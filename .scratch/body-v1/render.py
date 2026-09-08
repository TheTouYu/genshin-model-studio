from PIL import Image, ImageDraw
V=[]; F=[]
for line in open('.scratch/body-v1/body.obj'):
    p=line.split()
    if not p: continue
    if p[0]=='v': V.append((float(p[1]),float(p[2]),float(p[3])))
    elif p[0]=='f': F.append([int(x)-1 for x in p[1:] if x])
def render(ax_h, ax_v, name):
    W,H=380,620
    img=Image.new('RGB',(W,H),(255,255,255)); dr=ImageDraw.Draw(img)
    hs=[v[ax_h] for v in V]; vs=[v[ax_v] for v in V]
    h0,h1=min(hs),max(hs); v0,v1=min(vs),max(vs)
    def sx(h): return (h-h0)/(max(h1-h0,1e-9))*(W-40)+20
    def sv(v): return (H-40+20)-((v-v0)/(max(v1-v0,1e-9))*(H-40)+20)
    used={ax_h,ax_v}; dep=[i for i in (0,1,2) if i not in used][0]
    tris=sorted(((sum(V[i][dep] for i in f)/len(f), f) for f in F if len(f)>=3), key=lambda t:-t[0])
    for d,f in tris:
        dr.polygon([(sx(V[i][ax_h]), sv(V[i][ax_v])) for i in f], fill=(90,100,140))
    img.save('.scratch/body-v1/'+name)
render(0,1,'front.png'); render(2,1,'side.png'); render(0,2,'top.png')
print('done')
