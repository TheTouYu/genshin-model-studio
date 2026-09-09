import fs from 'node:fs';

const IMG_DIR = '/home/h/genshin-model-studio/reference/macbook/img';
const OUT = '/home/h/genshin-model-studio/reference/macbook/_scratch/measure5.html';

// 官方 dimensions_*.jpg：白卡片 + 黑圆角外框 + 银色上盖（俯视）
const jobs = [
  { key: 'lid14', file: 'official-mbp14-dimensions-1.jpg', scaleMm: 312.6 },
  { key: 'lid16', file: 'official-mbp16-dimensions-1.jpg', scaleMm: 355.7 },
];
const images = {};
for (const j of jobs) images[j.key] = fs.readFileSync(`${IMG_DIR}/${j.file}`).toString('base64');

const html = `<!doctype html><meta charset="utf-8"><title>measure5</title>
<style>body{margin:0;background:#111;color:#0f0;font:12px monospace;white-space:pre-wrap}canvas{display:none}</style>
<pre id="out">running…</pre>
<script>
const JOBS=${JSON.stringify(jobs)}, IMGS=${JSON.stringify(images)};
const lum=(r,g,b)=>0.2126*r+0.7152*g+0.0722*b;
const load=s=>new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.src='data:image/jpeg;base64,'+s;});
function getData(im,cv){const w=im.naturalWidth,h=im.naturalHeight;cv.width=w;cv.height=h;
  const cx=cv.getContext('2d');cx.drawImage(im,0,0);return {w,h,d:cx.getImageData(0,0,w,h).data};}
const px=(d,w,x,y)=>{const i=(y*w+x)*4;return [d[i],d[i+1],d[i+2]];};

function circleFit(pts){
  let S=0,Sx=0,Sy=0,Sxx=0,Syy=0,Sxy=0,Sxz=0,Syz=0,Sz=0;
  for(const [x,y] of pts){const z=x*x+y*y;S++;Sx+=x;Sy+=y;Sxx+=x*x;Syy+=y*y;Sxy+=x*y;Sxz+=x*z;Syz+=y*z;Sz+=z;}
  const A=[[Sxx,Sxy,Sx],[Sxy,Syy,Sy],[Sx,Sy,S]];const b=[-Sxz,-Syz,-Sz];
  for(let i=0;i<3;i++){
    let p=i;for(let k=i+1;k<3;k++)if(Math.abs(A[k][i])>Math.abs(A[p][i]))p=k;
    [A[i],A[p]]=[A[p],A[i]];[b[i],b[p]]=[b[p],b[i]];
    for(let k=i+1;k<3;k++){const f=A[k][i]/A[i][i];for(let j=i;j<3;j++)A[k][j]-=f*A[i][j];b[k]-=f*b[i];}
  }
  const sol=[0,0,0];
  for(let i=2;i>=0;i--){let s=b[i];for(let j=i+1;j<3;j++)s-=A[i][j]*sol[j];sol[i]=s/A[i][i];}
  const [D,E,F]=sol;const cx=-D/2,cy=-E/2;return {cx,cy,r:Math.sqrt(cx*cx+cy*cy-F)};
}

function run(im,cv,scaleMm){
  const {w,h,d}=getData(im,cv);
  // 卡片白底：取多个内点众数
  const samples=[[w*0.12,h*0.12],[w*0.88,h*0.12],[w*0.12,h*0.88],[w*0.88,h*0.88],[w*0.5,h*0.06]]
    .map(([x,y])=>px(d,w,Math.round(x),Math.round(y)));
  const card=[0,1,2].map(i=>{const v=samples.map(s=>s[i]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)];});
  const cardLum=lum(...card);
  const isLid=(r,g,b)=>{
    const L=lum(r,g,b);
    if(L<50) return false;                 // 黑角/黑 logo 排除
    const diff=Math.abs(r-card[0])+Math.abs(g-card[1])+Math.abs(b-card[2]);
    return diff>42;                        // 与卡片白底差异显著 = 银色上盖
  };
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
    const [r,g,b]=px(d,w,x,y);
    if(isLid(r,g,b)){if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}
  }
  const mmPerPx=scaleMm/(maxx-minx), mm=v=>+(v*mmPerPx).toFixed(2);
  // 四角圆弧点：逐行取最外前景
  function corner(c,N){
    const pts=[];
    for(let i=0;i<N;i++){
      let y,x0=-1;
      if(c==='TL'){y=miny+i;for(let x=minx;x<maxx;x++){const [r,g,b]=px(d,w,x,y);if(isLid(r,g,b)){x0=x;break;}}}
      if(c==='TR'){y=miny+i;for(let x=maxx;x>minx;x--){const [r,g,b]=px(d,w,x,y);if(isLid(r,g,b)){x0=x;break;}}}
      if(c==='BL'){y=maxy-i;for(let x=minx;x<maxx;x++){const [r,g,b]=px(d,w,x,y);if(isLid(r,g,b)){x0=x;break;}}}
      if(c==='BR'){y=maxy-i;for(let x=maxx;x>minx;x--){const [r,g,b]=px(d,w,x,y);if(isLid(r,g,b)){x0=x;break;}}}
      if(x0>=0)pts.push([x0,y]);
    }
    return pts;
  }
  const radii={};
  for(const c of ['TL','TR','BL','BR']){
    const pts=corner(c,Math.round((maxx-minx)*0.08));
    if(pts.length>15){const f=circleFit(pts);radii[c]=+(f.r*mmPerPx).toFixed(2);}
  }
  // logo：上盖内部真黑像素
  let lx0=1e9,lx1=-1,ly0=1e9,ly1=-1,cnt=0;
  const mx=Math.round((maxx-minx)*0.04),my=Math.round((maxy-miny)*0.04);
  for(let y=miny+my;y<=maxy-my;y++)for(let x=minx+mx;x<=maxx-mx;x++){
    const [r,g,b]=px(d,w,x,y);
    if(lum(r,g,b)<50){cnt++;if(x<lx0)lx0=x;if(x>lx1)lx1=x;if(y<ly0)ly0=y;if(y>ly1)ly1=y;}
  }
  const lidW=maxx-minx,lidH=maxy-miny;
  return {key:im.__k,img:[w,h],card,bbox:[minx,miny,maxx,maxy],mmPerPx:+mmPerPx.toFixed(5),
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
    try{out.push(run(im,cv,j.scaleMm));}catch(e){out.push({key:j.key,error:String(e)});}
  }
  document.getElementById('out').textContent=JSON.stringify(out,null,1);
})();
</script>`;
fs.writeFileSync(OUT, html);
console.log('wrote', OUT);
