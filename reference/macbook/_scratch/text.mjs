import { load } from './load.mjs';
const { w, h, ch, px } = load(process.argv[2]);
let minx=1e9,maxx=-1,miny=1e9,maxy=-1,n=0;
for(let y=430;y<560;y++)for(let x=200;x<800;x++){
  const i=(y*w+x)*ch, r=px[i],g=px[i+1],b=px[i+2];
  const lum=0.299*r+0.587*g+0.114*b, sat=Math.max(r,g,b)-Math.min(r,g,b);
  if(lum>110 && sat<35){ n++; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; }
}
console.log(`亮灰像素(文字候选) n=${n} bbox x[${minx},${maxx}] y[${miny},${maxy}]`);
// 每行计数，定位文字行
for(let y=miny;y<=maxy;y++){ let c=0; for(let x=minx;x<=maxx;x++){ const i=(y*w+x)*ch,r=px[i],g=px[i+1],b=px[i+2]; const lum=0.299*r+0.587*g+0.114*b,sat=Math.max(r,g,b)-Math.min(r,g,b); if(lum>110&&sat<35)c++; } if(c>0) console.log(`y=${y} 计数=${c}`); }
