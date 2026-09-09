import fs from 'node:fs';

const IMG_DIR = '/home/h/genshin-model-studio/reference/macbook/img';
const OUT = '/home/h/genshin-model-studio/reference/macbook/_scratch/measure2.html';

// 每个 job：从官方图量出真实几何（用已知真值做标尺）
const jobs = [
  // 闭合上盖俯视：圆角半径 + logo 位置/尺寸（标尺 = 机身宽 312.6mm）
  { key: 'lid_top', file: 'official-mbp14-dimensions-1.jpg', mode: 'lid', scaleMm: 312.6 },
  // 正面开盖：屏幕活动区 bbox + 刘海（标尺 = 活动区宽 302.4mm）
  { key: 'front_open', file: 'official-mbp14-hero.jpg', mode: 'screen', scaleMm: 302.4 },
  // 左右侧：机身厚度做标尺（闭合总高 15.5mm）→ 接口尺寸/间距/散热槽
  { key: 'side_left', file: 'official-mbp14-ports-1.jpg', mode: 'ports', scaleMm: 15.5 },
  { key: 'side_right', file: 'official-mbp14-ports-2.jpg', mode: 'ports', scaleMm: 15.5 },
];

const images = {};
for (const j of jobs) images[j.key] = fs.readFileSync(`${IMG_DIR}/${j.file}`).toString('base64');

