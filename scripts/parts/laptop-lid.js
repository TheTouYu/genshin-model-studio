// laptop-lid.js —— 笔记本电脑（MacBook 式银灰极简）part：lid（10 件）
// 自包含单文件（run-gms-parts.sh 直接在页面上下文执行；不依赖任何未注入的全局）。
// 规格来源：PROMPT-laptop-model.md §2（逐字复算）；方向语义见 exports/laptop/points.json conventions。
// 引擎事实（实测）：quad 的 w 沿局部 X、h 沿局部 Z、法线沿局部 Y；rotFromNormal(n)=[90+δ,90−φ,0]。
// window.__gmsNoClear=true 时不 clear（用于「全量装配 + 门禁复核」一次跑全部 part）。
;(function () {
  var G = window.gms
  if (!window.__gmsNoClear) G.clear()
  function q(s) { return G.part('quad', s) }
  // §2 上盖 内面（闭态 y=0.0115，屏幕面）
  q({"x":0,"y":0.10989395,"z":-0.11785722,"w":0.304,"h":0.212,"thick":0.001,"normal":[0,0.17364818,0.98480775],"color":"#C9CDD4"})
  // §2 上盖 外面（闭态 y=0.0155）
  q({"x":0,"y":0.10937301,"z":-0.12081164,"w":0.304,"h":0.212,"thick":0.001,"normal":[0,-0.17364818,-0.98480775],"color":"#C9CDD4"})
  // §2 上盖 前缘（z=+0.1060）
  q({"x":0,"y":0.2135307,"z":-0.13765432,"w":0.304,"h":0.004,"thick":0.001,"normal":[0,0.98480775,-0.17364818],"color":"#C9CDD4"})
  // §2 上盖 后缘（z=−0.1060，转轴侧）
  q({"x":0,"y":0.00573626,"z":-0.10101455,"w":0.304,"h":0.004,"thick":0.001,"normal":[0,-0.98480775,0.17364818],"color":"#C9CDD4"})
  // §2 上盖 左侧缘（x=−0.1520）
  q({"x":-0.1515,"y":0.10963348,"z":-0.11933443,"w":0.212,"h":0.004,"thick":0.001,"normal":[-1,0,0],"color":"#C9CDD4"})
  // 该面经引擎 rotFromNormal 推导的 w/h 轴与设计轴不平行 → 显式覆写 rotation（PROMPT §2 允许）
  G.props(-1, { transform: { position: [0, 0, -0.11933443], rotation: [10,180,90] } })
  // §2 上盖 右侧缘（x=+0.1520）
  q({"x":0.1515,"y":0.10963348,"z":-0.11933443,"w":0.212,"h":0.004,"thick":0.001,"normal":[1,0,0],"color":"#C9CDD4"})
  // 该面经引擎 rotFromNormal 推导的 w/h 轴与设计轴不平行 → 显式覆写 rotation（PROMPT §2 允许）
  G.props(-1, { transform: { position: [0, 0, -0.11933443], rotation: [10,180,90] } })
  // §2 圆角 上盖四角单张 45° 切角 quad
  q({"x":0.14664645,"y":0.20875088,"z":-0.13681151,"w":0.01414214,"h":0.004,"thick":0.001,"normal":[0.70710678,0.69636424,-0.1227878],"color":"#C9CDD4"})
  // 该面经引擎 rotFromNormal 推导的 w/h 轴与设计轴不平行 → 显式覆写 rotation（PROMPT §2 允许）
  G.props(-1, { transform: { position: [0, 0, -0.13681151], rotation: [10,180,-45] } })
  // §2 圆角 上盖四角单张 45° 切角 quad
  q({"x":0.14664645,"y":0.01051608,"z":-0.10185736,"w":0.01414214,"h":0.004,"thick":0.001,"normal":[0.70710678,-0.69636424,0.1227878],"color":"#C9CDD4"})
  // 该面经引擎 rotFromNormal 推导的 w/h 轴与设计轴不平行 → 显式覆写 rotation（PROMPT §2 允许）
  G.props(-1, { transform: { position: [0, 0, -0.10185736], rotation: [10,180,135] } })
  // §2 圆角 上盖四角单张 45° 切角 quad
  q({"x":-0.14664645,"y":0.20875088,"z":-0.13681151,"w":0.01414214,"h":0.004,"thick":0.001,"normal":[-0.70710678,0.69636424,-0.1227878],"color":"#C9CDD4"})
  // 该面经引擎 rotFromNormal 推导的 w/h 轴与设计轴不平行 → 显式覆写 rotation（PROMPT §2 允许）
  G.props(-1, { transform: { position: [0, 0, -0.13681151], rotation: [10,180,-45] } })
  // §2 圆角 上盖四角单张 45° 切角 quad
  q({"x":-0.14664645,"y":0.01051608,"z":-0.10185736,"w":0.01414214,"h":0.004,"thick":0.001,"normal":[-0.70710678,-0.69636424,0.1227878],"color":"#C9CDD4"})
  // 该面经引擎 rotFromNormal 推导的 w/h 轴与设计轴不平行 → 显式覆写 rotation（PROMPT §2 允许）
  G.props(-1, { transform: { position: [0, 0, -0.10185736], rotation: [10,180,135] } })
})()
