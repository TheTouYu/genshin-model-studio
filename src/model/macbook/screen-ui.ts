/**
 * 程序化 macOS 桌面（屏幕内容纹理，零依赖）
 * 深色壁纸 + 菜单栏 + 窗口 + Dock —— 在 0.5–1m 观察距离下读作真机桌面
 */
import { Texture } from '../../render/image.js';
import { Rng, clamp, smoothstep } from '../../render/math.js';

const W = 1512, H = 982;

class Canvas {
  w: number; h: number; px: Float32Array; // sRGB 0..1
  constructor(w: number, h: number) { this.w = w; this.h = h; this.px = new Float32Array(w * h * 3); }
  set(x: number, y: number, r: number, g: number, b: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = ((y | 0) * this.w + (x | 0)) * 3;
    this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b;
  }
  blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = ((y | 0) * this.w + (x | 0)) * 3;
    this.px[i] += (r - this.px[i]) * a;
    this.px[i + 1] += (g - this.px[i + 1]) * a;
    this.px[i + 2] += (b - this.px[i + 2]) * a;
  }
  rect(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 1): void {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) this.blend(x, y, r, g, b, a);
  }
  roundRect(x0: number, y0: number, x1: number, y1: number, rad: number, r: number, g: number, b: number, a = 1): void {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const dx = Math.max(0, Math.max(x0 + rad - x, x - (x1 - rad)));
      const dy = Math.max(0, Math.max(y0 + rad - y, y - (y1 - rad)));
      const d = Math.hypot(dx, dy) - rad;
      const cov = clamp(0.5 - d, 0, 1);
      if (cov > 0) this.blend(x, y, r, g, b, a * cov);
    }
  }
  circle(cx: number, cy: number, rad: number, r: number, g: number, b: number, a = 1): void {
    for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++)
      for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
        const d = Math.hypot(x - cx, y - cy) - rad;
        const cov = clamp(0.5 - d, 0, 1);
        if (cov > 0) this.blend(x, y, r, g, b, a * cov);
      }
  }
  /** 竖直/斜向渐变条带 */
  grad(x0: number, y0: number, x1: number, y1: number, c0: number[], c1: number[]): void {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      const t = (y - y0) / Math.max(1e-6, y1 - y0);
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) this.blend(x, y, c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t, 1);
    }
  }
}

function hash2(x: number, y: number): number {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 4): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

/** 壁纸：深空底 + 平滑极光带（macOS 抽象壁纸语汇，无 fbm 火焰感） */
function wallpaper(c: Canvas): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      // 深空底：左上偏蓝紫，右下近黑
      const g1 = Math.pow(clamp(1 - Math.hypot(u - 0.28, v - 0.22) / 0.95, 0, 1), 1.5);
      const g2 = Math.pow(clamp(1 - Math.hypot(u - 0.78, v - 0.85) / 0.9, 0, 1), 1.7);
      let r = 0.004 + 0.055 * g1 + 0.012 * g2;
      let g = 0.008 + 0.075 * g1 + 0.018 * g2;
      let b = 0.026 + 0.165 * g1 + 0.052 * g2;
      // 极光带：正弦调制曲线，带宽 ~0.1
      const curve = 0.52 + 0.30 * Math.sin(u * Math.PI * 1.55 + 0.7) - 0.22 * u;
      const d = Math.abs(v - curve);
      const band = Math.pow(clamp(1 - d / 0.115, 0, 1), 1.9);
      const core = Math.pow(clamp(1 - d / 0.028, 0, 1), 2.0);
      // 沿带方向的色相变化：青 → 蓝 → 品红 → 暖橙
      const t = clamp(u * 1.12 - 0.06, 0, 1);
      const cr = 0.06 + 0.55 * Math.pow(t, 2.6);
      const cg = 0.42 - 0.16 * t + 0.30 * Math.pow(1 - Math.abs(t - 0.55) * 2.2, 2.0);
      const cb = 0.62 + 0.20 * Math.sin(t * Math.PI) - 0.30 * Math.pow(t, 3.0);
      r += band * cr * 0.85 + core * 0.55;
      g += band * cg * 0.75 + core * 0.62;
      b += band * cb * 0.85 + core * 0.70;
      // 第二道细带（层次）
      const curve2 = curve - 0.20 + 0.05 * Math.sin(u * Math.PI * 4.1);
      const d2 = Math.abs(v - curve2);
      const band2 = Math.pow(clamp(1 - d2 / 0.055, 0, 1), 2.2);
      r += band2 * 0.10; g += band2 * 0.26; b += band2 * 0.42;
      // 底部压暗（Dock 区）
      const dark = smoothstep(0.62, 1.0, v) * 0.58;
      const i = (y * W + x) * 3;
      c.px[i] = clamp(r * (1 - dark), 0, 1);
      c.px[i + 1] = clamp(g * (1 - dark), 0, 1);
      c.px[i + 2] = clamp(b * (1 - dark), 0, 1);
    }
  }
}

