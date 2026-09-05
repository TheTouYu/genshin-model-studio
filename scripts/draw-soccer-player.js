/**
 * draw-soccer-player.js — gms 组件脚本：精美足球运动员（基础元件拼装）
 *
 * 说明：
 *  - 世界坐标：x 左右（米，0=模型中心）、y 高度（米，0=地面）、z 前后（米，0=正面）。
 *  - 全部用 window.gms.part 逐组件声明（rod/disc/el-disc/ring/plate/sphere），带 name 登记；
 *    然后 gms.link 声明受力连接（硬校验实体接触，未接触抛错带间隙），
 *    最后 gms.verify() 一键总检：{ok, links, floating, collides}，ok=false 直接抛错。
 *  - 姿态：站立带球（右脚触球），左脚支撑；足球 = 球体(10009002) + 深色轮廓环 + 黑色五边形块。
 *  - 基础元件：球体 10009002（头/头发/足球）、圆柱 10009008（躯干/短裤/靴/五官/球衣徽）、
 *    杆圆柱（四肢）、环管（足球环）、板（草皮）。
 */
/* 确保生成参数为圆柱杆（默认示例可能把 shape 切成 box，rod 会变方杆） */
(function () {
  var sh = document.getElementById('shape');
  if (sh && sh.value !== 'cylinder') {
    sh.value = 'cylinder';
    sh.dispatchEvent(new Event('change', { bubbles: true }));
  }
})();
window.gms.mode('extrude');
window.gms.clear();

/* ---------- 地面草皮（水平薄板） ---------- */
window.gms.part('plate', {
  name: 'pitch', x: 0.18, y: 0.002, z: 0,
  len: 0.86, wid: 0.52, thick: 0.004, color: '#2e7d32',
});

/* ---------- 球鞋（el-disc 水平椭圆靴） ---------- */
window.gms.part('el-disc', {
  name: 'leftBoot', x: -0.055, y: 0.016, z: 0,
  rx: 0.062, ry: 0.045, thick: 0.032,
  axis: 'up', rotation: [0, -8, 0], color: '#1a1f27',
});
window.gms.part('el-disc', {
  name: 'rightBoot', x: 0.15, y: 0.016, z: 0.02,
  rx: 0.075, ry: 0.045, thick: 0.032,
  axis: 'up', rotation: [0, -10, 0], color: '#1a1f27',
});

/* ---------- 小腿（白袜 rod） ---------- */
window.gms.part('rod', {
  name: 'leftShin', x1: -0.055, y1: 0.03, z: 0, x2: -0.065, y2: 0.30, z: -0.01,
  size: 0.052, color: '#f4f4f4',
});
window.gms.part('rod', {
  name: 'rightShin', x1: 0.15, y1: 0.03, z: 0.02, x2: 0.14, y2: 0.27, z: 0.015,
  size: 0.052, color: '#f4f4f4',
});

/* ---------- 大腿（肤色 rod） ---------- */
window.gms.part('rod', {
  name: 'leftThigh', x1: -0.065, y1: 0.30, z: -0.01, x2: -0.045, y2: 0.56, z: 0,
  size: 0.062, color: '#e8b184',
});
window.gms.part('rod', {
  name: 'rightThigh', x1: 0.14, y1: 0.27, z: 0.015, x2: 0.05, y2: 0.56, z: 0,
  size: 0.062, color: '#e8b184',
});

/* ---------- 短裤（深蓝椭圆柱） ---------- */
window.gms.part('el-disc', {
  name: 'shorts', x: 0, y: 0.585, z: 0,
  rx: 0.15, ry: 0.105, thick: 0.12,
  axis: 'up', color: '#20324d',
});

/* ---------- 球衣（红色椭圆柱躯干） ---------- */
window.gms.part('el-disc', {
  name: 'torso', x: 0, y: 0.805, z: 0,
  rx: 0.14, ry: 0.095, thick: 0.32,
  axis: 'up', color: '#d93848',
});
/* 球衣正面队徽（白圆贴在躯干前脸） */
window.gms.part('disc', {
  name: 'badge', x: -0.03, y: 0.83, z: 0.095,
  r: 0.022, thick: 0.004, axis: 'front', color: '#ffffff',
});

