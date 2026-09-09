import sys
from PIL import Image, ImageDraw
paths = sys.argv[1:-1]; out = sys.argv[-1]
IM = 620  # per-tile long edge (AB is 880 for single image; 620 keeps sheet readable)
tiles = []
for p in paths:
    im = Image.open(p).convert('RGB')
    s = IM / max(im.size)
    tiles.append((p.split('/')[-1], im.resize((max(1,int(im.width*s)), max(1,int(im.height*s))), Image.LANCZOS)))
cols = 3; rows = (len(tiles)+cols-1)//cols
cw = max(t[1].width for t in tiles)+8; ch = max(t[1].height for t in tiles)+22
sheet = Image.new('RGB', (cw*cols, ch*rows), (40,40,44)); d = ImageDraw.Draw(sheet)
for i,(name,im) in enumerate(tiles):
    x = (i%cols)*cw+4; y = (i//cols)*ch+18
    sheet.paste(im, (x,y)); d.text((x, (i//cols)*ch+4), name[:44], fill=(255,255,120))
sheet.save(out, quality=92)
print(out, sheet.size)
