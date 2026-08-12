// 水杯画法（lathe 模式：母线车削空心杯身 + solid 杯底 + rod 把手）
// 注意：height 对 lathe 母线是抬升语义（会悬浮），母线高度由画布像素决定；
// 把手必须标 render:'rod'，否则会被车削成小圆筒。
window.gms.mode('lathe');
window.gms.clear();
// 杯身母线：轴 x=302（与杯底同心），半径 30px，高 51px ≈ 0.16m（1m/320px 标定）
const pts = [];
for (let i = 0; i <= 20; i++) pts.push([302 + (30*i)/20, 300]);
for (let i = 1; i <= 20; i++) pts.push([332, 300 - (51*i)/20]);
window.gms.polyline(pts);
// 杯底：实心薄盘，圆心 = 母线轴
window.gms.circle(302, 250, 27, {render:'solid', height:0.005});
// 把手：rod 杆，控制点 y∈[250,285]（杯身顶部 y=249 以下才贴壁；extrude 时代的 y≈230 会悬空）
window.gms.curve([[332,252],[354,259],[358,266],[332,290]], false, {render:'rod'});
