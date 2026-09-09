/**
 * 零依赖渲染内核 · 着色与路径追踪积分器
 * - 金属/介质 微表面 BRDF（GGX + VNDF 采样 + 多重散射能量补偿）
 * - 程序化影棚环境（等距柱状 importance sampling + MIS）
 * - 屏幕材质：薄玻璃 Fresnel 反射 + 下方自发光面板
 * - 相机：针孔 + 薄透镜景深
 */
import {
  Vec3, v3, add, sub, mul, scale, dot, cross, norm, len, toLocal, toWorld, Rng,
  ggxD, smithG1, smithG, sampleGgxReflect, pdfGgxReflect, evalGgxReflect,
  fresnelDielectric, schlick, clamp, sampleDisk, cosineHemisphere, basis, fbm2, mix,
} from './math.js';
import { Scene, Hit, makeHit } from './geom.js';
import { Texture, lum, hexToLinear } from './image.js';

// ---------------------------------------------------------------- 材质

export type MatKind = 'pbr' | 'screen' | 'emissive';

export interface Material {
  name: string;
  kind: MatKind;
  baseColor: [number, number, number];
  metallic: number;
  roughness: number;
  ior: number;
  emission: [number, number, number];
  baseTex?: Texture;
  emisTex?: Texture;
  /** 程序化粗糙度扰动（打破完美反射） */
  roughNoise: number;
  roughNoiseScale: number;
  /** 法线微扰幅度（喷砂/磨砂） */
  bumpAmp: number;
  bumpScale: number;
  /** 各向异性 0=各向同性 */
  anisotropy: number;
  /** 屏幕：玻璃反射强度与下方基板色 */
  glassRough: number;
}

export function makeMaterial(p: Partial<Material> = {}): Material {
  return {
    name: p.name ?? 'mat',
    kind: p.kind ?? 'pbr',
    baseColor: p.baseColor ?? [0.5, 0.5, 0.5],
    metallic: p.metallic ?? 0,
    roughness: p.roughness ?? 0.4,
    ior: p.ior ?? 1.5,
    emission: p.emission ?? [0, 0, 0],
    baseTex: p.baseTex,
    emisTex: p.emisTex,
    roughNoise: p.roughNoise ?? 0,
    roughNoiseScale: p.roughNoiseScale ?? 200,
    bumpAmp: p.bumpAmp ?? 0,
    bumpScale: p.bumpScale ?? 2000,
    anisotropy: p.anisotropy ?? 0,
    glassRough: p.glassRough ?? 0.02,
  };
}

// ---------------------------------------------------------------- 多重散射能量补偿表

const MS_TABLE_SIZE = 24;
let msTable: Float32Array | null = null;
/** 预计算 GGX 方向反照率 E(roughness, NoV)（Kulla-Conty 用），避免能量损失 */
function buildMsTable(): Float32Array {
  const N = MS_TABLE_SIZE;
  const t = new Float32Array(N * N);
  const rng = new Rng(12345);
  for (let ri = 0; ri < N; ri++) {
    const rough = (ri + 0.5) / N;
    const alpha = Math.max(1e-3, rough * rough);
    for (let vi = 0; vi < N; vi++) {
      const nov = (vi + 0.5) / N;
      const wo = v3(Math.sqrt(Math.max(0, 1 - nov * nov)), 0, nov);
      let sum = 0;
      const S = 256;
      for (let s = 0; s < S; s++) {
        const u1 = rng.next(), u2 = rng.next();
        const wi = sampleGgxReflect(wo, v3(0, 0, 1), alpha, u1, u2);
        if (wi.z <= 0) continue;
        sum += evalGgxReflect(wo, wi, v3(0, 0, 1), alpha);
      }
      t[ri * N + vi] = sum / S;
    }
  }
  return t;
}
function msLookup(rough: number, nov: number): number {
  if (!msTable) msTable = buildMsTable();
  const N = MS_TABLE_SIZE;
  const x = clamp(rough, 0, 1) * N - 0.5, y = clamp(nov, 0, 1) * N - 0.5;
  const x0 = clamp(Math.floor(x), 0, N - 1), y0 = clamp(Math.floor(y), 0, N - 1);
  const x1 = Math.min(N - 1, x0 + 1), y1 = Math.min(N - 1, y0 + 1);
  const tx = clamp(x - x0, 0, 1), ty = clamp(y - y0, 0, 1);
  const a = msTable[x0 * N + y0], b = msTable[x1 * N + y0], c = msTable[x0 * N + y1], d = msTable[x1 * N + y1];
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}
export function initMsTable(): void { if (!msTable) msTable = buildMsTable(); }

