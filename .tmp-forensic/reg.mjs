import fs from 'node:fs'; import zlib from 'node:zlib';
const src = fs.readFileSync(process.argv[2]);
let off=8,w=0,h=0,bd=8,ct=6; const idat=[];
while(off<src.length){const len=src.readUInt32BE(off);const t=src.toString('ascii',off+4,off+8);const d=src.subarray(off+8,off+8+len);
 if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);bd=d[8];ct=d[9];} else if(t==='IDAT') idat.push(d); else if(t==='IEND') break; off+=12+len;}
const ch={0:1,2:3,3:1,4:2,6:4}[ct], bpp=(bd/8)*ch;
const raw=zlib.inflateSync(Buffer.concat(idat)); const stride=w*bpp; const out=Buffer.alloc(h*stride); let pos=0;
for(let y=0;y<h;y++){const ft=raw[pos++];const line=raw.subarray(pos,pos+stride);pos+=stride;
 const cur=out.subarray(y*stride,(y+1)*stride), prev=y>0?out.subarray((y-1)*stride,y*stride):null;
 for(let x=0;x<stride;x++){const a=x>=bpp?cur[x-bpp]:0,b=prev?prev[x]:0,c=prev&&x>=bpp?prev[x-bpp]:0;let v=line[x];
  if(ft===1)v=(v+a)&255;else if(ft===2)v=(v+b)&255;else if(ft===3)v=(v+((a+b)>>1))&255;
  else if(ft===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);const pr=pa<=pb&&pa<=pc?a:(pb<=pc?b:c);v=(v+pr)&255;}
  cur[x]=v;}}
const rgb=Buffer.alloc(w*h*3);
for(let i=0;i<w*h;i++){const s=i*bpp,d=i*3; if(ch<=2){const g=out[s];rgb[d]=g;rgb[d+1]=g;rgb[d+2]=g;} else {rgb[d]=out[s];rgb[d+1]=out[s+1];rgb[d+2]=out[s+2];}}
const [x0,y0,x1,y1] = process.argv.slice(3).map(Number);
let n=0,sr=0,sg=0,sb=0,sd=0,pure=0; const vals=[];
for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*w+x)*3;sr+=rgb[i];sg+=rgb[i+1];sb+=rgb[i+2];n++; if(rgb[i]===0&&rgb[i+1]===0&&rgb[i+2]===0)pure++;}
const mr=sr/n,mg=sg/n,mb=sb/n;
for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*w+x)*3;sd+=Math.abs(rgb[i]-mr)+Math.abs(rgb[i+1]-mg)+Math.abs(rgb[i+2]-mb);}
console.log(JSON.stringify({rect:[x0,y0,x1,y1],mean:[+mr.toFixed(2),+mg.toFixed(2),+mb.toFixed(2)],meanAbsDev:+(sd/n/3).toFixed(3),pureBlackPct:+(100*pure/n).toFixed(1),n}));
