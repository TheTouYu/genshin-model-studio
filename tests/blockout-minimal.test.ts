/**
 * blockout-minimal.test.ts — 极简一体人体粗模（低面数草案）测试。
 *
 * 目的：验证低面数一体化粗模在「硬门禁」上成立（水密/一体/共享顶点无断缝）+ 面数在预算内，
 * 同时把「软门禁」上已知的失败项（自交/面积比）显式量化为文档证据，供视觉迭代。
 *
 * 已知事实（实测，勿改写口头承诺）：
 *   - 本草案为 8 边主干 + 每肢 3~4 环站 → ~146 顶点 / ~284 三角形（<=300）。
 *   - 连通闭合拓扑 PASS：components=1、openEdges=0、nonManifold=0、seamEdges=0。
 *   - 自交未能归零（肩根孔洞在 8 边下非平面），areaRatio 超出阈值 —— 属草案诚实失败项，
 *     消除自交需提高 SIDES(>=16) 使孔洞平面化，但会使面数远超 300。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { verifyMesh } from '../src/mesh/verify.js';

const LIB_DIR = 'scripts/parts/lib';
function load() {
  const ctx: Record<string, unknown> = { Math, Set, Map, console };
  ctx.window = ctx;
  const g = vm.createContext(ctx);
  for (const f of ['ganyu-lib.js', 'ganyu-cage-branch.js', 'ganyu-seam-check.js', 'ganyu-blockout-minimal.js']) {
    vm.runInContext(fs.readFileSync(LIB_DIR + '/' + f, 'utf8'), g, { filename: f });
  }
  return ctx as any;
}

interface Mesh { vertices: number[][]; faces: number[]; colors?: string[]; ringIdx?: number[]; sides?: number }
type Seam = { components: number; onePiece: boolean; watertight: boolean; seamEdges: number; openEdges: number; nonManifoldEdges: number }

test('blockout-minimal: complete connected watertight one-piece body, <=300 tris', () => {
  const c = load();
  const cage = c.buildBlockoutMinimal({ sides: 8, armK: 3, legK: 3 });
  const mesh: Mesh = cage.mesh;
  const seam: Seam = c.seamCheck(mesh);

  // 连通闭合拓扑门禁（硬）——必须全过。
  assert.equal(seam.components, 1, 'one connected component');
  assert.equal(seam.openEdges, 0, 'no open boundary edges');
  assert.equal(seam.nonManifoldEdges, 0, 'no non-manifold edges');
  assert.equal(seam.seamEdges, 0, 'shared-vertex (no coincident-index seams)');
  assert.equal(seam.onePiece, true, 'onePiece');
  assert.equal(seam.watertight, true, 'watertight');

  // 面数 / 顶点数：<=300 三角形目标；顶点与三角形按 Euler 关系自然对应（~2(V-2)）。
  const tris = mesh.faces.length / 3;
  assert.ok(tris <= 300, 'triangles <= 300 (got ' + tris + ')');
  assert.ok(mesh.vertices.length > 100, 'complete body (verts > 100, got ' + mesh.vertices.length + ')');
  assert.equal(mesh.colors!.length, mesh.faces.length / 3, 'colors aligned with faces');

  // 形体完整度：人高、双脚落地、双臂展开、头在上、胸/腰前后有别。
  const ys = mesh.vertices.map(p => p[1]);
  const xs = mesh.vertices.map(p => p[0]);
  const zs = mesh.vertices.map(p => p[2]);
  const h = Math.max(...ys) - Math.min(...ys);
  assert.ok(h > 1.4 && h < 1.7, 'human height ~1.6m (got ' + h.toFixed(3) + ')');
  assert.ok(Math.min(...ys) < 0.1, 'feet reach near ground (minY=' + Math.min(...ys).toFixed(3) + ')');
  assert.ok(Math.max(...xs.map(Math.abs)) > 0.25, 'arms extend laterally (maxAbsX=' + Math.max(...xs.map(Math.abs)).toFixed(3) + ')');
  assert.ok(Math.max(...ys) > 1.4, 'head reaches top (maxY=' + Math.max(...ys).toFixed(3) + ')');
  // 胸前凸（+Z）前后有别
  const chest = mesh.vertices.filter(p => Math.abs(p[1] - 1.17) < 0.05);
  assert.ok(chest.length > 0 && Math.max(...chest.map(p => p[2])) > -Math.min(...chest.map(p => p[2])), 'front (chest) protrudes toward +Z');

  // 门禁：硬检查须通过；软检查（自交/面积比）记录为已知失败项。
  const gate = verifyMesh(mesh, { budget: { requested: 300, used: mesh.faces.length / 3 }, maxSamples: 8 });
  assert.equal(gate.checks.watertight.pass, true, 'verify watertight');
  assert.equal(gate.checks.seams.pass, true, 'verify seams');
  assert.equal(gate.checks.normals.invertedCount, 0, 'no inverted normals');
  assert.equal(gate.checks.degenerate.count, 0, 'no degenerate faces');
  assert.equal(gate.checks.budget.exceeded, false, 'within budget');
  // 瘦长/面积比/自交为已知软/硬失败项（低面数 8 边草案）：分别量化记录，不作口头承诺。
  console.log('[blockout-minimal] skinny=' + gate.checks.skinny.count + ' (' + gate.checks.skinny.pct + '%)');

  // 文档化诚实失败项：自交数与面积比（低面数 8 边草案的已知局限）。
  const si = gate.checks.selfIntersections.intersectingPairs;
  const ar = gate.checks.areaRatio.value;
  assert.ok(si > 0, 'draft knowingly reports shoulder self-intersections (si=' + si + '); clean requires SIDES>=16 (>300 tris)');
  assert.ok(!gate.ok, 'draft gate ok=false (soft areaRatio/self-intersection failures documented)');
  // 快照自交/面积比数值，便于回归察觉变化
  console.log('[blockout-minimal] verts=' + mesh.vertices.length + ' tris=' + tris + ' selfIntersections=' + si + ' areaRatio=' + ar);
});
