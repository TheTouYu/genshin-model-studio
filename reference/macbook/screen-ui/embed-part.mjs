/**
 * 把 screen-ui-layout.mjs（唯一真源）内联成可直接被 run-gms-parts.sh 执行的 part 脚本。
 * 用法：node reference/macbook/screen-ui/embed-part.mjs
 * 产物：scripts/parts/laptop-screen-ui.js（勿手改；改布局请改 screen-ui-layout.mjs 后重跑）
 */
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('./screen-ui-layout.mjs', import.meta.url), 'utf8')
  .replace(/^export /gm, '')                       // 去掉 ESM 导出，内联为函数声明
  .replace(/^if \(process\.argv\[1\][\s\S]*?\n\}\n/m, ''); // 去掉 CLI 自测块

const out = `/* ⚠ 自动生成，勿手改 —— 真源 reference/macbook/screen-ui/screen-ui-layout.mjs
 * 重新生成：node reference/macbook/screen-ui/embed-part.mjs
 *
 * laptop-screen-ui.js — 亮屏桌面组件（可拆分）
 * 屏幕活动区 302.4×196.4mm 内铺 macOS 桌面（壁纸渐变 + 菜单栏 + 刘海 + Dock + 窗口 + 光标）。
 * 运行：先把浏览器切到 http://localhost:8787 建模页，再
 *   bash scripts/run-gms-parts.sh <out> scripts/parts/laptop-screen-ui.js
 */
${src}
(function () {
  var TIER = 'full';          // 'minimal'(40) | 'standard'(103) | 'full'(182)
  var ANGLE = 100;            // 上盖开合角（度）
  var HINGE = { y: 0.0115, z: -0.1000 };  // 铰链枢轴（与骨架一致）
  var gms = window.gms;
  var built = buildScreenUI({ tier: TIER });
  var world = toWorld(built.quads, { hingeY: HINGE.y, hingeZ: HINGE.z, angleDeg: ANGLE });
  var n = lidNormal(ANGLE);
  for (var i = 0; i < world.length; i++) {
    var it = world[i];
    gms.part('quad', {
      x: it.x, y: it.y, z: it.z, w: it.w, h: it.h,
      thick: THICK, normal: n, color: it.color,
    });
  }
  return { part: 'screen-ui', tier: TIER, items: world.length, maxZ: built.stats.maxZ, normal: n };
})();
`;

const target = new URL('../../../scripts/parts/laptop-screen-ui.js', import.meta.url);
writeFileSync(target, out);
console.log('wrote', target.pathname, out.length, 'bytes');
