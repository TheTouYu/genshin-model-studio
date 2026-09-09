// laptop-v2-hinge.js —— 笔记本 v2（细节升级版）part：hinge（12 件）
// 自包含单文件（run-gms-parts.sh 直接在页面上下文执行；不依赖任何未注入的全局）。
// 规格来源：PROMPT-laptop-detail.md D1–D10 + PROMPT-laptop-model.md §2（坐标逐字沿用）。
// 引擎事实（本轮实测）：quad 的 w 沿局部 X、h 沿局部 Z、法线沿局部 Y；rotFromNormal(n)=[90+δ,90−φ,0]；
//   RDP 存活条件 min(w,h) > max(0.0002174, 0.005×hypot(w,h))（460px=1m）；poly 3D 折线端到端存活。
// window.__gmsNoClear=true 时不 clear（用于「全量装配 + 门禁复核」一次跑全部 part）。
;(function () {
  var G = window.gms
  if (!window.__gmsNoClear) G.clear()
  function q(s) { return G.part('quad', s) }
  // D6 转轴 第 1/6 段（rod size 0.0040，段间 0.0008）
  G.part('rod', {"x1":-0.152,"y1":0.0115,"x2":-0.102,"y2":0.0115,"z":-0.1,"size":0.004,"color":"#8A8F96","name":"hinge_rod_0"})
  // D6 转轴 第 2/6 段（rod size 0.0040，段间 0.0008）
  G.part('rod', {"x1":-0.1012,"y1":0.0115,"x2":-0.0512,"y2":0.0115,"z":-0.1,"size":0.004,"color":"#8A8F96","name":"hinge_rod_1"})
  // D6 转轴 第 3/6 段（rod size 0.0040，段间 0.0008）
  G.part('rod', {"x1":-0.0504,"y1":0.0115,"x2":-0.0004,"y2":0.0115,"z":-0.1,"size":0.004,"color":"#8A8F96","name":"hinge_rod_2"})
  // D6 转轴 第 4/6 段（rod size 0.0040，段间 0.0008）
  G.part('rod', {"x1":0.0004,"y1":0.0115,"x2":0.0504,"y2":0.0115,"z":-0.1,"size":0.004,"color":"#8A8F96","name":"hinge_rod_3"})
  // D6 转轴 第 5/6 段（rod size 0.0040，段间 0.0008）
  G.part('rod', {"x1":0.0512,"y1":0.0115,"x2":0.1012,"y2":0.0115,"z":-0.1,"size":0.004,"color":"#8A8F96","name":"hinge_rod_4"})
  // D6 转轴 第 6/6 段（rod size 0.0040，段间 0.0008）
  G.part('rod', {"x1":0.102,"y1":0.0115,"x2":0.152,"y2":0.0115,"z":-0.1,"size":0.004,"color":"#8A8F96","name":"hinge_rod_5"})
  // D6 铰链盖 left 顶面（离机身 0.0004 缝）
  q({"x":-0.127,"y":0.01195,"z":-0.1,"w":0.008,"h":0.05,"thick":0.0003,"normal":[0,1,0],"color":"#8A8F96","name":"hinge_cover_left"})
  // D6 铰链盖 left 前斜面
  q({"x":-0.127,"y":0.01185074,"z":-0.09501493,"w":0.05,"h":0.00200998,"thick":0.0003,"normal":[0,0.99503719,0.09950372],"color":"#8A8F96"})
  // D6 铰链盖 left 后斜面
  q({"x":-0.127,"y":0.01185074,"z":-0.10498507,"w":0.05,"h":0.00200998,"thick":0.0003,"normal":[0,0.99503719,-0.09950372],"color":"#8A8F96"})
  // D6 铰链盖 right 顶面（离机身 0.0004 缝）
  q({"x":0.127,"y":0.01195,"z":-0.1,"w":0.008,"h":0.05,"thick":0.0003,"normal":[0,1,0],"color":"#8A8F96","name":"hinge_cover_right"})
  // D6 铰链盖 right 前斜面
  q({"x":0.127,"y":0.01185074,"z":-0.09501493,"w":0.05,"h":0.00200998,"thick":0.0003,"normal":[0,0.99503719,0.09950372],"color":"#8A8F96"})
  // D6 铰链盖 right 后斜面
  q({"x":0.127,"y":0.01185074,"z":-0.10498507,"w":0.05,"h":0.00200998,"thick":0.0003,"normal":[0,0.99503719,-0.09950372],"color":"#8A8F96"})
})()
