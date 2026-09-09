import {decodePNG} from './png.mjs';
const f=process.argv[2]; const {w,h,ch,px}=decodePNG(f);
const at=(x,y)=>{const i=(y*w+x)*ch;return [px[i],px[i+1],px[i+2]];};
const cls=(x,y)=>{const [r,g,b]=at(x,y);const M=Math.max(r,g,b),N=Math.min(r,g,b);const sat=M===0?0:(M-N)/M;
  if(b>r+30&&b>g+10&&sat>0.25)return 'B';
  if(M>242&&sat<0.06)return '.'; if(M<110)return 'D'; return 'o';};
console.log('==',f,w,h,'ch',ch);
// leftmost/rightmost object (not bg, not blue) per row
const L=[],R=[];
for(let y=0;y<h;y++){ let l=-1,r=-1;
  for(let x=0;x<w;x++){const c=cls(x,y); if(c==='o'||c==='D'){l=x;break;}}
  for(let x=w-1;x>=0;x--){const c=cls(x,y); if(c==='o'||c==='D'){r=x;break;}}
  L.push(l);R.push(r); }
console.log('row: y -> leftmost,rightmost (every 8px)');
for(let y=0;y<h;y+=8) if(L[y]>=0) console.log(`  y=${y} L=${L[y]} R=${R[y]} width=${R[y]-L[y]}`);
// corner arc: top-left. for y in first 80, print L
console.log('top-left arc (y: L)'); let s=''; for(let y=0;y<80;y++) s+=`${y}:${L[y]} `; console.log(s);
console.log('bottom-left arc (y from h-80: L)'); s=''; for(let y=h-80;y<h;y++) s+=`${y}:${L[y]} `; console.log(s);
