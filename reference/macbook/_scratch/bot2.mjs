import {load} from './load.mjs';
const {w,h,ch,px}=load(process.argv[2]);
const at=(x,y)=>{const i=(y*w+x)*ch;return [px[i],px[i+1],px[i+2]];};
const cls=(x,y)=>{const [r,g,b]=at(x,y);const M=Math.max(r,g,b),N=Math.min(r,g,b);const sat=M===0?0:(M-N)/M;
  if(b>r+30&&b>g+10&&sat>0.25)return 'B'; if(M>244&&sat<0.05)return '.'; if(M<110)return '#'; return 'o';};
console.log('==',process.argv[2],w,h);
let bb=[1e9,1e9,-1,-1];
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=cls(x,y); if(c==='o'||c==='#'){if(x<bb[0])bb[0]=x;if(y<bb[1])bb[1]=y;if(x>bb[2])bb[2]=x;if(y>bb[3])bb[3]=y;}}
console.log('bbox',bb,'w',bb[2]-bb[0]+1,'h',bb[3]-bb[1]+1,'aspect',((bb[2]-bb[0]+1)/(bb[3]-bb[1]+1)).toFixed(4));
const GX=Math.max(8,Math.round(w/60)); let out=[];
for(let y=0;y<h;y+=GX){ let s=''; for(let x=0;x<w;x+=GX){ let d=0,n=0; for(let yy=y;yy<Math.min(y+GX,h);yy++)for(let xx=x;xx<Math.min(x+GX,w);xx++){n++; if(cls(xx,yy)==='#')d++;}
  const f=d/n; s+= f>0.6?'#':f>0.25?'+':f>0.05?'.':' '; } out.push(String(y).padStart(4)+' '+s); }
console.log(out.join('\n'));
