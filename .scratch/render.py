
from PIL import Image, ImageDraw
import json
m = json.load(open('delivery/r0-toes/body-r2.mesh.json'))
v = m['vertices']; f = m['faces']
# Front view (project X to px, Y to py). Body +X left/right, +Z front.
xs = [p[0] for p in v]; ys = [p[1] for p in v]; zs = [p[2] for p in v]
W,H = 300, 620
def front(v):
    x = v[0]; y = v[1]
    px = (x - min(xs))/(max(xs)-min(xs)+1e-9) * (W-40) + 20
    py = H-30 - (y - min(ys))/(max(ys)-min(ys)+1e-9) * (H-60)
    return px, py
def side(v):
    z = v[2]; y = v[1]
    px = (z - min(zs))/(max(zs)-min(zs)+1e-9) * (W-40) + 20
    py = H-30 - (y - min(ys))/(max(ys)-min(ys)+1e-9) * (H-60)
    return px, py
img = Image.new('RGB',(W*2+10, H),(255,255,255))
d = ImageDraw.Draw(img)
for view, xoff in ((front,0),(side,W+10)):
    for i in range(0,len(f),6):
        a,b,c = f[i],f[i+1],f[i+2]
        pts = [ (view(v[a])[0]+xoff, view(v[a])[1]), (view(v[b])[0]+xoff, view(v[b])[1]), (view(v[c])[0]+xoff, view(v[c])[1]) ]
        d.polygon(pts, outline=(0,0,120))
    d.text((xoff+5,5), 'FRONT' if xoff==0 else 'SIDE', fill=(200,0,0))
img.save('delivery/r0-toes/_body_cur.png')
print('rendered', W,H, 'verts',len(v),'faces',len(f)//3)
print('x range', min(xs), max(xs), 'y range', min(ys), max(ys), 'z range', min(zs), max(zs))
