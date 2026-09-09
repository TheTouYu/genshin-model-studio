/**
 * 零依赖渲染内核 · 数学与采样
 * 约定：右手系，y 向上；Vec3 用普通对象（V8 单态对象优化）；热点路径用就地写入。
 */

export interface Vec3 { x: number; y: number; z: number }
export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const set = (o: Vec3, a: Vec3): Vec3 => { o.x = a.x; o.y = a.y; o.z = a.z; return o; };
export const setv = (o: Vec3, x: number, y: number, z: number): Vec3 => { o.x = x; o.y = y; o.z = z; return o; };
export const add = (a: Vec3, b: Vec3, o?: Vec3): Vec3 => { o = o || v3(); o.x = a.x + b.x; o.y = a.y + b.y; o.z = a.z + b.z; return o; };
export const sub = (a: Vec3, b: Vec3, o?: Vec3): Vec3 => { o = o || v3(); o.x = a.x - b.x; o.y = a.y - b.y; o.z = a.z - b.z; return o; };
export const mul = (a: Vec3, b: Vec3, o?: Vec3): Vec3 => { o = o || v3(); o.x = a.x * b.x; o.y = a.y * b.y; o.z = a.z * b.z; return o; };
export const scale = (a: Vec3, s: number, o?: Vec3): Vec3 => { o = o || v3(); o.x = a.x * s; o.y = a.y * s; o.z = a.z * s; return o; };
export const madd = (a: Vec3, b: Vec3, s: number, o?: Vec3): Vec3 => { o = o || v3(); o.x = a.x + b.x * s; o.y = a.y + b.y * s; o.z = a.z + b.z * s; return o; };
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3, o?: Vec3): Vec3 => {
  o = o || v3();
  const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
  o.x = x; o.y = y; o.z = z; return o;
};
export const len = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const len2 = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const dist = (a: Vec3, b: Vec3): number => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
export const norm = (a: Vec3, o?: Vec3): Vec3 => {
  const l = len(a); if (l === 0) return setv(o || v3(), 0, 0, 0);
  const inv = 1 / l; return setv(o || v3(), a.x * inv, a.y * inv, a.z * inv);
};
export const neg = (a: Vec3, o?: Vec3): Vec3 => setv(o || v3(), -a.x, -a.y, -a.z);
export const lerp3 = (a: Vec3, b: Vec3, t: number, o?: Vec3): Vec3 =>
  setv(o || v3(), a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
export const isFinite3 = (a: Vec3): boolean => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);

/** 正交基（Duff 2017 无分支版）：返回与 n 垂直的两个单位向量 */
export function basis(n: Vec3): [Vec3, Vec3] {
  const sign = n.z >= 0 ? 1 : -1;
  const a = -1 / (sign + n.z);
  const b = n.x * n.y * a;
  return [v3(1 + sign * n.x * n.x * a, sign * b, -sign * n.x), v3(b, sign + n.y * n.y * a, -n.y)];
}
export function toWorld(d: Vec3, n: Vec3): Vec3 {
  const [t, b] = basis(n);
  return v3(t.x * d.x + b.x * d.y + n.x * d.z, t.y * d.x + b.y * d.y + n.y * d.z, t.z * d.x + b.z * d.y + n.z * d.z);
}
export function toLocal(d: Vec3, n: Vec3): Vec3 {
  const [t, b] = basis(n);
  return v3(dot(d, t), dot(d, b), dot(d, n));
}

/** 4x4 矩阵：行主序 mat[row*4+col] */
export type Mat4 = Float64Array;
export const mat4 = (): Mat4 => new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function m4mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
    o[r * 4 + c] = s;
  }
  return o;
}
export function m4translate(x: number, y: number, z: number): Mat4 {
  const m = mat4(); m[3] = x; m[7] = y; m[11] = z; return m;
}
export function m4scale(x: number, y: number, z: number): Mat4 {
  const m = mat4(); m[0] = x; m[5] = y; m[10] = z; return m;
}
export function m4rotX(a: number): Mat4 {
  const m = mat4(), c = Math.cos(a), s = Math.sin(a);
  m[5] = c; m[6] = -s; m[9] = s; m[10] = c; return m;
}
export function m4rotY(a: number): Mat4 {
  const m = mat4(), c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[2] = s; m[8] = -s; m[10] = c; return m;
}
export function m4rotZ(a: number): Mat4 {
  const m = mat4(), c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[1] = -s; m[4] = s; m[5] = c; return m;
}
export function m4xformPoint(m: Mat4, p: Vec3): Vec3 {
  return v3(
    m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3],
    m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
    m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11],
  );
}
export function m4xformDir(m: Mat4, p: Vec3): Vec3 {
  return v3(
    m[0] * p.x + m[1] * p.y + m[2] * p.z,
    m[4] * p.x + m[5] * p.y + m[6] * p.z,
    m[8] * p.x + m[9] * p.y + m[10] * p.z,
  );
}
/** 法线变换：逆转置（本工程只用刚体+均匀缩放，等价于旋转） */
export function m4xformNormal(m: Mat4, n: Vec3): Vec3 {
  return norm(m4xformDir(m, n));
}

