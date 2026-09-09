import {decodePNG} from './png.mjs';
const {w,h,ch,px}=decodePNG(process.argv[2]);
const at=(x,y)=>{const i=(y*w+x)*ch;return [px[i],px[i+1],px[i+2]];};
console.log('dims',w,h);
// classes: white bg (all>248), colorful screen (sat>0.25 & max>120), dark bezel/key (max<100), gray body
let b={all:[1e9,1e9,-1,-1],col:[1e9,1e9,-1,-1],dark:[1e9,1e9,-1,-1]};
const upd=(o,x,y)=>{if(x<o[0])o[0]=x;if(y<o[1])o[1]=y;if(x>o[2])o[2]=x;if(y>o[3])o[3]=y;};
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const [r,g,b2]=at(x,y);const M=Math.max(r,g,b2),N=Math.min(r,g,b2);const sat=M===0?0:(M-N)/M;
  if(!(M>248&&sat<0.03)) upd(b.all,x,y);
  if(sat>0.25&&M>120) upd(b.col,x,y);
  if(M<100) upd(b.dark,x,y);}
for(const k in b) console.log(k, b[k], 'w='+(b[k][2]-b[k][0]+1), 'h='+(b[k][3]-b[k][1]+1));
// scanlines: for each row, first/last colorful px and first/last dark px
console.log('row: y | colorful[x0,x1] | dark[x0,x1] | all[x0,x1]');
for(let y=20;y<h-10;y+=10){
  const f=(pred)=>{let a=-1,z=-1;for(let x=0;x<w;x++){const [r,g,b2]=at(x,y);const M=Math.max(r,g,b2),N=Math.min(r,g,b2);const sat=M===0?0:(M-N)/M;
    if(pred(M,sat)){if(a<0)a=x;z=x;}}return [a,z];};
  const c=f((M,sat)=>sat>0.25&&M>120), d=f((M)=>M<100), a=f((M,sat)=>!(M>248&&sat<0.03));
  console.log(`y=${y} C[${c}] D[${d}] A[${a}]`);}
