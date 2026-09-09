import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const file of ['web/index.html','public/index.html']) test(file+' refuses stale beforeunload writes',()=>{
 const source=fs.readFileSync(file,'utf8');
 const start=source.indexOf('  let observedWork =');
 const end=source.indexOf('  function saveLocal()',start);
 assert.ok(start>=0&&end>start);
 let stored='old', restores=0,writes=0;
 // 切片区间内的 writeLocal 还依赖两个缩放辅助函数（2026-09-09 新增，定义在切片区间之外）：
 // 按缺省值桩提供，保证本用例只测「拒绝陈旧写入」这一契约。
 const ctx=vm.createContext({LS_KEY:'work',WORK_VERSION:3,JSON,state:{strokes:[],options:{},componentNames:{},gmsLinks:[]},localStorage:{getItem:()=>stored,setItem:(_k:string,v:string)=>{stored=v;writes++;}},restoreLocal:()=>{restores++;},currentScaleOrDefault:()=>({rootScale:0.1,overallScale:1}),isDefaultScale:(s:{rootScale:number;overallScale:number})=>s.rootScale===0.1&&s.overallScale===1});
 vm.runInContext(source.slice(start,end),ctx);
 stored='newer-from-other-tab';
 vm.runInContext('writeLocal()',ctx);
 assert.equal(stored,'newer-from-other-tab');assert.equal(writes,0);assert.equal(restores,1);
 stored='old';vm.runInContext('writeLocal()',ctx);assert.equal(writes,1);
 vm.runInContext('writeLocal()',ctx);assert.equal(writes,2);
});
