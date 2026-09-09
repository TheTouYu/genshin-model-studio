/**
 * 亮屏桌面组件（可拆分）—— 布局生成器（纯数据，无引擎依赖）
 *
 * 坐标系：屏幕活动区局部坐标，原点 = 活动区左下角，x 向右、y 向上，单位米。
 * 屏幕活动区 = 0.3024 × 0.1964 m（14" MBP 3024×1964 @254ppi → 1px = 0.1mm = 1e-4 m）。
 *
 * 真实 macOS 比例（1pt = 2px = 0.2mm）：菜单栏 24pt=4.8mm｜Dock 图标 48pt=9.6mm｜Dock 高 64pt=12.8mm
 *   窗口标题栏 28pt=5.6mm｜交通灯 Ø12pt=2.4mm｜菜单字高 ≈2.6mm｜刘海 ≈40×6mm
 *
 * 引擎约束（源码实证）：
 *   - 平面 10009003 的轮廓抽稀阈值 = max(0.1px, 0.005 × 该笔画包围盒对角线)（src/draw/fitting.ts:14,16,47）
 *     → 矩形角点保留条件 ≈ 短边/长边 > 0.005（1:200）；与厚度无关。
 *   - 重叠件必须分 z 层：plate thick 0.0004 m、层间距 0.0005 m（层内不重叠则同层安全）。
 */

export const SCREEN = { w: 0.3024, h: 0.1964 };
export const THICK = 0.0004;   // 单块板厚
export const Z_STEP = 0.0005;  // 层间距
export const MIN_SHORT = 0.0022;  // 短边视觉下限（m）；引擎硬下限见 ASPECT_MAX
export const ASPECT_MAX = 200;    // 长边/短边 ≤ 200

const Z = { wallpaper: 0, chrome: 1, detail: 2, glyph: 3 };

const C = {
  wallpaper: ['#12325F', '#1E4E8C', '#2C6BB4', '#3E8BD6', '#58A8E6', '#74C2F2', '#8FD6F7'],
  menuBar: '#E9EFF7', menuInk: '#3A4657',
  dock: '#DCE6F2', dockSep: '#B4C2D6',
  winBase: '#F8FAFD', winTitle: '#E7EDF5', winSide: '#EFF4FA', winInk: '#5B6779',
  red: '#FF5F57', yellow: '#FEBC2E', green: '#28C840',
  thumb: ['#4C8DF6', '#F6A23C', '#3FBF6F', '#E8556D', '#9B6BE8', '#39C2D7', '#F2C744', '#6E7BF2'],
  cursor: '#FFFFFF', cursorEdge: '#1B2430', notch: '#0A0E14',
};

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex([r, g, b]) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}
function ramp(stops, t) {
  const p = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
  const a = hexToRgb(stops[i]), b = hexToRgb(stops[i + 1]);
  return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}
/** 两块的重叠面积（m²）；仅接触/坐标取整误差（<1e-6 m²）不算重叠 */
const OVERLAP_TOL = 1e-6; // m²（真重叠 ≥2.2mm×2.2mm = 4.8e-6 m²，不会漏检）
function overlapArea(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const area = ox > 0 && oy > 0 ? ox * oy : 0;
  return area > OVERLAP_TOL ? area : 0;
}

/**
 * 生成桌面组件。
 * tier: 'minimal'（≈40 件）| 'standard'（≈90 件）| 'full'（≈150 件，含窗口）
 */
