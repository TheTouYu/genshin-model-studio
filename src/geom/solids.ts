/**
 * 零依赖几何原语（CG 级）：圆角路径扫掠、遮罩补面（孔洞）、圆角盒、旋转体
 * 设计要点：所有面都是解析参数曲面 + 中心差分法线 → 连续曲率、无硬边台阶。
 */
import { Vec3, v3, add, sub, cross, norm, scale, len } from '../render/math.js';
import { MeshBuilder } from '../render/geom.js';

export type Surface = (u: number, v: number) => Vec3;

export interface PathPt { x: number; z: number; nx: number; nz: number; u: number }

/** 圆角矩形闭合路径（逆时针），u = 归一化周长参数 */
export function roundedRectPath(w: number, d: number, r: number, segsPerCorner = 16): PathPt[] {
  const hw = w / 2, hd = d / 2;
  const rr = Math.min(r, Math.min(hw, hd) - 1e-6);
  const pts: PathPt[] = [];
  const corners = [
    { cx: hw - rr, cz: hd - rr, a0: 0, a1: Math.PI / 2 },              // 前右
    { cx: -hw + rr, cz: hd - rr, a0: Math.PI / 2, a1: Math.PI },        // 前左
    { cx: -hw + rr, cz: -hd + rr, a0: Math.PI, a1: 1.5 * Math.PI },     // 后左
    { cx: hw - rr, cz: -hd + rr, a0: 1.5 * Math.PI, a1: 2 * Math.PI },  // 后右
  ];
  const straight = (x0: number, z0: number, x1: number, z1: number, n: number): void => {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      let nx = x1 - x0, nz = z1 - z0;
      const l = Math.hypot(nx, nz) || 1;
      // 外法线 = 切线顺时针旋转 90°
      const tx = nx / l, tz = nz / l;
      pts.push({ x, z, nx: tz, nz: -tx, u: 0 });
    }
  };
  // 从后右角结束点开始，顺时针？统一为：沿 +x 前边、右侧、后边、左侧
  // 顺序：前边（-x→+x 在 z=+hd 不可行，因为圆角占位），改为分段
  const cornerPts = (c: { cx: number; cz: number; a0: number; a1: number }, segs: number): void => {
    for (let i = 0; i <= segs; i++) {
      const a = c.a0 + (c.a1 - c.a0) * (i / segs);
      const x = c.cx + rr * Math.cos(a), z = c.cz + rr * Math.sin(a);
      pts.push({ x, z, nx: Math.cos(a), nz: Math.sin(a), u: 0 });
    }
  };
  // 右侧直边：从后右角（a1=2π）到前右角（a0=0）
  const hwv = hw, hdv = hd;
  straight(hwv, -hdv + rr, hwv, hdv - rr, 2);
  cornerPts(corners[0], segsPerCorner);
  straight(hwv - rr, hdv, -hwv + rr, hdv, 3);
  cornerPts(corners[1], segsPerCorner);
  straight(-hwv, hdv - rr, -hwv, -hdv + rr, 2);
  cornerPts(corners[2], segsPerCorner);
  straight(-hwv + rr, -hdv, hwv - rr, -hdv, 3);
  cornerPts(corners[3], segsPerCorner);
  // 去重：圆弧终点与相邻直边起点重合（4 处零长段）→ 弧长参数化后相邻 u 落在同一点，
  // 任何扇形/环带镶嵌都会在这里产出细针三角形（实测 0.1–0.2mm 边长）。
  const out: PathPt[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.hypot(p.x - q.x, p.z - q.z) < 1e-6) continue;
    out.push(p);
  }
  while (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 1e-6) out.pop(); else break;
  }
  // 弧长参数化
  let total = 0;
  const segs: number[] = [0];
  for (let i = 1; i <= out.length; i++) {
    const a = out[i - 1], b = out[i % out.length];
    total += Math.hypot(b.x - a.x, b.z - a.z);
    segs.push(total);
  }
  for (let i = 0; i < out.length; i++) out[i].u = total > 0 ? segs[i] / total : 0;
  return out;
}

