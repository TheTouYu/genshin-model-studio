// Minimal PNG decode/crop/upscale/encode + flat-region noise stats. No deps.
import fs from 'node:fs';
import zlib from 'node:zlib';

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let off = 8, w = 0, h = 0, bitDepth = 8, colorType = 6, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (interlace) throw new Error('interlaced not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('colorType ' + colorType);
  const bpp = (bitDepth / 8) * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      switch (ft) {
        case 0: break;
        case 1: v = (v + a) & 255; break;
        case 2: v = (v + b) & 255; break;
        case 3: v = (v + ((a + b) >> 1)) & 255; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
          v = (v + pr) & 255; break;
        }
        default: throw new Error('filter ' + ft);
      }
      cur[x] = v;
    }
  }
  // to RGB
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const s = i * bpp, d = i * 3;
    if (channels === 1 || channels === 2) { const g = out[s]; rgb[d] = g; rgb[d + 1] = g; rgb[d + 2] = g; }
    else { rgb[d] = out[s]; rgb[d + 1] = out[s + 1]; rgb[d + 2] = out[s + 2]; }
  }
  return { w, h, rgb };
}

function encodePNG(w, h, rgb) {
  const stride = w * 3;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunks = [];
  const chunk = (type, data) => {
    const b = Buffer.alloc(8 + data.length + 4);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii');
    data.copy(b, 8);
    const crcBuf = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    b.writeUInt32BE(zlib.crc32 ? zlib.crc32(crcBuf) >>> 0 : crc32(crcBuf), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  chunks.push(chunk('IHDR', ihdr));
  chunks.push(chunk('IDAT', idat));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const cmd = process.argv[2];
if (cmd === 'crop') {
  const [file, x, y, cw, ch, scale, out] = process.argv.slice(3);
  const img = decodePNG(fs.readFileSync(file));
  const X = +x, Y = +y, CW = +cw, CH = +ch, S = +scale;
  const ow = CW * S, oh = CH * S;
  const outBuf = Buffer.alloc(ow * oh * 3);
  for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
    const sx = Math.min(img.w - 1, X + Math.floor(ox / S));
    const sy = Math.min(img.h - 1, Y + Math.floor(oy / S));
    const s = (sy * img.w + sx) * 3, d = (oy * ow + ox) * 3;
    outBuf[d] = img.rgb[s]; outBuf[d + 1] = img.rgb[s + 1]; outBuf[d + 2] = img.rgb[s + 2];
  }
  fs.writeFileSync(out, encodePNG(ow, oh, outBuf));
  console.log('crop', file, '->', out, ow + 'x' + oh);
} else if (cmd === 'stats') {
  const file = process.argv[3];
  const img = decodePNG(fs.readFileSync(file));
  // split into 8x8 blocks, report high-frequency energy (mean |laplacian|) percentiles and darkest/lightest
  const { w, h, rgb } = img;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
  const blocks = [];
  for (let by = 1; by < h - 1; by += 8) for (let bx = 1; bx < w - 1; bx += 8) {
    let sum = 0, n = 0, min = 255, max = 0, m = 0;
    for (let y = by; y < Math.min(by + 8, h - 1); y++) for (let x = bx; x < Math.min(bx + 8, w - 1); x++) {
      const c = lum[y * w + x];
      const lap = Math.abs(4 * c - lum[y * w + x - 1] - lum[y * w + x + 1] - lum[(y - 1) * w + x] - lum[(y + 1) * w + x]);
      sum += lap; n++; if (c < min) min = c; if (c > max) max = c; m += c;
    }
    blocks.push({ lap: sum / n, range: max - min, mean: m / n });
  }
  blocks.sort((a, b) => a.lap - b.lap);
  const q = (p) => blocks[Math.floor(p * (blocks.length - 1))].lap;
  const flat = blocks.slice(0, Math.max(1, Math.floor(blocks.length * 0.3)));
  const flatLap = flat.reduce((s, b) => s + b.lap, 0) / flat.length;
  const flatRange = flat.reduce((s, b) => s + b.range, 0) / flat.length;
  // color noise in flattest blocks: mean abs deviation of R-G, B-G
  console.log(JSON.stringify({ file: file.split('/').pop(), w, h, blocks: blocks.length,
    lapP10: +q(0.1).toFixed(3), lapP50: +q(0.5).toFixed(3), lapP90: +q(0.9).toFixed(3),
    flatLap: +flatLap.toFixed(3), flatRange: +flatRange.toFixed(2) }));
} else if (cmd === 'meta') {
  const file = process.argv[3];
  const buf = fs.readFileSync(file);
  let off = 8, out = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (['IHDR', 'tEXt', 'iTXt', 'zTXt', 'pHYs', 'gAMA', 'sRGB', 'eXIf', 'tIME', 'cHRM', 'bKGD'].includes(type)) {
      const data = buf.subarray(off + 8, off + 8 + len);
      out.push({ type, len, data: type === 'IHDR' ? `${data.readUInt32BE(0)}x${data.readUInt32BE(4)} bd=${data[8]} ct=${data[9]}` : data.toString('latin1').slice(0, 120) });
    }
    off += 12 + len;
  }
  console.log(JSON.stringify({ file: file.split('/').pop(), chunks: out }));
}
