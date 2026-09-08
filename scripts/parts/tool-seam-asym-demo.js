import fs from 'fs'; import vm from 'vm';
const seamSrc=fs.readFileSync(new URL('./lib/ganyu-seam-check.js',import.meta.url),'utf8');
const asymSrc=fs.readFileSync(new URL('./lib/ganyu-asym-loft.js',import.meta.url),'utf8');
const ctx={console,Math}; vm.createContext(ctx); vm.runInContext(seamSrc,ctx); vm.runInContext(asymSrc,ctx);
const tri={vertices:[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,0],[1,0,0],[0,1,0],[1,1,0]],faces:[0,1,2,1,3,2,4,6,5,5,6,7]};
const split=ctx.seamCheck(tri); console.log('split seamCheck',split.seamEdges,split.seams.slice(0,2));
const path=[[0,0,0],[0,1,0],[0,2,0],[0,3,0],[0,4,0]], sections=[{rx:.22,ryF:.15,cyF:.025,ryB:.10,cyB:-.005},{rx:.25,ryF:.18,cyF:.03,ryB:.11,cyB:0},{rx:.18,ryF:.12,cyF:.01,ryB:.09,cyB:-.015},{rx:.16,ryF:.11,cyF:0,ryB:.10,cyB:.02},{rx:.22,ryF:.13,cyF:.01,ryB:.16,cyB:.06}];
const mesh=ctx.asymLoft(path,sections,4,16,()=>[.7,.7,.8],{up:[0,0,1],cap:'both'}); console.log('asym mesh',mesh.vertices.length,mesh.faces.length/3);
function check(m){let deg=0;for(let i=0;i<m.faces.length;i+=3){let a=m.vertices[m.faces[i]],b=m.vertices[m.faces[i+1]],c=m.vertices[m.faces[i+2]],u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-9)deg++;}return {faces:m.faces.length/3,deg};}
console.log('meshCheck',check(mesh));
for(let k=0;k<5;k++){let ring=mesh.vertices.slice(k*16,(k+1)*16),z=ring.map(p=>p[2]);console.log('ring',k,'ryF/ryB',sections[k].ryF,sections[k].ryB,'front/back',Math.max(...z),Math.min(...z));}
const hand={vertices:mesh.vertices.concat([[0,4.25,0],[.03,4.25,.01],[-.03,4.25,-.01]])}; console.log('proportion',ctx.proportionReport(hand,[{name:'shoulder',y0:3.9,y1:4.1},{name:'waist',y0:1.9,y1:2.1},{name:'palm',y0:0,y1:1},{name:'finger',y0:4.2,y1:4.3}]));
