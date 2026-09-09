import fs from 'node:fs'; import {createRequire} from 'node:module'; import {decodePNG} from './png.mjs';
const req=createRequire('/home/h/genshin-model-studio/'); const jpeg=req('jpeg-js');
export function load(p){ const b=fs.readFileSync(p);
  if(b.readUInt16BE(0)===0xFFD8){ const d=jpeg.decode(b,{useTArray:true}); return {w:d.width,h:d.height,ch:4,px:d.data}; }
  return decodePNG(p); }
