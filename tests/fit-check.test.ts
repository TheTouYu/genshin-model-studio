import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('fit-check converts manual picks to world metres with uncertainty',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gms-fit-'));
 try{
  const mesh={vertices:[[-0.12,0.514,0],[0.12,0.514,0],[-0.12,1.0001833,0],[0.12,1.0001833,0],[0,1.6,0]]};
  fs.writeFileSync(path.join(dir,'m.json'),JSON.stringify(mesh));
  const lm={scale:{heightMeters:1.6,topPixel:93,bottomPixel:1184,status:'provisional'},front:{landmarks:[{name:'knee',pixel:[177,833],uncertaintyPx:14},{name:'waist',pixel:[165,502],uncertaintyPx:10}]},side:{landmarks:[]}};
  fs.writeFileSync(path.join(dir,'lm.json'),JSON.stringify(lm));
  const out=JSON.parse(execFileSync(process.execPath,['scripts/fit-check.mjs',path.join(dir,'m.json'),path.join(dir,'lm.json'),'--knee','0.515'],{encoding:'utf8'}));
  assert.equal(out.provisional,true);
  const knee=out.comparisons.find((c:{name:string})=>c.name==='knee');
  assert.ok(Math.abs(knee.referenceWorldY-0.5147571035747023)<1e-9);
  assert.ok(Math.abs(knee.deltaM-(knee.referenceWorldY-0.515))<1e-9);
  assert.ok(Math.abs(knee.uncertaintyM-14/out.pxPerMeter)<1e-12);
  const waist=out.comparisons.find((c:{name:string})=>c.name==='waist');
  assert.equal(waist.meshWidthAtReferenceHeight,0.24);
 } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
