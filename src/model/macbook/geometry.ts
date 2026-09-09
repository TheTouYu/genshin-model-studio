/**
 * MacBook Pro 14" 几何构建器（零依赖）
 * 目标：连续曲率 · 精确孔洞 · 缝隙均匀 · 结构隐藏 · 三角面预算
 */
import { MeshBuilder, MeshData } from '../../render/geom.js';
import { Material, makeMaterial } from '../../render/integrator.js';
import { Texture } from '../../render/image.js';
import { Vec3, v3, clamp } from '../../render/math.js';
import {
  roundedRectPath, pathAt, sweepSurface, patch, lin, disk, cylinderSide,
  polygonFill, roundedRectOutline, extrudeOutline, plateWithHoles, plateFill, RRect,
} from '../../geom/solids.js';
import { S, KB_ROWS } from './spec.js';

export interface LogoShape { body: number[][]; leaf: number[][] }
export interface Assets {
  legendAtlas?: Texture;
  legendRects?: Record<string, [number, number, number, number]>;
  logo?: LogoShape;
  screenTex?: Texture;
  grilleTex?: Texture;
  screenGain?: number;
}
export interface BuildOpts { openAngle: number; screenOn: boolean; color?: 'silver' | 'spaceblack' }
export interface BuildResult { mesh: MeshData; materials: Material[]; stats: Record<string, number> }

const M = {
  ALU: 0, ALU_DARK: 1, GLASS: 2, SCREEN: 3, KEY: 4, LEGEND: 5, TRACKPAD: 6, LOGO: 7,
  PORT_DARK: 8, PORT_METAL: 9, RUBBER: 10, GRILLE: 11, SCREW: 12, HINGE: 13, LENS: 14, GRILLE_RIM: 15, ALU_GLOSS: 16,
} as const;

function baseMaterials(assets: Assets, color: 'silver' | 'spaceblack' = 'silver'): Material[] {
  const mats: Material[] = [];
  const aluCol: [number, number, number] = color === 'spaceblack' ? [0.088, 0.087, 0.092] : [0.897, 0.900, 0.907];
  const aluRough = color === 'spaceblack' ? 0.30 : 0.26;
  mats[M.ALU] = makeMaterial({ name: 'alu-' + color, baseColor: aluCol, metallic: 1, roughness: aluRough, roughNoise: 0.10, roughNoiseScale: 34 });
  mats[M.ALU_DARK] = makeMaterial({ name: 'alu-dark', baseColor: [0.30, 0.30, 0.31], metallic: 1, roughness: 0.36, roughNoise: 0.12, roughNoiseScale: 40 });
  mats[M.GLASS] = makeMaterial({ name: 'glass-black', baseColor: [0.0075, 0.0075, 0.008], metallic: 0, roughness: 0.028, ior: 1.52 });
  mats[M.SCREEN] = makeMaterial({
    name: 'screen', kind: 'screen', baseColor: [0.01, 0.01, 0.01], roughness: 0.02, glassRough: 0.022,
    baseTex: assets.screenTex, emisTex: assets.screenTex, emission: [0.35, 0.35, 0.36],
  });
  mats[M.KEY] = makeMaterial({ name: 'keycap', baseColor: [0.0125, 0.0125, 0.0135], metallic: 0, roughness: 0.56 });
  mats[M.LEGEND] = makeMaterial({ name: 'key-legend', baseColor: [0.014, 0.014, 0.015], metallic: 0, roughness: 0.52, baseTex: assets.legendAtlas });
  mats[M.TRACKPAD] = makeMaterial({ name: 'trackpad-glass', baseColor: [0.030, 0.030, 0.032], metallic: 0, roughness: 0.055, ior: 1.52 });
  mats[M.LOGO] = makeMaterial({ name: 'logo-mirror', baseColor: [0.965, 0.965, 0.97], metallic: 1, roughness: 0.022 });
  mats[M.PORT_DARK] = makeMaterial({ name: 'port-cavity', baseColor: [0.012, 0.012, 0.013], metallic: 0, roughness: 0.72 });
  mats[M.PORT_METAL] = makeMaterial({ name: 'port-metal', baseColor: [0.62, 0.62, 0.635], metallic: 1, roughness: 0.30 });
  mats[M.RUBBER] = makeMaterial({ name: 'foot', baseColor: [0.028, 0.028, 0.029], metallic: 0, roughness: 0.62 });
  mats[M.GRILLE] = makeMaterial({ name: 'grille', baseColor: [0.020, 0.020, 0.021], metallic: 0.35, roughness: 0.55, baseTex: assets.grilleTex });
  mats[M.SCREW] = makeMaterial({ name: 'screw', baseColor: [0.70, 0.70, 0.71], metallic: 1, roughness: 0.24 });
  mats[M.HINGE] = makeMaterial({ name: 'hinge', baseColor: [0.42, 0.42, 0.43], metallic: 1, roughness: 0.34 });
  mats[M.LENS] = makeMaterial({ name: 'lens', baseColor: [0.004, 0.005, 0.012], metallic: 0, roughness: 0.045, ior: 1.6 });
  mats[M.GRILLE_RIM] = makeMaterial({ name: 'grille-rim', baseColor: [0.55, 0.55, 0.56], metallic: 1, roughness: 0.42 });
  // 上盖外面/底面：大平面阳极氧化面（镜面度略高于键盘面，对应官方图上的平滑渐变）
  mats[M.ALU_GLOSS] = makeMaterial({ name: 'alu-gloss-' + color, baseColor: aluCol, metallic: 1, roughness: color === 'spaceblack' ? 0.20 : 0.125 });
  return mats;
}

