
from PIL import Image, ImageDraw
import json, math
m = json.load(open('delivery/r0-toes/body-r2.mesh.json'))
v = m['vertices']; f = m['faces']
xs=[p[0] for p in v]; ys=[p[1] for p in v]; zs=[p[2] for p in v]
W,H=220,640
def proj(view):
    def f(p):
        X,Y=p[0],p[1]
        if view=='front': px=(X-min(xs))/(max(xs)-min(xs)+1e-9); pyv=Y
        elif view=='side': px=(p[2]-min(zs))/(max(zs)-min(zs)+1e-9); pyv=Y
        elif view=='quarter':
            a=math.radians(45); qx=X*math.cos(a)+p[2]*math.sin(a); qz=-X*math.sin(a)+p[2]*math.cos(a)
            px=(qx-min(qx for q in v if True))/(max(qx for q in v if True)-min(qx for q in v if True)+1e-9); pyv=Y
        return (px*(W-40)+20, H-30-(pyv-min(ys))/(max(ys)-min(ys)+1e-9)*(H-60))
    return f
img=Image.new('RGB',(W*3+20,H),(255,255,255)); d=ImageDraw.Draw(img)
for i,view in enumerate(['front','side','quarter']):
    P=proj(view); off=i*(W+10)
    for t in range(0,len(f),6):
        a,b,c=f[t],f[t+1],f[t+2]
        pts=[(P(v[a])[0]+off,P(v[a])[1]),(P(v[b])[0]+off,P(v[b])[1]),(P(v[c])[0]+off,P(v[c])[1])]
        d.polygon(pts,outline=(0,0,120))
    d.text((off+5,5),view.upper(),fill=(200,0,0))
img.save('delivery/r0-toes/_qf.png')
# foot close-up (right leg front + side)
img2=Image.new('RGB',(2*W+10,int(H*0.4)),(255,255,255)); d2=ImageDraw.Draw(img2)
def foot(view,off):
    for t in range(0,len(f),3):
        a,b,c=f[t],f[t+1],f[t+2]
        pts=[v[a],v[b],v[c]]
        if min(p[1] for p in pts)>0.30: continue
        if view=='front': px=[(p[0]-min(xs))/(max(xs)-min(xs))*(W-40)+20 for p in pts]
        else: px=[(p[2]-min(zs))/(max(zs)-min(zs))*(W-40)+20 for p in pts]
        pyv=[int((1-(p[1]-0)/0.30)*int(H*0.35)) for p in pts]
        d2.polygon(list(zip([x+off for x in px],pyv)),outline=(0,0,120))
    d2.text((off+5,5),('foot-front' if view=='front' else 'foot-side'),fill=(200,0,0))
foot('front',0); foot('side',W+10)
img2.save('delivery/r0-toes/_foot.png')
print('rendered', 'x',round(min(xs),3),round(max(xs),3),'z',round(min(zs),3),round(max(zs),3),'footY min',round(min(p[1] for p in v),3))
