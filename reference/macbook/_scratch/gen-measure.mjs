import fs from 'node:fs';
const img = process.argv[2], out = process.argv[3];
const buf = fs.readFileSync(img);
const magic = buf.subarray(0,4).toString('hex');
const isPng = magic === '89504e47';
const isJpg = buf[0]===0xff && buf[1]===0xd8;
let w=0,h=0;
if (isPng){ w=buf.readUInt32BE(16); h=buf.readUInt32BE(20); }
console.log('magic', magic, 'png?', isPng, 'jpeg?', isJpg, 'size', w+'x'+h, 'bytes', buf.length);
const b64 = buf.toString('base64');
const mime = isPng ? 'image/png' : (isJpg ? 'image/jpeg' : 'application/octet-stream');
const html = `<!doctype html><meta charset="utf-8"><title>measure</title>
<style>body{margin:0;background:#111;color:#0f0;font:12px monospace}#wrap{position:relative;display:inline-block}
#cv{display:block}#ov{position:absolute;left:0;top:0}</style>
<div id="wrap"><canvas id="cv"></canvas><canvas id="ov"></canvas></div><pre id="out"></pre>
<script>
const src='data:${mime};base64,${b64}';
const im=new Image();
im.onload=()=>{
  const cv=document.getElementById('cv'), ov=document.getElementById('ov');
  cv.width=im.naturalWidth; cv.height=im.naturalHeight;
  ov.width=im.naturalWidth; ov.height=im.naturalHeight;
  const cx=cv.getContext('2d'); cx.drawImage(im,0,0);
  const d=cx.getImageData(0,0,cv.width,cv.height).data;
  // background detection: near-white & low saturation
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
  for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){
    const i=(y*cv.width+x)*4, r=d[i],g=d[i+1],b=d[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    const sat=mx===0?0:(mx-mn)/mx;
    if(!(mx>240 && sat<0.08)){ if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; }
  }
  const W=im.naturalWidth, H=im.naturalHeight;
  const o=ov.getContext('2d');
  o.lineWidth=1; o.font='11px monospace';
  for(let x=0;x<W;x+=50){ o.strokeStyle=(x%200===0)?'rgba(255,0,0,.9)':'rgba(0,255,255,.45)';
    o.beginPath();o.moveTo(x+0.5,0);o.lineTo(x+0.5,H);o.stroke();
    if(x%100===0){o.fillStyle='#ff0';o.fillText(x,x+2,12);} }
  for(let y=0;y<H;y+=50){ o.strokeStyle=(y%200===0)?'rgba(255,0,0,.9)':'rgba(0,255,255,.45)';
    o.beginPath();o.moveTo(0,y+0.5);o.lineTo(W,y+0.5);o.stroke();
    if(y%100===0){o.fillStyle='#ff0';o.fillText(y,2,y+12);} }
  o.strokeStyle='#0f0'; o.lineWidth=3; o.strokeRect(minx+0.5,miny+0.5,maxx-minx,maxy-miny);
  const scale = 304.1/(maxx-minx); // mm per px if chassis width == 304.1mm
  document.getElementById('out').textContent =
    JSON.stringify({natural:[W,H],bbox:[minx,miny,maxx,maxy],bboxW:maxx-minx,bboxH:maxy-miny,
      mmPerPx_if_width304_1:+scale.toFixed(5),
      chassisHeight_mm_if_width304_1:+((maxy-miny)*scale).toFixed(2),
      gridPx:50,gridMm:+(50*scale).toFixed(2)},null,1);
};
im.src=src;
</script>`;
fs.writeFileSync(out, html);
console.log('wrote', out, 'html bytes', html.length);