// ---------------------------------------------------------------- 环境（等距柱状）

export interface EnvLightDef {
  /** 球坐标方向（度）：theta 方位角(0=+z)，phi 仰角(-90..90) */
  theta: number; phi: number;
  /** 角尺寸（度） */
  width: number; height: number;
  radiance: [number, number, number];
  softness: number;
  shape?: 'rect' | 'strip' | 'round';
  /** 沿灯高度方向的亮度渐变 [底, 顶]（模拟渐变柔光布） */
  gradV?: [number, number];
}

export interface StudioConfig {
  /** 背景梯度（仰角 -90..90 映射） */
  zenith: [number, number, number];
  horizon: [number, number, number];
  nadir: [number, number, number];
  lights: EnvLightDef[];
  /** 环带亮度（模拟房间墙） */
  ambient: [number, number, number];
  envRes?: [number, number];
}

export function defaultStudio(over: Partial<StudioConfig> = {}): StudioConfig {
  return {
    zenith: [1.15, 1.15, 1.16],
    horizon: [0.82, 0.82, 0.83],
    nadir: [0.28, 0.28, 0.29],
    ambient: [0.35, 0.35, 0.36],
    lights: [
      { theta: -32, phi: 42, width: 44, height: 40, radiance: [26, 26, 27], softness: 0.16, shape: 'rect' },
      { theta: 38, phi: 26, width: 34, height: 30, radiance: [9, 9, 9.2], softness: 0.22, shape: 'rect' },
      { theta: 178, phi: 18, width: 60, height: 22, radiance: [6.5, 6.5, 6.6], softness: 0.3, shape: 'strip' },
    ],
    ...over,
  };
}

interface LightCache { ld: Vec3; tt: Vec3; bb: Vec3; rw: number; rh: number; rad: [number, number, number]; softness: number; shape: string; gradV?: [number, number] }
export class Environment {
  private lc: LightCache[] = [];
  W: number; H: number;
  rad: Float32Array;
  cdf: Float32Array;      // H*W 累积
  rowCdf: Float32Array;   // H
  total = 0;
  private avgRad = 1;
  /** 单位立体角（每像素） */
  omega0 = 0;

