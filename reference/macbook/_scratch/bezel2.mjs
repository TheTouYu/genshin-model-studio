// bezel2.mjs — 逐列/逐行：从「彩色活动区」向外量到「亮背景(lum>100)」的暗带长度 = 黑边宽
import { load } from './load.mjs';
const path = process.argv[2];
const { w, h, ch, px } = load(path);
const lum = (i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
const sat = (i) => { const r = px[i], g = px[i + 1], b = px[i + 2]; return Math.max(r, g, b) - Math.min(r, g, b); };
const isScreen = (x, y) => { const i = (y * w + x) * ch; return sat(i) > 45 && lum(i) > 55; };

const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const pct = (a, q) => { const s = [...a].sort((p, q) => p - q); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

// 活动区 bbox
let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isScreen(x, y)) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
const W = maxx - minx + 1, H = maxy - miny + 1;
const sx = 286.46 / W, sy = 179.02 / H;
console.log(`file=${path}  ${w}x${h} ch=${ch}`);
console.log(`活动区 x[${minx},${maxx}] y[${miny},${maxy}] = ${W}x${H}px  sx=${sx.toFixed(5)} sy=${sy.toFixed(5)} 各向异性=${(Math.abs(sx / sy - 1) * 100).toFixed(2)}%`);

const L = [], R = [], T = [], B = [];
for (let y = miny; y <= maxy; y++) {
  // 左：该行最左彩色像素 → 向左数暗带
  let xl = -1; for (let x = minx; x <= maxx; x++) if (isScreen(x, y)) { xl = x; break; }
  if (xl >= 0) { let n = 0, x = xl - 1; while (x >= 0 && lum((y * w + x) * ch) <= 100) { n++; x--; } L.push(n); }
  // 右
  let xr = -1; for (let x = maxx; x >= minx; x--) if (isScreen(x, y)) { xr = x; break; }
  if (xr >= 0) { let n = 0, x = xr + 1; while (x < w && lum((y * w + x) * ch) <= 100) { n++; x++; } R.push(n); }
}
for (let x = minx; x <= maxx; x++) {
  // 上
  let yt = -1; for (let y = miny; y <= maxy; y++) if (isScreen(x, y)) { yt = y; break; }
  if (yt >= 0) { let n = 0, y = yt - 1; while (y >= 0 && lum((y * w + x) * ch) <= 100) { n++; y--; } T.push(n); }
  // 下
  let yb = -1; for (let y = maxy; y >= miny; y--) if (isScreen(x, y)) { yb = y; break; }
  if (yb >= 0) { let n = 0, y = yb + 1; while (y < h && lum((y * w + x) * ch) <= 100) { n++; y++; } B.push(n); }
}
const rep = (name, arr, s) => console.log(`${name} n=${arr.length} 中位 ${med(arr)}px=${(med(arr) * s).toFixed(2)}mm  p75 ${pct(arr, .75)}=${(pct(arr, .75) * s).toFixed(2)} p90 ${pct(arr, .9)}=${(pct(arr, .9) * s).toFixed(2)} max ${Math.max(...arr)}=${(Math.max(...arr) * s).toFixed(2)}`);
rep('左黑边', L, sx); rep('右黑边', R, sx); rep('上黑边', T, sy); rep('下黑边', B, sy);
// 下黑边直方图（看是否被 "MacBook Pro" 文字打断 / 是否与键盘连通）
const bk = {}; for (const b of B) { const k = Math.round(b / 5) * 5; bk[k] = (bk[k] || 0) + 1; }
console.log('下黑边分布(5px桶):', Object.entries(bk).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
const tk = {}; for (const t of T) { const k = Math.round(t / 5) * 5; tk[k] = (tk[k] || 0) + 1; }
console.log('上黑边分布(5px桶):', Object.entries(tk).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
