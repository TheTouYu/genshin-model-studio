// laptop-hinge.js —— 笔记本电脑（MacBook 式银灰极简）part：hinge（3 件）
// 自包含单文件（run-gms-parts.sh 直接在页面上下文执行；不依赖任何未注入的全局）。
// 规格来源：PROMPT-laptop-model.md §2（逐字复算）；方向语义见 exports/laptop/points.json conventions。
// 引擎事实（实测）：quad 的 w 沿局部 X、h 沿局部 Z、法线沿局部 Y；rotFromNormal(n)=[90+δ,90−φ,0]。
// window.__gmsNoClear=true 时不 clear（用于「全量装配 + 门禁复核」一次跑全部 part）。
;(function () {
  var G = window.gms
  if (!window.__gmsNoClear) G.clear()
  function q(s) { return G.part('quad', s) }
  // §2 开合姿态 转轴轴心 (0,0.0115,−0.1000) 轴沿 x，rod size 0.0040
  G.part('rod', {"x1":-0.152,"y1":0.0115,"x2":0.152,"y2":0.0115,"z":-0.1,"size":0.004,"color":"#8A8F96","name":"hinge_rod"})
  // §2 转轴 铰链盖 2（左端 x −0.1520…−0.1020，贴顶面）
  q({"x":-0.127,"y":0.012,"z":-0.1,"w":0.012,"h":0.05,"thick":0.001,"normal":[0,1,0],"color":"#8A8F96","name":"hinge_cover_left"})
  // §2 转轴 铰链盖 2（右端 x +0.1020…+0.1520，贴顶面）
  q({"x":0.127,"y":0.012,"z":-0.1,"w":0.012,"h":0.05,"thick":0.001,"normal":[0,1,0],"color":"#8A8F96","name":"hinge_cover_right"})
})()
