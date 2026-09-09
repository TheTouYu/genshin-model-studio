/**
 * 渲染 worker：构建场景 → 渲染指定行带 → 回传 Float32 颜色缓冲
 */
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { MeshBuilder, Scene, RAYSTATS } from '../../dist/src/render/geom.js';
import { v3, Rng } from '../../dist/src/render/math.js';
import { Environment, makeMaterial, renderSample, initMsTable } from '../../dist/src/render/integrator.js';
import { decodePng, Texture } from '../../dist/src/render/image.js';
import { buildMacbook14 } from '../../dist/src/model/macbook/geometry.js';
import { makeScreenTexture } from '../../dist/src/model/macbook/screen-ui.js';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const W = workerData.W, H = workerData.H, SPP = workerData.SPP;
const y0 = workerData.y0, y1 = workerData.y1;

function toLin(img) {
  const { w, h, data, channels } = img;
  const LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const out = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    if (channels === 1) { const v = LUT[data[i]]; out[i * 3] = v; out[i * 3 + 1] = v; out[i * 3 + 2] = v; }
    else for (let c = 0; c < 3; c++) out[i * 3 + c] = LUT[data[i * channels + c]];
  }
  return out;
}
function grilleTexture() {
  const N = 512, pitch = 10.5, r = 2.55;
  const d = new Float32Array(N * N * 3);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x % pitch - pitch / 2, fy = y % pitch - pitch / 2;
    const dist = Math.hypot(fx, fy);
    let v = 0.62;
    if (dist < r) v = 0.012;
    else if (dist < r + 1.6) v = 0.62 + 0.5 * (1 - (dist - r) / 1.6);
    const i = (y * N + x) * 3;
    d[i] = v; d[i + 1] = v; d[i + 2] = v * 1.005;
  }
  return new Texture(N, N, d);
}

function loadAssets(wantScreen) {
  const out = { grilleTex: grilleTexture() };
  const atlasImg = decodePng(readFileSync(`${ROOT}/reference/macbook/legend-atlas.png`));
  const tex = new Texture(atlasImg.w, atlasImg.h, toLin(atlasImg));
  tex.wrapU = 0; tex.wrapV = 0;
  out.legendAtlas = tex;
  const atlasMeta = JSON.parse(readFileSync(`${ROOT}/reference/macbook/legend-atlas.json`, 'utf8'));
  out.legendRects = atlasMeta.rects;
  out.legendPxPerMm = atlasMeta.atlas_px_per_mm;
  out.logo = JSON.parse(readFileSync(`${ROOT}/reference/macbook/logo-outline.json`, 'utf8'));
  if (wantScreen) out.screenTex = makeScreenTexture(workerData.screenGain ?? 1.8);
  return out;
}

