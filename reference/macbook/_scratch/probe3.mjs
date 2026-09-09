import { load } from './load.mjs';
const { w, h, ch, px } = load(process.argv[2]);
const rgb = (x,y) => { const i=(y*w+x)*ch; return `${px[i]},${px[i+1]},${px[i+2]}`; };
for (const x of [200, 300, 700, 780]) {
  let s = `x=${x} `;
  for (let y = 470; y <= 524; y++) s += `${y}[${rgb(x,y)}] `;
  console.log(s); console.log('');
}
