#!/usr/bin/env python3
"""Dependency-free PNG decode/crop/zoom/stats for forensic inspection."""
import sys, zlib, struct

def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not png'
    pos = 8
    idat = b''
    w = h = bitd = ctype = None
    plte = None
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos+4])[0]
        typ = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+ln]
        if typ == b'IHDR':
            w, h, bitd, ctype, comp, filt, inter = struct.unpack('>IIBBBBB', chunk)
            assert inter == 0, 'interlaced not supported'
        elif typ == b'PLTE':
            plte = chunk
        elif typ == b'IDAT':
            idat += chunk
        elif typ == b'IEND':
            break
        pos += 12 + ln
    raw = zlib.decompress(idat)
    channels = {0:1, 2:3, 3:1, 4:2, 6:4}[ctype]
    assert bitd == 8, 'only 8-bit supported, got %d' % bitd
    stride = w * channels
    rows = []
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        if f == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i-channels]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i-channels] if i >= channels else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i-channels] if i >= channels else 0
                b = prev[i]
                c = prev[i-channels] if i >= channels else 0
                pa = abs(b - c); pb = abs(a - c); pc = abs(a + b - 2*c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        rows.append(bytes(line))
        prev = line
    if ctype == 3:
        assert plte is not None
        rows = [bytes(b for idx in r for b in plte[idx*3:idx*3+3]) for r in rows]
        channels = 3
    if ctype == 0:
        rows = [bytes(b for v in r for b in (v, v, v)) for r in rows]
        channels = 3
    if ctype == 4:
        rows = [bytes(b for i in range(0, len(r), 2) for b in (r[i], r[i], r[i])) for r in rows]
        channels = 3
    if ctype == 6:
        rows = [bytes(b for i in range(0, len(r), 4) for b in (r[i], r[i+1], r[i+2])) for r in rows]
        channels = 3
    return w, h, rows

def crop(rows, x0, y0, x1, y1):
    return [r[x0*3:x1*3] for r in rows[y0:y1]]

def write_png(path, rows, w, h):
    raw = b''.join(b'\x00' + r for r in rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(raw, 6))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)

def zoom(rows, factor):
    out = []
    for r in rows:
        px = [r[i:i+3] for i in range(0, len(r), 3)]
        big = b''.join(p * factor for p in px)
        for _ in range(factor):
            out.append(big)
    return out

def stats(rows, x0, y0, x1, y1, label):
    """Noise metric: mean |horizontal neighbor diff| on luma, plus unique-color count."""
    tot = 0; n = 0; uniq = set(); lums = []
    for r in rows[y0:y1]:
        prev = None
        for x in range(x0, x1):
            p = r[x*3:x*3+3]
            uniq.add(p)
            lum = (p[0]*299 + p[1]*587 + p[2]*114)//1000
            lums.append(lum)
            if prev is not None:
                tot += abs(lum - prev); n += 1
            prev = lum
    mean = sum(lums)/len(lums)
    var = sum((v-mean)**2 for v in lums)/len(lums)
    print('%-28s px=%5d  hf_noise=%.2f  luma_std=%.2f  mean=%.1f  uniq_colors=%d'
          % (label, len(lums), tot/max(n,1), var**0.5, mean, len(uniq)))

def blockavg(rows, n):
    out = []
    for y in range(0, len(rows) - n + 1, n):
        row = bytearray()
        for x in range(0, len(rows[0])//3 - n + 1, n):
            rs = gs = bs = 0
            for yy in range(y, y+n):
                r = rows[yy]
                for xx in range(x, x+n):
                    o = xx*3
                    rs += r[o]; gs += r[o+1]; bs += r[o+2]
            k = n*n
            row += bytes((rs//k, gs//k, bs//k))
        out.append(bytes(row))
    return out

def blockiness(rows, x0, y0, x1, y1, label):
    """JPEG 8x8 block-edge step: mean |d| on x%8==0 boundaries vs interior columns."""
    at = 0; atn = 0; inb = 0; inbn = 0
    for r in rows[y0:y1]:
        for x in range(x0+1, x1):
            a = r[(x-1)*3:(x-1)*3+3]; b = r[x*3:x*3+3]
            d = abs((a[0]*299+a[1]*587+a[2]*114)//1000 - (b[0]*299+b[1]*587+b[2]*114)//1000)
            if x % 8 == 0:
                at += d; atn += 1
            else:
                inb += d; inbn += 1
    print('%-24s block_edge=%.3f interior=%.3f ratio=%.2f'
          % (label, at/max(atn,1), inb/max(inbn,1), (at/max(atn,1))/max(inb/max(inbn,1), 1e-6)))

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'block':
        w, h, rows = read_png(sys.argv[2])
        args = sys.argv[3:]
        for i in range(0, len(args), 5):
            blockiness(rows, int(args[i+1]), int(args[i+2]), min(int(args[i+3]), w), min(int(args[i+4]), h), args[i])
        sys.exit(0)
    if cmd == 'thumb':
        # thumb <in> <out> <factor>
        w, h, rows = read_png(sys.argv[2])
        n = int(sys.argv[4])
        t = blockavg(rows, n)
        write_png(sys.argv[3], t, w//n, h//n)
        print('wrote %s %dx%d' % (sys.argv[3], w//n, h//n))
        sys.exit(0)
    if cmd == 'info':
        w, h, rows = read_png(sys.argv[2])
        print('%s: %dx%d' % (sys.argv[2], w, h))
    elif cmd == 'crop':
        # crop <in> <out> <x0> <y0> <x1> <y1> <zoom>
        w, h, rows = read_png(sys.argv[2])
        x0, y0, x1, y1, z = [int(v) for v in sys.argv[4:9]]
        c = crop(rows, x0, y0, min(x1, w), min(y1, h))
        if z > 1:
            c = zoom(c, z)
        write_png(sys.argv[3], c, (min(x1, w)-x0)*z, (min(y1, h)-y0)*z)
        print('wrote %s %dx%d' % (sys.argv[3], (min(x1, w)-x0)*z, (min(y1, h)-y0)*z))
    elif cmd == 'stats':
        # stats <in> <label> <x0> <y0> <x1> <y1> ...
        w, h, rows = read_png(sys.argv[2])
        args = sys.argv[3:]
        for i in range(0, len(args), 5):
            label = args[i]
            x0, y0, x1, y1 = [int(v) for v in args[i+1:i+5]]
            stats(rows, x0, y0, min(x1, w), min(y1, h), label)
