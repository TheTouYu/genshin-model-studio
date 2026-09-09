// laptop-trackpad.js —— 笔记本电脑（MacBook 式银灰极简）part：trackpad（5 件）
// 自包含单文件（run-gms-parts.sh 直接在页面上下文执行；不依赖任何未注入的全局）。
// 规格来源：PROMPT-laptop-model.md §2（逐字复算）；方向语义见 exports/laptop/points.json conventions。
// 引擎事实（实测）：quad 的 w 沿局部 X、h 沿局部 Z、法线沿局部 Y；rotFromNormal(n)=[90+δ,90−φ,0]。
// window.__gmsNoClear=true 时不 clear（用于「全量装配 + 门禁复核」一次跑全部 part）。
;(function () {
  var G = window.gms
  if (!window.__gmsNoClear) G.clear()
  function q(s) { return G.part('quad', s) }
  // §2 触控板 0.1300×0.0740 中心 (0,0.0115,+0.0570) 厚 0.0006
  q({"x":0,"y":0.0112,"z":0.057,"w":0.074,"h":0.13,"thick":0.0006,"normal":[0,1,0],"color":"#B9BEC6","name":"tp_face"})
  // §2 触控板 前侧壁（法线朝凹槽内；h 0.0010 见 engineFix）
  q({"x":0,"y":0.011,"z":0.0945,"w":0.13,"h":0.001,"thick":0.001,"normal":[0,0,-1],"color":"#B9BEC6"})
  // §2 触控板 后侧壁（法线朝凹槽内；h 0.0010 见 engineFix）
  q({"x":0,"y":0.011,"z":0.0195,"w":0.13,"h":0.001,"thick":0.001,"normal":[0,0,1],"color":"#B9BEC6"})
  // §2 触控板 左侧壁（法线朝凹槽内；h 0.0010 见 engineFix）
  q({"x":-0.0655,"y":0.011,"z":0.057,"w":0.074,"h":0.001,"thick":0.001,"normal":[1,0,0],"color":"#B9BEC6"})
  // §2 触控板 右侧壁（法线朝凹槽内；h 0.0010 见 engineFix）
  q({"x":0.0655,"y":0.011,"z":0.057,"w":0.074,"h":0.001,"thick":0.001,"normal":[-1,0,0],"color":"#B9BEC6"})
})()
