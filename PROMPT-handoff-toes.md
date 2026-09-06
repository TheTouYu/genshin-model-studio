# 交接提示词：甘雨「腿-袜-脚」局部重建（从零开始）

> 你是一名资深 3D 建模智能体，接管"甘雨腿部：大腿-袜-脚"局部重建任务。
> 工作目录 `/home/h/genshin-model-studio`（Genshin Model Studio：画线建模 + 浏览器 CDP 实操验证）。
> **先完整阅读**：`HANDOFF-sock-foot.md`（权威交接）、`SPEC-foot-modeling-agent.md`（老师规范+验收裁决+教训谱系）、`scripts/parts/lib/ganyu-lib.js`（可用工具原语清单）、`scripts/parts/ganyu-test-foot-sock.js`（当前最佳版本作起点）。

## 任务（从局部出发，先做最难、最被质疑的一项）
**第一任务（R0）：让"五趾"在最终成品中清晰可见、软体连续、符合参考图。**
当前状态：前任已实现 profileLoft 参数化网格（mesh 10009019），但**用户终审判定"连脚趾头都看不到"——完全未通过**。你的第一轮改进必须让五个脚趾在 **正面/顶面/侧面三个视角** 都能被一眼读出：
- 大趾最大、趾长阶梯递减、趾尖圆钝；
- 趾间为**浅沟槽**（软组织凹缝，不是机械切缝，也不是贴球）；
- 趾根与前掌连续过渡；趾部轮廓三视角一致。

## 方法论（老师规范，强制）
每轮按闭环：**参考图解析 → 问题诊断 → 问题分类(L1比例/L2结构/L3拓扑/L4材质) → 几何假设 → 选工具 → 执行修改 → 多视角渲染 → 误差评估 → 接受/回滚/继续**。每轮输出：①当前阶段 ②问题 ③优先级 ④参考依据 ⑤几何/物理解释 ⑥用哪些工具 ⑦具体步骤 ⑧多视角验证结果 ⑨接受/回滚 ⑩下一轮建议；并写 `iteration-records/NN-*.json`。
**禁令**：在没有完成脚部基础形体前，禁止做丝袜褶皱/材质来掩盖问题；丝袜是独立薄壳（R5 之后）；褶皱必须有压缩/拉伸成因且不规则、深度≤袜厚。

## 关键工具（直接用，勿重复造轮子）
- `part('mesh',{mesh:{vertices,faces,colors}, material:'sock'})` = 水密索引网格（10009019，预览已支持平滑法线/顶点色/sheen）。
- `profileLoft(path, secs{j,y,cy,ryB}, segs, sides, colorFn, opts)`：
  - `opts.toes={frac,amp,list:[{c,w,len,dy}]}`：五趾高斯瓣（**这是本次主角：调大 amp、调瓣距 w、加深瓣间谷、加长 frac，直到三视角清晰**）；
  - `opts.bumps[{t,th,amp,w,wt,irreg}]`（骨点/皱褶；irreg 内引用 `k,a` 变量）；`opts.rings/creases/micro/cap/dataOnly`。
- `mirrorMeshData(d)`/`place(d,xOff)`：左右镜像。
- `meshCheck(d)`：门禁（deg=0 & skinny<3% & areaRatio<20）。
- 核验：`setAmbient/setTarget/setCamera` + `capture_screenshot`（黑底、关网格）；每轮必须出**正面/顶面/侧面**三特写（且与原图等比放大对比）。

## 运行环境
页面：孤立 Edge `http://localhost:8787`（CDP 9225）；`BU_CDP_WS=$(curl -s http://127.0.0.1:9225/json/version | python3 -c "import json,sys;print(json.load(sys.stdin)['webSocketDebuggerUrl'])")`。
注入：`('(()=>{try{'+LIB_SRC+PART_SRC+'return{ok:true}}catch(e){return{ok:false,error:String(e)}}})()')`，等待状态栏 `✓ N 笔 · N 个元件`。
单次工具调用 **≤30 秒**（超时就拆小步：只改趾部参数、只渲染一个视角）。

## 参考图
用户提供的"袜子+脚"多视角图（含趾部细节 4 图）与材质/纹样拆解图；参考文件建议先存 `reference/sock/` 并逐张 read_image 建"参考解析表"（视角/标志点/置信度/不确定区）。

## 交付与验收
- 每轮：特写 PNG（`/tmp/rN-*.png`）+ `iteration-records/NN-*.json` + tickets（`.scratch/ganyu-materials-redux/issues/`）。
- **R0 验收**：五趾三视角清晰可读 + 趾沟浅槽/大趾最大/阶梯/圆钝 + meshCheck PASS → 提交用户终审；**用户签字前不得宣称完成**。
- 诚实原则：不确定区域明确标注；不得用褶皱/材质美化掩盖形体问题；每步先想清楚"这是什么问题、属于哪层、用什么工具、影响哪些视角"。
