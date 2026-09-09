import fs from 'node:fs';
import zlib from 'node:zlib';

function decodePNG(buf) {
  let off = 8, w = 0, h = 0, bitDepth = 8, colorType = 6;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const bpp = (bitDepth / 8) * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++]; const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v = (v + a) & 255; else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); const pr = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c); v = (v + pr) & 255; }
      cur[x] = v;
    }
  }
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const s = i * bpp, d = i * 3;
    if (channels <= 2) { const g = out[s]; rgb[d] = g; rgb[d + 1] = g; rgb[d + 2] = g; }
    else { rgb[d] = out[s]; rgb[d + 1] = out[s + 1]; rgb[d + 2] = out[s + 2]; }
  }
  return { w, h, rgb };
}

const files = process.argv.slice(2);
for (const file of files) {
  const { w, h, rgb } = decodePNG(fs.readFileSync(file));
  const lum = new Float32Array(w * h);
  let pure0 = 0, pure255 = 0;
  for (let i = 0; i < w * h; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    if (r === 0 && g === 0 && b === 0) pure0++;
    if (r === 255 && g === 255 && b === 255) pure255++;
  }
  // mid-luminance local noise: laplacian mean over 8x8 blocks whose mean lum in [40,215] and range < 40
  const laps = [];
  for (let by = 1; by < h - 9; by += 8) for (let bx = 1; bx < w - 9; bx += 8) {
    let sum = 0, n = 0, min = 255, max = 0, m = 0;
    for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) {
      const c = lum[y * w + x];
      sum += Math.abs(4 * c - lum[y * w + x - 1] - lum[y * w + x + 1] - lum[(y - 1) * w + x] - lum[(y + 1) * w + x]);
      n++; if (c < min) min = c; if (c > max) max = c; m += c;
    }
    const mean = m / n;
    if (mean > 40 && mean < 215 && (max - min) < 25) laps.push(sum / n);
  }
  laps.sort((a, b) => a - b);
  const med = laps.length ? laps[Math.floor(laps.length / 2)] : null;
  const p20 = laps.length ? laps[Math.floor(laps.length * 0.2)] : null;
  // JPEG 8x8 blockiness: on rows in mid-lum band, compare |diff| at multiples of 8 vs elsewhere
  let bSum = 0, bN = 0, iSum = 0, iN = 0;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const c = lum[y * w + x];
      if (c < 40 || c > 215) continue;
      const d = Math.abs(lum[y * w + x + 1] - lum[y * w + x - 1]);
      if (x % 8 === 0) { bSum += d; bN++; } else { iSum += d; iN++; }
    }
  }
  const blockiness = (iN && bN) ? (bSum / bN) / (iSum / iN) : null;
  console.log(JSON.stringify({
    file: file.split('/').pop(), w, h,
    pureBlackPct: +(100 * pure0 / (w * h)).toFixed(1),
    pureWhitePct: +(100 * pure255 / (w * h)).toFixed(1),
    midBlocks: laps.length,
    noiseMed: med === null ? null : +med.toFixed(3),
    noiseP20: p20 === null ? null : +p20.toFixed(3),
    blockiness: blockiness === null ? null : +blockiness.toFixed(3),
  }));
}
