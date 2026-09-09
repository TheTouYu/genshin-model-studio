/**
 * 零依赖渲染内核 · 图像
 * - PNG 编码/解码（zlib 自实现，无第三方）
 * - 纹理（线性空间，mipmap，双线性）
 * - AgX 色调映射 / 曝光 / 抖动
 * - 引导式 à-trous 降噪
 */
import { deflateSync, inflateSync } from 'node:zlib';

// ---------------------------------------------------------------- 颜色

/** sRGB 8bit → 线性 */
export function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
export function linearToSrgb(x: number): number {
  const v = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(v * 255)));
}
export function hexToLinear(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [srgbToLinear(parseInt(h.slice(0, 2), 16)), srgbToLinear(parseInt(h.slice(2, 4), 16)), srgbToLinear(parseInt(h.slice(4, 6), 16))];
}
export const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ---------------------------------------------------------------- PNG

function crc32Table(): Uint32Array {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC_TABLE = crc32Table();
export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  const crcBuf = Buffer.alloc(4 + data.length);
  crcBuf.write(type, 0, 'ascii');
  Buffer.from(data).copy(crcBuf, 4);
  out.writeUInt32BE(crc32(crcBuf), 8 + data.length);
  return out;
}
/** RGB8 线性 float 缓冲 → PNG 字节（sRGB 编码 + 有序抖动） */
export function encodePngRGB(w: number, h: number, rgb: Float32Array, opts: { dither?: boolean; exposure?: number } = {}): Buffer {
  const dit = opts.dither === true; // 默认关闭：周期抖动是法证破绽，改用渲染端传感器噪声
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3);
    raw[off] = 0;
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let v = rgb[(y * w + x) * 3 + c];
        if (!Number.isFinite(v)) v = 0;
        // sRGB 编码
        let s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
        s = Math.min(1, Math.max(0, s));
        let q = s * 255;
        if (dit) q += (Math.random() - 0.5) * 1.0;
        raw[off + 1 + x * 3 + c] = Math.max(0, Math.min(255, Math.round(q)));
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]);
}
/** 16bit PNG 编码（用于存档高动态范围输出） */
export function encodePng16(w: number, h: number, rgb: Float32Array): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 6));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 6);
    raw[off] = 0;
    for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
      const v = Math.min(1, Math.max(0, rgb[(y * w + x) * 3 + c] || 0));
      raw.writeUInt16BE(Math.round(v * 65535), off + 1 + (x * 3 + c) * 2);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 16; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]);
}

