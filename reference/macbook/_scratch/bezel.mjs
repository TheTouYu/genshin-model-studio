// bezel.mjs — 屏幕黑边实测：以「可视区已知 286.46 × 179.02 mm」自标定，量黑边四边宽度
import { load } from './load.mjs';
const path = process.argv[2];
const { w, h, ch, px } = load(path);
const lum = (i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
const sat = (i) => { const r = px[i], g = px[i + 1], b = px[i + 2]; return Math.max(r, g, b) - Math.min(r, g, b); };

// 1) 彩色区域 = 屏幕活动区（机身为低饱和银/黑）
let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, cnt = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * ch;
  if (sat(i) > 45 && lum(i) > 70) { cnt++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
}
const W = maxx - minx + 1, H = maxy - miny + 1;
console.log(`file=${path}`);
console.log(`img ${w}x${h} ch=${ch}; 彩色像素 ${cnt}`);
console.log(`活动区 bbox x[${minx},${maxx}] y[${miny},${maxy}] = ${W}x${H} px`);
const sx = 286.46 / W, sy = 179.02 / H;
console.log(`标定 sx=${sx.toFixed(5)} sy=${sy.toFixed(5)} mm/px  各向异性=${(Math.abs(sx / sy - 1) * 100).toFixed(2)}%`);

// 2) 从活动区四边向外数「暗像素」连续长度（黑边）——逐列/逐行，取中位数抗文字干扰
const DARK = 55;
function runDown(x, y0) { let n = 0; for (let y = y0; y < h; y++) { const i = (y * w + x) * ch; if (lum(i) < DARK) n++; else break; } return n; }
function runUp(x, y0) { let n = 0; for (let y = y0; y >= 0; y--) { const i = (y * w + x) * ch; if (lum(i) < DARK) n++; else break; } return n; }
function runRight(x0, y) { let n = 0; for (let x = x0; x < w; x++) { const i = (y * w + x) * ch; if (lum(i) < DARK) n++; else break; } return n; }
function runLeft(x0, y) { let n = 0; for (let x = x0; x >= 0; x--) { const i = (y * w + x) * ch; if (lum(i) < DARK) n++; else break; } return n; }
const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };

const cols = [], rowsL = [], rowsR = [];
for (let x = minx; x <= maxx; x++) { cols.push({ top: runUp(x, miny), bot: runDown(x, maxy) }); }
for (let y = miny; y <= maxy; y++) { rowsL.push(runLeft(minx, y)); rowsR.push(runRight(maxx, y)); }
const tops = cols.map(c => c.top), bots = cols.map(c => c.bot);
const rep = (name, arr, s) => {
  const m = med(arr), mn = Math.min(...arr), mx = Math.max(...arr);
  console.log(`${name}: 中位 ${m} px = ${(m * s).toFixed(2)} mm  [min ${mn}=${(mn * s).toFixed(2)} max ${mx}=${(mx * s).toFixed(2)}]`);
};
rep('上黑边', tops, sy); rep('下黑边', bots, sy); rep('左黑边', rowsL, sx); rep('右黑边', rowsR, sx);

// 3) 下黑边是否与键盘黑区连通：统计下黑边长度的分布（直方图桶）
const buckets = {};
for (const b of bots) { const k = Math.round(b / 10) * 10; buckets[k] = (buckets[k] || 0) + 1; }
console.log('下黑边长度分布(px桶):', Object.entries(buckets).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
const tbuckets = {};
for (const t of tops) { const k = Math.round(t / 5) * 5; tbuckets[k] = (tbuckets[k] || 0) + 1; }
console.log('上黑边长度分布(px桶):', Object.entries(tbuckets).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
