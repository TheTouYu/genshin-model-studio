import {decodePNG} from './png.mjs';
const [f,x0,x1,y0,y1,st]=[process.argv[2],+process.argv[3],+process.argv[4],+process.argv[5],+process.argv[6],+process.argv[7]];
const {w,h,ch,px}=decodePNG(f);
const g=(x,y)=>{const i=(y*w+x)*ch;return Math.round(0.299*px[i]+0.587*px[i+1]+0.114*px[i+2]);};
let hdr='     '; for(let x=x0;x<x1;x+=st) hdr+= (Math.floor(x/100)%10);
console.log(hdr);
for(let y=y0;y<y1;y+=st){ let s=String(y).padStart(4)+' ';
  for(let x=x0;x<x1;x+=st){ let sum=0,n=0; for(let dy=0;dy<st;dy+=2)for(let dx=0;dx<st;dx+=2){const xx=x+dx,yy=y+dy; if(xx<w&&yy<h){sum+=g(xx,yy);n++;}}
    s+= n? Math.min(9,Math.floor(sum/n/26)) : ' '; }
  console.log(s); }
