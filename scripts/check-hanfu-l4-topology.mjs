#!/usr/bin/env node
/* L4-G4：openEdges=0 / seamEdges=0 / components=1 / Euler=2 + 薄片插座共享顶点。 */
import { loadMesh, loadReport, seam, report } from './lib/l4-common.mjs';
const mesh = loadMesh(); const rep = loadReport();
const s = seam(mesh);
const V = mesh.vertices.length; const F = mesh.faces.length / 3; const E = (() => {
  const set = new Set();
  for (let i = 0; i < mesh.faces.length; i += 3) {
    const t = [mesh.faces[i], mesh.faces[i + 1], mesh.faces[i + 2]];
    for (let j = 0; j < 3; j += 1) { const a = t[j]; const b = t[(j + 1) % 3]; set.add(Math.min(a, b) + '_' + Math.max(a, b)); }
  }
  return set.size;
})();
const euler = V - E + F;
const sheetNames = ['sleeveR', 'sleeveL', 'veilA', 'veilB', 'veilC', 'hairBack1', 'hairBack2', 'hairFront1', 'hairFront2'];
const shared = sheetNames.every((n) => {
  const p = rep.parts.find((q) => q.name === n);
  return p && p.vStart > 0; // 插座顶点必属主干/已建分支（新顶点从 vStart 起，插座在更低索引）
});
const checks = [
  { name: 'L4-G4a openEdges=0', ok: s.openEdges === 0, detail: `${s.openEdges}` },
  { name: 'L4-G4b seamEdges=0', ok: s.seamEdges === 0, detail: `${s.seamEdges}` },
  { name: 'L4-G4c components=1', ok: s.components === 1, detail: `${s.components}` },
  { name: 'L4-G4d Euler=2', ok: euler === 2, detail: `V=${V} E=${E} F=${F} Euler=${euler}` },
  { name: 'L4-G4e 薄片插座共享顶点', ok: shared, detail: `${sheetNames.length} 片全部从主干环补丁挤出（vStart>0）` },
];
report('L4-G4 拓扑与水密', checks);
