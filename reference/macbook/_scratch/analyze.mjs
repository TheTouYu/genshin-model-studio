import {decodePNG} from './png.mjs';
const img=decodePNG(process.argv[2]);
const {w,h,ch,px}=img;
console.log('dims',w,h,'ch',ch);
const at=(x,y)=>{const i=(y*w+x)*ch;return [px[i],px[i+1],px[i+2]];};
function cls(x,y){ const [r,g,b]=at(x,y); const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  const sat=mx===0?0:(mx-mn)/mx;
  if(mx>242&&sat<0.06) return 'bg';
  if(b>r+30&&b>g+10&&sat>0.25) return 'blue';
  if(mx<90) return 'dark';
  return 'body'; }
// content bbox excluding bg and blue
let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){ const c=cls(x,y);
  if(c==='dark'||c==='body'){ if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; } }
console.log('content bbox', minx,miny,maxx,maxy, 'w',maxx-minx,'h',maxy-miny, 'aspect',((maxx-minx)/(maxy-miny)).toFixed(4));
// row profile of dark pixels (keyboard rows)
const rowDark=[];
for(let y=0;y<h;y++){ let n=0; for(let x=0;x<w;x++){ if(cls(x,y)==='dark') n++; } rowDark.push(n); }
let runs=[],cur=null;
for(let y=0;y<h;y++){ const on=rowDark[y]>60;
  if(on&&!cur) cur={s:y}; else if(!on&&cur){ cur.e=y-1; runs.push(cur); cur=null; } }
if(cur){cur.e=h-1;runs.push(cur);}
console.log('dark row-runs (y start-end, height):', runs.map(r=>`${r.s}-${r.e}(${r.e-r.s+1})`).join(' '));
// column profile of dark pixels within keyboard band
const kb = runs.filter(r=>r.e-r.s>8).sort((a,b)=>b.e-b.s-(a.e-a.s))[0];
if(kb){ const colDark=[];
  for(let x=0;x<w;x++){ let n=0; for(let y=kb.s;y<=kb.e;y++){ if(cls(x,y)==='dark') n++; } colDark.push(n); }
  let cr=[],c2=null;
  for(let x=0;x<w;x++){ const on=colDark[x]>2;
    if(on&&!c2) c2={s:x}; else if(!on&&c2){ c2.e=x-1; cr.push(c2); c2=null; } }
  if(c2){c2.e=w-1;cr.push(c2);}
  console.log('keyboard band y',kb.s,kb.e,'dark col-runs count',cr.length);
  console.log(cr.map(r=>`${r.s}-${r.e}`).join(' ').slice(0,1200));
}
