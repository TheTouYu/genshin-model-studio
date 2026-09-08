
from PIL import Image, ImageDraw
import json
m = json.load(open('delivery/r0-toes/body-r2.mesh.json'))
v = m['vertices']; f = m['faces']
xs=[p[0] for p in v]; ys=[p[1] for p in v]; zs=[p[2] for p in v]
W,H=200,620
def proj(view):
    def f(p):
        if view=='front': return ((p[0]-min(xs))/(max(xs)-min(xs)+1e-9)*(W-40)+20, H-30-(p[1]-min(ys))/(max(ys)-min(ys)+1e-9)*(H-60))
        if view=='side': return ((p[2]-min(zs))/(max(zs)-min(zs)+1e-9)*(W-40)+20, H-30-(p[1]-min(ys))/(max(ys)-min(ys)+1e-9)*(H-60))
        if view=='quarter':
            qx=p[0]*0.707-p[2]*0.707; qy=p[1]
            return ((qx-min(xs)*-0.5)/(W-40)+20, H-30-(qy-min(ys))/(max(ys)-min(ys)+1e-9)*(H-60))
    return f
img=Image.new('RGB',(W*3+20,H),(255,255,255)); d=ImageDraw.Draw(img)
for i,view in enumerate(['front','side','quarter']):
    P=proj(view); off=i*(W+10)
    for t in range(0,len(f),6):
        a,b,c=f[t],f[t+1],f[t+2]
        pts=[(P(v[a])[0]+off,P(v[a])[1]),(P(v[b])[0]+off,P(v[b])[1]),(P(v[c])[0]+off,P(v[c])[1])]
        d.polygon(pts,outline=(0,0,120))
    d.text((off+5,5),view.upper(),fill=(200,0,0))
img.save('delivery/r0-toes/_body_final.png')
print('saved')