/** 保角弧长重采样：转角 ≥ keepAngleDeg 的点原样保留，其余按弧长均匀布点（≤ maxSeg）。
 *  适合「原始点极密但曲率极缓」的轮廓（logo body 576 点、转角中位数 1.05°）——
 *  只按转角抽稀会把点数掉到 4，必须走弧长重采样。 */
export function decimatePath(pts: { x: number; z: number }[], keepAngleDeg = 8, maxSeg = 1e9): { x: number; z: number }[] {
  const n = pts.length;
  if (n < 4 || !(maxSeg > 0)) return pts.slice();
  const cum = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const a = pts[i - 1], b = pts[i % n];
    cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z);
  }
  const total = cum[n];
  if (!(total > 0)) return pts.slice();
  const at = (s: number): { x: number; z: number } => {
    const ss = ((s % total) + total) % total;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= ss) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[(lo + 1) % n];
    const span = cum[lo + 1] - cum[lo];
    const t = span > 1e-12 ? (ss - cum[lo]) / span : 0;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  };
  const corner: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], c = pts[i], d = pts[(i + 1) % n];
    let t = Math.atan2(d.z - c.z, d.x - c.x) - Math.atan2(c.z - a.z, c.x - a.x);
    if (t > Math.PI) t -= 2 * Math.PI;
    if (t < -Math.PI) t += 2 * Math.PI;
    if (Math.abs((t * 180) / Math.PI) >= keepAngleDeg) corner.push(i);
  }
  const out: { x: number; z: number }[] = [];
  if (corner.length < 3) {
    const k = Math.max(3, Math.round(total / maxSeg));
    for (let m = 0; m < k; m++) out.push(at((total * m) / k));
    return out;
  }
  for (let ci = 0; ci < corner.length; ci++) {
    const s0 = cum[corner[ci]];
    let s1 = cum[corner[(ci + 1) % corner.length]];
    if (s1 <= s0) s1 += total;
    out.push(at(s0));
    const k = Math.floor((s1 - s0) / maxSeg);
    for (let m = 1; m <= k; m++) out.push(at(s0 + ((s1 - s0) * m) / (k + 1)));
  }
  return out;
}

/** 在路径参数 u 处采样（线性插值 + 法线归一） */
export function pathAt(path: PathPt[], u: number): PathPt {
  let uu = u - Math.floor(u);
  // 二分
  let lo = 0, hi = path.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (path[mid].u <= uu) lo = mid; else hi = mid - 1; }
  const i = lo, j = (i + 1) % path.length;
  const a = path[i], b = path[j];
  const span = (j === 0 ? 1 : b.u) - a.u;
  const t = span > 1e-9 ? (uu - a.u) / span : 0;
  const nx = a.nx + (b.nx - a.nx) * t, nz = a.nz + (b.nz - a.nz) * t;
  const l = Math.hypot(nx, nz) || 1;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx: nx / l, nz: nz / l, u: uu };
}

/** 从路径与剖面构造扫掠曲面：剖面 (o=内偏移, y=高度) */
export function sweepSurface(path: PathPt[], profile: { o: number; y: number }[]): Surface {
  return (u: number, v: number) => {
    const pt = pathAt(path, u);
    const vv = Math.max(0, Math.min(1, v)) * (profile.length - 1);
    const i0 = Math.min(profile.length - 2, Math.floor(vv));
    const t = vv - i0;
    const o = profile[i0].o + (profile[i0 + 1].o - profile[i0].o) * t;
    const y = profile[i0].y + (profile[i0 + 1].y - profile[i0].y) * t;
    return v3(pt.x - pt.nx * o, y, pt.z - pt.nz * o);
  };
}

