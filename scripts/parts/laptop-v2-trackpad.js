// laptop-v2-trackpad.js —— 笔记本 v2（细节升级版）part：trackpad（7 件）
// 自包含单文件（run-gms-parts.sh 直接在页面上下文执行；不依赖任何未注入的全局）。
// 规格来源：PROMPT-laptop-detail.md D1–D10 + PROMPT-laptop-model.md §2（坐标逐字沿用）。
// 引擎事实（本轮实测）：quad 的 w 沿局部 X、h 沿局部 Z、法线沿局部 Y；rotFromNormal(n)=[90+δ,90−φ,0]；
//   RDP 存活条件 min(w,h) > max(0.0002174, 0.005×hypot(w,h))（460px=1m）；poly 3D 折线端到端存活。
// window.__gmsNoClear=true 时不 clear（用于「全量装配 + 门禁复核」一次跑全部 part）。
;(function () {
  var G = window.gms
  if (!window.__gmsNoClear) G.clear()
  function q(s) { return G.part('quad', s) }
  // §2/D8 触控板 0.1300×0.0740（凹陷 0.0008，面 #B9BEC6）
  q({"x":0,"y":0.0104,"z":0.057,"w":0.074,"h":0.13,"thick":0.0006,"normal":[0,1,0],"color":"#B9BEC6","name":"tp_face"})
  // §2/D8 触控板 前侧壁（凹陷边框，h 0.0008）
  q({"x":-0.0325,"y":0.0111,"z":0.0945,"w":0.065,"h":0.0008,"thick":0.001,"normal":[0,0,-1],"color":"#ADB3BC"})
  // §2/D8 触控板 前侧壁（凹陷边框，h 0.0008）
  q({"x":0.0325,"y":0.0111,"z":0.0945,"w":0.065,"h":0.0008,"thick":0.001,"normal":[0,0,-1],"color":"#ADB3BC"})
  // §2/D8 触控板 后侧壁（凹陷边框，h 0.0008）
  q({"x":-0.0325,"y":0.0111,"z":0.0195,"w":0.065,"h":0.0008,"thick":0.001,"normal":[0,0,1],"color":"#ADB3BC"})
  // §2/D8 触控板 后侧壁（凹陷边框，h 0.0008）
  q({"x":0.0325,"y":0.0111,"z":0.0195,"w":0.065,"h":0.0008,"thick":0.001,"normal":[0,0,1],"color":"#ADB3BC"})
  // §2/D8 触控板 左侧壁（凹陷边框）
  q({"x":-0.0655,"y":0.0111,"z":0.057,"w":0.074,"h":0.0008,"thick":0.001,"normal":[1,0,0],"color":"#ADB3BC"})
  // §2/D8 触控板 右侧壁（凹陷边框）
  q({"x":0.0655,"y":0.0111,"z":0.057,"w":0.074,"h":0.0008,"thick":0.001,"normal":[-1,0,0],"color":"#ADB3BC"})
})()
