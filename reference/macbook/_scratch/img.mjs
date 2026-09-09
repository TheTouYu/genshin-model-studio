import fs from 'node:fs'; import zlib from 'node:zlib'; import {createRequire} from 'node:module';
const req=createRequire('/home/h/genshin-model-studio/');
const jpeg=req('jpeg-js');
export function load(path){
  const b=fs.readFileSync(path);
  if(b.slice(0,8).toString('hex')==='89504e470d0a1a0a'){ const {decodePNG}=req('/home/h/genshin-model-studio/reference/macbook/_scratch/png.cjs'); }
  if(b.readUInt16BE(0)===0xFFD8){ const d=jpeg.decode(b,{useTArray:true}); return {w:d.width,h:d.height,ch:4,px:d.data}; }
  throw new Error('unsupported '+path);
}
