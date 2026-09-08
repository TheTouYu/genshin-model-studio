import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
test('motion regression assets preserve accepted mesh and cover all articulated joints',()=>{
 const a=JSON.parse(fs.readFileSync('delivery/motion-regression-v2/bundle.json','utf8'));
 const original=JSON.parse(fs.readFileSync('delivery/body-blockout-r1/mesh.json','utf8'));
 assert.deepEqual(a.mesh,original);
 assert.equal(a.rig.sourceSha256,crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'));
 assert.equal(a.rig.joints.length,15);assert.equal(a.clips.length,23);
 assert.equal(a.rig.joints.find((j:any)=>j.id==='neck').parent,'spine');
 assert.equal(a.rig.joints.find((j:any)=>j.id==='shoulderL').parent,'spine');
 assert.equal(a.rig.vertexJoint.length,original.vertices.length);
 const ids=new Set();for(const j of a.rig.joints){assert.ok(!ids.has(j.id));if(j.parent)assert.ok(ids.has(j.parent));ids.add(j.id);}
 for(const i of a.rig.vertexJoint)assert.ok(Number.isInteger(i)&&i>=0&&i<a.rig.joints.length);
 for(const j of a.rig.joints.filter((j:any)=>j.parent))assert.ok(a.clips.some((c:any)=>c.tracks.some((t:any)=>t.joint===j.id)));
 for(const c of a.clips)for(const t of c.tracks){assert.ok(ids.has(t.joint));assert.ok(['x','y','z'].includes(t.axis));assert.equal(t.keys[0][1],0);assert.equal(t.keys.at(-1)[1],0);assert.equal(t.keys.at(-1)[0],c.duration);}
 assert.deepEqual(a,JSON.parse(fs.readFileSync('web/draw/motion-assets/bundle.json','utf8')));
});
