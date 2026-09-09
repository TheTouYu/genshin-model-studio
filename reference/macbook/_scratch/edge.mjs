import {decodePNG} from './png.mjs';
const {w,h,ch,px}=decodePNG(process.argv[2]);
const at=(x,y)=>{const i=(y*w+x)*ch;return [px[i],px[i+1],px[i+2]];};
for(const y of [600,700,500]){
  let s=''; for(let x=24;x<40;x++) s+=`${x}:[${at(x,y)}] `; console.log('row',y,'LEFT',s);
  s=''; for(let x=1458;x<1472;x++) s+=`${x}:[${at(x,y)}] `; console.log('row',y,'RIGHT',s);
}
for(const x of [700,400]){
  let s=''; for(let y=18;y<32;y++) s+=`${y}:[${at(x,y)}] `; console.log('col',x,'TOP',s);
  s=''; for(let y=1030;y<1044;y++) s+=`${y}:[${at(x,y)}] `; console.log('col',x,'BOTTOM',s);
}