const TW0=Date.now();
initMsTable();
const assets = loadAssets(workerData.screenOn);
const TW1=Date.now();
const built = buildMacbook14({ openAngle: workerData.openAngle, screenOn: workerData.screenOn, color: workerData.color ?? 'silver', lod: workerData.lod ?? 1, legends: workerData.legends !== false }, assets);
if (workerData.aluRough !== undefined && workerData.aluRough !== null) { for (const m of built.materials) if (m && m.name === 'alu-silver') m.roughness = workerData.aluRough; }
const mats = built.materials;
const b = new MeshBuilder();
{
  const md = built.mesh;
  const idx = [];
  for (let i = 0; i < md.pos.length / 3; i++) {
    idx.push(b.vertex(v3(md.pos[i * 3], md.pos[i * 3 + 1], md.pos[i * 3 + 2]), v3(md.nrm[i * 3], md.nrm[i * 3 + 1], md.nrm[i * 3 + 2]), md.uv[i * 2], md.uv[i * 2 + 1]));
  }
  for (let t = 0; t < md.idx.length; t += 3) {
    b.material(md.mat[t / 3]); b.smooth(md.smooth[t / 3] === 1);
    b.tri(idx[md.idx[t]], idx[md.idx[t + 1]], idx[md.idx[t + 2]]);
  }
}
if (workerData.floorY !== null && workerData.floorY !== undefined) {
  const fy = workerData.floorY;
  b.material(mats.length); b.smooth(false);
  const N = 20, ext = 3.0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x0 = -ext + (2 * ext * i) / N, x1 = -ext + (2 * ext * (i + 1)) / N;
    const z0 = -ext + (2 * ext * j) / N, z1 = -ext + (2 * ext * (j + 1)) / N;
    const n = v3(0, 1, 0);
    const a = b.vertex(v3(x0, fy, z0), n, 0, 0), c = b.vertex(v3(x1, fy, z0), n, 1, 0), d = b.vertex(v3(x1, fy, z1), n, 1, 1), e = b.vertex(v3(x0, fy, z1), n, 0, 1);
    b.quad(a, c, d, e);
  }
  mats.push(makeMaterial({ name: 'floor', baseColor: workerData.floorColor ?? [0.055, 0.052, 0.05], metallic: 0, roughness: 0.5 }));
}
const mesh = b.build();
const scene = new Scene(mesh);
scene.build(4);
const TW2=Date.now();
const env = new Environment(workerData.studio);
const cam = workerData.cam;
const ctx = { scene, env, mats, maxDepth: workerData.maxDepth, blackBg: workerData.blackBg, misEnv: true, pixelAngle: (Math.tan((cam.fovY * Math.PI) / 180 / 2) * 2) / H };
const opt = { maxDepth: workerData.maxDepth, russianRouletteStart: workerData.rrStart, clampRadiance: workerData.clampRadiance ?? 40 };
const out = new Float32Array(3);
const aux = { albedo: new Float32Array(3), normal: new Float32Array(3), depth: new Float32Array(1) };
const nh = y1 - y0;
const color = new Float32Array(nh * W * 3);
const albedoBuf = new Float32Array(nh * W * 3);
const normalBuf = new Float32Array(nh * W * 3);
const depthBuf = new Float32Array(nh * W);
for (let yy = 0; yy < nh; yy++) {
  const y = y0 + yy;
  for (let x = 0; x < W; x++) {
    let r = 0, g = 0, bl = 0;
    for (let s = 0; s < SPP; s++) {
      const rng = new Rng((x * 73856093) ^ (y * 19349663) ^ (s * 83492791) ^ 0x9e3779b9 ^ (workerData.seedOffset | 0));
      renderSample(ctx, cam, x, y, W, H, rng, opt, out, aux, { i: s, n: SPP });
      r += out[0]; g += out[1]; bl += out[2];
    }
    const i = (yy * W + x) * 3;
    color[i] = r / SPP; color[i + 1] = g / SPP; color[i + 2] = bl / SPP;
    albedoBuf[i] = aux.albedo[0]; albedoBuf[i + 1] = aux.albedo[1]; albedoBuf[i + 2] = aux.albedo[2];
    normalBuf[i] = aux.normal[0]; normalBuf[i + 1] = aux.normal[1]; normalBuf[i + 2] = aux.normal[2];
    depthBuf[yy * W + x] = aux.depth[0];
  }
}
const TW3=Date.now();
if (y0===0) console.error(`worker: assets ${TW1-TW0}ms scene ${TW2-TW1}ms trace ${TW3-TW2}ms samples ${nh*W*SPP} | rays/sample: int ${(RAYSTATS.intersect/(nh*W*SPP)).toFixed(1)} occ ${(RAYSTATS.occluded/(nh*W*SPP)).toFixed(1)} nodes/int ${(RAYSTATS.nodes/RAYSTATS.intersect).toFixed(0)} tris/int ${(RAYSTATS.tris/RAYSTATS.intersect).toFixed(0)}`);
parentPort.postMessage({ y0, y1, color, albedoBuf, normalBuf, depthBuf, tris: scene.numTri });
