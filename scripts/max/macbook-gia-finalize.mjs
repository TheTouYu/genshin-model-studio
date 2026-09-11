
/**
 * macbook-gia-finalize.mjs — .gia 交付收尾（零自创格式）：
 *   1) 空跑对照：用 export-mesh 写出的 structure.json 重编码 .gia，必须与 CLI 产出**逐字节相同**
 *      （证明本脚本没有自创格式，走的是 encodeGia + makeGiaInput 同一路径）
 *   2) 透明度通道：把指定 rgb 的 item 的 color.opacity 改写（docs/gia-format.md:170 = 0-100 浮点）
 *   3) 用同一路径重编码 .gia / .gil，并重跑 auditExport 写 QA 报告
 *
 * 用法：node scripts/max/macbook-gia-finalize.mjs [--dir delivery/macbook-gia] [--name macbook-pro-14-silver-open]
 *        [--glass-rgb 0x151516 --glass-opacity 12] [--nulltest-only]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { encodeGia } from '../../dist/src/gia/gia-encoder.js';
import { makeGiaInput } from '../../dist/src/cli/gia-common.js';
import { encodeStructure } from '../../dist/src/core/encoder.js';
import { auditExport, formatQaMarkdown } from '../../dist/src/qa/export-qa.js';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const dir = arg('dir', 'delivery/macbook-gia');
const name = arg('name', 'macbook-pro-14-silver-open');
const glassRgb = parseInt(arg('glass-rgb', '0x151516'));
const glassOpacity = Number(arg('glass-opacity', '12'));
const nullTestOnly = argv.includes('--nulltest-only');
const ROOT_SCALE = 0.1, OVERALL_SCALE = 1;

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const structPath = path.join(dir, `${name}.structure.json`);
const giaPath = path.join(dir, `${name}.gia`);
const gilPath = path.join(dir, `${name}.gil`);

const structure = JSON.parse(readFileSync(structPath, 'utf8'));
console.log(`structure items = ${structure.items.length}`);

// --- 1) 空跑对照 ---------------------------------------------------------
const before = readFileSync(giaPath);
const re = Buffer.from(encodeGia(makeGiaInput(name, structure.items, { rootScale: ROOT_SCALE, overallScale: OVERALL_SCALE })));
const same = sha(re) === sha(before);
console.log(`null-test: CLI gia sha256 = ${sha(before)}`);
console.log(`null-test: re-encode sha256 = ${sha(re)}`);
console.log(`null-test: ${same ? 'PASS 逐字节相同（未自创格式）' : 'FAIL 与 CLI 产出不同 —— 中止'} `);
if (!same) process.exit(1);
if (nullTestOnly) process.exit(0);

// --- 2) 透明度通道 -------------------------------------------------------
const hist = new Map();
for (const it of structure.items) {
  const rgb = it.color?.rgb;
  hist.set(rgb, (hist.get(rgb) ?? 0) + 1);
}
console.log('rgb histogram (top 14):');
[...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
  .forEach(([rgb, n]) => console.log(`  0x${(rgb ?? 0).toString(16).padStart(6, '0')}  ${n}`));

let patched = 0;
for (const it of structure.items) {
  if (it.color && it.color.rgb === glassRgb) { it.color.opacity = glassOpacity; patched++; }
}
console.log(`opacity channel: rgb 0x${glassRgb.toString(16)} → ${glassOpacity} on ${patched} items`);

// --- 3) 重编码 + QA -----------------------------------------------------
const gia2 = Buffer.from(encodeGia(makeGiaInput(name, structure.items, { rootScale: ROOT_SCALE, overallScale: OVERALL_SCALE })));
writeFileSync(giaPath, gia2);
console.log(`wrote ${giaPath} (${gia2.length} bytes) sha256=${sha(gia2)}`);

try {
  const gil2 = Buffer.from(encodeStructure(structure));
  writeFileSync(gilPath, gil2);
  console.log(`wrote ${gilPath} (${gil2.length} bytes) sha256=${sha(gil2)}`);
} catch (e) {
  console.log(`gil re-encode skipped: ${e.message}`);
}


// --- 4) 回写 structure.json（带 opacity）+ 补全 summary.json -----------------
writeFileSync(structPath, JSON.stringify(structure, null, 2) + '\n');
console.log(`wrote ${structPath} (patched structure)`);

const countRgb = (rgb) => structure.items.filter((it) => it.color && it.color.rgb === rgb).length;
const summPath = path.join(dir, `${name}.summary.json`);
const summ = JSON.parse(readFileSync(summPath, 'utf8'));
const gilBytes = (() => { try { return readFileSync(gilPath); } catch { return null; } })();
summ.output = {
  ...summ.output,
  giaSize: gia2.length, giaSha256: sha(gia2),
  ...(gilBytes ? { gilSize: gilBytes.length, gilSha256: sha(gilBytes) } : {}),
  structureSize: readFileSync(structPath).length,
  postProcessed: 'macbook-gia-finalize.mjs（opacity 通道回写 + 同路径重编码；空跑对照与 CLI 产出逐字节相同）'
};
summ.opacityChannel = {
  format: 'docs/gia-format.md:170 — 颜色记录 32.4 = opacity（0-100 浮点，100=不透明）',
  applied: { rgb: '0x' + glassRgb.toString(16), items: patched, opacity: glassOpacity },
  rationale: '屏幕前玻璃 M.GLASS 用 opacity 表达透光；教室管线口径 0.085-0.2（小数）换算到 0-100 口径 = 8.5-20，取中值 12',
  unverified: '仓库既有 delivery 无任何 structure.json 用过非 100 的 opacity（classroom v1/v12/v13、ganyu 系列全 100）→ 该值域在真机未验证，首次进游戏请复核',
  keptOpaque: [
    { part: '屏幕活动区', rgb: '0x191919', items: countRgb(0x191919), note: '显示器本体，不透明；见 selfIlluminationCandidates' },
    { part: '触控板玻璃', rgb: '0x909093', items: countRgb(0x909093), note: '真机与掌托共面且不透光，保持 100' },
    { part: '端口腔体/内舌', rgb: '0x1d1d1e', items: countRgb(0x1d1d1e), note: '腔体内部的暗面，不透明' }
  ]
};
summ.renderOnlyAppearance = [
  '键帽字标：web/draw/kb-legends.png（字母/符号/方向键/F1-F12）—— .gia 只有逐面 color，无贴图与 UV',
  '屏幕内容：web/draw/screen-ui.png（亮屏桌面）—— .gia 无贴图通道',
  '底盖激光刻蚀：web/draw/bottom-etch.png（MacBook Pro / Model A2918 / 法规行 / 认证标记）',
  '材质参数：metalness / roughness / clearcoat / clearcoatRoughness / envMapIntensity —— 页面 PBR 分支专属（web/draw/photo.html 的 makeMat）',
  '环境光照：程序化影棚 cubemap + PMREM、三盏平行光、软箱尺寸 —— 渲染侧专属',
  '后处理：景深 DOF / 径向色散 / 暗角 / 传感器噪声 / ACES 色调映射 / 2× 超采样',
  '接触阴影与倒影：web/draw/shadow-mask.png + 镜像副本（reflGroup）',
  '连续倒角的镜面高光带（mirror shine）在 .gia 里退化为相邻面的 color 分界（逐面颜色无曲率信息）'
];
summ.selfIlluminationCandidates = [
  { part: '屏幕活动区', rgb: '0x191919', items: countRgb(0x191919), note: '主候选：游戏侧配置实体自发光即可亮屏；本 .gia 不含发光位（保持不透明）' },
  { part: '键盘背光/字标', rgb: '0x1d1d1f', items: countRgb(0x1d1d1f), note: '次选：字标仅存在于渲染侧贴图，需游戏侧贴图支持才能透光' },
  { part: 'Touch ID 环 / 摄像头孔', rgb: '0x0b0b0c', items: countRgb(0x0b0b0c), note: '可选装饰发光，当前按深色不透明处理' }
];
writeFileSync(summPath, JSON.stringify(summ, null, 2) + '\n');
console.log(`wrote ${summPath} (opacityChannel + renderOnlyAppearance + selfIlluminationCandidates)`);

const qa = auditExport(dir, { name });
writeFileSync(path.join(dir, `${name}.qa.json`), JSON.stringify(qa, null, 2) + '\n');
writeFileSync(path.join(dir, `${name}.qa.md`), formatQaMarkdown(qa) + '\n');
console.log(`qa=${qa.ok ? 'ok' : 'failed'}${qa.ok ? '' : '\n  ' + qa.failures.join('\n  ')}`);