export function buildScreenUI(opts = {}) {
  const tier = opts.tier || 'full';
  const withWindow = tier === 'full';
  const withGlyphs = tier !== 'minimal';
  const withMenuText = tier !== 'minimal';
  const withCursor = tier === 'full';
  const bands = opts.bands || (tier === 'full' ? 96 : tier === 'standard' ? 48 : 24);
  const dockIcons = opts.dockIcons || 12;

  const { w: SW, h: SH } = SCREEN;
  const q = [];
  const zOf = (layer) => +(layer * Z_STEP + THICK / 2).toFixed(5);
  const add = (x, y, w, h, color, layer, role) => {
    const long = Math.max(w, h), short = Math.min(w, h);
    if (short < MIN_SHORT - 1e-9) throw new Error(`短边过小：${short.toFixed(4)} m < ${MIN_SHORT}（${role}）`);
    if (long / short > ASPECT_MAX) throw new Error(`长宽比超限：${(long / short).toFixed(0)}:1 > ${ASPECT_MAX}:1（${role}）`);
    q.push({ x: +x.toFixed(5), y: +y.toFixed(5), w: +w.toFixed(5), h: +h.toFixed(5), color, z: zOf(layer), layer, role });
  };

  // ── 1. 壁纸：对角渐变（竖带）──────────────────────────────────
  const bw = SW / bands;
  for (let i = 0; i < bands; i++) {
    add(i * bw, 0, bw + 1e-6, SH, ramp(C.wallpaper, i / (bands - 1)), Z.wallpaper, 'wallpaper');
  }

  // ── 2. 菜单栏 + 刘海 ─────────────────────────────────────────
  const mh = 0.0048, my = SH - mh;
  add(0, my, SW, mh, C.menuBar, Z.chrome, 'menubar');
  if (withMenuText) {
    let cx = 0.0040;
    add(cx, my + (mh - 0.0030) / 2, 0.0030, 0.0030, C.menuInk, Z.detail, 'menu-apple');
    cx += 0.0030 + 0.0040;
    for (const wd of [0.0080, 0.0100, 0.0070, 0.0090, 0.0080, 0.0120]) {
      add(cx, my + (mh - 0.0026) / 2, wd, 0.0026, C.menuInk, Z.detail, 'menu-item');
      cx += wd + 0.0035;
    }
    let rx = SW - 0.0040;
    add(rx - 0.0120, my + (mh - 0.0026) / 2, 0.0120, 0.0026, C.menuInk, Z.detail, 'menu-clock'); rx -= 0.0150;
    for (let i = 0; i < 4; i++) { add(rx - 0.0030, my + (mh - 0.0026) / 2, 0.0030, 0.0026, C.menuInk, Z.detail, 'menu-status'); rx -= 0.0060; }
  }
  add((SW - 0.0400) / 2, SH - 0.0060, 0.0400, 0.0060, C.notch, Z.detail, 'notch');

  // ── 3. Dock（11 应用 + 分隔线 + 废纸篓；同层内 glyph 两两不重叠）──
  const icon = 0.0096, gap = 0.0016, pad = 0.0032, dockH = 0.0128, dockY = 0.0032;
  const sepGap = 0.0050, sepH = 0.0022;
  const dockW = 12 * icon + 10 * gap + sepGap + 2 * pad; // 0.1426
  const dockX = (SW - dockW) / 2;
  add(dockX, dockY, dockW, dockH, C.dock, Z.chrome, 'dock');
  const iy = dockY + (dockH - icon) / 2;
  add(dockX + pad + 11 * icon + 10 * gap + (sepGap - sepH) / 2, dockY + (dockH - sepH) / 2, sepH, sepH, C.dockSep, Z.detail, 'dock-sep');

  // 每个图标：1 块底 + 若干 glyph（相对比例 0..1；同图标内两两不重叠；短边 <2.2mm 自动省略）
  const ICONS = [
    { name: 'Finder', base: '#FFFFFF', glyph: [[0, 0, 0.50, 1.00, '#2E7CF6'], [0.54, 0.44, 0.23, 0.23, '#1B2430'], [0.77, 0.44, 0.23, 0.23, '#1B2430']] },
    { name: 'Launchpad', base: '#E9EEF5', glyph: [[0.16, 0.52, 0.30, 0.30, '#7A8794'], [0.54, 0.52, 0.30, 0.30, '#7A8794'], [0.16, 0.16, 0.30, 0.30, '#7A8794'], [0.54, 0.16, 0.30, 0.30, '#7A8794']] },
    { name: 'Safari', base: '#F2F6FA', glyph: [[0.10, 0.66, 0.80, 0.24, '#1B84E8'], [0.10, 0.10, 0.80, 0.24, '#1B84E8'], [0.10, 0.34, 0.24, 0.32, '#1B84E8'], [0.66, 0.34, 0.24, 0.32, '#1B84E8'], [0.34, 0.34, 0.32, 0.32, '#E8483F']] },
    { name: 'Mail', base: '#1B84E8', glyph: [[0.12, 0.28, 0.76, 0.44, '#FFFFFF']] },
    { name: 'Maps', base: '#E8F0E6', glyph: [[0.12, 0.12, 0.40, 0.76, '#3FBF6F'], [0.52, 0.12, 0.36, 0.76, '#FFFFFF']] },
    { name: 'Messages', base: '#34C759', glyph: [[0.14, 0.34, 0.72, 0.46, '#FFFFFF'], [0.24, 0.16, 0.24, 0.18, '#FFFFFF']] },
    { name: 'Photos', base: '#FFFFFF', glyph: [[0.16, 0.54, 0.30, 0.30, '#FF9F0A'], [0.54, 0.54, 0.30, 0.30, '#FF375F'], [0.16, 0.16, 0.30, 0.30, '#AF52DE'], [0.54, 0.16, 0.30, 0.30, '#30D158']] },
    { name: 'Calendar', base: '#FFFFFF', glyph: [[0, 0.66, 1.00, 0.34, '#FF3B30'], [0.30, 0.16, 0.40, 0.34, '#8A94A6']] },
    { name: 'Notes', base: '#FFD60A', glyph: [[0.14, 0.62, 0.72, 0.14, '#FFFFFF'], [0.14, 0.38, 0.72, 0.14, '#FFFFFF'], [0.14, 0.14, 0.44, 0.14, '#FFFFFF']] },
    { name: 'Music', base: '#FC3C44', glyph: [[0.16, 0.18, 0.26, 0.26, '#FFFFFF'], [0.44, 0.18, 0.12, 0.66, '#FFFFFF'], [0.56, 0.66, 0.26, 0.18, '#FFFFFF']] },
    { name: 'AppStore', base: '#1B84E8', glyph: [[0.12, 0.16, 0.24, 0.68, '#FFFFFF'], [0.64, 0.16, 0.24, 0.68, '#FFFFFF'], [0.36, 0.28, 0.28, 0.24, '#FFFFFF']] },
    { name: 'Trash', base: '#C7CDD6', glyph: [[0.20, 0.68, 0.60, 0.14, '#6E7276'], [0.26, 0.20, 0.48, 0.44, '#6E7276']] },
  ];
  for (let i = 0; i < 12; i++) {
    const ix = dockX + pad + i * (icon + gap) + (i >= 11 ? sepGap - gap : 0);
    const ic = ICONS[i];
    add(ix, iy, icon, icon, ic.base, Z.detail, 'dock-icon');
    if (withGlyphs) {
      const placed = [];
      for (const [gx, gy, gw, gh, gc] of ic.glyph) {
        const w = gw * icon, h = gh * icon;
        if (Math.min(w, h) < MIN_SHORT - 1e-9) continue; // 过小 glyph 省略
        const r = { x: ix + gx * icon, y: iy + gy * icon, w, h };
        for (const p of placed) {
          if (overlapArea(r, p) > 1e-9) throw new Error(`图标 ${ic.name} 内 glyph 重叠：${overlapArea(r, p).toExponential(2)} m²`);
        }
        placed.push(r);
        add(r.x, r.y, w, h, gc, Z.glyph, 'dock-glyph');
      }
    }
  }

  // ── 4. 窗口 ─────────────────────────────────────────────────
  if (withWindow) {
    const wx = 0.0300, wy = 0.0560, ww = 0.1400, wh = 0.0900;
    const tb = 0.0056, side = 0.0220;
    add(wx, wy, ww, wh, C.winBase, Z.chrome, 'win-base');
    add(wx, wy + wh - tb, ww, tb, C.winTitle, Z.detail, 'win-titlebar');
    const tly = wy + wh - tb + (tb - 0.0024) / 2;
    [C.red, C.yellow, C.green].forEach((col, i) => add(wx + 0.0048 + i * 0.0044, tly, 0.0024, 0.0024, col, Z.glyph, 'win-light'));
    add(wx + ww / 2 - 0.0110, wy + wh - tb + (tb - 0.0026) / 2, 0.0220, 0.0026, C.winInk, Z.glyph, 'win-title');
    add(wx, wy, side, wh - tb, C.winSide, Z.detail, 'win-sidebar');
    for (let i = 0; i < 6; i++) add(wx + 0.0028, wy + wh - tb - 0.0092 - i * 0.0092, side - 0.0056, 0.0028, C.winInk, Z.glyph, 'win-sidebar-item');
    const gx = wx + side + 0.0040, gy = wy + 0.0040;
    const cw = (ww - side - 0.0080 - 4 * 0.0022) / 5, ch = (wh - tb - 0.0080 - 2 * 0.0022) / 3;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      add(gx + c * (cw + 0.0022), gy + r * (ch + 0.0022), cw, ch, C.thumb[(r * 5 + c) % C.thumb.length], Z.glyph, 'win-thumb');
    }
    add(wx + ww - 0.0026, wy + 0.0040, 0.0022, wh - tb - 0.0080, '#C9D3E2', Z.glyph, 'win-scrollbar');
  }

  // ── 5. 光标（放在桌面空白处，避开窗口/缩略图）───────────────
  if (withCursor) {
    add(0.2000, 0.1300, 0.0024, 0.0052, C.cursor, Z.glyph, 'cursor-body');
    add(0.2024, 0.1300, 0.0024, 0.0024, C.cursorEdge, Z.glyph, 'cursor-tail');
  }

  // ── 6. 自检：同层不得重叠（同 z 共面 → z-fighting）────────────
  const layers = new Map();
  for (const it of q) {
    if (!layers.has(it.z)) layers.set(it.z, []);
    layers.get(it.z).push(it);
  }
  for (const [z, list] of layers) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = overlapArea(list[i], list[j]);
        if (a > 0) throw new Error(`同层重叠 z=${z}: ${list[i].role} ∩ ${list[j].role} = ${a.toExponential(2)} m²`);
      }
    }
  }

  const byLayer = {};
  for (const it of q) byLayer[it.role] = (byLayer[it.role] || 0) + 1;
  return { quads: q, stats: { tier, total: q.length, byRole: byLayer, maxZ: Math.max(...q.map((i) => i.z)), screen: SCREEN } };
}

