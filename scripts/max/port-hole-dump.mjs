/** port-hole-dump.mjs —— 从网格里直接量「墙体开孔」的真实范围（像素取证太绕） */
import { readFileSync } from 'node:fs';
const mesh = JSON.parse(readFileSync(process.argv[2] ?? 'web/draw/macbook-closed.json', 'utf8'));
const V = mesh.vertices.map(([x, y, z]) => [x * 1000, y * 1000, z * 1000]);
const C = mesh.colors ?? [];
const target = process.argv[3] ?? 'left';
const X = target === 'left' ? -156.3 : 156.3;
// 收集左壁面片（法线朝 ±x、|x|≈156.3）
const tris = [];
const raw = mesh.faces;
const flat = typeof raw[0] === 'number';
const triCount = flat ? raw.length / 3 : raw.length;
for (let i = 0; i < triCount; i++) {
  const a = flat ? raw[i * 3] : raw[i][0], b = flat ? raw[i * 3 + 1] : raw[i][1], c = flat ? raw[i * 3 + 2] : raw[i][2];
  const p = [V[a], V[b], V[c]];
  if (p.some((q) => Math.abs(q[0] - X) > 0.6)) continue;
  if (p.some((q) => q[1] < 3 || q[1] > 11.5)) continue;
  tris.push(p);
}
console.log(`左壁面片 ${tris.length} 个（x≈${X}, y 3..11.5）`);
// 以 0.05mm 网格光栅化：标记被面片覆盖的 (z,y)
const step = 0.05, z0 = -100, z1 = 0, y0 = 3, y1 = 11.5;
const W = Math.round((z1 - z0) / step), H = Math.round((y1 - y0) / step);
const grid = new Uint8Array(W * H);
for (const p of tris) {
  const zs = p.map((q) => q[2]), ys = p.map((q) => q[1]);
  const za = Math.max(0, Math.floor((Math.min(...zs) - z0) / step)), zb = Math.min(W - 1, Math.ceil((Math.max(...zs) - z0) / step));
  const ya = Math.max(0, Math.floor((Math.min(...ys) - y0) / step)), yb = Math.min(H - 1, Math.ceil((Math.max(...ys) - y0) / step));
  for (let i = za; i <= zb; i++) {
    for (let j = ya; j <= yb; j++) {
      const z = z0 + i * step, y = y0 + j * step;
      // 重心坐标判点在三角形内
      const [A, B, Cc] = p;
      const d = (B[1] - Cc[1]) * (A[2] - Cc[2]) + (Cc[2] - B[2]) * (A[1] - Cc[1]);
      if (Math.abs(d) < 1e-9) continue;
      const w1 = ((B[1] - Cc[1]) * (z - Cc[2]) + (Cc[2] - B[2]) * (y - Cc[1])) / d;
      const w2 = ((Cc[1] - A[1]) * (z - Cc[2]) + (A[2] - Cc[2]) * (y - Cc[1])) / d;
      const w3 = 1 - w1 - w2;
      if (w1 >= -0.01 && w2 >= -0.01 && w3 >= -0.01) grid[j * W + i] = 1;
    }
  }
}
// 逐列找「壁面内部的空洞」（不算采样窗口上下沿的开口）
const holes = [];
for (let i = 0; i < W; i++) {
  const cov = [];
  for (let j = 0; j < H; j++) if (grid[j * W + i]) cov.push(j);
  if (!cov.length) continue;
  const lo = cov[0], hi = cov[cov.length - 1];
  let run = null;
  for (let j = lo; j <= hi; j++) {
    const empty = !grid[j * W + i];
    if (empty && !run) run = { y0: y0 + j * step };
    else if (!empty && run) { run.y1 = y0 + j * step; if (run.y1 - run.y0 > 0.4) holes.push({ z: z0 + i * step, ...run }); run = null; }
  }
  if (run) { run.y1 = y0 + hi * step; if (run.y1 - run.y0 > 0.4) holes.push({ z: z0 + i * step, ...run }); }
}
// 合并同一端口的多列
holes.sort((a, b) => a.z - b.z);
const groups = [];
for (const h of holes) {
  const g = groups.find((q) => Math.abs(q.z1 - h.z) < 0.4 && Math.abs(q.ymid - (h.y0 + h.y1) / 2) < 1.2);
  if (g) { g.z1 = h.z; g.y0 = Math.min(g.y0, h.y0); g.y1 = Math.max(g.y1, h.y1); g.ymid = (g.y0 + g.y1) / 2; }
  else groups.push({ z0: h.z, z1: h.z, y0: h.y0, y1: h.y1, ymid: (h.y0 + h.y1) / 2 });
}
console.log(`检测到 ${groups.length} 个挖穿孔：`);
for (const g of groups) {
  console.log(`  z ${g.z0.toFixed(2)}..${g.z1.toFixed(2)}  宽 ${(g.z1 - g.z0).toFixed(2)}mm   y ${g.y0.toFixed(2)}..${g.y1.toFixed(2)}  高 ${(g.y1 - g.y0).toFixed(2)}mm   中心 y ${g.ymid.toFixed(2)}`);
}
