import fs from 'node:fs'; import zlib from 'node:zlib';
export function decodePNG(path){
  const b=fs.readFileSync(path);
  if(b.readUInt32BE(0)!==0x89504e47) throw new Error('not png');
  let off=8, w=0,h=0,bd=0,ct=0,inter=0; const idat=[];
  while(off<b.length){
    const len=b.readUInt32BE(off), type=b.subarray(off+4,off+8).toString('ascii');
    const data=b.subarray(off+8,off+8+len);
    if(type==='IHDR'){ w=data.readUInt32BE(0); h=data.readUInt32BE(4); bd=data[8]; ct=data[9]; inter=data[12]; }
    else if(type==='IDAT') idat.push(data);
    else if(type==='IEND') break;
    off+=12+len;
  }
  if(bd!==8) throw new Error('bitdepth '+bd+' unsupported');
  if(inter!==0) throw new Error('interlaced unsupported');
  const ch = ct===2?3 : ct===6?4 : ct===0?1 : ct===4?2 : (()=>{throw new Error('colortype '+ct)})();
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const stride=w*ch; const out=Buffer.alloc(h*stride);
  let p=0;
  for(let y=0;y<h;y++){
    const ft=raw[p++]; const line=raw.subarray(p,p+stride); p+=stride;
    const cur=out.subarray(y*stride,(y+1)*stride); const prev=y>0?out.subarray((y-1)*stride,y*stride):null;
    for(let x=0;x<stride;x++){
      const a=x>=ch?cur[x-ch]:0, bb=prev?prev[x]:0, c=(prev&&x>=ch)?prev[x-ch]:0; let v=line[x];
      if(ft===1)v+=a; else if(ft===2)v+=bb; else if(ft===3)v+=(a+bb)>>1;
      else if(ft===4){ const pa=Math.abs(bb-c),pb=Math.abs(a-c),pc=Math.abs(a+bb-2*c);
        v+= (pa<=pb&&pa<=pc)?a : (pb<=pc?bb:c); }
      cur[x]=v&0xff;
    }
  }
  return {w,h,ch,px:out};
}