// ---------------------------------------------------------------- RNG & 采样

const rotl = (x: number, k: number): number => (((x << k) | (x >>> (32 - k))) >>> 0);

export class Rng {
  private s0 = 0; private s1 = 0; private s2 = 0; private s3 = 0;
  constructor(seed: number) { this.seed(seed); }
  seed(seed: number): void {
    // splitmix32 初始化
    let x = (seed >>> 0) || 0x9e3779b9;
    const sm = (): number => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s0 = sm(); this.s1 = sm(); this.s2 = sm(); this.s3 = sm();
    if (!(this.s0 | this.s1 | this.s2 | this.s3)) this.s0 = 1;
  }
  /** xoshiro128** → [0,1) */
  next(): number {
    const res = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return res * 2.3283064365386963e-10;
  }
  next2(): [number, number] { return [this.next(), this.next()]; }
}

/** 分层抖动：n 个样本的第 i 个（1D） */
export function stratify(i: number, n: number, rnd: number): number {
  return (i + rnd) / n;
}
/** 同心圆盘采样（Shirley） */
export function sampleDisk(u1: number, u2: number): [number, number] {
  const r = Math.sqrt(u1), phi = 2 * Math.PI * u2;
  return [r * Math.cos(phi), r * Math.sin(phi)];
}
/** 余弦半球采样（局部空间，z 为法线） */
export function cosineHemisphere(u1: number, u2: number): Vec3 {
  const [x, y] = sampleDisk(u1, u2);
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  return v3(x, y, z);
}
export function uniformHemisphere(u1: number, u2: number): Vec3 {
  const z = u1, r = Math.sqrt(Math.max(0, 1 - z * z)), phi = 2 * Math.PI * u2;
  return v3(r * Math.cos(phi), r * Math.sin(phi), z);
}
/** 均匀球面 */
export function uniformSphere(u1: number, u2: number): Vec3 {
  const z = 1 - 2 * u1, r = Math.sqrt(Math.max(0, 1 - z * z)), phi = 2 * Math.PI * u2;
  return v3(r * Math.cos(phi), r * Math.sin(phi), z);
}
/** 圆锥内均匀采样 */
export function sampleCone(u1: number, u2: number, cosMax: number): Vec3 {
  const cosT = 1 - u1 * (1 - cosMax);
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  const phi = 2 * Math.PI * u2;
  return v3(sinT * Math.cos(phi), sinT * Math.sin(phi), cosT);
}
/** 幂次余弦（用于粗糙镜面近似） */
export function samplePowerCos(u1: number, u2: number, alpha: number): Vec3 {
  const cosT = Math.pow(u1, 1 / (alpha + 1));
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  const phi = 2 * Math.PI * u2;
  return v3(sinT * Math.cos(phi), sinT * Math.sin(phi), cosT);
}

