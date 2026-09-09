import {decodePNG} from './png.mjs';
const [f,x0,x1,y0,y1,step]=[process.argv[2],+process.argv[3],+process.argv[4],+process.argv[5],+process.argv[6],+(process.argv[7]||2)];
const {w,h,ch,px}=decodePNG(f);
const at=(x,y)=>{const i=(y*w+x)*ch;return [px[i],px[i+1],px[i+2]];};
const cls=(x,y)=>{const [r,g,b]=at(x,y);const M=Math.max(r,g,b),N=Math.min(r,g,b);const sat=M===0?0:(M-N)/M;
  if(b>r+30&&b>g+10&&sat>0.25)return 'B';
  if(M>242&&sat<0.06)return '.'; if(M<110)return '#'; if(M<180)return '+'; return 'o';};
let hdr='     '; for(let x=x0;x<x1;x+=step) hdr+= (Math.floor(x/step)%10===0?'|':(Math.floor(x/step)%10));
console.log(hdr);
for(let y=y0;y<y1;y+=step){ let s=String(y).padStart(4)+' ';
  for(let x=x0;x<x1;x+=step) s+=cls(x,y); console.log(s); }
