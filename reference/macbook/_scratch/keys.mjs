import {decodePNG} from './png.mjs';
const {w,h,ch,px}=decodePNG(process.argv[2]);
const at=(x,y)=>{const i=(y*w+x)*ch;return [px[i],px[i+1],px[i+2]];};
const isDark=(x,y)=>{const [r,g,b]=at(x,y);return Math.max(r,g,b)<110;};
const MMX=304.1/1456, MMY=212.4/1015, X0=28, Y0=23;
const mm=(v,ax)=>+(v*(ax==='x'?MMX:MMY)).toFixed(2);
// content bbox recheck: print content x-range at several y
console.log('=== bbox cross-sections (x-range of non-bg/non-blue) ===');
for(const y of [25,40,60,100,300,600,900,1020,1035]){
  let mn=1e9,mx=-1;
  for(let x=0;x<w;x++){ const [r,g,b]=at(x,y); const M=Math.max(r,g,b),N=Math.min(r,g,b); const sat=M===0?0:(M-N)/M;
    const blue=(b>r+30&&b>g+10&&sat>0.25);
    if(!(M>242&&sat<0.06) && !blue){ if(x<mn)mn=x; if(x>mx)mx=x; } }
  console.log(`y=${y} x:[${mn},${mx}] width=${mx-mn} (${mm(mx-mn,'x')}mm)`);
}
// key row analysis
const rows=[[162,242],[250,330],[338,417],[425,505],[513,592]];
console.log('\n=== key row column runs ===');
rows.forEach(([ys,ye],ri)=>{
  const ymid=Math.round((ys+ye)/2);
  // use a band: count dark over the row height
  const colDark=[]; for(let x=0;x<w;x++){let n=0;for(let y=ys;y<=ye;y++)if(isDark(x,y))n++;colDark.push(n);}
  const th=Math.max(3,Math.round((ye-ys+1)*0.35));
  let runs=[],c=null;
  for(let x=0;x<w;x++){ const on=colDark[x]>=th;
    if(on&&!c)c={s:x}; else if(!on&&c){c.e=x-1;runs.push(c);c=null;} }
  if(c){c.e=w-1;runs.push(c);}
  const widths=runs.map(r=>r.e-r.s+1);
  const gaps=[]; for(let i=1;i<runs.length;i++)gaps.push(runs[i].s-runs[i-1].e-1);
  const centers=runs.map(r=>(r.s+r.e)/2);
  const pitches=[]; for(let i=1;i<centers.length;i++)pitches.push(+(centers[i]-centers[i-1]).toFixed(1));
  console.log(`row${ri} y${ys}-${ye} h=${mm(ye-ys+1,'y')}mm keys=${runs.length}`);
  console.log('  runs(px):', runs.map(r=>`${r.s}-${r.e}`).join(' '));
  console.log('  width mm:', widths.map(v=>mm(v,'x')).join(' '));
  console.log('  gaps mm:', gaps.map(v=>mm(v,'x')).join(' '));
  console.log('  center-to-center mm:', pitches.join(' '));
});