function menuBar(c: Canvas): void {
  const hgt = 13;
  c.rect(0, 0, W, hgt, 0.10, 0.10, 0.12, 0.55);
  // 苹果标志（简化 16px 图标）
  const lx = 12, ly = hgt / 2;
  c.circle(lx + 3.4, ly + 1.2, 3.2, 0.92, 0.92, 0.93);
  c.circle(lx + 6.2, ly - 2.0, 1.5, 0.92, 0.92, 0.93);
  c.circle(lx + 5.4, ly + 1.2, 2.0, 0.10, 0.10, 0.12);
  // 菜单文字（灰条）
  let mx = 30;
  const items = [26, 30, 34, 28, 40, 26, 32, 24];
  for (const w of items) {
    c.roundRect(mx, ly - 1.6, mx + w, ly + 1.6, 1.2, 0.86, 0.86, 0.87, 0.9);
    mx += w + 16;
  }
  // 右侧状态栏
  let rx = W - 16;
  const right = [22, 14, 16, 12, 26];
  for (const w of right) {
    c.roundRect(rx - w, ly - 1.6, rx, ly + 1.6, 1.2, 0.86, 0.86, 0.87, 0.88);
    rx -= w + 14;
  }
}

function windowUI(c: Canvas): void {
  const x0 = 150, y0 = 92, x1 = 720, y1 = 470;
  // 阴影
  for (let i = 8; i > 0; i--) c.roundRect(x0 - i, y0 - i + 3, x1 + i, y1 + i + 3, 10 + i, 0, 0, 0, 0.035);
  // 窗口体（深色）
  c.roundRect(x0, y0, x1, y1, 9, 0.155, 0.155, 0.165);
  c.roundRect(x0, y0, x1, y0 + 26, 9, 0.205, 0.205, 0.215);
  c.rect(x0, y0 + 20, x1, y0 + 26, 0.205, 0.205, 0.215);
  // 红黄绿
  c.circle(x0 + 16, y0 + 13, 5.4, 0.98, 0.36, 0.33);
  c.circle(x0 + 33, y0 + 13, 5.4, 0.99, 0.76, 0.24);
  c.circle(x0 + 50, y0 + 13, 5.4, 0.28, 0.80, 0.33);
  // 侧栏
  c.rect(x0, y0 + 26, x0 + 132, y1, 0.128, 0.128, 0.138);
  for (let i = 0; i < 9; i++) {
    const yy = y0 + 46 + i * 24;
    c.roundRect(x0 + 14, yy, x0 + 96 + (i % 3) * 12, yy + 7, 3.5, 0.62, 0.62, 0.66, 0.75);
  }
  // 内容区：Finder 风格列表（行 + 缩略图块），避免"色卡"式假 UI
  const cx0 = x0 + 152, cy0 = y0 + 44;
  for (let j = 0; j < 11; j++) {
    const gy = cy0 + j * 26;
    if (gy + 22 > y1 - 12) break;
    c.roundRect(cx0, gy, cx0 + 16, gy + 16, 3, 0.32, 0.44, 0.62, 0.85);
    c.roundRect(cx0 + 26, gy + 3, cx0 + 150 + (j % 4) * 30, gy + 9, 2.5, 0.72, 0.72, 0.76, 0.55);
    c.roundRect(cx0 + 26, gy + 12, cx0 + 96 + (j % 3) * 22, gy + 17, 2.5, 0.55, 0.55, 0.59, 0.35);
    c.roundRect(cx0 + 300, gy + 4, cx0 + 360, gy + 10, 2.5, 0.62, 0.62, 0.66, 0.4);
    c.roundRect(cx0 + 380, gy + 4, cx0 + 430, gy + 10, 2.5, 0.62, 0.62, 0.66, 0.3);
  }
  // 菜单栏下方：窗口标题条上的文字
  c.roundRect(x0 + 74, y0 + 9, x0 + 150, y0 + 17, 4, 0.82, 0.82, 0.84, 0.7);
}