/** 上/下缘圆角 + 侧壁剖面（o=内偏移, y=高度），从顶面内缘到底面内缘 */
function bodyProfile(yBottom: number, yTop: number, fillet: number, nSeg = 4): { o: number; y: number }[] {
  const p: { o: number; y: number }[] = [];
  const rb = fillet;
  p.push({ o: rb, y: yTop });
  for (let i = 1; i <= nSeg; i++) {
    const a = (Math.PI / 2) * (1 - i / nSeg) + 0.03;
    p.push({ o: rb - rb * Math.cos(a), y: yTop - rb + rb * Math.sin(a) });
  }
  p.push({ o: 0, y: yTop - rb });
  p.push({ o: 0, y: yBottom + rb });
  for (let i = 1; i <= nSeg; i++) {
    const a = (Math.PI / 2) * (i / nSeg);
    p.push({ o: rb - rb * Math.cos(a), y: yBottom + rb - rb * Math.sin(a) });
  }
  p.push({ o: rb, y: yBottom });
  return p;
}
/** y → 剖面参数 v（二分） */
function vForY(prof: { o: number; y: number }[], y: number): number {
  let lo = 0, hi = prof.length - 1;
  if (y >= prof[0].y) return 0;
  if (y <= prof[prof.length - 1].y) return 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (prof[mid].y > y) lo = mid; else hi = mid;
  }
  const a = prof[lo], b = prof[hi];
  const t = Math.abs(b.y - a.y) < 1e-9 ? 0 : (a.y - y) / (a.y - b.y);
  return (lo + t) / (prof.length - 1);
}

/** 键帽：侧壁扫掠 + 上下盖（顶盖带凹陷与字符 UV） */
function keycap(
  b: MeshBuilder, cx: number, topY: number, cz: number, w: number, h: number, d: number, r: number,
  o: { dish: number; matSide: number; matTop: number; uvRect?: [number, number, number, number]; uvTile?: [number, number]; atlas?: [number, number] },
): void {
  const hh = h / 2, cy = topY - hh;
  const rr = Math.min(r, Math.min(w, d) / 2 - 1e-4);
  const rb = Math.min(0.40, hh - 1e-3, rr - 1e-3);
  const path = roundedRectPath(w, d, rr, 4);
  const prof = bodyProfile(-hh, hh, rb, 1);
  const surf = sweepSurface(path, prof);
  b.material(o.matSide);
  patch(b, (u, v) => { const p = surf(u, v); return v3(p.x + cx, p.y + cy, p.z + cz); }, path.map((q) => q.u), lin(0, 1, prof.length - 1));
  const q: RRect = { cx, cz, w, d, r: rr };
  const dish = o.dish;
  const uvFn = o.uvRect && o.atlas ? (x: number, z: number): [number, number] => {
    const [rx, ry, rw, rh] = o.uvRect!;
    const [tw, th] = o.uvTile ?? [w, d];
    const fu = clamp(0.5 + (x - cx) / tw, 0.002, 0.998), fv = clamp(0.5 + (z - cz) / th, 0.002, 0.998);
    return [(rx + fu * rw) / o.atlas![0], (ry + fv * rh) / o.atlas![1]];
  } : undefined;
  const deform = dish > 0 ? (x: number, z: number): number => {
    const qq = Math.min(1, Math.hypot((x - cx) / (w / 2 - rr * 0.4), (z - cz) / (d / 2 - rr * 0.4)));
    return -dish * (1 - qq * qq);
  } : undefined;
  b.material(o.matTop);
  plateFill(b, q, topY, { nu: 26, nt: 1, deform, uv: uvFn, cornerSegs: 4 });
  b.material(o.matSide);
  plateFill(b, q, topY - h, { nu: 26, nt: 1, flip: true, cornerSegs: 4 });
}

