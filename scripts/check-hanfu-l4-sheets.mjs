#!/usr/bin/env node
/* §6.2 结构：袖≥2 / 纱≥3 / 发≥4 / 刃薄片 / 下颌环 / 面部块≥3 / 眼窝≥2 / 片厚≤0.004。 */
import { loadMesh, loadReport, report } from './lib/l4-common.mjs';
const rep = loadReport(); const mesh = loadMesh();
const sh = rep.sheets;
const blade = rep.parts.find((p) => p.name === 'sword');
const bladeThin = (() => {
  // 刃 = sword 末环（最后 6 个环顶点）：量其在最薄轴上的跨距
  const vs = mesh.vertices.slice(blade.vEnd - 7, blade.vEnd - 1);
  let minSpan = Infinity;
  for (const ax of [0, 1, 2]) {
    const vals = vs.map((v) => v[ax]);
    minSpan = Math.min(minSpan, Math.max(...vals) - Math.min(...vals));
  }
  return minSpan;
})();
const checks = [
  { name: '§6.2① 袖片≥2', ok: sh.sleeve >= 2, detail: `${sh.sleeve}` },
  { name: '§6.2② 纱片≥3', ok: sh.veil >= 3, detail: `${sh.veil}` },
  { name: '§6.2③ 发片≥4', ok: sh.hair >= 4, detail: `${sh.hair}` },
  { name: '§6.2④ 剑刃薄片', ok: sh.blade === 1 && bladeThin <= 0.012, detail: `刃最小跨距=${bladeThin.toFixed(4)}m` },
  { name: '§6.2⑤ 下颌环 1', ok: sh.jawRing === 1, detail: `${sh.jawRing}` },
  { name: '§6.2⑤ 面部块≥3', ok: sh.faceBlock >= 3, detail: `${sh.faceBlock}` },
  { name: '§6.2⑤ 眼窝凹陷≥2', ok: sh.eyeSocket >= 2, detail: `${sh.eyeSocket}` },
  { name: '片厚≤0.004m', ok: sh.thicknessM <= 0.004, detail: `${sh.thicknessM}` },
  { name: '纱片层底 0.55/0.30/0.14', ok: JSON.stringify(sh.droopBottomsM) === JSON.stringify([0.55, 0.3, 0.14]),
    detail: `${sh.droopBottomsM.join('/')}` },
  { name: '发片流向 142°/154°', ok: sh.flowDeg.hairBack === 142 && sh.flowDeg.hairFront === 154,
    detail: `back=${sh.flowDeg.hairBack} front=${sh.flowDeg.hairFront}` },
];
report('§6.2 结构件', checks);
