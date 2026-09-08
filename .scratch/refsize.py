
from PIL import Image
import os
ref = Image.open('reference/body-wire-front.png')
print('front ref size', ref.size)
side = Image.open('reference/body-wire-side.png')
print('side ref size', side.size)
q = Image.open('reference/body-wire-quarter.png'); print('quarter', q.size)
b = Image.open('reference/body-wire-back.png'); print('back', b.size)
