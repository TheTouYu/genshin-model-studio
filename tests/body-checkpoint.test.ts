import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('body checkpoint fingerprints identify exact generated mesh and loaded source',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'gms-body-checkpoint-'));
 try {
  execFileSync(process.execPath,['scripts/build-body-cage.mjs',out,'test-body'],{stdio:'pipe'});
  const report=JSON.parse(fs.readFileSync(path.join(out,'test-body.report.json'),'utf8'));
  const mesh=JSON.parse(fs.readFileSync(path.join(out,'test-body.mesh.json'),'utf8'));
  const work=JSON.parse(fs.readFileSync(path.join(out,'test-body.work.json'),'utf8'));
  const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
  assert.equal(report.fingerprints.mesh,hash(JSON.stringify(mesh)));
  assert.equal(report.fingerprints.geometryNanometres,hash(JSON.stringify({vertices:mesh.vertices.map((p:number[])=>p.map(x=>Math.round(x*1e9))),faces:mesh.faces,colors:mesh.colors})));
  for(const [file,digest] of Object.entries(report.fingerprints.sources)) assert.equal(digest,hash(fs.readFileSync(file)));
  assert.deepEqual(work.strokes[0].mesh,mesh);
  assert.equal(report.visualAcceptance,'pending');
  assert.equal(report.gameAcceptance,'pending');
  assert.equal(fs.readdirSync(out).some(f=>f.endsWith('.gia')),false);
 } finally { fs.rmSync(out,{recursive:true,force:true}); }
});
