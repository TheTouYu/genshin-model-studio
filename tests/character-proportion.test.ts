import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function context() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync('scripts/parts/lib/proportion-check.js', 'utf8'), ctx);
  return ctx;
}
test('character proportions measure mesh height instead of reporting a fixed head ratio', () => {
  const ctx = context();
  const m = { vertices: [[0,0,0],[0,1.6,0],[0,1.4,0]] };
  assert.ok(Math.abs(ctx.characterProportionReport(m,{chinY:1.4}).ratios.headBody-8)<1e-10);
  m.vertices[1][1]=1.8;
  assert.ok(Math.abs(ctx.characterProportionReport(m,{chinY:1.4}).ratios.headBody-4.5)<1e-10);
});
test('missing anatomical data remains unknown rather than passing a fabricated ratio', () => {
  const report = context().characterProportionReport({vertices:[]});
  assert.equal(report.ratios.headBody,null);
  assert.equal(report.ratios.palmFingerLen,null);
  assert.equal(report.complete,false);
  assert.ok(report.missing.includes('headBody'));
  assert.equal(report.referenceFit,false);
});
test('character proportions use configurable hand windows and explicit target ranges', () => {
  const report=context().characterProportionReport({vertices:[[0.3,0.7,0],[0.36,0.78,0.02],[0.3,0.6,0],[0.36,0.69,0.02]]},{windows:{palm:[0.7,0.8,0.29,0.37],finger:[0.6,0.69,0.29,0.37]},targets:{palmFingerLen:[0.7,0.8]}});
  assert.ok(Math.abs(report.ratios.palmFingerLen-8/9)<1e-10);
  assert.ok(report.abnormal.some((x:string)=>x.startsWith('palmFingerLen')));
});
test('nonfinite landmark measurements remain unknown', () => {
  const report=context().characterProportionReport({vertices:[[0.3,0.7,0],[0.36,0.78,0.02]]},{chinY:Infinity,fingerRootSpan:Infinity,windows:{palm:[0.7,0.8,0.29,0.37]}});
  assert.equal(report.ratios.headBody,null);
  assert.equal(report.ratios.fingerSpread,null);
  assert.ok(report.missing.includes('fingerSpread'));
});

test('character and generic band reports cannot overwrite each other in either load order', () => {
  for(const files of [['proportion-check.js','ganyu-seam-check.js'],['ganyu-seam-check.js','proportion-check.js']]) {
    const ctx=vm.createContext({});
    for(const file of files) vm.runInContext(fs.readFileSync('scripts/parts/lib/'+file,'utf8'),ctx);
    assert.equal(typeof ctx.characterProportionReport,'function');
    assert.equal(typeof ctx.proportionReport,'function');
    assert.ok(ctx.characterProportionReport({vertices:[]}).missing.length>0);
    assert.ok(ctx.proportionReport({vertices:[]},[]).ratios);
  }
});
