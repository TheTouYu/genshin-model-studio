// Ferris wheel ROUND5 v2 修复版：组件连接图设计 + 角色分离（用户方案落地）
// 受力链（连续、每对连接点实体接触）：
//   地面 → 支架杆(4) → 轮毂轴盘 → 轮辐(6, [30,90,150,210,270,330])
//   → 结构横杆(6, 同角度, z向, 两端插环, 承接轮辐) → 双环
//   → 悬挂横杆(6, [0,60,120,180,240,300], z向, 两端插环——自身有支撑不悬空)
//   → 绳索(6) → 座舱(6)
// 角色分离：结构横杆（承接轮辐+连两环）与悬挂横杆（挂绳索）角度错开 30°，
//   任何转动角度下悬挂系（绳索/座舱）与结构系（轮辐/结构横杆/轮）都不重叠。
// 绳索两端：上端插入悬挂横杆下表面 0.005，下端深插座舱顶 0.02（覆盖渲染语义差）。
gms.clear();

var R = 0.75;          // 轮半径
var H = 1.25;          // 轮心高度
var ringZ = 0.12;      // 环面 z 偏移（环管径 0.025 → 内面 z=±0.1075）

// ============ 1. 双环 ============
gms.part('ring', { x: 0, y: H, z: -ringZ, r: R, size: 0.025, color: '#cc4444' });
gms.part('ring', { x: 0, y: H, z:  ringZ, r: R, size: 0.025, color: '#cc4444' });

// ============ 2. 轮毂轴盘（z 向，两端伸到支架接触面） ============
gms.part('disc', { x: 0, y: H, z: 0, r: 0.055, thick: 0.42, axis: 'front', color: '#bbbbbb' });

// ============ 3. 支架：四根斜撑（地面 → 轮轴两端） ============
// 底端贴地 x=±0.85，顶端 (0,H) z=±0.2225：杆半径 0.0125，内侧面贴轴端面 z=±0.21
var footX = 0.85;
gms.part('rod', { x1: -footX, y1: 0, x2: 0, y2: H, z: -0.2225, size: 0.025, color: '#888888' });
gms.part('rod', { x1:  footX, y1: 0, x2: 0, y2: H, z: -0.2225, size: 0.025, color: '#888888' });
gms.part('rod', { x1: -footX, y1: 0, x2: 0, y2: H, z:  0.2225, size: 0.025, color: '#888888' });
gms.part('rod', { x1:  footX, y1: 0, x2: 0, y2: H, z:  0.2225, size: 0.025, color: '#888888' });

// ============ 4. 结构系：轮辐 + 结构横杆（同角度 [30..330]） ============
var structAngs = [30, 90, 150, 210, 270, 330];
var rHub = 0.061;         // 轮辐内端半径 = 轴盘半径 0.055 + 轮辐半径 0.006（贴面）
var rSpoke = 0.738;       // 轮辐外端半径 = 结构横杆表面 R-0.020=0.730 再插入 0.008
var beamR = 0.020;        // 结构横杆半径（粗于轮辐，承担结构）
var beamLen = 0.235;      // 横杆长：z∈[-0.1175,+0.1175]，两端插入环内 0.010
for (var i = 0; i < 6; i++) {
  var a = structAngs[i] * Math.PI / 180;
  var px = Math.cos(a), py = Math.sin(a);
  // 轮辐：轮毂外缘 → 结构横杆（外端插入横杆侧面 0.008）
  gms.part('rod', {
    x1: px * rHub, y1: H + py * rHub,
    x2: px * rSpoke, y2: H + py * rSpoke,
    z: 0, size: 0.012, color: '#999999'
  });
  // 结构横杆：z 向连接两环 + 承接轮辐（两端插入环内 0.010）
  gms.part('disc', { x: px * R, y: H + py * R, z: 0, r: beamR, thick: beamLen, axis: 'front', color: '#aaaaaa' });
}

// ============ 5. 悬挂系：悬挂横杆（错开 30°）+ 绳索 + 座舱 ============
var hangAngs = [0, 60, 120, 180, 240, 300];
var hBeamR = 0.012;       // 悬挂横杆半径（细杆，仅挂绳索；两端插环自身有支撑）
var ropeLen = 0.08;       // 绳索长
var cabinR = 0.10;        // 座舱半径（el-disc rx/ry → 导出圆柱直径 0.20）
var cabinH = 0.22;        // 座舱高（el-disc thick → 导出圆柱轴向长度 0.22）
for (var j = 0; j < 6; j++) {
  var b = hangAngs[j] * Math.PI / 180;
  var qx = Math.cos(b), qy = Math.sin(b);
  // 悬挂横杆：z 向，两端插环（与结构横杆错开 30°，互不干涉）
  gms.part('disc', { x: qx * R, y: H + qy * R, z: 0, r: hBeamR, thick: beamLen, axis: 'front', color: '#d0e0d0' });
  // 绳索：上端插入悬挂横杆下表面 0.005；下端深插座舱顶 0.02
  var ropeTopY = H + qy * R - hBeamR - 0.005;
  var ropeBotY = ropeTopY - ropeLen;
  gms.part('rod', { x1: qx * R, y1: ropeTopY, x2: qx * R, y2: ropeBotY, z: 0, size: 0.012, color: '#dddddd' });
  // 座舱：竖直（rotation:[0,0,0] 必须显式——el-disc 的 rotation 覆盖 axis 默认朝向）
  gms.part('el-disc', {
    x: qx * R, y: ropeBotY - 0.02 - cabinH / 2, z: 0,
    rx: cabinR, ry: cabinR, thick: cabinH, axis: 'front',
    rotation: [0, 0, 0], color: '#e8c060'
  });
}
