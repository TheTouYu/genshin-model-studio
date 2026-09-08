
from PIL import Image
import json
m = json.load(open('delivery/r0-toes/body-r2.mesh.json'))
v = m['vertices']; f = m['faces']
xs=[p[0] for p in v]; ys=[p[1] for p in v]
W,H=240,724
def front(p):
    return ((p[0]-min(xs))/(max(xs)-min(xs)+1e-9)*(W-40)+20, H-30-(p[1]-min(ys))/(max(ys)-min(ys)+1e-9)*(H-60))
img=Image.new('RGB',(W,(H)),(255,255,255))
from PIL import ImageDraw
d=ImageDraw.Draw(img)
for t in range(0,len(f),6):
    a,b,c=f[t],f[t+1],f[t+2]
    d.polygon([front(v[a]),front(v[b]),front(v[c])],outline=(0,0,120))
img.save('.scratch/_my_front.png')
# compose: reference front (278x724) + my front
ref=Image.open('reference/body-wire-front.png').convert('RGB')
my=Image.open('.scratch/_my_front.png').convert('RGB')
# scale my to same height
scale=724/my.height
my2=my.resize((int(my.width*scale),724))
canvas=Image.new('RGB',(ref.width+my2.width+20,724),(240,240,240))
canvas.paste(ref,(0,0)); canvas.paste(my2,(ref.width+20,0))
canvas.save('delivery/r0-toes/_cmp_front.png')
print('done ref',ref.size,'my',my2.size)