function portCavity(b: MeshBuilder, side: 1 | -1, wallX: number, cy: number, cz: number, w: number, h: number, depth: number, kind: string): void {
  const x0 = wallX, x1 = wallX - side * depth;
  const z0 = cz - w / 2, z1 = cz + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  b.material(M.PORT_DARK);
  const V = (x: number, y: number, z: number, nx: number, ny: number, nz: number): number => b.vertex(v3(x, y, z), v3(nx, ny, nz), 0, 0);
  b.quad(V(x0, y1, z0, 0, -1, 0), V(x1, y1, z0, 0, -1, 0), V(x1, y1, z1, 0, -1, 0), V(x0, y1, z1, 0, -1, 0));
  b.quad(V(x0, y0, z0, 0, 1, 0), V(x0, y0, z1, 0, 1, 0), V(x1, y0, z1, 0, 1, 0), V(x1, y0, z0, 0, 1, 0));
  b.quad(V(x0, y0, z0, 0, 0, 1), V(x1, y0, z0, 0, 0, 1), V(x1, y1, z0, 0, 0, 1), V(x0, y1, z0, 0, 0, 1));
  b.quad(V(x0, y0, z1, 0, 0, -1), V(x0, y1, z1, 0, 0, -1), V(x1, y1, z1, 0, 0, -1), V(x1, y0, z1, 0, 0, -1));
  b.quad(V(x1, y0, z0, side, 0, 0), V(x1, y0, z1, side, 0, 0), V(x1, y1, z1, side, 0, 0), V(x1, y1, z0, side, 0, 0));
  if (kind === 'jack') {
    // 耳机口：圆柱内腔
    b.material(M.PORT_DARK);
    const rr = w / 2;
    const segs = 16;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0 = v3(x0, cy + Math.sin(a0) * rr, cz + Math.cos(a0) * rr);
      const p1 = v3(x0, cy + Math.sin(a1) * rr, cz + Math.cos(a1) * rr);
      const p2 = v3(x1, cy + Math.sin(a1) * rr, cz + Math.cos(a1) * rr);
      const p3 = v3(x1, cy + Math.sin(a0) * rr, cz + Math.cos(a0) * rr);
      const n0 = v3(0, -Math.sin(a0), -Math.cos(a0)), n1 = v3(0, -Math.sin(a1), -Math.cos(a1));
      const i0 = b.vertex(p0, n0, 0, 0), i1 = b.vertex(p1, n1, 0, 0), i2 = b.vertex(p2, n1, 0, 0), i3 = b.vertex(p3, n0, 0, 0);
      b.quad(i0, i1, i2, i3);
    }
    const nOut = v3(side, 0, 0);
    const c0 = b.vertex(v3(x1, cy, cz), nOut, 0, 0);
    const ring: number[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      ring.push(b.vertex(v3(x1, cy + Math.sin(a) * rr, cz + Math.cos(a) * rr), nOut, 0, 0));
    }
    for (let i = 0; i < segs; i++) {
      if (side > 0) b.tri(c0, ring[i], ring[(i + 1) % segs]); else b.tri(c0, ring[(i + 1) % segs], ring[i]);
    }
    return;
  }
  b.material(M.PORT_METAL);
  const mh = kind === 'usbc' ? 1.15 : kind === 'hdmi' ? 3.6 : kind === 'sdxc' ? 1.0 : 1.7;
  const mw = kind === 'usbc' ? 6.2 : kind === 'hdmi' ? 12.8 : kind === 'sdxc' ? 25.0 : 7.6;
  const md = Math.min(depth - 0.4, kind === 'magsafe' ? 2.6 : 6.2);
  const mx0 = wallX - side * 0.35, mx1 = wallX - side * md;
  const zc0 = cz - mw / 2, zc1 = cz + mw / 2, yc0 = cy - mh / 2, yc1 = cy + mh / 2;
  const P = (x: number, y: number, z: number, nx: number, ny: number, nz: number): number => b.vertex(v3(x, y, z), v3(nx, ny, nz), 0, 0);
  b.quad(P(mx0, yc1, zc0, 0, 1, 0), P(mx1, yc1, zc0, 0, 1, 0), P(mx1, yc1, zc1, 0, 1, 0), P(mx0, yc1, zc1, 0, 1, 0));
  b.quad(P(mx0, yc0, zc0, 0, -1, 0), P(mx0, yc0, zc1, 0, -1, 0), P(mx1, yc0, zc1, 0, -1, 0), P(mx1, yc0, zc0, 0, -1, 0));
  b.quad(P(mx0, yc0, zc0, 0, 0, -1), P(mx1, yc0, zc0, 0, 0, -1), P(mx1, yc1, zc0, 0, 0, -1), P(mx0, yc1, zc0, 0, 0, -1));
  b.quad(P(mx0, yc0, zc1, 0, 0, 1), P(mx0, yc1, zc1, 0, 0, 1), P(mx1, yc1, zc1, 0, 0, 1), P(mx1, yc0, zc1, 0, 0, 1));
  const f1 = P(mx0, yc0, zc0, side, 0, 0), f2 = P(mx0, yc0, zc1, side, 0, 0), f3 = P(mx0, yc1, zc1, side, 0, 0), f4 = P(mx0, yc1, zc0, side, 0, 0);
  if (side > 0) b.quad(f1, f2, f3, f4); else b.quad(f1, f4, f3, f2);
  if (kind === 'magsafe') {
    // 5 个金色触点
    const gold = M.PORT_METAL;
    b.material(gold);
    for (let i = 0; i < 5; i++) {
      const zc = cz - 3.4 + i * 1.7;
      const px = wallX - side * 0.75;
      const nf = v3(side, 0, 0);
      const a = b.vertex(v3(px, cy - 0.55, zc), nf, 0, 0);
      const c = b.vertex(v3(px, cy + 0.55, zc), nf, 0, 0);
      const d = b.vertex(v3(px, cy + 0.55, zc + 0.8), nf, 0, 0);
      const e = b.vertex(v3(px, cy - 0.55, zc + 0.8), nf, 0, 0);
      if (side > 0) b.quad(a, c, d, e); else b.quad(a, e, d, c);
    }
  }
}

