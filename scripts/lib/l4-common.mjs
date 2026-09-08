/* L4 门禁公共库：读终态 mesh / 构建报告 / G1-IoU 报告，统一口径。 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ROOT = '/home/h/genshin-model-studio';
const require = createRequire(`${ROOT}/`);

export function loadMesh() {
  return JSON.parse(fs.readFileSync(`${ROOT}/delivery/hanfu-cage/cage-mesh.json`, 'utf8'));
}
export function loadReport() {
  return JSON.parse(fs.readFileSync(`${ROOT}/.scratch/l4-build-report.json`, 'utf8'));
}
export function loadG1() {
  return JSON.parse(fs.readFileSync(`${ROOT}/delivery/hanfu-l1/g1-3d-report.json`, 'utf8'));
}
export function verify(mesh, opts = {}) {
  const { verifyMesh } = require(`${ROOT}/dist/src/mesh/verify.js`);
  return verifyMesh({ vertices: mesh.vertices, faces: mesh.faces }, opts);
}
export function seam(mesh) {
  const ctx = { Math, console, JSON };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(`${ROOT}/scripts/parts/lib/ganyu-seam-check.js`, 'utf8'), ctx);
  return ctx.seamCheck(mesh);
}
export function partOfFactory(report) {
  const F3 = Array.from({ length: 0 });
  return (faces, fi) => {
    const t = [faces[3 * fi], faces[3 * fi + 1], faces[3 * fi + 2]];
    const vmax = Math.max(...t);
    const p = report.parts.find((q) => vmax >= q.vStart && vmax < q.vEnd);
    return p ? p.name : '?';
  };
}
export function report(name, checks) {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}：${c.detail}`);
  console.log(failed.length ? `\n❌ ${name} FAIL（${failed.length} 项）` : `\n✅ ${name} OK（${checks.length} 项）`);
  process.exitCode = failed.length ? 1 : 0;
}
export { ROOT };