/** 由参数曲面生成网格（中心差分法线）；mask(u,v) 返回 true 时跳过该格 */
export function patch(
  b: MeshBuilder, surf: Surface,
  uBreaks: number[], vBreaks: number[],
  opts: { mask?: (u: number, v: number) => boolean; flip?: boolean; uv?: (u: number, v: number) => [number, number]; nu?: number; nv?: number; closeU?: boolean } = {},
): void {
  const us = uBreaks, vs = vBreaks;
  const nu = us.length - 1, nv = vs.length - 1;
  const eps = 1e-4;
  const flip = opts.flip ? -1 : 1;
  const grid: number[][] = [];
  const pts: Vec3[][] = [];
  for (let j = 0; j <= nv; j++) {
    const row: number[] = []; const prow: Vec3[] = [];
    for (let i = 0; i <= nu; i++) {
      const u = us[i], v = vs[j];
      const p = surf(u, v);
      const du = surf(Math.min(1, u + eps), v);
      const du2 = surf(Math.max(0, u - eps), v);
      const dv = surf(u, Math.min(1, v + eps));
      const dv2 = surf(u, Math.max(0, v - eps));
      let n = cross(sub(du, du2), sub(dv, dv2));
      const l = len(n);
      if (l < 1e-14) n = v3(0, 1, 0); else n = scale(n, flip / l);
      const uv = opts.uv ? opts.uv(u, v) : [u, v];
      row.push(b.vertex(p, n, uv[0], uv[1]));
      prow.push(p);
    }
    grid.push(row); pts.push(prow);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const uc = (us[i] + us[i + 1]) / 2, vc = (vs[j] + vs[j + 1]) / 2;
    if (opts.mask && opts.mask(uc, vc)) continue;
    if (flip > 0) b.quad(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
    else b.quad(grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]);
  }
  void nu; void nv; void pts;
}

/** 均匀细分数组工具 */
export function lin(a: number, b: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}
export function mergeBreaks(...arrs: number[][]): number[] {
  const s = new Set<number>();
  for (const a of arrs) for (const x of a) s.add(Math.round(x * 1e7) / 1e7);
  return [...s].sort((p, q) => p - q);
}

/** 圆角矩形洞的遮罩（u,v 归一化到某个矩形区域时用绝对坐标版） */
export function insideRoundedRect(x: number, z: number, cx: number, cz: number, w: number, d: number, r: number): boolean {
  const hw = w / 2, hd = d / 2;
  const dx = Math.abs(x - cx) - (hw - r), dz = Math.abs(z - cz) - (hd - r);
  if (dx <= 0 && dz <= 0) return true;
  const ex = Math.max(0, dx), ez = Math.max(0, dz);
  if (dx > 0 && dz > 0) return ex * ex + ez * ez <= r * r;
  return dx <= 0 ? dz <= 0 : dx <= 0;
}

/** 圆角盒（用于键帽/脚垫/接口等）：中心在 (cx,cy,cz)，尺寸 w×h×d，平面圆角 r，顶/底倒角 rb */
export function roundedBox(
  b: MeshBuilder, cx: number, cy: number, cz: number, w: number, h: number, d: number, r: number, rb = 0.25,
  opts: { segsCorner?: number; segsVert?: number; topDish?: number; dishR?: number } = {},
): void {
  const segsC = opts.segsCorner ?? 8, segsV = opts.segsVert ?? 4;
  const hw = w / 2, hd = d / 2, hh = h / 2;
  const rr = Math.min(r, Math.min(hw, hd) - 1e-5);
  const rbv = Math.min(rb, Math.min(hh, rr) - 1e-5);
  const dish = opts.topDish ?? 0;
  const dishR = opts.dishR ?? Math.max(hw, hd);
  // 剖面：(o,y) 从底中心向外
  const prof: { o: number; y: number }[] = [];
  for (let i = 0; i <= segsV; i++) {
    const a = (i / segsV) * (Math.PI / 2);
    prof.push({ o: -rbv * (1 - Math.cos(a)), y: -hh + rbv * (1 - Math.sin(a)) });
  }
  // 侧壁
  // 顶部倒角
  for (let i = 0; i <= segsV; i++) {
    const a = (i / segsV) * (Math.PI / 2);
    prof.push({ o: -rbv * Math.sin(a), y: hh - rbv * (1 - Math.cos(a)) });
  }
  // 注意：o 是「向外为正」，sweepSurface 用内偏移，取反
  const profIn = prof.map((p) => ({ o: -p.o, y: p.y }));
  // 路径：圆角矩形，但半径用 rr
  const path = roundedRectPath(w, d, rr, segsC);
  const surf = sweepSurface(path, profIn);
  const us = path.map((p) => p.u);
  const vs = lin(0, 1, profIn.length - 1);
  patch(b, (u, v) => {
    const p = surf(u, v);
    // 顶面凹陷（键帽双曲面）
    if (dish > 0 && p.y > hh - 1e-6) {
      const dx = p.x - cx, dz = p.z - cz;
      const q = Math.min(1, Math.hypot(dx / (hw - rr * 0.2), dz / (hd - rr * 0.2)));
      p.y -= dish * (1 - Math.pow(q, 2));
    }
    return v3(p.x + cx, p.y + cy, p.z + cz);
  }, us, vs, { uv: (u, v) => [u, v] });
  void dishR;
}

