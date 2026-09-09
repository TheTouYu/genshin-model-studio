// laptop-grille.js —— 笔记本电脑（MacBook 式银灰极简）part：grille（10 件）
// 自包含单文件（run-gms-parts.sh 直接在页面上下文执行；不依赖任何未注入的全局）。
// 规格来源：PROMPT-laptop-model.md §2（逐字复算）；方向语义见 exports/laptop/points.json conventions。
// 引擎事实（实测）：quad 的 w 沿局部 X、h 沿局部 Z、法线沿局部 Y；rotFromNormal(n)=[90+δ,90−φ,0]。
// window.__gmsNoClear=true 时不 clear（用于「全量装配 + 门禁复核」一次跑全部 part）。
;(function () {
  var G = window.gms
  if (!window.__gmsNoClear) G.clear()
  function q(s) { return G.part('quad', s) }
  // §2 散热格栅#1 框面（暗色底衬，外凸 0.0001；z 向 0.0060 见 engineFix）
  q({"x":-0.075,"y":0.00071368,"z":-0.103,"w":0.006,"h":0.14,"thick":0.0003,"normal":[0,-1,0],"color":"#1A1A1C","name":"grille1_frame"})
  // §2 散热格栅#1 叶片1（外凸 0.0002；0.1400×0.0010×0.0003 见 engineFix）
  q({"x":-0.075,"y":0.00061368,"z":-0.10550005,"w":0.001,"h":0.14,"thick":0.0003,"normal":[0,-1,0],"color":"#C9CDD4","name":"grille1_blade0"})
  // §2 散热格栅#1 叶片2（外凸 0.0002；0.1400×0.0010×0.0003 见 engineFix）
  q({"x":-0.075,"y":0.00061368,"z":-0.10383335,"w":0.001,"h":0.14,"thick":0.0003,"normal":[0,-1,0],"color":"#C9CDD4","name":"grille1_blade1"})
  // §2 散热格栅#1 叶片3（外凸 0.0002；0.1400×0.0010×0.0003 见 engineFix）
  q({"x":-0.075,"y":0.00061368,"z":-0.10216665,"w":0.001,"h":0.14,"thick":0.0003,"normal":[0,-1,0],"color":"#C9CDD4","name":"grille1_blade2"})
  // §2 散热格栅#1 叶片4（外凸 0.0002；0.1400×0.0010×0.0003 见 engineFix）
  q({"x":-0.075,"y":0.00061368,"z":-0.10049995,"w":0.001,"h":0.14,"thick":0.0003,"normal":[0,-1,0],"color":"#C9CDD4","name":"grille1_blade3"})
  // §2 散热格栅#2 框面（暗色底衬，外凸 0.0001；z 向 0.0060 见 engineFix）
  q({"x":0.075,"y":0.00071368,"z":-0.103,"w":0.006,"h":0.14,"thick":0.0003,"normal":[0,-1,0],"color":"#1A1A1C","name":"grille2_frame"})
  // §2 散热格栅#2 叶片1（外凸 0.0002；0.1400×0.0010×0.0003 见 engineFix）
  q({"x":0.075,"y":0.00061368,"z":-0.10550005,"w":0.001,"h":0.14,"thick":0.0003,"normal":[0,-1,0],"color":"#C9CDD4","name":"grille2_blade0"})
  // §2 散热格栅#2 叶片2（外凸 0.0002；0.1400×0.0010×0.0003 见 engineFix）
  q({"x":0.075,"y":0.00061368,"z":-0.10383335,"w":0.001,"h":0.14,"thick":0.0003,"normal":[0,-1,0],"color":"#C9CDD4","name":"grille2_blade1"})
  // §2 散热格栅#2 叶片3（外凸 0.0002；0.1400×0.0010×0.0003 见 engineFix）
  q({"x":0.075,"y":0.00061368,"z":-0.10216665,"w":0.001,"h":0.14,"thick":0.0003,"normal":[0,-1,0],"color":"#C9CDD4","name":"grille2_blade2"})
  // §2 散热格栅#2 叶片4（外凸 0.0002；0.1400×0.0010×0.0003 见 engineFix）
  q({"x":0.075,"y":0.00061368,"z":-0.10049995,"w":0.001,"h":0.14,"thick":0.0003,"normal":[0,-1,0],"color":"#C9CDD4","name":"grille2_blade3"})
})()
