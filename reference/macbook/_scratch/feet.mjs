import {load} from './load.mjs';
const {w,h,ch,px}=load(process.argv[2]);
const at=(x,y)=>{const i=(y*w+x)*ch;return [px[i],px[i+1],px[i+2]];};
const dark=(x,y)=>{const [r,g,b]=at(x,y);return Math.max(r,g,b)<120;};
const seen=new Uint8Array(w*h); const comps=[];
for(let y=0;y<h;y++)for(let x=0;x<w;x++){ const id=y*w+x;
  if(seen[id]||!dark(x,y))continue;
  const st=[id]; seen[id]=1; let n=0,bb=[x,y,x,y];
  while(st.length){ const c=st.pop(); const cx=c%w, cy=(c-cx)/w; n++;
    if(cx<bb[0])bb[0]=cx; if(cy<bb[1])bb[1]=cy; if(cx>bb[2])bb[2]=cx; if(cy>bb[3])bb[3]=cy;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=cx+dx, ny=cy+dy;
      if(nx<0||ny<0||nx>=w||ny>=h)continue; const ni=ny*w+nx; if(seen[ni]||!dark(nx,ny))continue; seen[ni]=1; st.push(ni); } }
  if(n>150) comps.push({n,bb,cx:((bb[0]+bb[2])/2).toFixed(1),cy:((bb[1]+bb[3])/2).toFixed(1),w:bb[2]-bb[0]+1,h:bb[3]-bb[1]+1});
}
comps.sort((a,b)=>b.n-a.n);
const MMX=304.1/802, MMY=212.4/561, X0=42, Y0=23;
console.log('dark components (>150px), sorted by area:');
for(const c of comps.slice(0,14)) console.log(`  area=${c.n} bbox=${c.w}x${c.h} center=(${c.cx},${c.cy}) -> mm center=(${((c.cx-X0)*MMX).toFixed(1)},${((c.cy-Y0)*MMY).toFixed(1)}) size=${(c.w*MMX).toFixed(1)}x${(c.h*MMY).toFixed(1)}mm  eqdia=${(2*Math.sqrt(c.n/Math.PI)*MMX).toFixed(1)}mm`);