  constructor(cfg: StudioConfig) {
    this.cfg = cfg;
    for (const L of cfg.lights) {
      const lth = (L.theta * Math.PI) / 180, lph = (L.phi * Math.PI) / 180;
      const ld = v3(Math.sin(lth) * Math.cos(lph), Math.sin(lph), Math.cos(lth) * Math.cos(lph));
      const { t, b } = localFrame(ld);
      this.lc.push({ ld, tt: t, bb: b, rw: (L.width * Math.PI) / 180 * 0.5, rh: (L.height * Math.PI) / 180 * 0.5, rad: L.radiance, softness: L.softness, shape: L.shape ?? 'rect', gradV: L.gradV });
    }
    const [W, H] = cfg.envRes ?? [768, 384];
    this.W = W; this.H = H;
    this.rad = new Float32Array(W * H * 3);
    this.cdf = new Float32Array(W * H);
    this.rowCdf = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      // 等距柱状：v=0 顶部（+y）
      const phi = (0.5 - (y + 0.5) / H) * Math.PI;
      const sinP = Math.sin(phi), cosP = Math.cos(phi);
      for (let x = 0; x < W; x++) {
        const theta = ((x + 0.5) / W * 2 - 1) * Math.PI;
        const dir = v3(Math.sin(theta) * cosP, sinP, Math.cos(theta) * cosP);
        const c = this.evalBase(cfg, dir, phi);
        const i = (y * W + x) * 3;
        this.rad[i] = c[0]; this.rad[i + 1] = c[1]; this.rad[i + 2] = c[2];
      }
    }
    this.buildCdf();
  }

  private evalBase(cfg: StudioConfig, dir: Vec3, phi: number): [number, number, number] {
    // 背景梯度
    const t = (Math.sin(phi) + 1) * 0.5; // 0=下 1=上
    let r: number, g: number, b: number;
    if (t >= 0.5) {
      const k = (t - 0.5) / 0.5;
      r = mix(cfg.horizon[0], cfg.zenith[0], k * k * (3 - 2 * k));
      g = mix(cfg.horizon[1], cfg.zenith[1], k * k * (3 - 2 * k));
      b = mix(cfg.horizon[2], cfg.zenith[2], k * k * (3 - 2 * k));
    } else {
      const k = t / 0.5;
      r = mix(cfg.nadir[0], cfg.horizon[0], k * k * (3 - 2 * k));
      g = mix(cfg.nadir[1], cfg.horizon[1], k * k * (3 - 2 * k));
      b = mix(cfg.nadir[2], cfg.horizon[2], k * k * (3 - 2 * k));
    }
    // 环境带（房间墙）
    const band = Math.exp(-Math.pow((Math.abs(phi) - 0.12) / 0.35, 2));
    r += cfg.ambient[0] * band * 0.6; g += cfg.ambient[1] * band * 0.6; b += cfg.ambient[2] * band * 0.6;
    // 灯箱（预计算方向/切基）
    for (let i = 0; i < this.lc.length; i++) {
      const L = this.lc[i];
      const cosA = dir.x * L.ld.x + dir.y * L.ld.y + dir.z * L.ld.z;
      if (cosA <= 1e-4) continue;
      const inv = 1 / cosA;
      const dx = (dir.x * L.tt.x + dir.y * L.tt.y + dir.z * L.tt.z) * inv;
      const dy = (dir.x * L.bb.x + dir.y * L.bb.y + dir.z * L.bb.z) * inv;
      let inside: number;
      if (L.shape === 'round') {
        const q = Math.sqrt(dx * dx + dy * dy) / L.rw;
        const q2 = q * q; inside = Math.exp(-(q2 * q2));
      } else {
        const u = dx / L.rw, v = dy / L.rh;
        const u2 = u * u, v2 = v * v;
        inside = Math.exp(-(u2 * u2)) * Math.exp(-(v2 * v2));
      }
      if (inside > 0) {
        if (L.gradV) {
          const t = clamp((dy / L.rh + 1) * 0.5, 0, 1);
          inside *= L.gradV[0] + (L.gradV[1] - L.gradV[0]) * t;
        }
        const k = inside * (1 - L.softness * 0.15);
        r += L.rad[0] * k; g += L.rad[1] * k; b += L.rad[2] * k;
      }
    }
    return [r, g, b];
  }

  private buildCdf(): void {
    const { W, H, rad } = this;
    let acc = 0;
    for (let y = 0; y < H; y++) {
      const phi = (0.5 - (y + 0.5) / H) * Math.PI;
      const w = Math.cos(phi); // 立体角权重
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const l = lum(rad[i], rad[i + 1], rad[i + 2]) * Math.max(0.0001, w);
        acc += l;
        this.cdf[y * W + x] = acc;
      }
      this.rowCdf[y] = acc;
    }
    this.total = acc;
    this.omega0 = (2 * Math.PI / W) * (Math.PI / H);
    this.avgRad = acc / (W * H);
  }

  /** 解析求值（无纹素放大/采样噪声；用于反射与逃逸光线） */
  eval(dir: Vec3): [number, number, number] {
    const phi = Math.asin(clamp(dir.y, -1, 1));
    const theta = Math.atan2(dir.x, dir.z);
    void theta;
    return this.evalBase(this.cfg!, dir, phi);
  }
  private cfg: StudioConfig | null = null;
  private bilinear(fx: number, fy: number): [number, number, number] {
    const W = this.W, H = this.H;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    let x1 = x0 + 1, y1 = y0 + 1;
    x0 = ((x0 % W) + W) % W; x1 = ((x1 % W) + W) % W;
    y0 = clamp(y0, 0, H - 1); y1 = clamp(y1, 0, H - 1);
    const o: [number, number, number] = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const a = this.rad[(y0 * W + x0) * 3 + c], b = this.rad[(y0 * W + x1) * 3 + c];
      const e = this.rad[(y1 * W + x0) * 3 + c], f = this.rad[(y1 * W + x1) * 3 + c];
      const top = a + (b - a) * tx, bot = e + (f - e) * tx;
      o[c] = top + (bot - top) * ty;
    }
    return o;
  }
  pdf(dir: Vec3): number {
    const phi = Math.asin(clamp(dir.y, -1, 1));
    const theta = Math.atan2(dir.x, dir.z);
    const x = clamp(Math.floor((theta / Math.PI + 1) * 0.5 * this.W), 0, this.W - 1);
    const y = clamp(Math.floor((0.5 - phi / Math.PI) * this.H), 0, this.H - 1);
    const i = (y * this.W + x) * 3;
    const l = lum(this.rad[i], this.rad[i + 1], this.rad[i + 2]) * Math.max(0.0001, Math.cos(phi));
    return l / Math.max(1e-12, this.total * this.omega0);
  }
  /** 重要性采样：返回方向与 pdf */
  sample(u1: number, u2: number): { dir: Vec3; pdf: number; rad: [number, number, number] } {
    const { W, H } = this;
    const target = u1 * this.total;
    // 行二分
    let lo = 0, hi = H - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.rowCdf[mid] < target) lo = mid + 1; else hi = mid; }
    const y = lo;
    const rowStart = y > 0 ? this.rowCdf[y - 1] : 0;
    const rowTotal = this.rowCdf[y] - rowStart;
    const rowTarget = rowStart + u2 * rowTotal;
    let xlo = 0, xhi = W - 1;
    while (xlo < xhi) { const mid = (xlo + xhi) >> 1; if (this.cdf[y * W + mid] < rowTarget) xlo = mid + 1; else xhi = mid; }
    const x = xlo;
    const phi = (0.5 - (y + 0.5) / H) * Math.PI;
    const theta = ((x + 0.5) / W * 2 - 1) * Math.PI;
    const cp = Math.cos(phi);
    const dir = v3(Math.sin(theta) * cp, Math.sin(phi), Math.cos(theta) * cp);
    const i = (y * W + x) * 3;
    // pdf 必须与 buildCdf 的权重一致（含 cos 立体角因子），否则 MIS 有偏
    const l = lum(this.rad[i], this.rad[i + 1], this.rad[i + 2]) * Math.max(0.0001, Math.cos(phi));
    const pdf = l / Math.max(1e-12, this.total * this.omega0);
    return { dir, pdf, rad: [this.rad[i], this.rad[i + 1], this.rad[i + 2]] };
  }
  /** 平均亮度（曝光参考） */
  average(): number { return this.avgRad; }
}

