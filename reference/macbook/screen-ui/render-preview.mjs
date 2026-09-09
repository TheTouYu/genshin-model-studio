/**
 * 亮屏桌面组件 —— 预览渲染器（生成 preview-*.html，再用 headless chromium 截图为 PNG）
 * 用法：node render-preview.mjs && chromium --headless ... --screenshot=preview-full.png file://.../preview-full.html
 */
import { writeFileSync } from 'node:fs';
import { buildScreenUI, SCREEN, THICK, Z_STEP } from './screen-ui-layout.mjs';

const PX_PER_M = 6;
const W = Math.round(SCREEN.w * 1000 * PX_PER_M);
const H = Math.round(SCREEN.h * 1000 * PX_PER_M);

function page(tier) {
  const { quads, stats } = buildScreenUI({ tier });
  const html = `<!doctype html><meta charset="utf-8"><title>screen-ui-${tier}</title>
<style>html,body{margin:0;background:#1b1f24}canvas{display:block;margin:24px auto;box-shadow:0 18px 60px rgba(0,0,0,.6);border-radius:14px}</style>
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
const Q = ${JSON.stringify(quads)}, SW = ${SCREEN.w}, SH = ${SCREEN.h}, S = ${PX_PER_M} * 1000;
const ctx = document.getElementById('c').getContext('2d');
ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, ${W}, ${H});
for (const q of Q) {
  ctx.fillStyle = q.color;
  ctx.fillRect(Math.round(q.x * S), Math.round((SH - q.y - q.h) * S), Math.ceil(q.w * S), Math.ceil(q.h * S));
}
document.title = 'screen-ui-${tier} | quads=' + Q.length;
</script>`;
  return { html, stats };
}

for (const tier of ['minimal', 'standard', 'full']) {
  const p = page(tier);
  writeFileSync(new URL(`./preview-${tier}.html`, import.meta.url), p.html);
  console.log(tier.padEnd(9), JSON.stringify(p.stats));
}
console.log('canvas:', W, 'x', H, '| thick', THICK, '| zStep', Z_STEP);
