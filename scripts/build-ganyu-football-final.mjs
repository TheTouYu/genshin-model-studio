#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { verifyMesh, verifyMeshExport } from '../dist/src/mesh/verify.js';
import { panelizeMesh } from '../dist/src/mesh/panelize.js';

const ROOT = process.cwd();
const OUT = path.resolve(process.argv[2] || 'delivery/ganyu-football-final');
const NAME = process.argv[3] || 'ganyu-football-10-final';
const BODY_SUBDIV = Number(process.env.BODY_SUBDIV || 1);
fs.mkdirSync(OUT, { recursive: true });

function loadContext() {
  const context = { Math, console, Set, Map, Infinity, Number, JSON };
  context.window = context;
  vm.createContext(context);
  for (const file of ['lib/ganyu-lib.js', 'lib/ganyu-cage-branch.js', 'lib/ganyu-seam-check.js', 'ganyu-body-cage.js', 'ganyu-head-new.js']) {
    const source = fs.readFileSync(path.join(ROOT, 'scripts/parts', file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  return context;
}

const ctx = loadContext();
const bodySource = ctx.__BODY_CAGE__;
const headSource = ctx.__GMS_HEAD_PARTS__;

const PAL = {
  skin: '#F5C9A6', skinShadow: '#E2AB82',
  hairBright: '#A8D8F0', hairMid: '#6FA5D5', hairDeep: '#3E6FA8', hairPurple: '#6C79C9',
  navy: '#244B85', blue: '#3A6DB0', blueLight: '#7EB6E8', white: '#F3F5F7',
  black: '#1A1A1C', red: '#A93B46', gold: '#C9A66B', sock: '#F0F2F4', sole: '#D8E0EA'
};

function cloneMesh(m) {
  return { vertices: (m.vertices || []).map(p => p.slice()), faces: (m.faces || []).slice(), colors: (m.colors || []).slice() };
}
function vec(a,b) { return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
function cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
function dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function norm(a) { const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; }
function add(a,b) { return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]; }
function mul(a,s) { return [a[0]*s,a[1]*s,a[2]*s]; }
function signedVolume(m) {
  let c=[0,0,0]; for (const p of m.vertices) c=add(c,p); c=mul(c,1/Math.max(1,m.vertices.length));
  let v=0; for(let i=0;i<m.faces.length;i+=3){const a=vec(m.vertices[m.faces[i]],c),b=vec(m.vertices[m.faces[i+1]],c),d=vec(m.vertices[m.faces[i+2]],c);v+=dot(a,cross(b,d))/6;} return v;
}
function outward(m) { if (signedVolume(m)<0) for(let i=0;i<m.faces.length;i+=3){const t=m.faces[i+1];m.faces[i+1]=m.faces[i+2];m.faces[i+2]=t;} return m; }
function orientMesh(m) {
  const faceCount = Math.floor(m.faces.length / 3);
  const edgeMap = new Map();
  const addEdge = (a,b,fi) => {
    const key = a < b ? a+':'+b : b+':'+a;
    const dir = a < b ? 1 : -1;
    let list = edgeMap.get(key); if (!list) { list=[]; edgeMap.set(key,list); }
    list.push({fi,dir});
  };
  for (let fi=0; fi<faceCount; fi++) {
    const a=m.faces[fi*3], b=m.faces[fi*3+1], c=m.faces[fi*3+2];
    addEdge(a,b,fi); addEdge(b,c,fi); addEdge(c,a,fi);
  }
  const adj=Array.from({length:faceCount},()=>[]);
  for (const list of edgeMap.values()) if (list.length===2) {
    const x=list[0], y=list[1], needFlip=x.dir===y.dir;
    adj[x.fi].push({fi:y.fi,flip:needFlip}); adj[y.fi].push({fi:x.fi,flip:needFlip});
  }
  const flip=Array(faceCount).fill(null);
  for (let seed=0; seed<faceCount; seed++) if (flip[seed]===null) {
    flip[seed]=false; const q=[seed];
    while(q.length){const fi=q.shift();for(const e of adj[fi]){const want=flip[fi] !== e.flip;if(flip[e.fi]===null){flip[e.fi]=want;q.push(e.fi);}}}
  }
  for(let fi=0;fi<faceCount;fi++) if(flip[fi]) { const k=fi*3+1,t=m.faces[k];m.faces[k]=m.faces[k+1];m.faces[k+1]=t; }
  const seen=Array(faceCount).fill(false);
  for(let seed=0;seed<faceCount;seed++) if(!seen[seed]) {
    const faces=[], q=[seed]; seen[seed]=true;
    while(q.length){const fi=q.shift();faces.push(fi);for(const e of adj[fi])if(!seen[e.fi]){seen[e.fi]=true;q.push(e.fi);}}
    const verts=new Set(); for(const fi of faces){verts.add(m.faces[fi*3]);verts.add(m.faces[fi*3+1]);verts.add(m.faces[fi*3+2]);}
    let center=[0,0,0];for(const vi of verts)center=add(center,m.vertices[vi]);center=mul(center,1/Math.max(1,verts.size));
    let vol=0;for(const fi of faces){const a=vec(m.vertices[m.faces[fi*3]],center),b=vec(m.vertices[m.faces[fi*3+1]],center),c=vec(m.vertices[m.faces[fi*3+2]],center);vol+=dot(a,cross(b,c))/6;}
    if(vol<0)for(const fi of faces){const k=fi*3+1,t=m.faces[k];m.faces[k]=m.faces[k+1];m.faces[k+1]=t;}
  }
  return m;
}
function faceColor(m, color) { m.colors = Array.from({length:m.faces.length/3},()=>color); return m; }

function cappedLoft(rings, colorFn, opts={}) {
  const n=rings[0].length, v=[], f=[], c=[], bases=[];
  for(const ring of rings){ bases.push(v.length); for(const p of ring)v.push(p.slice()); }
  for(let i=0;i<rings.length-1;i++) for(let j=0;j<n;j++){
    const a=bases[i]+j,b=bases[i]+(j+1)%n,d=bases[i+1]+j,e=bases[i+1]+(j+1)%n;
    f.push(a,b,e,a,e,d); const col=colorFn(i,j,(i+.5)/(rings.length-1),(j+.5)/n); c.push(col,col);
  }
  const cap=(base,reverse)=>{let p=[0,0,0];for(let j=0;j<n;j++)p=add(p,v[base+j]);p=mul(p,1/n);const ci=v.length;v.push(p);for(let j=0;j<n;j++){const a=base+j,b=base+(j+1)%n;f.push(...(reverse?[ci,b,a]:[ci,a,b]));c.push(colorFn(reverse?0:rings.length-2,j,reverse?0:1,j/n));}};
  if(opts.cap !== 'none'){cap(bases[0],true);cap(bases[bases.length-1],false);}
  return outward({vertices:v,faces:f,colors:c});
}
function ringY(y,rx,front,back,cz=0,n=32){const out=[];for(let j=0;j<n;j++){const t=j/n*2*Math.PI,co=Math.cos(t),si=Math.sin(t);out.push([rx*co,y,cz+(si>=0?front:back)*si]);}return out;}
function tube(pathPts,radii,n=20,colorFn=()=>PAL.white){
  const rings=[];
  for(let i=0;i<pathPts.length;i++){
    const p=pathPts[i], p0=pathPts[Math.max(0,i-1)], p1=pathPts[Math.min(pathPts.length-1,i+1)], t=norm(vec(p1,p0));
    const ref=Math.abs(t[1])<.85?[0,1,0]:[1,0,0], u=norm(cross(t,ref)), w=cross(t,u), r=radii[Math.min(i,radii.length-1)];
    const rr=Array.isArray(r)?r:[r,r]; const ring=[];
    for(let j=0;j<n;j++){const a=j/n*2*Math.PI;ring.push(add(p,add(mul(u,Math.cos(a)*rr[0]),mul(w,Math.sin(a)*rr[1]))));}
    rings.push(ring);
  }
  return cappedLoft(rings,(i,j,t,u)=>colorFn(i,j,t,u));
}
function box(cx,cy,cz,w,h,d,color){const x=w/2,y=h/2,z=d/2;const v=[[cx-x,cy-y,cz-z],[cx+x,cy-y,cz-z],[cx+x,cy+y,cz-z],[cx-x,cy+y,cz-z],[cx-x,cy-y,cz+z],[cx+x,cy-y,cz+z],[cx+x,cy+y,cz+z],[cx-x,cy+y,cz+z]];const q=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]],f=[];for(const a of q)f.push(a[0],a[1],a[2],a[0],a[2],a[3]);return outward(faceColor({vertices:v,faces:f},color));}
function ellipsePanel(center,rx,ry,rz,color,n=20){return cappedLoft([ringY(center[1]-ry,rx,rz,rz,center[2],n),ringY(center[1]+ry,rx,rz,rz,center[2],n)],()=>color);}
function finalHorn(sign){
  const pts=[[.050*sign,1.585,-.018],[.064*sign,1.615,-.026],[.078*sign,1.650,-.038],[.087*sign,1.688,-.050],[.086*sign,1.725,-.064],[.078*sign,1.758,-.078],[.064*sign,1.782,-.090],[.050*sign,1.798,-.098]];
  const radii=[.022,.022,.021,.020,.018,.016,.013,.010];
  return tube(pts,radii,20,(i)=>i<2?PAL.gold:(i<5?PAL.red:PAL.black));
}

function jersey() {
  const rings=[
    ringY(.885,.158,.090,.078,-.012), ringY(.925,.173,.101,.090,-.014), ringY(1.03,.158,.108,.096,-.016),
    ringY(1.13,.176,.116,.102,-.012), ringY(1.225,.164,.106,.095,-.006), ringY(1.285,.112,.072,.065,-.004)
  ];
  return cappedLoft(rings,(i,j,t,u)=>{
    const side=Math.abs(Math.cos((j+.5)/32*2*Math.PI))>.84;
    const front=Math.sin((j+.5)/32*2*Math.PI)>.25;
    const diagonal=front && (u > .35 && u < .72) && ((u - .35) > (j/32)*.48);
    if(i>=4)return PAL.blue;
    if(side || diagonal)return t<.32?PAL.blueLight:PAL.blue;
    return t<.25?PAL.white:(t<.68?PAL.white:PAL.blueLight);
  });
}
function shorts(sign) {
  const rings=[ringY(.735,.133,.078,.070,-.012),ringY(.785,.151,.085,.075,-.012),ringY(.865,.159,.090,.080,-.010),ringY(.925,.168,.094,.084,-.010)];
  const m=cappedLoft(rings,(i,j)=>{const side=Math.abs(Math.cos((j+.5)/32*2*Math.PI))>.82;return side?PAL.blue:PAL.white;});
  if(sign < 0) for(const p of m.vertices) p[0] = -p[0];
  return m;
}
function sock(sign) {
  const pts=[[.095,.59,0],[.094,.52,.002],[.093,.44,.004],[.091,.36,.010],[.089,.29,.012],[.086,.22,.008],[.084,.14,.004],[.084,.07,.006]];
  const m=tube(pts.map(p=>[p[0]*sign,p[1],p[2]]),[[.054,.050],[.054,.050],[.052,.048],[.050,.046],[.047,.043],[.044,.040],[.041,.037],[.040,.035]],20,(i)=>i<2?PAL.blue:PAL.sock);
  return m;
}
function shoeUpper(sign) {
  const pts=[[.086,.135,.010],[.088,.098,.030],[.090,.061,.072],[.090,.040,.125],[.090,.032,.175]];
  const m=tube(pts,[[.043,.041],[.046,.043],[.048,.046],[.045,.041],[.035,.032]],20,(i)=>i<2?PAL.white:(i<4?PAL.blue:PAL.white));
  if(sign < 0) for(const p of m.vertices) p[0] = -p[0];
  return m;
}
function shoeSole(sign) { return box(.090*sign,.030,.115,.095,.028,.245,PAL.sole); }
function shoeStud(sign,z) { return box(.090*sign,.012,.115+z,.024,.020,.030,PAL.black); }
function cleat(sign) { return shoeUpper(sign); }
function sleeve(sign) {
  // Build the canonical (+x / left) sleeve, then mirror the vertices for the right (-x) side.
  // tube()'s frame is not mirror-invariant: ref switches [0,1,0]->[1,0,0] mid-path (|t[1]| crosses
  // 0.85), twisting the cross-section so a separately-built mirrored side self-intersects
  // (279 处 for the 7-ring version, 40 处 for this 3-ring one). Mirroring a clean canonical sleeve
  // is exact and passes verifyMesh; orientMesh (in validatePart) re-winds the mirrored faces, so no
  // gate is weakened.
  const pts=[[.184,1.238,.002],[.214,1.205,.003],[.246,1.095,.004]];
  const m=tube(pts,[[.034,.032],[.030,.029],[.024,.023]],8,(i)=>i>=1?PAL.blueLight:PAL.white);
  if(sign < 0) for(const p of m.vertices) p[0] = -p[0];
  return m;
}
function glove(sign) {
  const pts=[[.290*sign,.735,.018],[.291*sign,.700,.020],[.292*sign,.665,.023],[.293*sign,.635,.025]];
  return tube(pts,[[.030,.036],[.033,.040],[.031,.039],[.026,.032]],16,()=>PAL.black);
}
function tail(sign, offset=0) {
  const pts=[[.055,1.42,-.045],[.078,1.34,-.058],[.092,1.22,-.070],[.088,1.10,-.074],[.066,1.02,-.064],[.035,.96,-.050]];
  const m=tube(pts.map(p=>[p[0]+offset,p[1],p[2]]),[.034,.034,.032,.030,.028,.026],12,(i)=>i<2?PAL.hairBright:(i<4?PAL.hairMid:PAL.hairDeep));
  if(sign < 0) for(const p of m.vertices) p[0] = -p[0];
  return m;
}
function mergeMeshes(parts){const v=[],f=[],c=[];let off=0;for(const m of parts){for(const p of m.vertices)v.push(p.slice());for(const x of m.faces)f.push(x+off);for(const x of m.colors||[])c.push(x);off+=m.vertices.length;}return {vertices:v,faces:f,colors:c};}
function glyphBars(text,cx,y,z,scale,color,back=false){
  const out=[]; let x=cx;
  const gap=scale*.65, bw=scale*.18, h=scale;
  const glyphs={
    G:[[0,0,0,h],[0,0,bw,h],[0,h/2,scale*.55,bw],[scale*.45,0,0,bw],[scale*.45,h/2,0,bw]],
    A:[[0,0,bw,h],[scale*.62,0,bw,h],[scale*.17,h*.48,scale*.28,bw],[scale*.18,h*.85,scale*.28,bw]],
    N:[[0,0,bw,h],[scale*.62,0,bw,h],[scale*.31,h*.5,bw,h*.76]],
    Y:[[0,0,bw,h*.55],[scale*.62,0,bw,h*.55],[scale*.31,h*.42,bw,h*.58],[scale*.31,h*.78,bw,h*.30]],
    U:[[0,0,bw,h],[scale*.62,0,bw,h],[scale*.31,0,scale*.45,bw]],
    '1':[[scale*.28,0,bw,h],[scale*.08,h*.84,scale*.4,bw]],
    '0':[[0,0,bw,h],[scale*.62,0,bw,h],[scale*.31,0,scale*.50,bw],[scale*.31,h*.86,scale*.50,bw]],
  };
  for(const ch of text){const bars=glyphs[ch]||[];for(const [dx,dy,w,hh] of bars){const ww=Math.max(Math.abs(w),bw), hh2=Math.max(Math.abs(hh),bw);out.push(box(x+dx+ ww/2,y+dy+hh2/2,z,ww,hh2,.010,color));}x+=scale+gap;}
  return out;
}
function tasselTop(sign){ return box(.183*sign,.84,.016,.014,.070,.014,PAL.gold); }
function tasselRed(sign){ return box(.190*sign,.785,.018,.018,.080,.016,PAL.red); }
function tasselBlue(sign){ return box(.171*sign,.805,.017,.014,.040,.014,PAL.navy); }
function browAndFaceAccents(){
  return [box(-.038,1.475,.092,.039,.008,.008,PAL.hairPurple,-0.10),box(.038,1.475,.092,.039,.008,.008,PAL.hairPurple,0.10)];
}

const body = cloneMesh(bodySource.mesh);
let bodyElevated = body;
if (BODY_SUBDIV > 0 && typeof ctx.subdivSurface === 'function') bodyElevated = ctx.subdivSurface(body, BODY_SUBDIV, {colors:true});
// Keep the generated body colour bands, while making skin/cloth values match the palette.
bodyElevated.colors = (bodyElevated.colors || []).map(c => c === '#f3c9a7' ? PAL.skin : c === '#d9d9de' ? PAL.white : c === '#9aa2ab' ? PAL.sock : c);

const parts = [
  {id:'body', mesh:bodyElevated, material:'body'},
  {id:'hair', mesh:headSource.hair, material:'hair'},
  {id:'horn-left', mesh:finalHorn(-1), material:'horn'},
  {id:'horn-right', mesh:finalHorn(1), material:'horn'},
  {id:'face-details', mesh:headSource.face, material:'face'},
  {id:'jersey', mesh:jersey(), material:'jersey'},
  {id:'shorts-left', mesh:shorts(1), material:'shorts'},
  {id:'shorts-right', mesh:shorts(-1), material:'shorts'},
  {id:'sleeve-left', mesh:sleeve(1), material:'jersey'},
  {id:'sleeve-right', mesh:sleeve(-1), material:'jersey'},
  {id:'glove-left', mesh:glove(1), material:'glove'},
  {id:'glove-right', mesh:glove(-1), material:'glove'},
  {id:'sock-left', mesh:sock(1), material:'sock'},
  {id:'sock-right', mesh:sock(-1), material:'sock'},
  {id:'shoe-upper-left', mesh:shoeUpper(1), material:'shoe'},
  {id:'shoe-upper-right', mesh:shoeUpper(-1), material:'shoe'},
  {id:'shoe-sole-left', mesh:shoeSole(1), material:'shoe'},
  {id:'shoe-sole-right', mesh:shoeSole(-1), material:'shoe'},
  {id:'shoe-stud-left-front', mesh:shoeStud(1,-.07), material:'shoe'},
  {id:'shoe-stud-left-mid', mesh:shoeStud(1,0), material:'shoe'},
  {id:'shoe-stud-left-back', mesh:shoeStud(1,.07), material:'shoe'},
  {id:'shoe-stud-right-front', mesh:shoeStud(-1,-.07), material:'shoe'},
  {id:'shoe-stud-right-mid', mesh:shoeStud(-1,0), material:'shoe'},
  {id:'shoe-stud-right-back', mesh:shoeStud(-1,.07), material:'shoe'},
  {id:'tail-left', mesh:tail(-1), material:'hair'},
  {id:'tail-right', mesh:tail(1), material:'hair'},
  {id:'tassel-left-gold', mesh:tasselTop(1), material:'ornament'},
  {id:'tassel-left-red', mesh:tasselRed(1), material:'ornament'},
  {id:'tassel-left-blue', mesh:tasselBlue(1), material:'ornament'},
  {id:'tassel-right-gold', mesh:tasselTop(-1), material:'ornament'},
  {id:'tassel-right-red', mesh:tasselRed(-1), material:'ornament'},
  {id:'tassel-right-blue', mesh:tasselBlue(-1), material:'ornament'}
];

const frontGlyphs = glyphBars('10',-.070,1.035,.111,.075,PAL.navy).concat(glyphBars('10',-.072,.795,.105,.050,PAL.blue));
const backGlyphs = glyphBars('GANYU',-.135,1.145,-.113,.034,PAL.navy,true).concat(glyphBars('10',-.052,.980,-.116,.082,PAL.blue,true));
for (let i=0;i<frontGlyphs.length;i++) parts.push({id:'front-mark-'+i,mesh:frontGlyphs[i],material:'decal'});
for (let i=0;i<backGlyphs.length;i++) parts.push({id:'back-mark-'+i,mesh:backGlyphs[i],material:'decal'});
for(const m of browAndFaceAccents()) parts.push({id:'face-accent-'+parts.length,mesh:m,material:'face'});

function validatePart(part){
  orientMesh(part.mesh);
  const rep=verifyMesh(part.mesh);
  if(!rep.ok) throw new Error(part.id+' verify failed: '+rep.failures.join('; '));
  return {id:part.id,vertices:part.mesh.vertices.length,faces:part.mesh.faces.length/3,gate:rep};
}
const reports=parts.map(validatePart);
const panelStats=parts.map(p=>panelizeMesh(p.mesh).stats);
const units=panelStats.map(s=>s.budget.used);
const exportGate=verifyMeshExport(parts.map(p=>p.mesh),units,null);
if(!exportGate.ok) throw new Error('batch verify failed: '+exportGate.failures.join('; '));
const seam=ctx.seamCheck(body);
if(!seam.onePiece) throw new Error('body seamCheck(onePiece) failed: '+JSON.stringify(seam));
const bodyMeshCheck=ctx.meshCheck(bodyElevated);
const ys=body.vertices.map(p=>p[1]);
const fit={
  source:'reference/ganyu-landmarks.json', reference:'reference/ganyu-3view.png',
  method:'orthographic overlay calibration; body wire front/side/quarter/back consulted',
  status:'provisional-overlay-reviewed',
  target:{heightM:1.6, crownY:1.60, chinY:1.36, jerseyHemY:.89, shortsHemY:.735, sockTopY:.59, soleY:.008},
  measured:{heightM:+(Math.max(...ys)-Math.min(...ys)).toFixed(4), minY:Math.min(...ys), maxY:Math.max(...ys)},
  landmarks:'pixel picks retained with uncertaintyPx in reference/ganyu-landmarks.json',
  limitations:['hair and garment depth are fit independently','hands/fingers remain a topology follow-up; glove silhouette is present','game acceptance requires user import check']
};
const work={version:3,strokes:parts.map((p,i)=>({id:'ganyu-final-'+p.id+'-'+i,points:[[0,0]],render:'rod',resourceId:10009019,mesh:p.mesh,material:p.material})),options:{mode:'extrude',shape:'cylinder',size:.01,count:60,heightMeters:1.6,canvasHeightPx:460,canvasWidthPx:416}};
const structureInput={name:NAME,template:'空模型',items:parts.map(p=>({resourceId:10009019,vertices:p.mesh.vertices,faces:p.mesh.faces,colors:p.mesh.colors}))};
const stage={
  schemaVersion:1, model:NAME, referenceFit:fit,
  sequence:['blockout','control-points','elevated-surface','appearance','verify','browser-orthographic','export'],
  blockout:{source:'scripts/parts/ganyu-body-cage.js',bodyVertices:body.vertices.length,bodyFaces:body.faces.length/3,componentsExpected:1},
  controls:bodySource.controls,
  elevated:{subdivLevels:BODY_SUBDIV,vertices:bodyElevated.vertices.length,faces:bodyElevated.faces.length/3},
  appearance:{parts:parts.length,items:parts.map((p,i)=>({id:p.id,material:p.material,vertices:p.mesh.vertices.length,faces:p.mesh.faces.length/3}))},
  meshCheck:bodyMeshCheck,seamCheck:seam,verify:exportGate,perPart:reports,
  gameAcceptance:'pending-user-import'
};
fs.writeFileSync(path.join(OUT,NAME+'.work.json'),JSON.stringify(work,null,2)+'\\n');
fs.writeFileSync(path.join(OUT,NAME+'.structure-input.json'),JSON.stringify(structureInput,null,2)+'\\n');
fs.writeFileSync(path.join(OUT,NAME+'.mesh.json'),JSON.stringify({name:NAME,vertices:bodyElevated.vertices,faces:bodyElevated.faces,colors:bodyElevated.colors},null,2)+'\\n');
fs.writeFileSync(path.join(OUT,NAME+'.build.json'),JSON.stringify(stage,null,2)+'\\n');
fs.writeFileSync(path.join(ROOT,'iteration-records/34-reference-fit-blockout.json'),JSON.stringify({iteration:34,stage:'reference-fit+blockout',...fit,body:{vertices:body.vertices.length,faces:body.faces.length/3,seam},gate:verifyMesh(body),visualAcceptance:'pending'},null,2)+'\\n');
fs.writeFileSync(path.join(ROOT,'iteration-records/35-control-elevated-appearance.json'),JSON.stringify({iteration:35,stage:'control-points+elevated-surface+appearance',model:NAME,body:{subdivLevels:BODY_SUBDIV,vertices:bodyElevated.vertices.length,faces:bodyElevated.faces.length/3},parts:parts.length,appearance:['hair-gradient','black-red-horns','red-gold-tassels','white-blue-jersey','GANYU-10','black-gloves','striped-socks','white-blue-cleats'],meshCheck:bodyMeshCheck,seamCheck:seam,verify:exportGate,visualAcceptance:'pending',gameAcceptance:'pending'},null,2)+'\\n');
console.log(JSON.stringify({out:OUT,name:NAME,parts:parts.length,body:{vertices:bodyElevated.vertices.length,faces:bodyElevated.faces.length/3},units:units.reduce((a,b)=>a+b,0),gate:exportGate,seam,meshCheck:bodyMeshCheck},null,2));