const html = `<!doctype html><meta charset="utf-8"><title>measure2</title>
<style>body{margin:0;background:#111;color:#0f0;font:12px monospace;white-space:pre-wrap}canvas{display:none}</style>
<pre id="out">running…</pre>
<script>
const JOBS = ${JSON.stringify(jobs)};
const IMGS = ${JSON.stringify(images)};
const lum = (r,g,b) => 0.2126*r + 0.7152*g + 0.0722*b;

function load(src){return new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.src='data:image/jpeg;base64,'+src;});}

function px(d,w,x,y){const i=(y*w+x)*4;return [d[i],d[i+1],d[i+2]];}

// —— 俯视图：前景 bbox、圆角半径、logo bbox ——
function lidRoutine(im, cv, scaleMm){
  const w=im.naturalWidth,h=im.naturalHeight;
  cv.width=w;cv.height=h;const cx=cv.getContext('2d');cx.drawImage(im,0,0);
  const d=cx.getImageData(0,0,w,h).data;
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const [r,g,b]=px(d,w,x,y);
    const bg = r>246&&g>246&&b>246;
    if(!bg){if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}
  }
  const mmPerPx = scaleMm/(maxx-minx);
  // 圆角：左上角逐行找最左前景 x，dx 归零处即半径
  const xmin=[];for(let y=miny;y<=miny+Math.min(300,maxy-miny);y++){
    let x0=-1;for(let x=minx;x<maxx;x++){const [r,g,b]=px(d,w,x,y);if(!(r>246&&g>246&&b>246)){x0=x;break;}}
    xmin.push(x0);
  }
  let radiusPx=0;for(let i=0;i<xmin.length;i++){if(xmin[i]>=0&&xmin[i]<=minx+1){radiusPx=i;break;}}
  // logo：机身内部暗像素 bbox
  let lx0=1e9,lx1=-1,ly0=1e9,ly1=-1;
  for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){
    const [r,g,b]=px(d,w,x,y);
    if(lum(r,g,b)<110){if(x<lx0)lx0=x;if(x>lx1)lx1=x;if(y<ly0)ly0=y;if(y>ly1)ly1=y;}
  }
  const mm=(v)=>+(v*mmPerPx).toFixed(2);
  return {key:'lid_top',img:[w,h],bbox:[minx,miny,maxx,maxy],mmPerPx:+mmPerPx.toFixed(5),
    lidWmm:mm(maxx-minx),lidHmm:mm(maxy-miny),aspect:+((maxx-minx)/(maxy-miny)).toFixed(4),
    cornerRadiusPx:radiusPx,cornerRadiusMm:mm(radiusPx),
    logoBbox:[lx0,ly0,lx1,ly1],logoWmm:mm(lx1-lx0),logoHmm:mm(ly1-ly0),
    logoCenterXmm:mm(((lx0+lx1)/2)-minx),logoCenterYmm:mm(((ly0+ly1)/2)-miny),
    lidCenterXmm:mm((maxx-minx)/2),lidCenterYmm:mm((maxy-miny)/2)};
}

// —— 正面开盖：活动区 bbox + 刘海 bbox ——
function screenRoutine(im, cv, scaleMm){
  const w=im.naturalWidth,h=im.naturalHeight;
  cv.width=w;cv.height=h;const cx=cv.getContext('2d');cx.drawImage(im,0,0);
  const d=cx.getImageData(0,0,w,h).data;
  // 活动区 = 亮于阈值的连通大块（背景近纯黑）
  const T=42;let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const [r,g,b]=px(d,w,x,y);
    if(lum(r,g,b)>T){if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}
  }
  const mmPerPx = scaleMm/(maxx-minx);
  const mm=(v)=>+(v*mmPerPx).toFixed(2);
  // 刘海：活动区顶部中央的暗块（在 miny..miny+0.08*h 内，居中 ±25% 宽）
  let nx0=1e9,nx1=-1,ny0=1e9,ny1=-1;
  const yTop=miny, yBot=miny+Math.max(3,Math.round((maxy-miny)*0.10));
  const cx0=minx+Math.round((maxx-minx)*0.30), cx1=minx+Math.round((maxx-minx)*0.70);
  for(let y=yTop;y<=yBot;y++)for(let x=cx0;x<=cx1;x++){
    const [r,g,b]=px(d,w,x,y);
    if(lum(r,g,b)<T){if(x<nx0)nx0=x;if(x>nx1)nx1=x;if(y<ny0)ny0=y;if(y>ny1)ny1=y;}
  }
  return {key:'front_open',img:[w,h],activeBbox:[minx,miny,maxx,maxy],mmPerPx:+mmPerPx.toFixed(5),
    activeWmm:mm(maxx-minx),activeHmm:mm(maxy-miny),activeAspect:+((maxx-minx)/(maxy-miny)).toFixed(4),
    notchBbox:[nx0,ny0,nx1,ny1],notchWmm:mm(nx1-nx0),notchHmm:mm(ny1-ny0),
    notchCenterOffsetMm:mm(((nx0+nx1)/2)-(minx+maxx)/2)};
}

// —— 侧视：机身带 + 暗色接口块 ——
function portsRoutine(im, cv, scaleMm){
  const w=im.naturalWidth,h=im.naturalHeight;
  cv.width=w;cv.height=h;const cx=cv.getContext('2d');cx.drawImage(im,0,0);
  const d=cx.getImageData(0,0,w,h).data;
  // 机身带：逐行统计“铝色”像素（亮度 90..250）
  const rowScore=[];
  for(let y=0;y<h;y++){let c=0;for(let x=0;x<w;x++){const [r,g,b]=px(d,w,x,y);const L=lum(r,g,b);if(L>90&&L<250)c++;}rowScore.push(c);}
  const maxRow=Math.max(...rowScore);
  let top=-1,bot=-1;
  for(let y=0;y<h;y++){if(rowScore[y]>maxRow*0.5){if(top<0)top=y;bot=y;}}
  const bodyH=bot-top+1, mmPerPx = scaleMm/bodyH;
  const mm=(v)=>+(v*mmPerPx).toFixed(2);
  // 暗块：列级统计（机身带内亮度<90 的比例）
  const colDark=[];
  for(let x=0;x<w;x++){let c=0;for(let y=top;y<=bot;y++){const [r,g,b]=px(d,w,x,y);if(lum(r,g,b)<90)c++;}colDark.push(c/bodyH);}
  const blobs=[];let start=-1;
  for(let x=0;x<w;x++){
    const on = colDark[x]>0.18;
    if(on&&start<0)start=x;
    if((!on||x===w-1)&&start>=0){const e=on?x:x-1;
      if(e-start>=3){
        // 该 blob 的 y 范围
        let y0=1e9,y1=-1;
        for(let yy=top;yy<=bot;yy++)for(let xx=start;xx<=e;xx++){const [r,g,b]=px(d,w,xx,yy);if(lum(r,g,b)<90){if(yy<y0)y0=yy;if(yy>y1)y1=yy;}}
        blobs.push({x0:start,x1:e,pxW:e-start+1,pxH:y1-y0+1,mmW:mm(e-start+1),mmH:mm(y1-y0+1),
          centerMmFromLeft:mm(((start+e)/2)),topOffsetMmFromBodyTop:mm(y0-top)});
      }
      start=-1;
    }
  }
  return {key:'side',img:[w,h],bodyTop:top,bodyBottom:bot,bodyHpx:bodyH,mmPerPx:+mmPerPx.toFixed(5),
    bodyHmm:mm(bodyH),blobs};
}

(async()=>{
  const out=[];
  for(const j of JOBS){
    const im=await load(IMGS[j.key]);
    const cv=document.createElement('canvas');
    try{
      const r = j.mode==='lid'?lidRoutine(im,cv,j.scaleMm)
              : j.mode==='screen'?screenRoutine(im,cv,j.scaleMm)
              : portsRoutine(im,cv,j.scaleMm);
      out.push(r);
    }catch(e){out.push({key:j.key,error:String(e)});}
  }
  document.getElementById('out').textContent = JSON.stringify(out,null,1);
})();
</script>`;

fs.writeFileSync(OUT, html);
console.log('wrote', OUT, html.length, 'bytes');