/** 圆盘/圆环（脚垫、耳机孔等） */
export function disk(b: MeshBuilder, cx: number, cy: number, cz: number, r: number, segs = 32, flip = false, y = 0): void {
  const center = b.vertex(v3(cx, cy + y, cz), v3(0, flip ? -1 : 1, 0), 0.5, 0.5);
  const ring: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    ring.push(b.vertex(v3(cx + Math.cos(a) * r, cy + y, cz + Math.sin(a) * r), v3(0, flip ? -1 : 1, 0), 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)));
  }
  for (let i = 0; i < segs; i++) {
    if (flip) b.tri(center, ring[(i + 1) % segs], ring[i]);
    else b.tri(center, ring[i], ring[(i + 1) % segs]);
  }
}

/** 圆柱侧面 */
export function cylinderSide(b: MeshBuilder, cx: number, cz: number, y0: number, y1: number, r: number, segs = 32, flip = false): void {
  const ring0: number[] = [], ring1: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    ring0.push(b.vertex(v3(cx + nx * r, y0, cz + nz * r), v3(nx, 0, nz), i / segs, 0));
    ring1.push(b.vertex(v3(cx + nx * r, y1, cz + nz * r), v3(nx, 0, nz), i / segs, 1));
  }
  for (let i = 0; i < segs; i++) {
    if (flip) b.quad(ring0[i], ring1[i], ring1[i + 1], ring0[i + 1]);
    else b.quad(ring0[i], ring0[i + 1], ring1[i + 1], ring1[i]);
  }
}

/** 平面矩形补面（可遮罩），坐标直接给世界 (x,z) */
export function flatRect(
  b: MeshBuilder, x0: number, x1: number, z0: number, z1: number, y: number,
  nx = 0, ny = 1, nz = 0, uBreaks?: number[], vBreaks?: number[],
  mask?: (x: number, z: number) => boolean, flip = false,
): void {
  const us = uBreaks ?? lin(0, 1, 8), vs = vBreaks ?? lin(0, 1, 8);
  patch(b, (u, v) => v3(x0 + (x1 - x0) * u, y, z0 + (z1 - z0) * v), us, vs, {
    mask: mask ? (u, v) => mask(x0 + (x1 - x0) * u, z0 + (z1 - z0) * v) : undefined,
    flip, uv: (u, v) => [u, v],
  });
  void nx; void ny; void nz;
}

/** 由二维轮廓（x,z 平面）挤出成柱体（用于键帽字符等）——此处提供「平面多边形填充」 */
/**
 * 多边形填充（耳切三角化）。默认只做去重；opts.maxSeg 开启保角重采样
 * （轮廓点过密时，任何三角化都会沿轮廓产出细针——先抽稀再切）。
 * 耳选择用「最小内角最大化」而非首个可行耳：同一点集下三角形状显著更好。
 */
