
from PIL import Image, ImageDraw
import json
m = json.load(open('delivery/r0-toes/body-r2.mesh.json'))
v = m['vertices']; f = m['faces']; cols=m.get('colors',[])
def hexc(c):
    c=c.lstrip('#'); return tuple(int(c[i:i+2],16) for i in (0,2,4))
# side view zoom on trunk front-mid: y in [0.70,1.45], project Z-Y, show +Z (front) region
W,H=360,560
img=Image.new('RGB',(W,H),(20,20,20)); d=ImageDraw.Draw(img)
y0,y1=0.70,1.45; z0,z1=-0.13,0.21
for t in range(0,len(f),3):
    a,b,c=f[t],f[t+1],f[t+2]; pts=[v[a],v[b],v[c]]
    if max(p[1] for p in pts)<y0 or min(p[1] for p in pts)>y1: continue
    px=[(p[2]-z0)/(z1-z0)*(W-40)+20 for p in pts]; pyv=[H-30-(p[1]-y0)/(y1-y0)*(H-60) for p in pts]
    col=hexc(cols[t//3]) if t//3<len(cols) else (200,200,200)
    d.polygon(list(zip(px,pyv)),fill=col,outline=(255,255,255))
# mark front (+Z) axis
d.line([(20,H-30-(1.30-y0)/(y1-y0)*(H-60)),(W-20,H-30-(1.30-y0)/(y1-y0)*(H-60))],fill=(255,0,0))
img.save('delivery/r0-toes/_frontmid.png')
print('ok, region y',y0,y1,'front +Z right side')
