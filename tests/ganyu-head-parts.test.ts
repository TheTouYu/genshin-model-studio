import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { verifyMesh } from '../src/mesh/verify.js';

function load() {
  const ctx = vm.createContext({ Math, console });
  vm.runInContext(fs.readFileSync('scripts/parts/ganyu-head-new.js', 'utf8'), ctx);
  return ctx as any;
}

test('hair/hornL/hornR/face each watertight + selfIntersections 0 + no degenerate + colors #RRGGBB', () => {
  const ctx = load();
  const P = ctx.__GMS_HEAD_PARTS__;
  assert.ok(P, 'parts exposed');
  assert.ok(P.hair && P.horns && P.face, 'has hair/horns/face');
  assert.equal(P.horns.length, 2, 'two horns');
  const parts: [string, any][] = [['hair', P.hair], ['hornL', P.horns[0]], ['hornR', P.horns[1]], ['face', P.face]];
  for (const [name, m] of parts) {
    assert.ok(m.vertices && m.faces && m.colors, name + ': has vertices/faces/colors');
    assert.equal(m.faces.length % 3, 0, name + ': faces multiple of 3');
    assert.equal(m.colors.length, m.faces.length / 3, name + ': one color per triangle');
    assert.ok(m.colors.length > 0, name + ': has faces');
    assert.ok(m.colors.every((c: string) => /^#[0-9A-Fa-f]{6}$/.test(c)), name + ': colors are #RRGGBB');
    const r = verifyMesh(m);
    assert.equal(r.checks.watertight.pass, true, name + ': watertight -> ' + JSON.stringify(r.failures));
    assert.equal(r.checks.selfIntersections.pass, true, name + ': selfIntersections 0 -> ' + JSON.stringify(r.failures));
    assert.equal(r.checks.degenerate.count, 0, name + ': no degenerate faces');
  }
});

test('hair shell fits head: back vertex y~1.45 z<-0.09, forehead bang y~1.50 z>0.06, gap>=2mm behind head', () => {
  const P = load().__GMS_HEAD_PARTS__;
  const V: number[][] = P.hair.vertices;
  const back = V.some((v: number[]) => Math.abs(v[1] - 1.45) < 0.02 && v[2] < -0.09);
  const front = V.some((v: number[]) => Math.abs(v[1] - 1.50) < 0.02 && v[2] > 0.06);
  assert.ok(back, 'hair has back vertex y~1.45 z<-0.09');
  assert.ok(front, 'hair has forehead/bang vertex y~1.50 z>0.06');
  const backBand = V.filter((v: number[]) => Math.abs(v[1] - 1.45) < 0.02).map((v: number[]) => v[2]);
  assert.ok(backBand.length > 0, 'back band has vertices');
  const minBack = Math.min(...backBand);
  assert.ok(minBack <= -0.104, 'hair back-most point >=2mm behind head (head back z=-0.101; hair min=' + minBack.toFixed(4) + ')');
});