/** 映射到世界坐标：屏幕局部 (u,v) → 上盖内表面（开合角 angleDeg，枢轴在铰链）
 *  上盖方向 u=(0,sinθ,cosθ)，屏幕法线 n=(0,−cosθ,sinθ)（θ=开合角；θ=100° 时上盖后仰 10°） */
export function toWorld(local, { hingeZ = -0.1000, hingeY = 0.0115, angleDeg = 100, centerX = 0, vOffset = 0.0096 } = {}) {
  const t = (angleDeg * Math.PI) / 180;
  const sin = Math.sin(t), cos = Math.cos(t);
  const n = lidNormal(angleDeg);
  return local.map((it) => {
    const u = centerX + (it.x + it.w / 2) - SCREEN.w / 2;  // part('quad') 的 x/y/z = 该块中心
    const v = vOffset + (it.y + it.h / 2);                  // 活动区下沿距铰链 9.6mm（屏顶 v=0.2060 → y=0.2144）
    return {
      ...it,
      x: u,
      y: hingeY + v * sin - it.z * cos,
      z: hingeZ + v * cos + it.z * sin,
      normal: n,
    };
  });
}

/** 上盖内表面法线（世界坐标），供 gms.part('quad') 的 normal 参数使用 */
export function lidNormal(angleDeg = 100) {
  const t = (angleDeg * Math.PI) / 180;
  return [0, +(-Math.cos(t)).toFixed(6), +Math.sin(t).toFixed(6)];
}

if (process.argv[1] && process.argv[1].endsWith('screen-ui-layout.mjs')) {
  for (const tier of ['minimal', 'standard', 'full']) {
    const r = buildScreenUI({ tier });
    console.log(tier.padEnd(9), 'items=' + String(r.stats.total).padStart(4), 'maxZ=' + r.stats.maxZ);
  }
}