export function polygonFill(
  b: MeshBuilder, pts: { x: number; z: number }[], y: number, flip = false,
  opts: { maxSeg?: number; keepAngleDeg?: number } = {},
): void {
  const ded: { x: number; z: number }[] = [];
  for (const p of pts) {
    const q = ded[ded.length - 1];
    if (q && Math.hypot(p.x - q.x, p.z - q.z) < 1e-6) continue;
    ded.push(p);
  }
  while (ded.length > 1) {
    const a = ded[0], c = ded[ded.length - 1];
    if (Math.hypot(a.x - c.x, a.z - c.z) < 1e-6) ded.pop(); else break;
  }
  const poly = opts.maxSeg ? decimatePath(ded, opts.keepAngleDeg ?? 8, opts.maxSeg) : ded;
  const n = poly.length;
  if (n < 3) return;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const area2 = (a: number, c: number, d: number): number =>
    (poly[c].x - poly[a].x) * (poly[d].z - poly[a].z) - (poly[d].x - poly[a].x) * (poly[c].z - poly[a].z);
  const cosAt = (a: number, c: number, d: number): number => {
    const ux = poly[a].x - poly[c].x, uz = poly[a].z - poly[c].z;
    const vx = poly[d].x - poly[c].x, vz = poly[d].z - poly[c].z;
    const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    if (lu < 1e-12 || lv < 1e-12) return 1;
    return (ux * vx + uz * vz) / (lu * lv);
  };
  let guard = 0;
  const verts: number[] = [];
  for (const p of poly) verts.push(b.vertex(v3(p.x, y, p.z), v3(0, flip ? -1 : 1, 0), p.x, p.z));
  while (idx.length > 3 && guard++ < n * n) {
    let bestI = -1, bestScore = -2;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i - 1 + idx.length) % idx.length], c = idx[i], d = idx[(i + 1) % idx.length];
      if (area2(a, c, d) <= 0) continue;
      let ok = true;
      for (const e of idx) {
        if (e === a || e === c || e === d) continue;
        if (area2(a, c, e) >= 0 && area2(c, d, e) >= 0 && area2(d, a, e) >= 0) { ok = false; break; }
      }
      if (!ok) continue;
      // 分数 = 该耳最小内角的余弦（越小越好 → 分数 = -cos）
      const score = -Math.max(cosAt(a, c, d), cosAt(c, d, a), cosAt(d, a, c));
      if (score > bestScore) { bestScore = score; bestI = i; }
    }
    if (bestI < 0) break;
    const i = bestI;
    const a = idx[(i - 1 + idx.length) % idx.length], c = idx[i], d = idx[(i + 1) % idx.length];
    if (flip) b.tri(verts[a], verts[d], verts[c]); else b.tri(verts[a], verts[c], verts[d]);
    idx.splice(i, 1);
  }
  if (idx.length === 3) {
    if (flip) b.tri(verts[idx[0]], verts[idx[2]], verts[idx[1]]);
    else b.tri(verts[idx[0]], verts[idx[1]], verts[idx[2]]);
  }
}

/** 圆角矩形轮廓点（x,z 平面，闭合，用于孔洞内壁） */
export function roundedRectOutline(w: number, d: number, r: number, cx = 0, cz = 0, segs = 8, edgeSegs = 0): { x: number; z: number }[] {
  const hw = w / 2, hd = d / 2, rr = Math.min(r, Math.min(hw, hd));
  const out: { x: number; z: number }[] = [];
  const arc = (ccx: number, ccz: number, a0: number, a1: number): void => {
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (a1 - a0) * (i / segs);
      out.push({ x: cx + ccx + rr * Math.cos(a), z: cz + ccz + rr * Math.sin(a) });
    }
  };
  // 直边：只加内部点（端点由相邻圆弧提供）
  const edge = (x0: number, z0: number, x1: number, z1: number): void => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(L / (edgeSegs || 12)));
    for (let i = 1; i < n; i++) out.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n });
  };
  const HALF = Math.PI / 2;
  // 逆时针：前右角 → 前边 → 前左角 → 左边 → 后左角 → 后边 → 后右角 → 右边
  arc(hw - rr, hd - rr, 0, HALF);
  edge(hw - rr, hd, -hw + rr, hd);
  arc(-hw + rr, hd - rr, HALF, Math.PI);
  edge(-hw, hd - rr, -hw, -hd + rr);
  arc(-hw + rr, -hd + rr, Math.PI, 1.5 * Math.PI);
  edge(-hw + rr, -hd, hw - rr, -hd);
  arc(hw - rr, -hd + rr, 1.5 * Math.PI, 2 * Math.PI);
  edge(hw, -hd + rr, hw, hd - rr);
  return out;
}