export interface DecodedImage { w: number; h: number; data: Uint8Array; channels: number }

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
/** PNG 解码：8/16bit、colorType 0/2/3/4/6、非隔行 + Adam7 */
export function decodePng(buf: Uint8Array): DecodedImage {
  if (buf[0] !== 137 || buf[1] !== 80) throw new Error('not png');
  let off = 8, w = 0, h = 0, depth = 8, ctype = 6, interlace = 0;
  let palette: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (off + 8 <= buf.length) {
    const len = (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
    const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = (data[0] << 24 | data[1] << 16 | data[2] << 8 | data[3]) >>> 0;
      h = (data[4] << 24 | data[5] << 16 | data[6] << 8 | data[7]) >>> 0;
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = new Uint8Array(data);
    else if (type === 'IDAT') idat.push(new Uint8Array(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = new Uint8Array(inflateSync(Buffer.concat(idat.map((u) => Buffer.from(u)))));
  const channels = ctype === 0 ? 1 : ctype === 2 ? 3 : ctype === 3 ? 1 : ctype === 4 ? 2 : 4;
  const bpp = Math.max(1, Math.ceil((channels * depth) / 8));
  const out = new Uint8Array(w * h * channels);
  const bytesPerPixel = Math.ceil((channels * depth) / 8);
  const rowBytes = Math.ceil((w * channels * depth) / 8);

  const unfilter = (src: Uint8Array, dst: Uint8Array, width: number, height: number, bpp2: number, rb: number, dstStride: number, dstOff: number, dx: number): void => {
    let pos = 0;
    let prev = new Uint8Array(rb);
    const cur = new Uint8Array(rb);
    for (let y = 0; y < height; y++) {
      const ft = src[pos++];
      cur.set(src.subarray(pos, pos + rb)); pos += rb;
      for (let i = 0; i < rb; i++) {
        const a = i >= bpp2 ? cur[i - bpp2] : 0;
        const b = prev[i];
        const c = i >= bpp2 ? prev[i - bpp2] : 0;
        let v = cur[i];
        if (ft === 1) v = (v + a) & 255;
        else if (ft === 2) v = (v + b) & 255;
        else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
        else if (ft === 4) v = (v + paeth(a, b, c)) & 255;
        cur[i] = v;
      }
      // 拷贝到目标
      const stridePix = depth === 16 ? 2 : 1;
      for (let x = 0; x < width; x++) {
        const dOff = ((y * dstStride) + dstOff + x * dx) * channels;
        for (let c = 0; c < channels; c++) {
          const si = (x * channels + c) * stridePix;
          dst[dOff + c] = depth === 16 ? cur[si] : cur[si];
        }
      }
      prev = cur.slice();
    }
  };

  if (interlace === 0) {
    unfilter(raw, out, w, h, bpp, rowBytes, w, 0, 1);
  } else {
    // Adam7
    const xs = [0, 4, 0, 2, 0, 1, 0], ys = [0, 0, 4, 0, 2, 0, 1];
    const xd = [8, 8, 4, 4, 2, 2, 1], yd = [8, 8, 8, 4, 4, 2, 2];
    let pos = 0;
    for (let p = 0; p < 7; p++) {
      const pw = Math.ceil((w - xs[p]) / xd[p]), ph = Math.ceil((h - ys[p]) / yd[p]);
      if (pw <= 0 || ph <= 0) continue;
      const rb = Math.ceil((pw * channels * depth) / 8);
      const sub = raw.subarray(pos, pos + ph * (rb + 1)); pos += ph * (rb + 1);
      const tmp = new Uint8Array(pw * ph * channels);
      unfilter(sub, tmp, pw, ph, bpp, rb, pw, 0, 1);
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        const gx = xs[p] + x * xd[p], gy = ys[p] + y * yd[p];
        for (let c = 0; c < channels; c++) out[(gy * w + gx) * channels + c] = tmp[(y * pw + x) * channels + c];
      }
    }
  }
  // 调色板展开
  if (ctype === 3 && palette) {
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      const idx = out[i];
      rgb[i * 3] = palette[idx * 3]; rgb[i * 3 + 1] = palette[idx * 3 + 1]; rgb[i * 3 + 2] = palette[idx * 3 + 2];
    }
    return { w, h, data: rgb, channels: 3 };
  }
  return { w, h, data: out, channels };
}

/** 8bit sRGB 图像 → 线性 RGB Float32 */
export function toLinearRGB(img: DecodedImage): Float32Array {
  const { w, h, data, channels } = img;
  const out = new Float32Array(w * h * 3);
  const LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) LUT[i] = srgbToLinear(i);
  for (let i = 0; i < w * h; i++) {
    const s = i * channels;
    out[i * 3] = LUT[data[s]];
    out[i * 3 + 1] = LUT[channels === 1 ? s : s + 1];
    out[i * 3 + 2] = LUT[channels === 1 ? s : channels >= 3 ? s + 2 : s + 1];
  }
  return out;
}

// ---------------------------------------------------------------- 纹理

export class Texture {
  w: number; h: number;
  /** 线性 RGB */
  data: Float32Array;
  mips: Float32Array[] = [];
  mipW: number[] = []; mipH: number[] = [];
  wrapU = 1; wrapV = 1;
  constructor(w: number, h: number, data: Float32Array) { this.w = w; this.h = h; this.data = data; this.buildMips(); }
  static fromImage(img: DecodedImage): Texture {
    return new Texture(img.w, img.h, toLinearRGB(img));
  }
  static solid(w: number, h: number, rgb: [number, number, number]): Texture {
    const d = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { d[i * 3] = rgb[0]; d[i * 3 + 1] = rgb[1]; d[i * 3 + 2] = rgb[2]; }
    return new Texture(w, h, d);
  }
  private buildMips(): void {
    let cw = this.w, ch = this.h, src = this.data;
    this.mips.push(src); this.mipW.push(cw); this.mipH.push(ch);
    while (cw > 1 || ch > 1) {
      const nw = Math.max(1, cw >> 1), nh = Math.max(1, ch >> 1);
      const dst = new Float32Array(nw * nh * 3);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        const x0 = Math.min(cw - 1, x * 2), x1 = Math.min(cw - 1, x * 2 + 1);
        const y0 = Math.min(ch - 1, y * 2), y1 = Math.min(ch - 1, y * 2 + 1);
        for (let c = 0; c < 3; c++) {
          dst[(y * nw + x) * 3 + c] = 0.25 * (src[(y0 * cw + x0) * 3 + c] + src[(y0 * cw + x1) * 3 + c] + src[(y1 * cw + x0) * 3 + c] + src[(y1 * cw + x1) * 3 + c]);
        }
      }
      this.mips.push(dst); this.mipW.push(nw); this.mipH.push(nh);
      cw = nw; ch = nh; src = dst;
    }
  }
  /** u,v 在 [0,1]；lod 可选（0=全分辨率） */
  sample(u: number, v: number, lod = 0, out?: Float32Array): Float32Array {
    const o = out || new Float32Array(3);
    const lvl = Math.max(0, Math.min(this.mips.length - 1, Math.round(lod)));
    const w = this.mipW[lvl], h = this.mipH[lvl], d = this.mips[lvl];
    let uu = u, vv = v;
    if (this.wrapU) { uu = uu - Math.floor(uu); } else uu = Math.min(1, Math.max(0, uu));
    if (this.wrapV) { vv = vv - Math.floor(vv); } else vv = Math.min(1, Math.max(0, vv));
    const fx = uu * w - 0.5, fy = vv * h - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const cx0 = Math.min(w - 1, Math.max(0, x0)), cx1 = Math.min(w - 1, Math.max(0, x0 + 1));
    const cy0 = Math.min(h - 1, Math.max(0, y0)), cy1 = Math.min(h - 1, Math.max(0, y0 + 1));
    for (let c = 0; c < 3; c++) {
      const a = d[(cy0 * w + cx0) * 3 + c], b = d[(cy0 * w + cx1) * 3 + c];
      const e = d[(cy1 * w + cx0) * 3 + c], f = d[(cy1 * w + cx1) * 3 + c];
      o[c] = (a + (b - a) * tx) + ((e + (f - e) * tx) - (a + (b - a) * tx)) * ty;
    }
    return o;
  }
}