function localFrame(d: Vec3): { t: Vec3; b: Vec3 } {
  const up = Math.abs(d.y) < 0.95 ? v3(0, 1, 0) : v3(1, 0, 0);
  const t = norm(cross(up, d));
  const b = norm(cross(d, t));
  return { t, b };
}

// ---------------------------------------------------------------- 相机

export interface Camera {
  eye: Vec3;
  target: Vec3;
  up: Vec3;
  /** 垂直视场角（度） */
  fovY: number;
  /** 光圈直径（米），0=针孔 */
  aperture: number;
  focusDist: number;
  /** 传感器偏移（移轴），单位：视高比例 */
  shiftY: number;
  shiftX: number;
}

export function cameraBasis(cam: Camera): { fwd: Vec3; right: Vec3; up: Vec3 } {
  const fwd = norm(sub(cam.target, cam.eye));
  let right = cross(fwd, cam.up);
  if (len(right) < 1e-6) right = v3(1, 0, 0);
  right = norm(right);
  const up = norm(cross(right, fwd));
  return { fwd, right, up };
}

export function makeRay(cam: Camera, px: number, py: number, w: number, h: number, lensU: number, lensV: number, rng: Rng): { o: Vec3; d: Vec3 } {
  const { fwd, right, up } = cameraBasis(cam);
  const aspect = w / h;
  const tanY = Math.tan((cam.fovY * Math.PI) / 180 * 0.5);
  const tanX = tanY * aspect;
  const sx = ((px + rng.next()) / w * 2 - 1) + cam.shiftX * 2;
  const sy = (1 - (py + rng.next()) / h * 2) + cam.shiftY * 2;
  const dir = norm(add(add(scale(right, sx * tanX), scale(up, sy * tanY)), fwd));
  if (cam.aperture <= 0) return { o: cam.eye, d: dir };
  const [dx, dy] = sampleDisk(rng.next(), rng.next());
  const r = cam.aperture * 0.5;
  const o = add(add(cam.eye, scale(right, dx * r)), scale(up, dy * r));
  const focal = add(cam.eye, scale(dir, cam.focusDist));
  return { o, d: norm(sub(focal, o)) };
}

// ---------------------------------------------------------------- 着色上下文

