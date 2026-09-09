// crop.mjs — 用 zlib 自写 PNG 编码器裁剪放大指定区域（便于 read_image 目视）
import fs from 'node:fs';
import zlib from 'node:zlib';
import { load } from './load.mjs';

const [src, out, X0, Y0, X1, Y1, SCALE] = process.argv.slice(2);
const x0 = +X0, y0 = +Y0, x1 = +X1, y1 = +Y1, sc = +(SCALE || 1);
const { w, h, ch, px } = load(src);
const W = (x1 - x0) * sc, H = (y1 - y0) * sc;

const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); };

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; // 8bit RGB
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const ro = y * (1 + W * 3); raw[ro] = 0;
  for (let x = 0; x < W; x++) {
    const sx = x0 + Math.floor(x / sc), sy = y0 + Math.floor(y / sc);
    const i = (sy * w + sx) * ch, o = ro + 1 + x * 3;
    raw[o] = px[i]; raw[o + 1] = px[i + 1]; raw[o + 2] = px[i + 2];
  }
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(out, png);
console.log(`wrote ${out} ${W}x${H} (src region ${x0},${y0} - ${x1},${y1}, scale ${sc})`);