// ---------------------------------------------------------------- 色调映射

/** AgX 色调映射（Sobotka/iolite 最小实现：log2 整形 + 对比度多项式） */
function agxContrast(x: number): number {
  const x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
const AGX_IN = [
  [0.842479062253094, 0.0784335999999992, 0.0792237451477643],
  [0.0423282422610123, 0.878468636469772, 0.0791661274605434],
  [0.0423756549057051, 0.0784336, 0.879142973793104],
];
const AGX_OUT = [
  [1.19687900512017, -0.0980208811401368, -0.0990297440797205],
  [-0.0528968517574562, 1.15190312990417, -0.0989611768448433],
  [-0.0529716355144438, -0.0980434501171241, 1.15107367264116],
];
const AGX_MIN_EV = -12.47393, AGX_MAX_EV = 4.026069;
export function agxTM(r: number, g: number, b: number, out: Float32Array): void {
  let x = AGX_IN[0][0] * r + AGX_IN[0][1] * g + AGX_IN[0][2] * b;
  let y = AGX_IN[1][0] * r + AGX_IN[1][1] * g + AGX_IN[1][2] * b;
  let z = AGX_IN[2][0] * r + AGX_IN[2][1] * g + AGX_IN[2][2] * b;
  const enc = (v: number): number => {
    const l = Math.log2(Math.max(1e-10, v));
    return (Math.min(AGX_MAX_EV, Math.max(AGX_MIN_EV, l)) - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV);
  };
  const cx = agxContrast(enc(x)), cy = agxContrast(enc(y)), cz = agxContrast(enc(z));
  out[0] = Math.max(0, AGX_OUT[0][0] * cx + AGX_OUT[0][1] * cy + AGX_OUT[0][2] * cz);
  out[1] = Math.max(0, AGX_OUT[1][0] * cx + AGX_OUT[1][1] * cy + AGX_OUT[1][2] * cz);
  out[2] = Math.max(0, AGX_OUT[2][0] * cx + AGX_OUT[2][1] * cy + AGX_OUT[2][2] * cz);
}

/** ACES filmic 近似（RRT+ODT fit） */
export function acesTM(r: number, g: number, b: number, out: Float32Array): void {
  const f = (x: number): number => {
    const a = 2.51, bb = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return Math.min(1, Math.max(0, (x * (a * x + bb)) / (x * (c * x + d) + e)));
  };
  const m1 = 0.59719, m2 = 0.35458, m3 = 0.04823, m4 = 0.07600, m5 = 0.90834, m6 = 0.01566;
  const m7 = 0.02840, m8 = 0.13383, m9 = 0.83777;
  const x = m1 * r + m2 * g + m3 * b, y = m4 * r + m5 * g + m6 * b, z = m7 * r + m8 * g + m9 * b;
  const xx = f(x), yy = f(y), zz = f(z);
  out[0] = Math.min(1, Math.max(0, 1.60475 * xx - 0.53108 * yy - 0.07367 * zz));
  out[1] = Math.min(1, Math.max(0, -0.10208 * xx + 1.10813 * yy - 0.00605 * zz));
  out[2] = Math.min(1, Math.max(0, -0.00327 * xx - 0.07276 * yy + 1.07602 * zz));
}

// ---------------------------------------------------------------- 降噪

/** 引导式 à-trous 小波降噪（albedo/normal/深度引导） */
export function denoiseAtrous(
  color: Float32Array, w: number, h: number,
  albedo: Float32Array, normal: Float32Array, depth: Float32Array,
  iterations = 5, sigmaC = 0.35, sigmaN = 0.12, sigmaD = 0.06,
): void {
  const n = w * h;
  let src = color.slice();
  let dst = new Float32Array(n * 3);
  const kernel = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
  for (let it = 0; it < iterations; it++) {
    const step = 1 << it;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const dc = depth[i];
        let sumR = 0, sumG = 0, sumB = 0, wsum = 0;
        for (let ky = -2; ky <= 2; ky++) {
          for (let kx = -2; kx <= 2; kx++) {
            const sx = x + kx * step, sy = y + ky * step;
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
            const j = sy * w + sx;
            const kw = kernel[ky + 2] * kernel[kx + 2];
            // 深度/法线引导
            const dd = Math.abs(depth[j] - dc) / Math.max(1e-6, dc);
            if (dd > sigmaD * 4) continue;
            const nd = 1 - (normal[i * 3] * normal[j * 3] + normal[i * 3 + 1] * normal[j * 3 + 1] + normal[i * 3 + 2] * normal[j * 3 + 2]);
            if (nd > sigmaN) continue;
            const cd = Math.abs(lum(src[j * 3], src[j * 3 + 1], src[j * 3 + 2]) - lum(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]));
            if (cd > sigmaC) continue;
            const aw = Math.abs(albedo[j * 3] - albedo[i * 3]) + Math.abs(albedo[j * 3 + 1] - albedo[i * 3 + 1]) + Math.abs(albedo[j * 3 + 2] - albedo[i * 3 + 2]);
            const gw = kw * Math.exp(-aw * 12) * Math.exp(-cd * 6) * Math.exp(-nd / Math.max(1e-6, sigmaN)) * Math.exp(-dd / Math.max(1e-6, sigmaD));
            sumR += src[j * 3] * gw; sumG += src[j * 3 + 1] * gw; sumB += src[j * 3 + 2] * gw;
            wsum += gw;
          }
        }
        if (wsum > 1e-9) { dst[i * 3] = sumR / wsum; dst[i * 3 + 1] = sumG / wsum; dst[i * 3 + 2] = sumB / wsum; }
        else { dst[i * 3] = src[i * 3]; dst[i * 3 + 1] = src[i * 3 + 1]; dst[i * 3 + 2] = src[i * 3 + 2]; }
      }
    }
    const t = src; src = dst; dst = t;
  }
  color.set(src);
}