export interface SceneCtx {
  scene: Scene;
  env: Environment;
  mats: Material[];
  maxDepth: number;
  pixelAngle: number;
  /** 相机直射逃逸光线返回黑（影棚黑幕：环境仍用于照明与反射） */
  blackBg?: boolean;
  /** 环境光 MIS（默认开） */
  misEnv?: boolean;
  /** NEE 最小粗糙度（低于此值仅用 BSDF 采样，避免大光源+光泽面的萤火虫） */
  neeMinRough?: number;
}

interface BsdfSample { wi: Vec3; f: Vec3; pdf: number; specular: boolean }

function evalBsdf(mat: Material, base: [number, number, number], n: Vec3, wo: Vec3, wi: Vec3, out: Vec3): number {
  const NoL = dot(n, wi), NoV = dot(n, wo);
  if (NoL <= 0 || NoV <= 0) return 0;
  const h = norm(add(wo, wi));
  const NoH = Math.max(0, dot(n, h));
  const VoH = Math.max(0, dot(wo, h));
  const rough = mat.roughness;
  const alpha = Math.max(1e-3, rough * rough);
  const F0r = mix(0.04, base[0], mat.metallic);
  const F0g = mix(0.04, base[1], mat.metallic);
  const F0b = mix(0.04, base[2], mat.metallic);
  const Fc = [F0r + (1 - F0r) * Math.pow(1 - VoH, 5), F0g + (1 - F0g) * Math.pow(1 - VoH, 5), F0b + (1 - F0b) * Math.pow(1 - VoH, 5)];
  const D = ggxD(NoH, alpha);
  const G = smithG(NoV, NoL, alpha);
  const spec = D * G / (4 * NoV * NoL);
  const kd = (1 - mat.metallic);
  // 多重散射能量补偿（金属）
  let msScale = 1;
  if (mat.metallic > 0.5 && rough > 0.15) {
    const E = msLookup(rough, NoV);
    const Ei = msLookup(rough, NoL);
    const avg = 1 - (1 - E) * (1 - Ei) / Math.max(1e-4, 1 - msLookup(rough, 0.5));
    msScale = 1 + Math.max(0, avg) * 0.9;
  }
  for (let c = 0; c < 3; c++) {
    const diffuse = kd * base[c] / Math.PI * (1 - Fc[c]);
    const s = spec * Fc[c] * msScale;
    const val = (diffuse + s) * NoL;
    if (c === 0) out.x = val; else if (c === 1) out.y = val; else out.z = val;
  }
  return NoL;
}

function bsdfPdf(mat: Material, base: [number, number, number], n: Vec3, wo: Vec3, wi: Vec3): number {
  const NoL = dot(n, wi), NoV = dot(n, wo);
  if (NoL <= 0 || NoV <= 0) return 0;
  const alpha = Math.max(1e-3, mat.roughness * mat.roughness);
  const ps = specProb(mat, base);
  const pdfS = pdfGgxReflect(wo, wi, n, alpha);
  const pdfD = NoL / Math.PI;
  return ps * pdfS + (1 - ps) * pdfD;
}

function specProb(mat: Material, base: [number, number, number]): number {
  const f0 = mix(0.04, lum(base[0], base[1], base[2]), mat.metallic);
  const diff = lum(base[0], base[1], base[2]) * (1 - mat.metallic);
  let p = (f0 * 1.0) / (f0 + diff + 1e-6);
  // 光滑面提高镜面采样概率
  if (mat.roughness < 0.12) p = Math.max(p, 0.85);
  return clamp(p, 0.05, 0.98);
}

function sampleBsdf(mat: Material, base: [number, number, number], n: Vec3, wo: Vec3, rng: Rng, out: BsdfSample): void {
  const alpha = Math.max(1e-3, mat.roughness * mat.roughness);
  const ps = specProb(mat, base);
  if (rng.next() < ps) {
    const wi = sampleGgxReflect(wo, n, alpha, rng.next(), rng.next());
    if (wi.x === 0 && wi.y === 0 && wi.z === 0) { out.pdf = 0; out.f = v3(0, 0, 0); out.wi = v3(0, 0, 0); out.specular = true; return; }
    const cosT = evalBsdf(mat, base, n, wo, wi, out.f);
    const pdf = ps * pdfGgxReflect(wo, wi, n, alpha);
    out.pdf = pdf; out.wi = wi; out.specular = true;
    if (cosT <= 0) out.pdf = 0;
    return;
  }
  const local = cosineHemisphere(rng.next(), rng.next());
  const wi = toWorld(local, n);
  const cosT = evalBsdf(mat, base, n, wo, wi, out.f);
  const pdf = (1 - ps) * (dot(n, wi) / Math.PI);
  out.pdf = pdf; out.wi = wi; out.specular = false;
  if (cosT <= 0) out.pdf = 0;
}

