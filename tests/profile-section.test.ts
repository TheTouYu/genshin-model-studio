import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loft(sections: object[], dense?: object[]) {
  const ctx = vm.createContext({ Math });
  vm.runInContext(fs.readFileSync('scripts/parts/lib/ganyu-lib.js', 'utf8'), ctx);
  return ctx.profileLoft([[0,0,0],[0,1,0]], sections, 2, 8, () => '#fff', {
    dataOnly: true, cap: 'none', up: [0,0,1], dense,
  }) as {vertices: number[][]; ringIdx: number[]};
}
test('profile section fallbacks interpolate both endpoint offsets', () => {
  const m = loft([{rx:1,ry:1,cy:0},{rx:1,ry:1,cy:0.2}]);
  const middle = m.vertices.slice(8,16).map(p => p[2]);
  assert.ok(Math.abs((Math.max(...middle)+Math.min(...middle))/2 + 0.1)<1e-9);
});
test('profile dense sampling preserves original section rings', () => {
  const sections = [{rx:1,ry:1},{rx:2,ry:2}];
  const a = loft(sections), b = loft(sections,[{t0:0,t1:0.5,mult:4}]);
  for (const start of a.ringIdx) {
    const p = a.vertices[start];
    assert.ok(b.vertices.some(q => q.every((v,i) => Math.abs(v-p[i])<1e-9)));
  }
});
