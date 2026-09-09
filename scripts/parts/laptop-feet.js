// laptop-feet.js —— 笔记本电脑（MacBook 式银灰极简）part：feet（4 件）
// 自包含单文件（run-gms-parts.sh 直接在页面上下文执行；不依赖任何未注入的全局）。
// 规格来源：PROMPT-laptop-model.md §2（逐字复算）；方向语义见 exports/laptop/points.json conventions。
// 引擎事实（实测）：quad 的 w 沿局部 X、h 沿局部 Z、法线沿局部 Y；rotFromNormal(n)=[90+δ,90−φ,0]。
// window.__gmsNoClear=true 时不 clear（用于「全量装配 + 门禁复核」一次跑全部 part）。
;(function () {
  var G = window.gms
  if (!window.__gmsNoClear) G.clear()
  function q(s) { return G.part('quad', s) }
  // §2 脚垫 4×Ø0.0080×0.0006（disc，中心 y = y_bottom(z) − 0.0003）
  G.part('disc', {"x":0.132,"y":0.004375471698113208,"z":0.086,"r":0.004,"thick":0.0006,"axis":"up","color":"#C9CDD4","name":"foot_pp"})
  // §2 脚垫 4×Ø0.0080×0.0006（disc，中心 y = y_bottom(z) − 0.0003）
  G.part('disc', {"x":0.132,"y":0.0007245283018867926,"z":-0.086,"r":0.004,"thick":0.0006,"axis":"up","color":"#C9CDD4","name":"foot_pn"})
  // §2 脚垫 4×Ø0.0080×0.0006（disc，中心 y = y_bottom(z) − 0.0003）
  G.part('disc', {"x":-0.132,"y":0.004375471698113208,"z":0.086,"r":0.004,"thick":0.0006,"axis":"up","color":"#C9CDD4","name":"foot_np"})
  // §2 脚垫 4×Ø0.0080×0.0006（disc，中心 y = y_bottom(z) − 0.0003）
  G.part('disc', {"x":-0.132,"y":0.0007245283018867926,"z":-0.086,"r":0.004,"thick":0.0006,"axis":"up","color":"#C9CDD4","name":"foot_nn"})
})()
