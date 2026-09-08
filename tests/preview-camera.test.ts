import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('camera projection API preserves orbit, resizes frustum and rejects unknown modes', () => {
  const events: Record<string, () => void> = {};
  let rendered: any;
  class Vector {
    x=0; y=0; z=0;
    constructor(x=0,y=0,z=0) { this.set(x,y,z); }
    set(x:number,y:number,z:number) { this.x=x;this.y=y;this.z=z;return this; }
    copy(v:Vector) { return this.set(v.x,v.y,v.z); }
    add(v:Vector) { return this.set(this.x+v.x,this.y+v.y,this.z+v.z); }
    setFromSpherical() { return this; }
    toArray() { return [this.x,this.y,this.z]; }
  }
  class Node { position=new Vector(); children:any[]=[]; add(n:any) {this.children.push(n);} }
  class Camera extends Node { left=0;right=0;top=0;bottom=0;aspect=1; lookAt() {} updateProjectionMatrix() {} }
  class Renderer {setPixelRatio() {} setSize() {} render(_s:any,c:any) { rendered=c; }}
  const canvas={clientWidth:800,clientHeight:400,style:{},addEventListener() {}};
  const ctx=vm.createContext({THREE:{WebGLRenderer:Renderer,Scene:Node,Color:class {},PerspectiveCamera:Camera,OrthographicCamera:Camera,AmbientLight:Node,DirectionalLight:Node,GridHelper:Node,AxesHelper:Node,Group:Node,Box3:class { setFromObject() { return this; } isEmpty() { return true; } },Vector3:Vector,Spherical:class {}},requestAnimationFrame:()=>1,addEventListener:(name:string,cb:()=>void)=>{events[name]=cb;},console});
  vm.runInContext(fs.readFileSync('web/draw/preview.js','utf8'),ctx);
  const api=ctx.createPreview(canvas);
  assert.equal(JSON.stringify(api.getMeshStats()),'[]');
  api.getMeshStats().push({vertices:999});
  assert.equal(JSON.stringify(api.getMeshStats()),'[]');
  api.setTarget(0,0.8,0);
  api.setCamera({projection:'orthographic',yaw:0,pitch:Math.PI/2,radius:2});
  const before=JSON.stringify(api.getCamera());
  assert.equal(api.getWireframe(),true);
  api.setWireframe(false);
  assert.equal(api.getWireframe(),false);
  assert.equal(JSON.stringify(api.getCamera()),before);
  api.setItems([]);
  api.setTarget(0,0.8,0);
  api.setCamera({radius:2});
  api.setWireframe(true);
  assert.equal(api.getWireframe(),true);
  assert.equal(JSON.stringify(api.getCamera()),before);
  assert.ok(Math.abs(rendered.right/rendered.top-2)<1e-10);
  api.setCamera({projection:'perspective'});
  assert.equal(api.getCamera().projection,'perspective');
  api.setCamera({projection:'orthographic'});
  assert.equal(JSON.stringify(api.getCamera()),before);
  assert.throws(()=>api.setCamera({projection:'invalid'}));
  assert.equal(JSON.stringify(api.getCamera()),before);
  canvas.clientWidth=400;events.resize();api.setCamera({});
  assert.equal(api.getCamera().aspect,1);
  assert.equal(rendered.right,rendered.top);
  const state=api.getCamera();state.target[1]=999;
  assert.equal(api.getCamera().target[1],0.8);
});

test('both preview entry points expose exactly one default-on wireframe control', () => {
  for (const file of ['web/index.html','public/index.html','web/draw/preview-demo.html']) {
    const source=fs.readFileSync(file,'utf8');
    assert.equal((source.match(/id="toggleWireframe"/g)||[]).length,1,file);
    assert.match(source,/aria-pressed="true"/);
    assert.match(source,/getWireframe\(\)/);
    assert.match(source,/preview\.js\?v=/);
  }
});

test('local and deployed preview artifacts remain identical', () => {
  assert.equal(fs.readFileSync('web/draw/preview.js','utf8'),fs.readFileSync('public/draw/preview.js','utf8'));
});
