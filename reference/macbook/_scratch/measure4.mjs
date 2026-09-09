import fs from 'node:fs';

const IMG_DIR = '/home/h/genshin-model-studio/reference/macbook/img';
const OUT = '/home/h/genshin-model-studio/reference/macbook/_scratch/measure4.html';

const jobs = [
  { key: 'lid_top_14', file: 'official-mbp14-dimensions-1.jpg', scaleMm: 312.6 },
  { key: 'lid_top_16', file: 'official-mbp16-dimensions-1.jpg', scaleMm: 355.7 },
  { key: 'lid_black_14', file: 'official-mbp14-color-spaceblack.jpg', scaleMm: 312.6, cropTop: 0.75 },
];
const images = {};
for (const j of jobs) images[j.key] = fs.readFileSync(`${IMG_DIR}/${j.file}`).toString('base64');

const html = `<!doctype html><meta charset="utf-8"><title>measure4</title>
<style>body{margin:0;background:#111;color:#0f0;font:12px monospace;white-space:pre-wrap}canvas{display:none}</style>
<pre id="out">running…</pre>
<script>
const JOBS=${JSON.stringify(jobs)}, IMGS=${JSON.stringify(images)};
const lum=(r,g,b)=>0.2126*r+0.7152*g+0.0722*b;
const load=s=>new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.src='data:image/jpeg;base64,'+s;});
function getData(im,cv){const w=im.naturalWidth,h=im.naturalHeight;cv.width=w;cv.height=h;
  const cx=cv.getContext('2d');cx.drawImage(im,0,0);return {w,h,d:cx.getImageData(0,0,w,h).data};}
const px=(d,w,x,y)=>{const i=(y*w+x)*4;return [d[i],d[i+1],d[i+2]];};

function circleFit(pts){ // 代数最小二乘：x²+y² + Dx + Ey + F = 0
  let S=0,Sx=0,Sy=0,Sxx=0,Syy=0,Sxy=0,Sxz=0,Syz=0,Sz=0;
  for(const [x,y] of pts){const z=x*x+y*y;S++;Sx+=x;Sy+=y;Sxx+=x*x;Syy+=y*y;Sxy+=x*y;Sxz+=x*z;Syz+=y*z;Sz+=z;}
  const A=[[Sxx,Sxy,Sx],[Sxy,Syy,Sy],[Sx,Sy,S]];
  const b=[-Sxz,-Syz,-Sz];
  // 3x3 高斯消元
  for(let i=0;i<3;i++){
    let p=i;for(let k=i+1;k<3;k++)if(Math.abs(A[k][i])>Math.abs(A[p][i]))p=k;
    [A[i],A[p]]=[A[p],A[i]];[b[i],b[p]]=[b[p],b[i]];
    for(let k=i+1;k<3;k++){const f=A[k][i]/A[i][i];for(let j=i;j<3;j++)A[k][j]-=f*A[i][j];b[k]-=f*b[i];}
  }
  const sol=[0,0,0];
  for(let i=2;i>=0;i--){let s=b[i];for(let j=i+1;j<3;j++)s-=A[i][j]*sol[j];sol[i]=s/A[i][i];}
  const [D,E,F]=sol;const cx=-D/2,cy=-E/2;const r=Math.sqrt(cx*cx+cy*cy-F);
  return {cx,cy,r};
}

function lidRoutine(im,cv,scaleMm,cropTop){
  const {w,h,d}=getData(im,cv);
  const yStart = cropTop? Math.round(h*(1-cropTop)) : 4;
  // 背景：左上角 + 右上角取样
  const bgPts=[[6,yStart+6],[w-7,yStart+6],[6,h-7],[w-7,h-7]].map(([x,y])=>px(d,w,x,y));
  const bg=[0,1,2].map(i=>bgPts.map(c=>c[i]).sort((a,b)=>a-b)[2]);
  const bgLum=lum(...bg);
  const isFg=(r,g,b)=>{
    const dl=Math.abs(lum(r,g,b)-bgLum);
    const dr=Math.abs(r-bg[0])+Math.abs(g-bg[1])+Math.abs(b-bg[2]);
    return dr>36 || dl>18;
  };
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
  for(let y=yStart;y<h-4;y++)for(let x=4;x<w-4;x++){
    const [r,g,b]=px(d,w,x,y);
    if(isFg(r,g,b)){if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}
  }
  const mmPerPx=scaleMm/(maxx-minx), mm=v=>+(v*mmPerPx).toFixed(2);
  // 四角圆弧点集（各取 50 行/列的最外前景）
  function cornerPts(corner){
    const pts=[],N=Math.min(60,Math.round((maxx-minx)*0.12));
    for(let i=0;i<N;i++){
      if(corner==='TL'||corner==='TR'){const y=miny+i;let x0=-1;
        if(corner==='TL'){for(let x=minx;x<maxx;x++){const [r,g,b]=px(d,w,x,y);if(isFg(r,g,b)){x0=x;break;}}}
        else{for(let x=maxx;x>minx;x--){const [r,g,b]=px(d,w,x,y);if(isFg(r,g,b)){x0=x;break;}}}
        if(x0>=0)pts.push([x0,y]);
      } else {const y=maxy-i;let x0=-1;
        if(corner==='BL'){for(let x=minx;x<maxx;x++){const [r,g,b]=px(d,w,x,y);if(isFg(r,g,b)){x0=x;break;}}}
        else{for(let x=maxx;x>minx;x--){const [r,g,b]=px(d,w,x,y);if(isFg(r,g,b)){x0=x;break;}}}
        if(x0>=0)pts.push([x0,y]);
      }
    }
    return pts;
  }
  const radii={};
  for(const c of ['TL','TR','BL','BR']){
    const pts=cornerPts(c);
    if(pts.length>12){const f=circleFit(pts);radii[c]=+(f.r*mmPerPx).toFixed(2);}
  }
  // logo：真黑（亮度 < 45）且不贴边
  let lx0=1e9,lx1=-1,ly0=1e9,ly1=-1,cnt=0;
  const mx=Math.round((maxx-minx)*0.06),my=Math.round((maxy-miny)*0.06);
  for(let y=miny+my;y<=maxy-my;y++)for(let x=minx+mx;x<=maxx-mx;x++){
    const [r,g,b]=px(d,w,x,y);
    if(lum(r,g,b)<45){cnt++;if(x<lx0)lx0=x;if(x>lx1)lx1=x;if(y<ly0)ly0=y;if(y>ly1)ly1=y;}
  }
  const lidW=maxx-minx,lidH=maxy-miny;
  return {key:im.__k||'lid',img:[w,h],bg,bbox:[minx,miny,maxx,maxy],mmPerPx:+mmPerPx.toFixed(5),
    lidWmm:mm(lidW),lidHmm:mm(lidH),aspect:+(lidW/lidH).toFixed(4),
    cornerRadiiMm:radii,
    logoPx:cnt,logoWmm:cnt?mm(lx1-lx0):0,logoHmm:cnt?mm(ly1-ly0):0,
    logoCenterXmm:cnt?mm((lx0+lx1)/2-minx):0,logoCenterYmm:cnt?mm((ly0+ly1)/2-miny):0,
    lidCenterXmm:mm(lidW/2),lidCenterYmm:mm(lidH/2)};
}

(async()=>{
  const out=[];
  for(const j of JOBS){
    const im=await load(IMGS[j.key]); im.__k=j.key;
    const cv=document.createElement('canvas');
    try{out.push(lidRoutine(im,cv,j.scaleMm,j.cropTop));}catch(e){out.push({key:j.key,error:String(e)});}
  }
  document.getElementById('out').textContent=JSON.stringify(out,null,1);
})();
</script>`;
fs.writeFileSync(OUT, html);
console.log('wrote', OUT);
