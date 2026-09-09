import { load } from './load.mjs';
const { w, h, ch, px } = load(process.argv[2]);
const lum = (x,y) => { const i=(y*w+x)*ch; return Math.round(0.299*px[i]+0.587*px[i+1]+0.114*px[i+2]); };
const row=(y,x0,x1)=>{ let s=`y=${y} `; for(let x=x0;x<=x1;x++) s+=`${x}:${lum(x,y)} `; console.log(s); };
const col=(x,y0,y1)=>{ let s=`x=${x} `; for(let y=y0;y<=y1;y++) s+=`${y}:${lum(x,y)} `; console.log(s); };
console.log('== 左边缘 (活动区 minx=158) =='); row(300,148,168);
console.log('== 右边缘 (活动区 maxx=820) =='); row(300,810,830);
console.log('== 上边缘 (活动区 miny=94, 取 x=250 避开摄像头) =='); col(250,80,100);
console.log('== 下边缘 (活动区 maxy=508, 取 x=250 避开文字) =='); col(250,498,518);