/** 把二维轮廓挤出成管壁（沿 y 方向），可选封闭两端。
 *  minWall：壁高低于该值（mm）时不出壁——薄片侧壁在任何三角化下都是细针
 *  （0.3mm × 150mm 的矩形不可能有好形状），而游戏内该壁宽不足 1px，直接降级为贴片。 */
export function extrudeOutline(
  b: MeshBuilder, pts: { x: number; z: number }[], y0: number, y1: number,
  opts: { capStart?: boolean; capEnd?: boolean; flipWall?: boolean; nrm?: Vec3; minWall?: number } = {},
): void {
  const n = pts.length;
  const nx = opts.nrm ?? v3(0, 1, 0);
  const minWall = opts.minWall ?? 0;
  const thin = Math.abs(y1 - y0) < minWall;
  const rings: number[][] = [[], []];
  if (!thin) {
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      let ex = q.x - p.x, ez = q.z - p.z;
      const l = Math.hypot(ex, ez) || 1;
      const nx2 = ez / l, nz2 = -ex / l;
      rings[0].push(b.vertex(v3(p.x, y0, p.z), v3(nx2, 0, nz2), i / n, 0));
      rings[1].push(b.vertex(v3(p.x, y1, p.z), v3(nx2, 0, nz2), i / n, 1));
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (opts.flipWall) b.quad(rings[0][i], rings[1][i], rings[1][j], rings[0][j]);
      else b.quad(rings[0][i], rings[0][j], rings[1][j], rings[1][i]);
    }
  }
  if (opts.capStart) polygonFill(b, pts, y0, true);
  if (opts.capEnd) polygonFill(b, pts, y1, false);
  void nx;
}

// ---------------------------------------------------------------- 带孔平板（扫描线精确镶嵌）

export interface RRect { cx: number; cz: number; w: number; d: number; r: number }

/** 圆角矩形在给定 z 处的 x 区间（无则 null） */
export function rrectInterval(q: RRect, z: number): [number, number] | null {
  const hw = q.w / 2, hd = q.d / 2;
  const dz = Math.abs(z - q.cz);
  if (dz > hd) return null;
  const rr = Math.min(q.r, Math.min(hw, hd));
  if (dz <= hd - rr) return [q.cx - hw, q.cx + hw];
  const k = dz - (hd - rr);
  const dx = Math.sqrt(Math.max(0, rr * rr - k * k));
  return [q.cx - hw + rr - dx, q.cx + hw - rr + dx];
}

/**
 * 带孔平板：outline 为外轮廓（圆角矩形），holes 为孔（圆角矩形）。
 * 扫描线沿 z 分带，每带内做区间减法 → 孔边缘精确、无锯齿。
 */
