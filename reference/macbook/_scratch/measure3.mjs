import fs from 'node:fs';

const IMG_DIR = '/home/h/genshin-model-studio/reference/macbook/img';
const OUT = '/home/h/genshin-model-studio/reference/macbook/_scratch/measure3.html';

const jobs = [
  { key: 'lid_top', file: 'official-mbp14-dimensions-1.jpg', mode: 'lid', scaleMm: 312.6 },
  { key: 'side_left', file: 'official-mbp14-ports-1.jpg', mode: 'ports', scaleMm: 15.5 },
  { key: 'side_right', file: 'official-mbp14-ports-2.jpg', mode: 'ports', scaleMm: 15.5 },
  { key: 'screen_promo', file: 'official-mbp14-display-promotion.jpg', mode: 'screen' },
  { key: 'screen_mba', file: 'official-mba13-hero.jpg', mode: 'screen' },
];

const images = {};
for (const j of jobs) images[j.key] = fs.readFileSync(`${IMG_DIR}/${j.file}`).toString('base64');

const html = `<!doctype html><meta charset="utf-8"><title>measure3</title>
<style>body{margin:0;background:#111;color:#0f0;font:12px monospace;white-space:pre-wrap}canvas{display:none}</style>
<pre id="out">running…</pre>
<script>
const JOBS = ${JSON.stringify(jobs)};
const IMGS = ${JSON.stringify(images)};
const lum = (r,g,b) => 0.2126*r + 0.7152*g + 0.0722*b;
function load(src){return new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.src='data:image/jpeg;base64,'+src;});}
function getData(im,cv){const w=im.naturalWidth,h=im.naturalHeight;cv.width=w;cv.height=h;
  const cx=cv.getContext('2d');cx.drawImage(im,0,0);return {w,h,d:cx.getImageData(0,0,w,h).data};}
function px(d,w,x,y){const i=(y*w+x)*4;return [d[i],d[i+1],d[i+2]];}
function cornerBg(d,w,h){const pts=[[6,6],[w-7,6],[6,h-7],[w-7,h-7]];
  const cs=pts.map(([x,y])=>px(d,w,x,y));
  return [0,1,2].map(i=>cs.map(c=>c[i]).sort((a,b)=>a-b)[2]);}
const B=4; // 忽略边缘像素

// —— 俯视上盖：圆角半径 + logo ——
function lidRoutine(im,cv,scaleMm){
  const {w,h,d}=getData(im,cv); const bg=cornerBg(d,w,h);
  const isBg=(r,g,b)=>Math.abs(r-bg[0])<22&&Math.abs(g-bg[1])<22&&Math.abs(b-bg[2])<22;
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
  for(let y=B;y<h-B;y++)for(let x=B;x<w-B;x++){
    const [r,g,b]=px(d,w,x,y);
    if(!isBg(r,g,b)){if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}
  }
  const mmPerPx=scaleMm/(maxx-minx), mm=v=>+(v*mmPerPx).toFixed(2);
  // 左上角：逐行最左前景
  const rows=[];for(let y=miny;y<=Math.min(maxy,miny+Math.round((maxy-miny)*0.5));y++){
    let x0=-1;for(let x=minx;x<maxx;x++){const [r,g,b]=px(d,w,x,y);if(!isBg(r,g,b)){x0=x;break;}}
    rows.push(x0);
  }
  let radiusPx=0;for(let i=0;i<rows.length;i++){if(rows[i]>=0&&rows[i]<=minx+1){radiusPx=i;break;}}
  // logo：上盖内部暗像素
  let lx0=1e9,lx1=-1,ly0=1e9,ly1=-1;
  const mx=Math.round((maxx-minx)*0.05), my=Math.round((maxy-miny)*0.05);
  for(let y=miny+my;y<=maxy-my;y++)for(let x=minx+mx;x<=maxx-mx;x++){
    const [r,g,b]=px(d,w,x,y);
    if(lum(r,g,b)<90){if(x<lx0)lx0=x;if(x>lx1)lx1=x;if(y<ly0)ly0=y;if(y>ly1)ly1=y;}
  }
  return {key:'lid_top',img:[w,h],bg,bbox:[minx,miny,maxx,maxy],mmPerPx:+mmPerPx.toFixed(5),
    lidWmm:mm(maxx-minx),lidHmm:mm(maxy-miny),aspect:+((maxx-minx)/(maxy-miny)).toFixed(4),
    cornerRadiusPx:radiusPx,cornerRadiusMm:mm(radiusPx),
    logoWmm:mm(lx1-lx0),logoHmm:mm(ly1-ly0),
    logoCenterXmm:mm((lx0+lx1)/2-minx),logoCenterYmm:mm((ly0+ly1)/2-miny),
    lidCenterXmm:mm((maxx-minx)/2),lidCenterYmm:mm((maxy-miny)/2)};
}

// —— 侧视：机身带 + 暗色开口（接口/散热槽）——
function portsRoutine(im,cv,scaleMm){
  const {w,h,d}=getData(im,cv);
  const rowScore=[];for(let y=0;y<h;y++){let c=0;for(let x=0;x<w;x++){const [r,g,b]=px(d,w,x,y);const L=lum(r,g,b);if(L>100&&L<248)c++;}rowScore.push(c);}
  const maxRow=Math.max(...rowScore);let top=-1,bot=-1;
  for(let y=0;y<h;y++){if(rowScore[y]>maxRow*0.55){if(top<0)top=y;bot=y;}}
  const bodyH=bot-top+1, mmPerPx=scaleMm/bodyH, mm=v=>+(v*mmPerPx).toFixed(2);
  // 暗像素：亮度 < 65（开口内腔），列级比例
  const colDark=[];for(let x=0;x<w;x++){let c=0;for(let y=top;y<=bot;y++){const [r,g,b]=px(d,w,x,y);if(lum(r,g,b)<65)c++;}colDark.push(c/bodyH);}
  const blobs=[];let start=-1;
  for(let x=0;x<=w;x++){
    const on = x<w && colDark[x]>0.10;
    if(on&&start<0)start=x;
    if((!on||x===w)&&start>=0){
      const e=x-1;
      if(e-start>=4){
        let y0=1e9,y1=-1,dark=0;
        for(let yy=top;yy<=bot;yy++)for(let xx=start;xx<=e;xx++){const [r,g,b]=px(d,w,xx,yy);if(lum(r,g,b)<65){dark++;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}}
        blobs.push({x0:start,x1:e,pxW:e-start+1,pxH:y1-y0+1,mmW:mm(e-start+1),mmH:mm(y1-y0+1),
          centerMmFromLeft:mm((start+e)/2),topFromBodyTopMm:mm(y0-top),fillRatio:+(dark/((e-start+1)*(y1-y0+1))).toFixed(2)});
      }
      start=-1;
    }
  }
  return {key:'side',img:[w,h],bodyTop:top,bodyBottom:bot,bodyHpx:bodyH,mmPerPx:+mmPerPx.toFixed(5),
    bodyHmm:mm(bodyH),blobs:blobs.filter(b=>b.mmW>=1.0&&b.mmW<=30)};
}

// —— 正面：屏幕活动区 + 刘海（暗run被同行亮像素夹住）——
function screenRoutine(im,cv){
  const {w,h,d}=getData(im,cv); const bg=cornerBg(d,w,h);
  const bgLum=lum(...bg);
  // 亮内容 = 显著亮于背景
  const isBright=(r,g,b)=>lum(r,g,b)>Math.max(55,bgLum+35);
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
  const rowW=[];
  for(let y=B;y<h-B;y++){let lo=-1,hi=-1;
    for(let x=B;x<w-B;x++){const [r,g,b]=px(d,w,x,y);if(isBright(r,g,b)){if(lo<0)lo=x;hi=x;}}
    rowW.push([lo,hi]);
    if(lo>=0){if(lo<minx)minx=lo;if(hi>maxx)maxx=hi;if(y<miny)miny=y;if(y>maxy)maxy=y;}
  }
  // 底座前缘：底部 30% 内整行亮且宽度接近满宽 → 排除
  let baseTop=-1;
  for(let y=h-B-1;y>h*0.55;y--){const [lo,hi]=rowW[y-B];
    if(lo>=0&&(hi-lo)>w*0.75){baseTop=y;}}
  const screenBot = baseTop>0 ? baseTop-1 : maxy;
  // 刘海：screen 顶部 12% 内，暗 run（亮度<bgLum+20）左右同行都是亮像素
  let nx0=1e9,nx1=-1,ny0=1e9,ny1=-1;
  const yTop=miny, yEnd=Math.min(screenBot, miny+Math.round((screenBot-miny)*0.12));
  for(let y=yTop;y<=yEnd;y++){
    let x=B,run=null;
    while(x<w-B){
      const [r,g,b]=px(d,w,x,y);const L=lum(r,g,b);
      if(L<bgLum+22&&x>minx+4&&x<maxx-4){
        let s=x;while(x<w-B){const [r2,g2,b2]=px(d,w,x,y);if(lum(r2,g2,b2)>=bgLum+22)break;x++;}
        const len=x-s;
        const [lr,lg,lb]=px(d,w,Math.max(0,s-3),y), [rr,rg,rb]=px(d,w,Math.min(w-1,x+2),y);
        if(len>=6&&len<=w*0.2&&isBright(lr,lg,lb)&&isBright(rr,rg,rb)){
          if(s<nx0)nx0=s;if(x-1>nx1)nx1=x-1;if(y<ny0)ny0=y;if(y>ny1)ny1=y;
        }
      } else x++;
    }
  }
  const mmPerPx = 302.4/(maxx-minx), mm=v=>+(v*mmPerPx).toFixed(2);
  return {key:'screen',img:[w,h],bg,activeBbox:[minx,miny,maxx,maxy],screenBotPx:screenBot,baseTopPx:baseTop,
    mmPerPx:+mmPerPx.toFixed(5),activeWmm:mm(maxx-minx),activeHmm:mm(screenBot-miny),
    activeAspect:+((maxx-minx)/(screenBot-miny)).toFixed(4),
    notchBbox:[nx0,ny0,nx1,ny1],notchWmm:mm(nx1-nx0),notchHmm:mm(ny1-ny0)};
}

(async()=>{
  const out=[];
  for(const j of JOBS){
    const im=await load(IMGS[j.key]);
    const cv=document.createElement('canvas');
    try{
      out.push(j.mode==='lid'?lidRoutine(im,cv,j.scaleMm)
        : j.mode==='ports'?portsRoutine(im,cv,j.scaleMm)
        : screenRoutine(im,cv));
    }catch(e){out.push({key:j.key,error:String(e)});}
  }
  document.getElementById('out').textContent=JSON.stringify(out,null,1);
})();
</script>`;

fs.writeFileSync(OUT, html);
console.log('wrote', OUT);