function logoPatch(b: MeshBuilder, shape: LogoShape, cx: number, cy: number, cz: number, w: number, h: number, mat: number): void {
  b.material(mat);
  for (const part of [shape.body, shape.leaf]) {
    const pts = part.map(([x, y]) => ({ x: cx + (x - 0.5) * w, z: cz + (y - 0.5) * h }));
    polygonFill(b, pts, cy);
  }
}

// ---------------------------------------------------------------- 主构建

export function buildMacbook14(opts: BuildOpts, assets: Assets): BuildResult {
  const b = new MeshBuilder();
  const mats = baseMaterials(assets, opts.color ?? 'silver');
  const stats: Record<string, number> = {};
  const B = S.base, L = S.lid;
  const deckY = B.bottomY + B.h;
  const kb = S.keyboard;

  // ============ 1. 机身主体 ============
  {
    const path = roundedRectPath(B.w, B.d, B.r, 20);
    const prof = bodyProfile(B.bottomY, deckY, B.fillet, 4);
    const surf0 = sweepSurface(path, prof);
    // 前缘开盖凹槽（宽 50mm、深 1.5mm，前壁中部）
    const GROOVE_W = 50.0, GROOVE_D = 1.5;
    const groove = (p: Vec3): number => {
      if (p.z < B.d / 2 - 6 || Math.abs(p.x) > GROOVE_W / 2) return 0;
      const t = clamp(1 - Math.abs(p.x) / (GROOVE_W / 2), 0, 1);
      const shape = Math.pow(t, 0.45);
      const y = p.y;
      const ym = clamp(Math.min((y - B.bottomY - 0.7) / 1.4, (deckY - 0.7 - y) / 1.4), 0, 1);
      return GROOVE_D * shape * ym;
    };
    const surf = (u: number, v: number): Vec3 => {
      const p = surf0(u, v);
      const g = groove(p);
      if (g <= 0) return p;
      const pt = pathAt(path, u);
      return v3(p.x + pt.nx * g, p.y, p.z + pt.nz * g);
    };
    const allPorts = [...S.ports.left.map((p) => ({ ...p, side: -1 as const })), ...S.ports.right.map((p) => ({ ...p, side: 1 as const }))];
    const zToU = (z: number, side: number): number => {
      let best = 0, bd = 1e9;
      for (let i = 0; i <= 1024; i++) {
        const u = i / 1024, p = pathAt(path, u);
        if (side < 0 ? p.x > -B.w / 2 + 3 : p.x < B.w / 2 - 3) continue;
        const dd = Math.abs(p.z - z);
        if (dd < bd) { bd = dd; best = u; }
      }
      return best;
    };
    const uBreaks = [...lin(0, 1, 288)];
    const vBreaks = [...lin(0, 1, prof.length - 1)];
    for (const p of allPorts) {
      uBreaks.push(zToU(p.z - p.w / 2, p.side), zToU(p.z + p.w / 2, p.side), zToU(p.z, p.side));
      vBreaks.push(vForY(prof, S.ports.centerY - p.h / 2), vForY(prof, S.ports.centerY + p.h / 2));
    }
    uBreaks.sort((a, c) => a - c); vBreaks.sort((a, c) => a - c);
    b.material(M.ALU);
    patch(b, surf, uBreaks, vBreaks, {
      mask: (u, v) => {
        const p = surf(u, v);
        if (Math.abs(p.x) < B.w / 2 - 1.4) return false;
        const side = p.x > 0 ? 1 : -1;
        for (const q of allPorts) {
          if (q.side !== side) continue;
          if (q.kind === 'jack') {
            if (Math.hypot(p.z - q.z, p.y - S.ports.centerY) < q.w / 2) return true;
            continue;
          }
          {
            // 圆角矩形（两端半圆）开孔
            const dz = Math.abs(p.z - q.z) - (q.w / 2 - q.h / 2);
            const dy = Math.abs(p.y - S.ports.centerY);
            if (dz <= 0 ? dy < q.h / 2 : Math.hypot(dz, dy) < q.h / 2) return true;
          }
        }
        return false;
      },
    });
  }

  // ============ 2. 台面 ============
  const wellW = kb.blockW + kb.wellMargin * 2, wellD = 5 * kb.pitchY + kb.keyH + kb.wellMargin * 2;
  const wellCz = S.deck.kbBackZ + (5 * kb.pitchY + kb.keyH) / 2;
  const grilleCx = kb.blockW / 2 + kb.wellMargin + S.grille.w / 2 + 0.8;
  {
    const outline: RRect = { cx: 0, cz: 0, w: B.w - 2.2, d: B.d - 2.2, r: B.r - 1.1 };
    const holes: RRect[] = [
      { cx: 0, cz: wellCz, w: wellW, d: wellD, r: 4.0 },
      { cx: -grilleCx, cz: wellCz, w: S.grille.w, d: S.grille.d, r: S.grille.r },
      { cx: grilleCx, cz: wellCz, w: S.grille.w, d: S.grille.d, r: S.grille.r },
    ];
    b.material(M.ALU);
    plateWithHoles(b, outline, holes, deckY, { maxCell: 24 });
    b.material(M.KEY);
    plateFill(b, { cx: 0, cz: wellCz, w: wellW, d: wellD, r: 4.0 }, deckY - kb.wellDepth, { nu: 56, nt: 2, cornerSegs: 6 });
    b.material(M.ALU);
    extrudeOutline(b, roundedRectOutline(wellW, wellD, 4.0, 0, wellCz, 6, 10), deckY - kb.wellDepth, deckY, { flipWall: true });
    b.material(M.GRILLE);
    for (const sx of [-1, 1]) {
      const gq: RRect = { cx: sx * grilleCx, cz: wellCz, w: S.grille.w, d: S.grille.d, r: S.grille.r };
      plateFill(b, gq, deckY - S.grille.depth, { nu: 40, nt: 1, cornerSegs: 4, uv: (x, z) => [x / 0.86, z / 0.86] });
      b.material(M.GRILLE_RIM);
      extrudeOutline(b, roundedRectOutline(S.grille.w, S.grille.d, S.grille.r, sx * grilleCx, wellCz, 4, 6), deckY - S.grille.depth, deckY, { flipWall: true });
      b.material(M.GRILLE);
    }
  }

  // ============ 3. 键帽 ============
  {
    const blockX0 = -kb.blockW / 2;
    const gapX = kb.pitchX - kb.keyW, gapZ = kb.pitchY - kb.keyH;
    const atlasSize: [number, number] | undefined = assets.legendAtlas ? [assets.legendAtlas.w, assets.legendAtlas.h] : undefined;
    const pxPerMm = 90 / 19.05;
    for (let ri = 0; ri < KB_ROWS.length; ri++) {
      const row = KB_ROWS[ri];
      const cz = S.deck.kbBackZ + ri * kb.pitchY + kb.keyH / 2;
      let x = blockX0;
      for (const [name, u] of row.keys) {
        const wpx = u * kb.pitchX;
        const capW = wpx - gapX;
        const cx = x + wpx / 2;
        const rect = assets.legendRects?.[ri === 0 ? `f:${name}` : `${ri - 1}:${name}`];
        let uvRect: [number, number, number, number] | undefined, uvTile: [number, number] | undefined;
        if (rect && atlasSize) { uvRect = rect; uvTile = [rect[2] / pxPerMm, rect[3] / pxPerMm]; }
        keycap(b, cx, deckY + kb.protrude, cz, capW, kb.capH, kb.keyH - gapZ, kb.keyR, {
          dish: kb.dish, matSide: M.KEY, matTop: rect ? M.LEGEND : M.KEY, uvRect, uvTile, atlas: atlasSize,
        });
        x += wpx;
      }
    }
  }

  // ============ 4. 触控板 ============
  {
    const tp = S.trackpad, cz = (S.deck.tpBackZ + S.deck.tpFrontZ) / 2;
    b.material(M.TRACKPAD);
    plateFill(b, { cx: 0, cz, w: tp.w, d: tp.d, r: tp.r }, deckY + 0.004, { nu: 48, nt: 2, cornerSegs: 6 });
  }

  // ============ 5. 底面 + 脚垫 + 螺丝 ============
  {
    b.material(M.ALU);
    b.material(M.ALU_GLOSS);
    plateFill(b, { cx: 0, cz: 0, w: B.w - 2.2, d: B.d - 2.2, r: B.r - 1.1 }, B.bottomY, { nu: 64, nt: 3, flip: true, cornerSegs: 10 });
    b.material(M.ALU);
    const f = S.feet;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const fx = sx * (B.w / 2 - f.insetX), fz = sz * (B.d / 2 - f.insetZ);
      b.material(M.RUBBER);
      cylinderSide(b, fx, fz, 0.0, B.bottomY, f.d / 2, 24);
      disk(b, fx, 0.0, fz, f.d / 2, 24, true);
    }
    // 底盖螺丝（4 颗 pentalobe，后缘一排）+ 螺丝孔凹槽
    b.material(M.SCREW);
    for (const sx of [-1, 1]) {
      for (const xo of [33.0, 118.0]) {
        const sxv = sx * xo, szv = -B.d / 2 + S.screws.insetZ;
        // 凹槽环（略暗）
        cylinderSide(b, sxv, szv, B.bottomY - 0.45, B.bottomY - 0.02, S.screws.d / 2 + 0.55, 18);
        disk(b, sxv, B.bottomY - 0.45, szv, S.screws.d / 2 + 0.55, 18, false);
        // 螺丝头（略高）
        cylinderSide(b, sxv, szv, B.bottomY - 0.45, B.bottomY - 0.14, S.screws.d / 2 + 0.1, 16);
        disk(b, sxv, B.bottomY - 0.14, szv, S.screws.d / 2 + 0.1, 16, true);
        // 十字槽
        b.material(M.PORT_DARK);
        disk(b, sxv, B.bottomY - 0.15, szv, S.screws.d / 4.2, 10, true);
        b.material(M.SCREW);
      }
    }
    // 激光雕刻区（法规文字，极低对比：比周围略暗的氧化面）
    b.material(M.ALU_DARK);
    plateFill(b, { cx: 0, cz: -B.d / 2 + 22, w: 92, d: 7.5, r: 1.0 }, B.bottomY - 0.006, { nu: 24, nt: 1, flip: true, cornerSegs: 3 });
  }

  // ============ 6. 接口腔体 ============
  {
    const wallL = -B.w / 2 + 0.05, wallR = B.w / 2 - 0.05;
    for (const p of S.ports.left) portCavity(b, -1, wallL, S.ports.centerY, p.z, p.w, p.h, 9.0, p.kind);
    for (const p of S.ports.right) portCavity(b, 1, wallR, S.ports.centerY, p.z, p.w, p.h, 9.0, p.kind);
  }

  // ============ 7. 上盖 ============
  const theta = (opts.openAngle * Math.PI) / 180;
  const cs = Math.cos(theta), sn = Math.sin(theta);
  const hingeY = L.closedY, hingeZ = L.hingeZ;
  const xf = (p: Vec3): Vec3 => v3(p.x, hingeY + (p.y * cs + p.z * sn), hingeZ + (-p.y * sn + p.z * cs));
  const xfN = (n: Vec3): Vec3 => v3(n.x, n.y * cs + n.z * sn, -n.y * sn + n.z * cs);
  const loc = (p: Vec3): Vec3 => p;
  {
    b.material(M.ALU);
    const path = roundedRectPath(L.w, L.d, L.r, 20);
    const prof = bodyProfile(0, L.h, 1.30, 4);
    const surf0 = sweepSurface(path, prof);
    // path 中心在原点 → 平移到 [0, L.d]（与 plates 的局部坐标一致）
    const surf = (u: number, v: number): Vec3 => { const p = surf0(u, v); return v3(p.x, p.y, p.z + L.d / 2); };
    patch(b, (u, v) => xf(surf(u, v)), lin(0, 1, 256), lin(0, 1, prof.length - 1));

    const plateLocal = (outline: RRect, holes: RRect[], y: number, flip: boolean, mat: number, opts2: { nu?: number; nt?: number; maxCell?: number; uv?: (x: number, z: number) => [number, number] } = {}): void => {
      const tmp = new MeshBuilder();
      tmp.material(0);
      if (holes.length) plateWithHoles(tmp, outline, holes, y, { maxCell: opts2.maxCell ?? 24, flip });
      else plateFill(tmp, outline, y, { nu: opts2.nu ?? 64, nt: opts2.nt ?? 3, flip, uv: opts2.uv, cornerSegs: 10 });
      const md = tmp.build();
      b.material(mat);
      const idx: number[] = [];
      for (let i = 0; i < md.pos.length / 3; i++) {
        const p = xf(loc(v3(md.pos[i * 3], md.pos[i * 3 + 1], md.pos[i * 3 + 2])));
        const n = xfN(v3(md.nrm[i * 3], md.nrm[i * 3 + 1], md.nrm[i * 3 + 2]));
        idx.push(b.vertex(p, n, md.uv[i * 2], md.uv[i * 2 + 1]));
      }
      for (let t = 0; t < md.idx.length; t += 3) b.tri(idx[md.idx[t]], idx[md.idx[t + 1]], idx[md.idx[t + 2]]);
    };
    const outer: RRect = { cx: 0, cz: L.d / 2, w: L.w - 2.2, d: L.d - 2.2, r: L.r - 1.1 };
    const inner: RRect = { cx: 0, cz: L.d / 2, w: L.w - 2 * S.screen.glassInset, d: L.d - 2 * S.screen.glassInset, r: S.screen.glassR };
    plateLocal(outer, [], L.h, false, M.ALU_GLOSS);
    plateLocal(outer, [inner], 0, true, M.ALU, { maxCell: 24 });
    // 屏幕总成：内面朝 -y（用户方向）。玻璃边框 = inner 挖去活动区
    const scr = S.screen;
    const actCz = L.d - scr.chin - scr.h / 2;
    const act: RRect = { cx: 0, cz: actCz, w: scr.w, d: scr.h, r: scr.r };
    const YG = -0.020;                       // 玻璃平面
    plateLocal(inner, [act], YG, true, M.GLASS, { maxCell: 24 });
    if (assets.screenTex) {
      plateLocal(act, [], YG + 0.002, true, M.SCREEN, {
        nu: 64, nt: 2,
        uv: (x, z) => [(x - (act.cx - act.w / 2)) / act.w, 1 - (z - (act.cz - act.d / 2)) / act.d],
      });
      const notchCz = actCz + scr.h / 2 - scr.notchH / 2;
      plateLocal({ cx: 0, cz: notchCz, w: scr.notchW, d: scr.notchH, r: 2.6 }, [], YG - 0.004, true, M.GLASS, { nu: 24, nt: 1 });
      const tmp3 = new MeshBuilder(); tmp3.material(0); disk(tmp3, 0, YG - 0.006, notchCz, 1.85, 18, true);
      const md3 = tmp3.build(); const idx3: number[] = [];
      for (let i = 0; i < md3.pos.length / 3; i++) {
        const p = xf(loc(v3(md3.pos[i * 3], md3.pos[i * 3 + 1], md3.pos[i * 3 + 2])));
        const n = xfN(v3(md3.nrm[i * 3], md3.nrm[i * 3 + 1], md3.nrm[i * 3 + 2]));
        idx3.push(b.vertex(p, n, md3.uv[i * 2], md3.uv[i * 2 + 1]));
      }
      for (let t = 0; t < md3.idx.length; t += 3) b.tri(idx3[md3.idx[t]], idx3[md3.idx[t + 1]], idx3[md3.idx[t + 2]]);
    } else {
      plateLocal(act, [], YG + 0.002, true, M.SCREEN, { nu: 48, nt: 2 });
    }
    if (assets.logo) {
      const lg = S.logo;
      const lcz = L.d / 2 + lg.centerOffsetZ;
      const tmp = new MeshBuilder(); tmp.material(0);
      logoPatch(tmp, assets.logo, 0, L.h + 0.006, lcz, lg.w, lg.h, 0);
      const md = tmp.build(); const idx: number[] = [];
      for (let i = 0; i < md.pos.length / 3; i++) {
        const p = xf(loc(v3(md.pos[i * 3], md.pos[i * 3 + 1], md.pos[i * 3 + 2])));
        const n = xfN(v3(md.nrm[i * 3], md.nrm[i * 3 + 1], md.nrm[i * 3 + 2]));
        idx.push(b.vertex(p, n, md.uv[i * 2], md.uv[i * 2 + 1]));
      }
      for (let t = 0; t < md.idx.length; t += 3) b.tri(idx[md.idx[t]], idx[md.idx[t + 1]], idx[md.idx[t + 2]]);
    }
  }

  // ============ 8. 转轴 ============
  {
    b.material(M.HINGE);
    const r = S.hinge.rodD / 2, segs = 20, xSegs = 20;
    for (let j = 0; j < xSegs; j++) {
      const x0 = -S.hinge.coverW / 2 + (S.hinge.coverW * j) / xSegs;
      const x1 = -S.hinge.coverW / 2 + (S.hinge.coverW * (j + 1)) / xSegs;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
        const n0 = v3(0, Math.sin(a0), Math.cos(a0)), n1 = v3(0, Math.sin(a1), Math.cos(a1));
        const p0 = v3(x0, hingeY + n0.y * r, hingeZ + n0.z * r), p1 = v3(x0, hingeY + n1.y * r, hingeZ + n1.z * r);
        const p2 = v3(x1, hingeY + n1.y * r, hingeZ + n1.z * r), p3 = v3(x1, hingeY + n0.y * r, hingeZ + n0.z * r);
        const v0 = b.vertex(p0, n0, 0, 0), v1 = b.vertex(p1, n1, 1, 0), v2 = b.vertex(p2, n1, 1, 1), v3v = b.vertex(p3, n0, 0, 1);
        b.quad(v0, v1, v2, v3v);
      }
    }
  }

  stats['tris'] = b.triCount;
  // 单位：规格为 mm，渲染/相机为 m → 统一缩放到米
  const raw = b.build();
  const S_M = 1e-3;
  for (let i = 0; i < raw.pos.length; i++) raw.pos[i] *= S_M;
  stats['verts'] = raw.pos.length / 3;
  return { mesh: raw, materials: mats, stats };
}