export function plateWithHoles(
  b: MeshBuilder, outline: RRect, holes: RRect[], y: number,
  opts: { zBreaks?: number[]; xBreaks?: number[]; uvScale?: [number, number]; uvOffset?: [number, number]; flip?: boolean; mask?: (x: number, z: number) => boolean; maxCell?: number; snapGap?: number } = {},
): void {
  const flip = opts.flip ? -1 : 1;
  const maxCell = opts.maxCell ?? 6;
  const zs = new Set<number>();
  // 注意：界限必须相对 cz（早期版本按 ±d/2 判绝对 z，偏移轮廓的孔边会被丢弃 → 缺带）
  const addZ = (z: number): void => { if (z > outline.cz - outline.d / 2 - 1e-9 && z < outline.cz + outline.d / 2 + 1e-9) zs.add(Math.round(z * 1e6) / 1e6); };
  const z0 = outline.cz - outline.d / 2, z1 = outline.cz + outline.d / 2;
  const nz = Math.max(2, Math.ceil(outline.d / maxCell));
  for (let i = 0; i <= nz; i++) zs.add(z0 + ((z1 - z0) * i) / nz);
  for (const h of holes) {
    const hd = h.d / 2, rr = Math.min(h.r, Math.min(h.w / 2, hd));
    for (const z of [h.cz - hd, h.cz + hd, h.cz - hd + rr, h.cz + hd - rr]) addZ(z);
  }
  for (const z of opts.zBreaks ?? []) addZ(z);
  // 近重合断点吸附：孔边与外轮廓边相差 0.02–0.1mm 时，扫描线会切出同宽的窄带
  // （0.1mm × 300mm 的条带 → 每条都是细针）。亚像素特征直接并档，肉眼无差。
  const snap = (list: number[], minGap: number): number[] => {
    const out: number[] = [];
    for (const v of list) if (!out.length || v - out[out.length - 1] > minGap) out.push(v);
    return out;
  };
  const SNAP = opts.snapGap ?? 0.3;
  const zList = snap([...zs].sort((a, c) => a - c), SNAP);
  const xs = new Set<number>();
  for (const x of opts.xBreaks ?? []) xs.add(x);
  const xList = [...xs].sort((a, c) => a - c);
  const uvS = opts.uvScale ?? [1, 1], uvO = opts.uvOffset ?? [0, 0];
  const emit = (x0: number, x1: number, za: number, zb: number): void => {
    if (x1 - x0 < 1e-7 || Math.abs(zb - za) < 1e-7) return;
    if (opts.mask && opts.mask((x0 + x1) / 2, (za + zb) / 2)) return;
    const p = (x: number, z: number): Vec3 => v3(x, y, z);
    const n = v3(0, flip, 0);
    const uvf = (x: number, z: number): [number, number] => [uvO[0] + (x - outline.cx) * uvS[0], uvO[1] + (z - outline.cz) * uvS[1]];
    const a = b.vertex(p(x0, za), n, ...uvf(x0, za));
    const c = b.vertex(p(x1, za), n, ...uvf(x1, za));
    const d = b.vertex(p(x1, zb), n, ...uvf(x1, zb));
    const e = b.vertex(p(x0, zb), n, ...uvf(x0, zb));
    if (flip > 0) b.quad(a, c, d, e); else b.quad(a, e, d, c);
  };
  for (let i = 0; i < zList.length - 1; i++) {
    const za = zList[i], zb = zList[i + 1];
    const zm = (za + zb) / 2;
    if (Math.abs(zb - za) < 1e-9) continue;
    const oa = rrectInterval(outline, za), ob = rrectInterval(outline, zb);
    if (!oa || !ob) continue;
    // 在带中点处求孔区间（用于切分），端点处求实际边界
    const cut: [number, number][] = [];
    for (const h of holes) {
      const iv = rrectInterval(h, zm);
      if (iv) cut.push(iv);
    }
    // 该带的 x 分割点：外轮廓用「两端区间的并」而非各自端点——
    // 否则圆角处两端相差 0.02–0.2mm 会切出一条同宽的针形列（边界倾斜是正常的）
    const xsLocal = new Set<number>([Math.min(oa[0], ob[0]), Math.max(oa[1], ob[1])]);
    for (const c of cut) { xsLocal.add(c[0]); xsLocal.add(c[1]); }
    // 孔的 x 断点只在「该孔在本带内存在」时生效：全局生效会在孔不存在的带里
    // 切出无用窄列（实测 0.8mm 宽的铝条被切成 200+ 片）
    for (const h of holes) {
      if (!rrectInterval(h, zm)) continue;
      const hw = h.w / 2, rr = Math.min(h.r, Math.min(hw, h.d / 2));
      for (const x of [h.cx - hw, h.cx + hw, h.cx - hw + rr, h.cx + hw - rr]) xsLocal.add(x);
    }
    for (const x of xList) if (x > Math.min(oa[0], ob[0]) - 1e-9 && x < Math.max(oa[1], ob[1]) + 1e-9) xsLocal.add(x);
    const xl = snap([...xsLocal].sort((a, c) => a - c), SNAP);
    for (let j = 0; j < xl.length - 1; j++) {
      const xa = xl[j], xb = xl[j + 1];
      const xm = (xa + xb) / 2;
      // 中点是否在孔内
      let inHole = false;
      for (const c of cut) if (xm > c[0] && xm < c[1]) { inHole = true; break; }
      if (inHole) continue;
      // 细分：沿 x 均匀切
      const n = Math.max(1, Math.ceil((xb - xa) / maxCell));
      for (let k = 0; k < n; k++) {
        const x0 = xa + ((xb - xa) * k) / n, x1 = xa + ((xb - xa) * (k + 1)) / n;
        // 两端 z 处的实际边界裁剪
        const za0 = Math.max(oa[0], Math.min(oa[1], x0)), za1 = Math.max(oa[0], Math.min(oa[1], x1));
        const zb0 = Math.max(ob[0], Math.min(ob[1], x0)), zb1 = Math.max(ob[0], Math.min(ob[1], x1));
        if (za1 - za0 < 1e-7 && zb1 - zb0 < 1e-7) continue;
        const p0 = v3(za0, y, za), p1 = v3(za1, y, za), p2 = v3(zb1, y, zb), p3 = v3(zb0, y, zb);
        const nv = v3(0, flip, 0);
        const uvf = (p: Vec3): [number, number] => [uvO[0] + (p.x - outline.cx) * uvS[0], uvO[1] + (p.z - outline.cz) * uvS[1]];
        if (opts.mask && opts.mask((p0.x + p1.x) / 2, (p0.z + p2.z) / 2)) continue;
        const ia = b.vertex(p0, nv, ...uvf(p0));
        const ib = b.vertex(p1, nv, ...uvf(p1));
        const ic = b.vertex(p2, nv, ...uvf(p2));
        const id = b.vertex(p3, nv, ...uvf(p3));
        if (flip > 0) b.quad(ia, ib, ic, id); else b.quad(ia, id, ic, ib);
      }
    }
  }
  void emit;
}

