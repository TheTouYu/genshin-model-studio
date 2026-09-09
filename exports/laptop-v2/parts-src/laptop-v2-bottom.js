// laptop-v2-bottom.js —— 笔记本 v2（细节升级版）part：bottom（4 件）
// 自包含单文件（run-gms-parts.sh 直接在页面上下文执行；不依赖任何未注入的全局）。
// 规格来源：PROMPT-laptop-detail.md D1–D10 + PROMPT-laptop-model.md §2（坐标逐字沿用）。
// 引擎事实（本轮实测）：quad 的 w 沿局部 X、h 沿局部 Z、法线沿局部 Y；rotFromNormal(n)=[90+δ,90−φ,0]；
//   RDP 存活条件 min(w,h) > max(0.0002174, 0.005×hypot(w,h))（460px=1m）；poly 3D 折线端到端存活。
// window.__gmsNoClear=true 时不 clear（用于「全量装配 + 门禁复核」一次跑全部 part）。
;(function () {
  var G = window.gms
  if (!window.__gmsNoClear) G.clear()
  function q(s) { return G.part('quad', s) }
  // D7 铭牌位（0.0600×0.0090 开孔，底衬 #B9BEC6 下沉 0.0012）
  q({"x":0,"y":0.00535654,"z":0.05447135,"w":0.068,"h":0.017,"thick":0.0003,"normal":[0,-0.9997748,0.02122163],"color":"#B9BEC6","name":"nameplate"})
  // D7 序列号槽（0.0400×0.0022 开孔，暗底衬下沉 0.0012）
  q({"x":0,"y":0.00556031,"z":0.06407135,"w":0.046,"h":0.0082,"thick":0.0003,"normal":[0,-0.9997748,0.02122163],"color":"#4A4E55"})
  // D7 扬声器孔阵列 1/2（4 孔 0.0016×0.0070，暗底衬下沉 0.0012）
  q({"x":-0.11,"y":0.00575984,"z":0.07347135,"w":0.0154,"h":0.012,"thick":0.0003,"normal":[0,-0.9997748,0.02122163],"color":"#1A1A1C","name":"speaker_back_0"})
  // D7 扬声器孔阵列 2/2（4 孔 0.0016×0.0070，暗底衬下沉 0.0012）
  q({"x":0.11,"y":0.00575984,"z":0.07347135,"w":0.0154,"h":0.012,"thick":0.0003,"normal":[0,-0.9997748,0.02122163],"color":"#1A1A1C","name":"speaker_back_1"})
})()