function dockUI(c: Canvas): void {
  const icons = 11;
  const isz = 46, gap = 12;
  const totalW = icons * isz + (icons - 1) * gap;
  const x0 = (W - totalW) / 2 - 14, y0 = H - 74;
  const x1 = x0 + totalW + 28, y1 = H - 12;
  c.roundRect(x0, y0, x1, y1, 18, 0.82, 0.82, 0.85, 0.30);
  c.roundRect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, 17, 0.95, 0.95, 0.97, 0.10);
  const cols = [
    [0.22, 0.55, 0.95], [0.35, 0.78, 0.42], [0.95, 0.35, 0.30], [0.98, 0.78, 0.25],
    [0.62, 0.40, 0.92], [0.20, 0.75, 0.82], [0.95, 0.55, 0.75], [0.45, 0.45, 0.50],
    [0.90, 0.90, 0.92], [0.30, 0.62, 0.98], [0.75, 0.75, 0.78],
  ];
  for (let i = 0; i < icons; i++) {
    const ix = x0 + 14 + i * (isz + gap);
    const col = cols[i % cols.length];
    const cy = y0 + 12 + isz / 2;
    // 底色（略降饱和，带纵向渐变）
    for (let k = 0; k < isz; k++) {
      const t = k / isz;
      const kk = 1 - 0.28 * t;
      c.roundRect(ix, y0 + 12 + k, ix + isz, y0 + 13 + k, 0, col[0] * kk, col[1] * kk, col[2] * kk);
    }
    // 圆角遮罩（重绘圆角外的透明不可行，改用四角覆盖白雾）
    // 内嵌图形
    if (i % 4 === 0) { c.circle(ix + isz / 2, cy, isz * 0.26, 1, 1, 1, 0.86); c.circle(ix + isz / 2, cy, isz * 0.12, col[0] * 0.4, col[1] * 0.4, col[2] * 0.4, 0.9); }
    else if (i % 4 === 1) { c.roundRect(ix + 10, cy - isz * 0.22, ix + isz - 10, cy + isz * 0.06, 4, 1, 1, 1, 0.8); c.roundRect(ix + 10, cy + isz * 0.12, ix + isz - 18, cy + isz * 0.3, 3, 1, 1, 1, 0.5); }
    else if (i % 4 === 2) { c.roundRect(ix + isz * 0.3, cy - isz * 0.24, ix + isz * 0.7, cy + isz * 0.24, 5, 1, 1, 1, 0.78); }
    else { c.circle(ix + isz * 0.38, cy, isz * 0.13, 1, 1, 1, 0.7); c.circle(ix + isz * 0.62, cy, isz * 0.13, 1, 1, 1, 0.7); c.circle(ix + isz * 0.5, cy + isz * 0.22, isz * 0.13, 1, 1, 1, 0.7); }
  }
  // 运行指示点
  for (let i = 0; i < icons; i += 3) {
    const ix = x0 + 14 + i * (isz + gap);
    c.circle(ix + isz / 2, y1 - 5, 2.0, 0.9, 0.9, 0.92, 0.6);
  }
}

function cursor(c: Canvas): void {
  const x = 980, y = 300;
  // 箭头指针（白描边黑填充）
  const pts = [[0, 0], [0, 17], [4.4, 13.2], [7.2, 19.6], [10.6, 18.1], [7.8, 11.9], [13.4, 11.7]];
  for (let s = 0; s < 2; s++) {
    const off = s === 0 ? 0 : 1.2;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const steps = 24;
      for (let t = 0; t <= steps; t++) {
        const px = x + a[0] + (b[0] - a[0]) * (t / steps) + off;
        const py = y + a[1] + (b[1] - a[1]) * (t / steps) + off;
        c.blend(px, py, s === 0 ? 1 : 0.05, s === 0 ? 1 : 0.05, s === 0 ? 1 : 0.05, 1);
      }
    }
    if (s === 1) {
      for (let yy = 1; yy < 17; yy++) for (let xx = 1; xx < 13; xx++) {
        // 简单填充：点在多边形内
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
          if ((yi > yy) !== (yj > yy) && xx < ((xj - xi) * (yy - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) c.blend(x + xx, y + yy, 0.06, 0.06, 0.07, 1);
      }
    }
  }
}

export function makeScreenTexture(gain = 0.95): Texture {
  const c = new Canvas(W, H);
  wallpaper(c);
  windowUI(c);
  menuBar(c);
  dockUI(c);
  cursor(c);
  // sRGB → 线性 + 亮度增益
  const LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255; LUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  const lin = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H * 3; i++) {
    const v = clamp(c.px[i], 0, 1);
    lin[i] = LUT[Math.min(255, Math.round(v * 255))] * gain;
  }
  const t = new Texture(W, H, lin);
  t.wrapU = 0; t.wrapV = 0;
  void Rng;
  return t;
}