/** GGX 法线分布 */
export function ggxD(nh: number, alpha: number): number {
  const a2 = alpha * alpha;
  const d = nh * nh * (a2 - 1) + 1;
  return a2 / (Math.PI * d * d);
}
/** Smith 高度相关遮蔽（GGX） */
export function smithG1(no: number, alpha: number): number {
  const a = alpha * alpha;
  const l = no * Math.sqrt(a + (1 - a) * no * no);
  return 2 * no / (l + no + 1e-12);
}
export function smithG(no: number, ni: number, alpha: number): number {
  return smithG1(no, alpha) * smithG1(ni, alpha);
}
/** 可见法线分布采样（Heitz 2018） */
export function sampleGgxVndf(wo: Vec3, alpha: number, u1: number, u2: number): Vec3 {
  // 变换到半球
  const vh = norm(v3(alpha * wo.x, alpha * wo.y, wo.z));
  const lensq = vh.x * vh.x + vh.y * vh.y;
  const t1 = lensq > 0 ? v3(-vh.y, vh.x, 0) : v3(1, 0, 0);
  const t1n = norm(t1);
  const t2 = cross(vh, t1n);
  const [px, py] = sampleDisk(u1, u2);
  const s = 0.5 * (1 + vh.z);
  const py2 = (1 - s) * Math.sqrt(Math.max(0, 1 - px * px)) + s * py;
  const pz = Math.sqrt(Math.max(0, 1 - px * px - py2 * py2));
  const n = v3(t1n.x * px + t2.x * py2 + vh.x * pz, t1n.y * px + t2.y * py2 + vh.y * pz, t1n.z * px + t2.z * py2 + vh.z * pz);
  return norm(v3(alpha * n.x, alpha * n.y, Math.max(0, n.z) + 1e-9));
}
/** GGX 反射采样：给定出射方向与法线，返回入射方向（世界） */
export function sampleGgxReflect(wo: Vec3, n: Vec3, alpha: number, u1: number, u2: number): Vec3 {
  const wl = toLocal(wo, n);
  if (wl.z <= 0) return v3(0, 0, 0);
  const h = sampleGgxVndf(wl, alpha, u1, u2);
  const dh = dot(wl, h);
  const wi = v3(2 * dh * h.x - wl.x, 2 * dh * h.y - wl.y, 2 * dh * h.z - wl.z);
  if (wi.z <= 0) return v3(0, 0, 0);
  return toWorld(norm(wi), n);
}
/** GGX 反射 pdf（世界方向，VNDF 采样下）：D(h)·G1(wo)/(4·wo·n) */
export function pdfGgxReflect(wo: Vec3, wi: Vec3, n: Vec3, alpha: number): number {
  const wl = toLocal(wo, n), il = toLocal(wi, n);
  if (wl.z <= 0 || il.z <= 0) return 0;
  const h = norm(add(wl, il));
  const d = ggxD(h.z, alpha);
  return d * smithG1(wl.z, alpha) / (4 * Math.max(1e-9, wl.z));
}
/** GGX 反射 f*cos / pdf 的权重（数值稳定版，含 Smith G） */
export function evalGgxReflect(wo: Vec3, wi: Vec3, n: Vec3, alpha: number): number {
  const wl = toLocal(wo, n), il = toLocal(wi, n);
  if (wl.z <= 0 || il.z <= 0) return 0;
  const h = norm(add(wl, il));
  const d = ggxD(h.z, alpha);
  const g = smithG(wl.z, il.z, alpha);
  const f = d * g / (4 * wl.z * il.z);
  return f * il.z; // f * cos
}
/** 菲涅尔（精确，介质） */
export function fresnelDielectric(cosI: number, eta: number): number {
  let ci = Math.min(1, Math.max(-1, cosI));
  const ei = eta;
  const si2 = Math.max(0, 1 - ci * ci) / (ei * ei);
  if (si2 >= 1) return 1;
  const ct = Math.sqrt(Math.max(0, 1 - si2));
  const rs = (ei * ci - ct) / (ei * ci + ct);
  const rp = (ci - ei * ct) / (ci + ei * ct);
  return 0.5 * (rs * rs + rp * rp);
}
export function schlick(cosT: number): number {
  const m = Math.max(0, 1 - cosT), m2 = m * m;
  return m2 * m2 * m;
}
export function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- 噪声（程序化材质）

function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** 值噪声（双线性） */
export function valueNoise2(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return mix(mix(a, b, u), mix(c, d, u), v);
}
export function fbm2(x: number, y: number, oct = 3, lac = 2, gain = 0.5): number {
  let s = 0, amp = 1, f = 1, norm2 = 0;
  for (let i = 0; i < oct; i++) { s += amp * valueNoise2(x * f, y * f); norm2 += amp; amp *= gain; f *= lac; }
  return s / norm2;
}
export function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function valueNoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = mix(c(0, 0, 0), c(1, 0, 0), u), x10 = mix(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = mix(c(0, 0, 1), c(1, 0, 1), u), x11 = mix(c(0, 1, 1), c(1, 1, 1), u);
  return mix(mix(x00, x10, v), mix(x01, x11, v), w);
}
