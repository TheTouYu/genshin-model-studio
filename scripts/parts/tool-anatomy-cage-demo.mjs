#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=process.cwd();
const out=path.resolve(process.argv[2]||'delivery/anatomy-cage');
fs.mkdirSync(out,{recursive:true});
const c=vm.createContext({Math,Set,Map,console});
vm.runInContext(fs.readFileSync(path.join(root,'scripts/parts/lib/ganyu-anatomy-cage.js'),'utf8'),c);
function serial(value){return JSON.parse(JSON.stringify(value));}
function stage(name,graph,sides){
  const cage=c.buildAnatomyCage(graph,{sides,targetFaces:300});
  return {name,cage:serial(cage),wireframe:serial(c.cageWireframe(cage)),structure:serial(c.anatomyStructureReport(graph))};
}
const coarseGraph=c.createAnatomyControlGraph();
const movedGraph=c.createAnatomyControlGraph();
c.moveAnatomyControlPoint(movedGraph,'acromionL',[-.035,.015,.018]);
c.moveAnatomyControlPoint(movedGraph,'acromionR',[.035,.015,.018]);
c.moveAnatomyControlPoint(movedGraph,'axillaFrontL',[-.018,0,.010]);
c.moveAnatomyControlPoint(movedGraph,'axillaFrontR',[.018,0,.010]);
const coarse=stage('coarse',coarseGraph,6);
const moved=stage('moved-shoulder',movedGraph,6);
const elevated=stage('elevated-density-preview',movedGraph,12);
const manifest={schemaVersion:1,model:'ganyu-anatomy-cage-demo',reference:['reference/body-wire-front.png','reference/body-wire-side.png','reference/body-wire-quarter.png','reference/body-wire-back.png'],stages:[coarse,moved,elevated],workflow:['semantic controls','low-poly cage','structural report','point edit','density preview'],visualAcceptance:'pending-browser-capture',productionBoundary:'cage preview is not the final one-piece body; use shared extrudePatch/branch for production topology'};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(out,'coarse.mesh.json'),JSON.stringify(coarse.cage.mesh,null,2)+'\n');
const coarseWork={version:3,strokes:[{id:'anatomy-cage-coarse',points:[[0,0]],render:'rod',resourceId:10009019,mesh:coarse.cage.mesh,material:'wireframe'}],options:{mode:'extrude',shape:'cylinder',size:0.01,count:60,heightMeters:1.6,canvasHeightPx:460,canvasWidthPx:416}};
fs.writeFileSync(path.join(out,'coarse.work.json'),JSON.stringify(coarseWork,null,2)+'\n');
fs.writeFileSync(path.join(out,'moved-shoulder.mesh.json'),JSON.stringify(moved.cage.mesh,null,2)+'\n');
fs.writeFileSync(path.join(out,'elevated-density.mesh.json'),JSON.stringify(elevated.cage.mesh,null,2)+'\n');
console.log(JSON.stringify({out,stages:manifest.stages.map(s=>({name:s.name,vertices:s.cage.stats.vertices,faces:s.cage.stats.faces,controlPoints:s.cage.stats.controlPoints,edges:s.cage.stats.edges,structurePass:s.structure.pass}))},null,2));