// ---------------------------------------------------------------- 无孔圆角板（径向收缩镶嵌）

/**
 * 圆角矩形填充板：径向收缩参数化，边界精确跟随圆角、内部三角形最少。
 * deform(x,z) 可做凹陷/起伏；uv(x,z) 可做平面 UV 映射。
 */
export function plateFill(
  b: MeshBuilder, q: RRect, y: number,
  opts: { nu?: number; nt?: number; flip?: boolean; deform?: (x: number, z: number) => number; uv?: (x: number, z: number) => [number, number]; cornerSegs?: number; vertexSampling?: boolean } = {},
): void {
  const nu = opts.nu ?? 48, nt = opts.nt ?? 2;
  const path = roundedRectPath(q.w, q.d, q.r, opts.cornerSegs ?? 8);
  const flip = opts.flip ? -1 : 1;
  const nv = v3(0, flip, 0);
  // 采样点：默认均匀弧长（nu 段）。**vertexSampling=true 时改用路径自身顶点**——
  // 低 LOD 下 nu 很小（如 8），均匀弧长会在圆角弧（31mm）上采不到点，整段圆角被一条
  // 上百毫米的弦切掉（页面预览里盖板顶角出现明显缺口）。用路径顶点则角点必被采到，
  // 直边仍是弦（本来就直，无误差）。
  const us: number[] = [];
  if (opts.vertexSampling) {
    for (const p of path) us.push(p.u);
    us.push(1);
  } else {
    for (let i = 0; i < nu; i++) us.push(i / nu);
    us.push(1);
  }
  const nU = us.length - 1;
  const grid: number[][] = [];
  for (let j = 0; j <= nt; j++) {
    const t = j / nt;
    const row: number[] = [];
    for (let i = 0; i <= nU; i++) {
      const p = pathAt(path, us[i]);
      // path 以原点为中心 → 向 (q.cx,q.cz) 收缩
      const x = q.cx + p.x * (1 - t);
      const z = q.cz + p.z * (1 - t);
      const yy = y + (opts.deform ? opts.deform(x, z) : 0);
      const uv = opts.uv ? opts.uv(x, z) : [x, z];
      row.push(b.vertex(v3(x, yy, z), nv, uv[0], uv[1]));
    }
    grid.push(row);
  }
  for (let j = 0; j < nt; j++) for (let i = 0; i < nU; i++) {
    if (flip > 0) b.quad(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
    else b.quad(grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]);
  }
}

/** 圆角矩形侧壁（从 y0 到 y1，法线朝外） */
export function rrectWall(b: MeshBuilder, q: RRect, y0: number, y1: number, segs = 10, flip = false): void {
  const pts = roundedRectOutline(q.w, q.d, q.r, q.cx, q.cz, segs);
  extrudeOutline(b, pts, y0, y1, { flipWall: flip });
}
