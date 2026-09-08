
from PIL import Image, ImageDraw
import json, math
m = json.load(open('delivery/r0-toes/body-r2.mesh.json'))
v = m['vertices']; f = m['faces']
xs=[p[0] for p in v]; ys=[p[1] for p in v]; zs=[p[2] for p in v]
def qxof(p):
    a=math.radians(45); return p[0]*math.cos(a)+p[2]*math.sin(a)
Q=[qxof(p) for p in v]
W,H=220,640
def proj(view):
    def f(p):
        if view=='front': px=(p[0]-min(xs))/(max(xs)-min(xs)+1e-9)
        elif view=='side': px=(p[2]-min(zs))/(max(zs)-min(zs)+1e-9)
        else: px=(qxof(p)-min(Q))/(max(Q)-min(Q)+1e-9)
        return (px*(W-40)+20, H-30-(p[1]-min(ys))/(max(ys)-min(ys)+1e-9)*(H-60))
    return f
img=Image.new('RGB',(W*3+20,H),(255,255,255)); d=ImageDraw.Draw(img)
for i,view in enumerate(['front','side','quarter']):
    P=proj(view); off=i*(W+10)
    for t in range(0,len(f),3):
        a,b,c=f[t],f[t+1],f[t+2]
        d.polygon([(P(v[a])[0]+off,P(v[a])[1]),(P(v[b])[0]+off,P(v[b])[1]),(P(v[c])[0]+off,P(v[c])[1])],outline=(0,0,120))
    d.text((off+5,5),view.upper(),fill=(200,0,0))
img.save('delivery/r0-toes/_qf2.png')
# foot side closeup
W2,H2=340,200
img2=Image.new('RGB',(W2,H2),(255,255,255)); d2=ImageDraw.Draw(img2)
fp=v if True else None
for t in range(0,len(f),3):
    a,b,c=f[t],f[t+1],f[t+2]; pts=[v[a],v[b],v[c]]
    if min(p[1] for p in pts)>0.30: continue
    px=[(p[2]-min(zs))/(max(zs)-min(zs)+1e-9)*(W2-30)+15 for p in pts]
    pyv=[H2-int(p[1]/0.30*(H2-10))-5 for p in pts]
    d2.polygon(list(zip(px,pyv)),outline=(0,0,120))
img2.save('delivery/r0-toes/_foot2.png')
print('ok')