// ---------------------------------------------------------------- 积分器

export interface IntegratorOptions {
  maxDepth: number;
  russianRouletteStart: number;
  clampRadiance: number;
}

export interface PathAux {
  albedo: Float32Array; // 3
  normal: Float32Array; // 3
  depth: Float32Array;  // 1
}

export function renderSample(
  ctx: SceneCtx, cam: Camera, px: number, py: number, w: number, h: number, rng: Rng, opt: IntegratorOptions,
  outRGB: Float32Array, aux: PathAux, stratum: { i: number; n: number } = { i: 0, n: 1 },
): void {
  const { scene, env, mats } = ctx;
  const ray = makeRay(cam, px, py, w, h, 0, 0, rng);
  let ox = ray.o.x, oy = ray.o.y, oz = ray.o.z;
  let dx = ray.d.x, dy = ray.d.y, dz = ray.d.z;
  let tr = 1, tg = 1, tb = 1;
  let Lr = 0, Lg = 0, Lb = 0;
  let lastPdf = 0;
  let lastWasDiffuse = false;
  let lastNee = false;
  const hit = makeHit();
  const f = v3(0, 0, 0);
  let auxSet = false;

  for (let depth = 0; depth < opt.maxDepth; depth++) {
    const found = scene.intersect(ox, oy, oz, dx, dy, dz, 1e30, hit);
    if (!found) {
      if (depth === 0) {
        if (ctx.blackBg) { break; }
        const e = env.eval(v3(dx, dy, dz));
        Lr += tr * e[0]; Lg += tg * e[1]; Lb += tb * e[2];
        if (!auxSet) { aux.albedo.set([e[0], e[1], e[2]]); aux.normal.set([dx, dy, dz]); aux.depth[0] = 1e30; }
      } else {
        const e = env.eval(v3(dx, dy, dz));
        let weight = 1;
        if (lastWasDiffuse) {
          const pdfL = env.pdf(v3(dx, dy, dz));
          weight = pdfL > 0 ? lastPdf / (lastPdf + pdfL) : 1;
        }
        Lr += tr * e[0] * weight; Lg += tg * e[1] * weight; Lb += tb * e[2] * weight;
      }
      break;
    }
    const mat = mats[scene.triMat[scene.tSrc[hit.tri]]];
    // 纹理 albedo（每命中点采样；lod 由命中距离估计）
    const base: [number, number, number] = [mat.baseColor[0], mat.baseColor[1], mat.baseColor[2]];
    if (mat.baseTex && mat.kind === 'pbr') {
      const lod = Math.log2(Math.max(1, hit.t * ctx.pixelAngle * mat.baseTex.w));
      const t = mat.baseTex.sample(hit.uu, hit.vv, lod);
      base[0] = t[0]; base[1] = t[1]; base[2] = t[2];
    }
    let nx = hit.nx, ny = hit.ny, nz = hit.nz;
    if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
    const n = v3(nx, ny, nz);
    const p = v3(hit.px, hit.py, hit.pz);
    const wo = v3(-dx, -dy, -dz);

    if (!auxSet) {
      auxSet = true;
      aux.normal[0] = nx; aux.normal[1] = ny; aux.normal[2] = nz;
      aux.depth[0] = hit.t;
      if (mat.baseTex) {
        const t = mat.baseTex.sample(hit.uu, hit.vv, 0);
        aux.albedo[0] = t[0]; aux.albedo[1] = t[1]; aux.albedo[2] = t[2];
      } else {
        aux.albedo[0] = mat.baseColor[0]; aux.albedo[1] = mat.baseColor[1]; aux.albedo[2] = mat.baseColor[2];
      }
    }

    // ---- 屏幕材质：薄玻璃 + 下方发光面板
    if (mat.kind === 'screen') {
      const NoV = Math.max(1e-4, dot(n, wo));
      const F = fresnelDielectric(NoV, 1.5);
      // 菲涅尔分光：以概率 F 走反射分支。反射积分 = F·L_env，
      // 采样概率也是 F → 每次贡献 = L_env（不再额外除以 F，否则偏亮 1/F 倍）
      if (rng.next() < F) {
        const alpha = Math.max(1e-4, mat.glassRough * mat.glassRough);
        const wi = sampleGgxReflect(wo, n, alpha, rng.next(), rng.next());
        if (wi.x === 0 && wi.y === 0 && wi.z === 0) break;
        dx = wi.x; dy = wi.y; dz = wi.z;
        ox = hit.px + nx * 1e-5; oy = hit.py + ny * 1e-5; oz = hit.pz + nz * 1e-5;
        lastWasDiffuse = false; lastPdf = 1;
        continue;
      }
      // 透射：见到发光面板
      if (mat.emisTex) {
        const tex = mat.emisTex;
        const lod = Math.log2(Math.max(1, hit.t * ctx.pixelAngle * tex.w));
        const c = tex.sample(hit.uu, hit.vv, lod);
        const k = 1 / Math.max(1e-4, 1 - F);
        Lr += tr * c[0] * k; Lg += tg * c[1] * k; Lb += tb * c[2] * k;
      } else {
        Lr += tr * mat.emission[0]; Lg += tg * mat.emission[1]; Lb += tb * mat.emission[2];
      }
      // 面板基板吸收，终止
      break;
    }

    if (mat.kind === 'emissive') {
      Lr += tr * mat.emission[0]; Lg += tg * mat.emission[1]; Lb += tb * mat.emission[2];
      break;
    }

    // ---- 常规 PBR
    const isSmooth = mat.roughness < 0.035;
    const s = { wi: v3(0, 0, 0), f: v3(0, 0, 0), pdf: 0, specular: false };

    // NEE：环境重要性采样（glossy 表面可用 ctx.neeMinRough 关闭）
    lastNee = !isSmooth && mat.roughness >= (ctx.neeMinRough ?? 0);
    if (lastNee) {
      // 分层采样：环境方向的 u1 在样本内均匀分层（降噪关键）
      const u1 = stratum.n > 1 ? (stratum.i + rng.next()) / stratum.n : rng.next();
      const ls = env.sample(u1, rng.next());
      const wi = ls.dir;
      const NoL = dot(n, wi);
      if (NoL > 0 && ls.pdf > 0) {
        const cosT = evalBsdf(mat, base, n, wo, wi, f);
        if (cosT > 0) {
          const occluded = scene.occluded(hit.px + nx * 1e-5, hit.py + ny * 1e-5, hit.pz + nz * 1e-5, wi.x, wi.y, wi.z, 1e30);
          if (!occluded) {
            const pdfB = bsdfPdf(mat, base, n, wo, wi);
            const wgt = ls.pdf / (ls.pdf + pdfB);
            Lr += tr * f.x * ls.rad[0] * wgt / ls.pdf;
            Lg += tg * f.y * ls.rad[1] * wgt / ls.pdf;
            Lb += tb * f.z * ls.rad[2] * wgt / ls.pdf;
          }
        }
      }
    }

    sampleBsdf(mat, base, n, wo, rng, s);
    if (s.pdf <= 0) break;
    const cosL = dot(n, s.wi);
    if (cosL <= 0) break;
    tr *= s.f.x / s.pdf; tg *= s.f.y / s.pdf; tb *= s.f.z / s.pdf;
    // 溢出保护
    const mx = Math.max(tr, tg, tb);
    if (mx > opt.clampRadiance) { const k = opt.clampRadiance / mx; tr *= k; tg *= k; tb *= k; }
    lastWasDiffuse = !s.specular;
    lastPdf = s.pdf;
    dx = s.wi.x; dy = s.wi.y; dz = s.wi.z;
    const eps = 2e-5 * Math.max(1, hit.t);
    ox = hit.px + nx * eps; oy = hit.py + ny * eps; oz = hit.pz + nz * eps;

    if (depth >= opt.russianRouletteStart) {
      const q = Math.min(0.95, Math.max(tr, tg, tb));
      if (rng.next() > q) break;
      tr /= q; tg /= q; tb /= q;
    }
    if (tr + tg + tb <= 1e-6) break;
  }
  if (!auxSet) {
    aux.depth[0] = Infinity;
    aux.normal[0] = 0; aux.normal[1] = 0; aux.normal[2] = 0;
    aux.albedo[0] = 0; aux.albedo[1] = 0; aux.albedo[2] = 0;
  }
  outRGB[0] = Lr; outRGB[1] = Lg; outRGB[2] = Lb;
}
