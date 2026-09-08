
from PIL import Image, ImageDraw
import json
m = json.load(open('delivery/r0-toes/body-r2.mesh.json'))
v = m['vertices']; f = m['faces']; cols = m.get('colors',[])
xs=[p[0] for p in v]; ys=[p[1] for p in v]; zs=[p[2] for p in v]
W,H=300,720
def hexc(c):
    c=c.lstrip('#'); return tuple(int(c[i:i+2],16) for i in (0,2,4))
W2,H2=2*W+12,H
img=Image.new('RGB',(W2,H2),(30,30,30)); d=ImageDraw.Draw(img)
for view,off in (('side',0),('front',W+12)):
    for t in range(0,len(f),3):
        a,b,c=f[t],f[t+1],f[t+2]; pts=[v[a],v[b],v[c]]
        if view=='side': px=[(p[2]-min(zs))/(max(zs)-min(zs)+1e-9)*(W-40)+20 for p in pts]; pyv=[H-30-(p[1]-min(ys))/(max(ys)-min(ys)+1e-9)*(H-60) for p in pts]
        else: px=[(p[0]-min(xs))/(max(xs)-min(xs)+1e-9)*(W-40)+20 for p in pts]; pyv=[H-30-(p[1]-min(ys))/(max(ys)-min(ys)+1e-9)*(H-60) for p in pts]
        col=hexc(cols[t//3]) if t//3<len(cols) else (200,200,200)
        d.polygon(list(zip([x+off for x in px],pyv)),fill=col,outline=(255,255,255)
)
img.save('delivery/r0-toes/_solid.png')
print('colors sample:', sorted(set(cols))[:12])
print('front-mid region: trunk y 0.8-1.4, z>0 (front)')
