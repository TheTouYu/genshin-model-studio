/** 前后不对称截面放样：竖直件 opts.up=[0,0,1] 时 rx=宽、ry=深；+z 为前，-z 为后。 */
(function (root) {
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function cr(a, b, c, d, t) { var t2=t*t,t3=t2*t; return [0.5*(2*b[0]+(-a[0]+c[0])*t+(2*a[0]-5*b[0]+4*c[0]-d[0])*t2+(-a[0]+3*b[0]-3*c[0]+d[0])*t3),0.5*(2*b[1]+(-a[1]+c[1])*t+(2*a[1]-5*b[1]+4*c[1]-d[1])*t2+(-a[1]+3*b[1]-3*c[1]+d[1])*t3),0.5*(2*b[2]+(-a[2]+c[2])*t+(2*a[2]-5*b[2]+4*c[2]-d[2])*t2+(-a[2]+3*b[2]-3*c[2]+d[2])*t3)]; }
  function asymLoft(path, sections, segs, sides, colorFn, opts) {
    opts=opts||{}; segs=Math.max(1,segs||12); sides=Math.max(3,sides||12); colorFn=colorFn||function(){return '#fff';};
    var pts=[]; for(var k=0;k<=segs;k++){var x=k/segs*(path.length-1),i=Math.min(path.length-2,Math.floor(x)),t=x-i;pts.push(cr(path[Math.max(0,i-1)],path[i],path[i+1],path[Math.min(path.length-1,i+2)],t));}
    function sec(k){var x=k/Math.max(1,pts.length-1)*(sections.length-1),i=Math.min(sections.length-1,Math.floor(x)),t=x-i,a=sections[i],b=sections[Math.min(sections.length-1,i+1)];function g(n,fb){return (a[n]==null?(a[fb]==null?0:a[fb]):a[n])+((b[n]==null?(b[fb]==null?0:b[fb]):b[n])-(a[n]==null?(a[fb]==null?0:a[fb]):a[n]))*t;}return {rx:g('rx','rx'),ryF:g('ryF','ry'),cyF:g('cyF','cy'),ryB:g('ryB','ry'),cyB:g('cyB','cy')};}
    var up=norm(opts.up||[0,1,0]), verts=[],faces=[],colors=[],rings=[];
    for(var k=0;k<pts.length;k++){var p=pts[k],p0=pts[Math.max(0,k-1)],p1=pts[Math.min(pts.length-1,k+1)],tg=norm([p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]]);var u=norm(cross(tg,up));if(Math.hypot(u[0],u[1],u[2])<1e-5)u=[1,0,0];var d=norm(cross(u,tg)),s=sec(k),base=verts.length;rings.push(base);for(var j=0;j<sides;j++){var th=j/sides*Math.PI*2, sn=Math.sin(th),cs=Math.cos(th),front=sn>=0,ry=front?s.ryF:s.ryB,cy=front?s.cyF:s.cyB;var off=[u[0]*cs*s.rx+d[0]*(sn*ry+cy),u[1]*cs*s.rx+d[1]*(sn*ry+cy),u[2]*cs*s.rx+d[2]*(sn*ry+cy)];verts.push([p[0]+off[0],p[1]+off[1],p[2]+off[2]]);}}
    for(var i=0;i<rings.length-1;i++)for(var j=0;j<sides;j++){var n=(j+1)%sides,A=rings[i]+j,B=rings[i]+n,C=rings[i+1]+n,D=rings[i+1]+j,col=colorFn(i,j,i/Math.max(1,segs));faces.push(A,B,C,A,C,D);colors.push(col,col);}
    var cap=opts.cap||'none'; if(cap==='both'||cap==='top'){var c=verts.length;verts.push(pts[0]);for(var j=0;j<sides;j++){var n=(j+1)%sides;faces.push(c,rings[0]+n,rings[0]+j);colors.push(colorFn(0,j,0));}} if(cap==='both'||cap==='bottom'){var c2=verts.length;verts.push(pts[pts.length-1]);var rr=rings[rings.length-1];for(var j=0;j<sides;j++){var n=(j+1)%sides;faces.push(c2,rr+j,rr+n);colors.push(colorFn(segs,j,1));}}
    return {vertices:verts,faces:faces,colors:colors,ringIdx:rings,sides:sides};
  }
  root.asymLoft=asymLoft; if(typeof module!=='undefined')module.exports={asymLoft:asymLoft};
})(typeof globalThis!=='undefined'?globalThis:this);
