import fs from 'node:fs';
import { verifyMesh } from '../../dist/src/mesh/verify.js';
const editFile=process.argv[2];
const input=editFile?JSON.parse(fs.readFileSync(editFile,'utf8')):[];
const controlEdits=Array.isArray(input)?input:input.edits;
const legProfile=Array.isArray(input)?null:input.legProfile;
if(legProfile && (!Array.isArray(legProfile)||legProfile.some(r=>!Array.isArray(r)||r.length!==7||typeof r[0]!=='string'||!r.slice(1).every(Number.isFinite))))throw new Error('Invalid leg profile');
if(!Array.isArray(controlEdits))throw new Error('Control edits must be an array');
const vertices=[], quads=[], regions={};
const ring=(y,w,front,back)=>[[-w,y,-back],[0,y,-back],[w,y,-back],[w,y,front],[0,y,front],[-w,y,front]].map(p=>vertices.push(p)-1);
const band=(a,b,label)=>{for(let j=0;j<a.length;j++)quads.push({ids:[a[j],a[(j+1)%a.length],b[(j+1)%a.length],b[j]],label});};
const profiles=[['pelvis',.80,.145,.09,.10],['waist',1.00,.115,.08,.08],['chest',1.16,.17,.125,.095],['shoulder',1.28,.18,.085,.08],['neck',1.34,.047,.045,.045],['jaw',1.38,.065,.075,.07],['head',1.51,.085,.085,.09],['crown',1.60,.055,.06,.06]];
const rings=profiles.map(([name,y,w,f,b])=>{const r=ring(y,w,f,b);regions[name]=r;return r;});
for(let i=0;i<rings.length-1;i++)band(rings[i],rings[i+1],profiles[i][0]);
quads.push({ids:rings.at(-1).slice(),label:'crown-cap'});
const extrude=(loop,positions,label)=>{const next=positions.map(p=>vertices.push(p)-1);band(loop,next,label);regions[label]=next;return next;};
for(const sign of [-1,1]){
 const side=sign>0?'R':'L';
 const face=quads.find(q=>q.label==='chest'&&q.ids.every(i=>Math.abs(vertices[i][0]-sign*(vertices[i][1]>1.2?.18:.17))<1e-8));
 quads.splice(quads.indexOf(face),1);
 let loop=face.ids;
 const corners=loop.map(i=>({outer:vertices[i][1]>1.2,front:vertices[i][2]>0}));
 for(const [name,x,y,w,d] of [['upperArm',.225,1.18,.047,.055],['elbow',.265,.96,.035,.035],['wrist',.30,.76,.025,.022],['palm',.31,.67,.038,.018]]){
  loop=extrude(loop,corners.map(c=>[sign*(x+(c.outer?w:-w)),y,c.front?d:-d]),name+side);
 }
 quads.push({ids:loop,label:'palm-cap'+side});
 const base=rings[0];
 let leg=sign>0?[base[1],base[2],base[3],base[4]]:[base[0],base[1],base[4],base[5]];
 const shape=leg.map(i=>({outer:Math.abs(vertices[i][0])>.01,front:vertices[i][2]>0}));
 for(const [name,x,y,w,f,b,frontY=y] of (legProfile||[['thigh',.09,.70,.07,.08,.08],['knee',.10,.48,.048,.05,.05],['ankle',.105,.12,.032,.035,.035],['foot',.105,.035,.047,.19,.05]])){
  leg=extrude(leg,shape.map(c=>[sign*(x+(c.outer?w:-w)),c.front?frontY:y,c.front?f:-b]),name+side);
 }
 quads.push({ids:leg,label:'sole'+side});
}
for(const edit of controlEdits){
 if(!edit || !regions[edit.region])throw new Error('Unknown control region');
 if(!Array.isArray(edit.scale)||edit.scale.length!==3||!edit.scale.every(x=>Number.isFinite(x)&&x>0))throw new Error('Scale must contain three positive finite numbers');
 const delta=edit.delta||[0,0,0];
 if(!Array.isArray(delta)||delta.length!==3||!delta.every(Number.isFinite))throw new Error('Invalid control delta');
 const ids=regions[edit.region], center=[0,0,0];
 for(const i of ids)for(let d=0;d<3;d++)center[d]+=vertices[i][d]/ids.length;
 for(const i of ids)for(let d=0;d<3;d++)vertices[i][d]=center[d]+(vertices[i][d]-center[d])*edit.scale[d]+delta[d];
}
const faces=[];for(const q of quads){if(q.ids.length>4){const center=[0,0,0];for(const id of q.ids)for(let d=0;d<3;d++)center[d]+=vertices[id][d]/q.ids.length;const ci=vertices.push(center)-1;for(let i=0;i<q.ids.length;i++)faces.push(ci,q.ids[i],q.ids[(i+1)%q.ids.length]);}else for(let i=1;i<q.ids.length-1;i++)faces.push(q.ids[0],q.ids[i],q.ids[i+1]);}
// Orient adjacent faces consistently, then choose outward signed volume.
const edges=new Map(),adj=Array.from({length:faces.length/3},()=>[]);
for(let i=0;i<faces.length;i+=3)for(let j=0;j<3;j++){const a=faces[i+j],b=faces[i+(j+1)%3],k=[Math.min(a,b),Math.max(a,b)].join(':');if(!edges.has(k))edges.set(k,[]);edges.get(k).push([i/3,a<b?1:-1]);}
for(const es of edges.values())if(es.length===2){const [a,b]=es;adj[a[0]].push([b[0],a[1]===b[1]]);adj[b[0]].push([a[0],a[1]===b[1]]);}
const flip=new Map([[0,false]]),queue=[0];for(let k=0;k<queue.length;k++)for(const [n,f]of adj[queue[k]])if(!flip.has(n)){flip.set(n,flip.get(queue[k])!==f);queue.push(n);}
for(const [i,f]of flip)if(f)[faces[3*i+1],faces[3*i+2]]=[faces[3*i+2],faces[3*i+1]];
let volume=0;for(let i=0;i<faces.length;i+=3){const [a,b,c]=faces.slice(i,i+3).map(j=>vertices[j]);volume+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);}
if(volume<0)for(let i=0;i<faces.length;i+=3)[faces[i+1],faces[i+2]]=[faces[i+2],faces[i+1]];
const mesh={vertices,faces,colors:Array(faces.length/3).fill('#cbd3d8')};
const report={vertices:vertices.length,triangles:faces.length/3,polygonFaces:quads.length,connected:flip.size===faces.length/3,closed:[...edges.values()].every(es=>es.length===2),gate:verifyMesh(mesh),referenceFit:false,fingers:'palm block only',stage:'editable blockout, not export'};
const work={version:3,strokes:[{id:'body-blockout-low',points:[[0,0]],render:'rod',resourceId:10009019,mesh}],options:{mode:'extrude',shape:'cylinder',size:.01,count:10,heightMeters:1.6,canvasHeightPx:460,canvasWidthPx:640}};
const out=process.argv[3]||'delivery/body-blockout-low';fs.mkdirSync(out,{recursive:true});
for(const [name,data]of Object.entries({mesh,work,report,controls:{regions,vertices,polygons:quads,edits:controlEdits,legProfile}}))fs.writeFileSync(out+'/'+name+'.json',JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