/* ---------- 手臂（上臂=球衣袖红，前臂=肤色） ---------- */
window.gms.part('rod', {
  name: 'upperArmL', x1: -0.125, y1: 0.93, z: 0, x2: -0.22, y2: 0.83, z: 0.03,
  size: 0.058, color: '#d93848',
});
window.gms.part('rod', {
  name: 'forearmL', x1: -0.22, y1: 0.83, z: 0.03, x2: -0.285, y2: 0.73, z: 0.05,
  size: 0.046, color: '#e8b184',
});
window.gms.part('rod', {
  name: 'upperArmR', x1: 0.125, y1: 0.93, z: 0, x2: 0.20, y2: 0.86, z: 0.02,
  size: 0.058, color: '#d93848',
});
window.gms.part('rod', {
  name: 'forearmR', x1: 0.20, y1: 0.86, z: 0.02, x2: 0.24, y2: 0.78, z: 0.04,
  size: 0.046, color: '#e8b184',
});

/* ---------- 头（球体）+ 头发（球体后倾）+ 五官 ---------- */
window.gms.part('sphere', {
  name: 'head', x: 0, y: 1.045, z: 0,
  r: 0.085, color: '#e8b184',
});
window.gms.part('sphere', {
  name: 'hair', x: 0, y: 1.08, z: -0.015,
  r: 0.088, color: '#4a2c17',
});
window.gms.part('disc', {
  name: 'eyeL', x: -0.028, y: 1.06, z: 0.078,
  r: 0.0075, thick: 0.004, axis: 'front', color: '#151515',
});
window.gms.part('disc', {
  name: 'eyeR', x: 0.028, y: 1.06, z: 0.078,
  r: 0.0075, thick: 0.004, axis: 'front', color: '#151515',
});
window.gms.part('disc', {
  name: 'mouth', x: 0, y: 1.012, z: 0.078,
  r: 0.010, thick: 0.003, axis: 'front', color: '#8a3a2a',
});

/* ---------- 足球（球体 + 轮廓环 + 正/侧面五边形块） ---------- */
window.gms.part('sphere', {
  name: 'ball', x: 0.27, y: 0.094, z: 0,
  r: 0.09, color: '#f6f6f6',
});
window.gms.part('ring', {
  name: 'ballRing', x: 0.27, y: 0.094, z: 0,
  r: 0.09, size: 0.006, color: '#1d1f24',
});
window.gms.part('disc', {
  name: 'ballPatchFront', x: 0.27, y: 0.094, z: 0.088,
  r: 0.028, thick: 0.004, axis: 'front', color: '#17181c',
});
window.gms.part('disc', {
  name: 'ballPatchSide', x: 0.359, y: 0.094, z: 0,
  r: 0.024, thick: 0.004, axis: 'side', color: '#17181c',
});

/* ---------- 受力链声明（硬校验：未接触立即抛错） ---------- */
window.gms.link('pitch', 'leftBoot', { support: 'b' });
window.gms.link('pitch', 'rightBoot', { support: 'b' });
window.gms.link('pitch', 'ball', { support: 'b' });
window.gms.link('leftBoot', 'leftShin', { support: 'b' });
window.gms.link('rightBoot', 'rightShin', { support: 'b' });
window.gms.link('leftShin', 'leftThigh', { support: 'b' });
window.gms.link('rightShin', 'rightThigh', { support: 'b' });
window.gms.link('leftThigh', 'shorts', { support: 'b' });
window.gms.link('rightThigh', 'shorts', { support: 'b' });
window.gms.link('shorts', 'torso', { support: 'b' });
window.gms.link('torso', 'upperArmL', { support: 'a' });
window.gms.link('torso', 'upperArmR', { support: 'a' });
window.gms.link('upperArmL', 'forearmL', { support: 'a' });
window.gms.link('upperArmR', 'forearmR', { support: 'a' });
window.gms.link('torso', 'head', { support: 'a' });
window.gms.link('head', 'hair', { support: 'a' });
window.gms.link('head', 'eyeL', { support: 'a' });
window.gms.link('head', 'eyeR', { support: 'a' });
window.gms.link('head', 'mouth', { support: 'a' });
window.gms.link('torso', 'badge', { support: 'a' });
window.gms.link('ball', 'ballRing', { support: 'a' });
window.gms.link('ball', 'ballPatchFront', { support: 'a' });
window.gms.link('ball', 'ballPatchSide', { support: 'a' });
window.gms.link('rightBoot', 'ball', { support: 'a' });

/* ---------- 一键总检（物理正确性门禁） ---------- */
var __v = window.gms.verify();
if (!__v.ok) {
  throw new Error('VERIFY_FAIL ' + JSON.stringify({
    floating: __v.floating, collides: __v.collides,
    badLinks: __v.links.filter(function (l) { return !l.contact; }),
  }));
}
