# 甘雨 · 袜+脚 移交文档（HANDOFF — 给更强模型）

> 位置：`/home/h/genshin-model-studio`（Genshin Model Studio，画线建模工具 + 浏览器 CDP）。
> 本文件是**唯一权威交接**：新模型从零开始，先读本文件（+ `SPEC-foot-modeling-agent.md` + `scripts/parts/lib/ganyu-lib.js` 能力清单）。

## 0. 一句话任务
在浏览器里用【mesh 基础元件 10009019 + profileLoft 参数化网格】从**局部**开始重建"腿-袜-脚"，**第一步先让五趾清晰可见**（当前终审完全未通过：趾列不可见）；严格按老师规范（下方 §2）逐轮迭代，每轮多视角核验+迭代记录，最终用户终审。

## 1. 参考图（用户提供，最高标准）
- **袜子+脚 8 视 + 四视 + 细节拆解**（用户 4 条消息内含：正/侧/顶/背/内/外/脚底 + 袜口双蓝带特写 + 腓骨鸢尾 + 脚趾细节 4 图）。
- 判读要求（老师规范 §1）：先提取**结构**（踝→背过渡、跟/弓/前掌体积、五趾软体、内外侧不对称），不是颜色纹理。
- **不确定区域必须标"不确定"，不得伪造精确结论**。

## 2. 老师规范（已落盘 `SPEC-foot-modeling-agent.md`，务必执行）
核心循环：参考图解析→问题诊断→问题分类→几何假设→选工具→执行修改→多视角渲染→误差评估→接受/回滚/继续。
问题分层（顺序不可乱）：L1 比例/轮廓 → L2 结构关系（踝/腱/趾连接）→ L3 拓扑/曲率 → L4 丝袜材质。
形体层级：比例→轮廓→体积→结构转折→表面褶皱→材质微细节。
迭代轮次：R1 基础比例(灰模)→R2 踝+跟→R3 前掌+五趾→R4 拓扑→R5 丝袜薄壳→R6 物理褶皱→R7 材质。
**禁令**：R5 前不许丝袜/褶皱；禁止用褶皱/材质掩盖形体错误；禁止均匀环纹；趾=软体非锯齿/贴球。
每轮输出 10 段 + `iteration-records/NN-*.json`。
**验收裁决（用户）**：趾列三视角可见（大趾最大/长度阶梯/圆钝/浅槽），否则打回。

## 3. 工具能力（本会话已建立，直接复用）
公共库 `scripts/parts/lib/ganyu-lib.js`（画布内函数，随部件脚本注入）：
- `part('mesh',{mesh:{vertices,faces,colors}, color, material:'sock'})` → **10009019**（水密索引网格；preview 已支持平滑法线/逐面顶点色/sheen）
- `profileLoft(path, secs, segs, sides, colorFn, opts)`：截面 `{rx,ry,cx,cy,ryB}`（cy 偏心=小腿肚/脚背；ryB=足弓底部缩放）
  - `opts.toes{frac,amp,list:[{c,w,len,dy}]}`：五趾高斯瓣（每趾参数；**目前趾列视觉不可见 → 第一任务重点调大/加瓣/加深沟槽**）
  - `opts.bumps[{t,th,amp,w,wt,irreg}]`：骨点/皱褶（角域高斯；irreg 用 `k,a` 索引，勿用未定义变量）
  - `opts.rings`、`opts.creases`、`opts.micro`（细罗纹）、`opts.cap:'none|top|bottom|both'`、`opts.dataOnly:true`
- `mirrorMeshData(d)`（x 取反+绕序翻转）、`place(d,xOff)`
- `meshCheck(d)`：{faces,deg,skinnyPct,areaRatio} gate（deg=0 & skinny<3% & ratio<20）
- `toeBumps/quadB/loftMesh`（旧），`setTarget/setCamera/setAmbient`（preview API）
- server: `gms.part('mesh')` 全链路已通；`npm run build` + 重启 `node dist/web/server.js`(:8787) + 同步 `public/index.html`&`public/draw/preview.js`

## 4. 当前状态
- R1–R7 均**实现且机械验收通过**（记录 01–07；门禁 PASS）；但**用户终审：趾列不可见 → 完全未通过**。
- 证据：`delivery/legs-pair/pair-5views.png`、`delivery/sock-agent-final/contact-5views.png`、`iteration-records/01..07`。
- 已知失败史（教训谱系见 SPEC 附表）：平面quad不水密→mesh；非索引→平涂→索引法线；贴球趾→toes；均匀环纹→irreg；irreg `j` NaN→`a`。
- **本次最重要的技术债：趾列可视化**（toes 参数已存在但成品几乎不可见——幅度/瓣距/沟槽/视角/密度都要重做）。

## 5. 运行环境速查
- 页面：孤立 Edge `http://localhost:8787`（CDP 端口 9225）；`BU_CDP_WS=$(curl -s http://127.0.0.1:9225/json/version | python3 -c "import json,sys;print(json.load(sys.stdin)['webSocketDebuggerUrl'])")`
- 注入库+部件：`expr='(()=>{try{'+LIB_SRC+PART_SRC+'return{ok:true}}catch(e){return{ok:false,error:String(e)}}})()'`；等状态栏 `✓ N 笔 · N 个元件`。
- 特写：`setGridVisible(false)+setBackground('#000000')+setAmbient(x)+setTarget(x,y,z)+setCamera({yaw,pitch,radius})` → capture_screenshot。
- 参考本地裁剪：`reference/details/`（甘雨全身细节 13 张）；袜子图需重新由用户提供/存 `reference/sock/`。

## 6. 第一任务（R0）
`ticket 29`：趾列可见性专项——用 `profileLoft(toes)` 重做趾部（幅度↑ 瓣形圆润、趾间沟槽加深但≤浅槽、大趾最大、长度阶梯、趾尖圆钝；正/顶/侧三视角一致）；每步 ≤30s；完成后 5 特写+迭代记录 → 交用户终审。

## 7. 交接提示词（复制即用）
见 `PROMPT-handoff-toes.md`。
