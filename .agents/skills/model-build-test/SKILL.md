---
name: model-build-test
description: 用 Genshin Model Studio 的"画线建模"工具快速完成物体建模与测试。本地服务 + 浏览器 CDP 实操，验证生成正确性。适用于画水杯/手机/电风扇等模型的建模流程、功能验证、bug 排查，以及「以假乱真」级产品复刻（spec 标定 + 渲染通道 + 盲测，§3.5/§12）。
---

# 画线建模：建模 & 测试技能

针对 `genshin-model-studio`（画线 → 拟合 → 3D 元件）的**浏览器实操建模 + 验证**流程。核心：建模操作协议（CDP 事件序列）+ 验证协议（状态栏/数据/API/截图四层）+ 坑清单。

## 0. 链式路由（先选路线，再按需加载子技能）

建模前先看本节省上下文：决定走哪条路线，再**按需加载对应子技能**（不要通读全文）。子技能注册于 `.dsh/skills/gms-modeling-<stage>/SKILL.md`（front-matter 仅 name/description，可被模型直接调用），每阶段一份，链式推进，可单独加载。

| 路线 | 适用 | 阶段链 |
|---|---|---|
| **网格-面片 route**（Mesh） | 有机曲面 / 自定义多边形（脚、杯、曲面板）——能用「顶视轮廓 + 侧视高度剖面」或「顶点+面」表达 | preflight → reference-fit → blockout → detail → verify → export |
| **经典画线 route**（Stroke） | 常规刚体（杯 / 风扇 / 手机）——用 gms 笔画 + 弹层参数 | 本技能 §1–§10 直接建模 |
| **照片级保真 route**（Photo） | 「以假乱真」级整机复刻（MacBook 级）——官方规格标定 + solids 原语 + 渲染验收通道 + 盲测 | §3.5 保真门 + §12 长跑工作流 |

**选路规则**：目标是照片级整机复刻（有官方规格可查）→ Photo route（先读 §3.5 再动工）；物体能切成「一叠截面环」→ Mesh route（更贴合曲面）；只能靠基本几何拼装 → Stroke route。不确定 → 先加载 `gms-modeling-preflight` 自检环境、读标定、定档位（budget / points / cap）。

**每阶段加载**：
- `gms-modeling-preflight`：环境自检 + 路线/档位决策。
- `gms-modeling-reference-fit`：参考 → `contour-model` 输入 JSON（topOutline + sideProfile 或 rings）。
- `gms-modeling-blockout`：低分辨率剪影（`contour-model --points 64`，`--views` 五视角）。
- `gms-modeling-detail`：颜色带 / 分辨率 / 封盖 / 退化 / 多 mesh 拼接。
- `gms-modeling-verify`：门禁（watertight / seams / normals / degenerate / skinny / areaRatio / budget）与修复。
- `gms-modeling-export`：面板化 → `.structure/.gil/.gia` + 摘要（`--format` / `--budget` / `--views`）。

> 关键命令与参数以子技能正文为准；本技能 §11 是网格-面片体系的规则与阈值速查。

## 1. 环境准备（每次开始）

```bash
# 1) 构建 + 测试（确保最新代码可用）
cd /home/h/genshin-model-studio && npm run build --silent 2>&1 | grep -i error
node --test dist/tests/*.test.js 2>&1 | grep -E "ℹ (tests|pass|fail)"   # 全绿再继续

# 2) 改过 web/index.html 必须做内联 JS 语法检查（TS 语法混入会静默杀死整个页面！）
python3 - <<'EOF'
import re, subprocess, tempfile, os
html = open('web/index.html').read()
for i, s in enumerate(re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>', html, re.S)):
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f: f.write(s); p = f.name
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    print(f"script[{i}]:", "OK" if r.returncode == 0 else r.stderr[:200]); os.unlink(p)
EOF
# 注意：index.html 是原生 JS，禁止 `as number` 等 TS 语法

# 3) 同步 public 副本（web/index.html、web/draw/preview.js）
cp web/index.html public/index.html && cp web/draw/preview.js public/draw/preview.js
sha256sum web/index.html public/index.html | awk '{print $1}' | uniq -c  # 输出 2 个相同哈希

# 4) 重启本地服务（pkill 模式别带 "dist/web/server.js" 全文——会杀掉 bash 自己！）
pkill -f "node dist/web/server"; sleep 1
cd /home/h/genshin-model-studio && (setsid env PORT=8902 node dist/web/server.js > /tmp/web8902.log 2>&1 &)
sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8902/   # 200
   # ⚠ 两个服务别混（2026-09-10 固化）：8902 = dist/web/server.js（开发期 /api/draw-model）；
   #   8787 = scripts/web-server.js（静态页 + 历史条目 + /api/export + photo.html——交付/长跑走这个，见 §8.4/§12）。
   #   页面 404 / 历史读不到时先确认起的是哪个端口的服务。

# 5) 浏览器连接——本机浏览器 = **Win11 宿主上的微软 Edge**（不是 chromium/chrome！）
#    **权威启动流程见 browser-harness 技能的 Local Chrome 节**（~/.pi/agent/skills/browser-harness/SKILL.md），此处为速查：
#    启动 Edge 远程调试（WSL2 内调用 Windows 版 msedge.exe，经 localhost 转发访问 127.0.0.1:9222）：
#    - user-data-dir 必须用独立目录（如 C:\edge-cdp-fan），否则 Edge 复用已有实例、不开调试端口
#    - 首次 Temp 路径启动可能失败（权限/路径），用 C:\ 根下目录更稳；失败时 tasklist.exe 查 msedge.exe 进程数
#    - **前提：先 taskkill /f /im msedge.exe 全退 Edge**（用户日常 Edge 开着时，新实例参数会被路由忽略）
#    - **先在 WSL 侧 cd /mnt/c/Users/touyu 再启动**（WSL 当前目录是 \\wsl.localhost UNC 路径时，Windows 侧直接报错拒绝启动）
#    - 连不上先查：任务管理器/msedge 进程 → curl 9222 → BU_CDP_WS 是否过期（坑 #12/#13）
cd /mnt/c/Users/touyu && cmd.exe /c "taskkill /f /im msedge.exe" 2>/dev/null | head -2; sleep 2
setsid "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 --user-data-dir="C:\edge-cdp-fan" --no-first-run --no-default-browser-check http://localhost:8787/ &
sleep 8   # 等 DevTools 端口就绪（curl 502 说明 Edge 没起来，查 tasklist.exe | grep msedge）
#    刷新 CDP WS 地址（Edge 重启后 UUID 必变，旧地址会 404——坑 #12）：
#    .env 位于 ~/.config/browser-harness/agent-workspace/.env，已写入本机配置（BU_CDP_WS）
WS=$(curl -s http://127.0.0.1:9222/json/version | python3 -c "import json,sys; print(json.load(sys.stdin)['webSocketDebuggerUrl'])")
sed -i "s|^BU_CDP_WS=.*|BU_CDP_WS=$WS|" ~/.config/browser-harness/agent-workspace/.env
export BU_CDP_WS=$WS
```

## 2. 建模操作协议（浏览器里画图）

关键规则：
- **每次画前 `drawCanvas.scrollIntoView({block:'center'})`**（canvas 在视口外 = 事件丢失，症状诡异）
- **每次先 `localStorage.removeItem('gms.draw.work.v1')` + reload**（旧作品污染索引）
- **笔画索引动态取**：`document.querySelectorAll('.stroke-chip').length`，不要写死
- **弹层（colorPopover）开着会挡住画布**——设完参数必须"点外部关闭"（真实鼠标事件）
- 工具切换：`[...document.querySelectorAll('.tool-btn')].find(b => b.dataset.tool === 'X').click()`

```python
# browser-harness heredoc 内（函数化，直接复用）
import time, math

def drag(tool, x, y, dx, dy):        # 圆/直线/矩形/自由笔
    js(f"""[...document.querySelectorAll('.tool-btn')].find(b => b.dataset.tool === '{tool}').click()""")
    time.sleep(0.3)
    cdp("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", buttons=1, clickCount=1)
    cdp("Input.dispatchMouseEvent", type="mouseMoved", x=x+dx, y=y+dy, button="left", buttons=1)
    cdp("Input.dispatchMouseEvent", type="mouseReleased", x=x+dx, y=y+dy, button="left", buttons=0, clickCount=1)
    time.sleep(1.5)

def freehandEllipse(cx, cy, rx, ry, n=40):   # 自由笔椭圆（密点！< 20 点会被 RDP 抽稀成多边形）
    js("""[...document.querySelectorAll('.tool-btn')].find(b => b.dataset.tool === 'pen').click()""")
    time.sleep(0.3)
    cdp("Input.dispatchMouseEvent", type="mousePressed", x=cx, y=cy, button="left", buttons=1, clickCount=1)
    for i in range(1, n):
        a = i / n * 2 * math.pi
        cdp("Input.dispatchMouseEvent", type="mouseMoved", x=cx+rx*math.cos(a), y=cy+ry*math.sin(a), button="left", buttons=1)
    cdp("Input.dispatchMouseEvent", type="mouseMoved", x=cx+rx*0.02+3, y=cy+3, button="left", buttons=1)  # 收笔回起点附近
    cdp("Input.dispatchMouseEvent", type="mouseReleased", x=cx+6, y=cy+3, button="left", buttons=0, clickCount=1)
    time.sleep(1.5)

def setStroke(i, render=None, height=None, axis=None):  # 弹层设参数（改完必须关弹层！）
    js(f"document.querySelectorAll('.stroke-chip')[{i}].click()")
    time.sleep(0.4)
    js(f"""(() => {{
      const p = document.getElementById('colorPopover')
      {f"const s = p.querySelector('#popRender'); s.value = '{render}'; s.dispatchEvent(new Event('change', {{ bubbles: true }}))" if render else ""}
      {f"const h = p.querySelector('#popHeight'); h.value = '{height}'; h.dispatchEvent(new Event('input', {{ bubbles: true }}))" if height else ""}
      {f"const a = p.querySelector('#popAxis'); a.value = '{axis}'; a.dispatchEvent(new Event('change', {{ bubbles: true }}))" if axis else ""}
      return 'ok'
    }})()""")
    time.sleep(2.0)
    closePop()

def closePop():  # 点外部关闭弹层（真实鼠标事件）
    cdp("Input.dispatchMouseEvent", type="mousePressed", x=box['x']+500, y=box['y']+400, button="left", buttons=1, clickCount=1)
    cdp("Input.dispatchMouseEvent", type="mouseReleased", x=box['x']+500, y=box['y']+400, button="left", buttons=0, clickCount=1)
    time.sleep(0.4)

def rotateCopy(i, center, n):  # 旋转复制：选笔画 → 按钮 → 点旋转中心 → 份数 → 确定
    js(f"document.querySelectorAll('.stroke-chip')[{i}].click()")
    time.sleep(0.4)
    js("""(() => { const b = [...document.querySelectorAll('button')].find(b => /旋转复制/.test(b.textContent)); b.click(); return 'ok' })()""")
    time.sleep(0.5)
    cdp("Input.dispatchMouseEvent", type="mousePressed", x=center[0], y=center[1], button="left", buttons=1, clickCount=1)
    cdp("Input.dispatchMouseEvent", type="mouseReleased", x=center[0], y=center[1], button="left", buttons=0, clickCount=1)
    time.sleep(0.6)
    js(f"""(() => {{ const m = document.getElementById('rotateModal'); const inp = m.querySelector('input'); inp.value = '{n}'; inp.dispatchEvent(new Event('input', {{ bubbles: true }})); const ok = [...m.querySelectorAll('button')].find(b => /确定|复制|生成/.test(b.textContent)); ok.click(); return 'ok' }})()""")
    time.sleep(2.5)

def tap(x, y):  # 曲线工具控制点
    cdp("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", buttons=1, clickCount=1)
    cdp("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", buttons=0, clickCount=1)
```

## 3. 验证协议（四层，按顺序）

```python
# 层 1：状态栏（drawStatus，不是 status！status 是一期示例区的）
js("document.getElementById('drawStatus').textContent")
# 期望格式：✓ N 笔 · M 笔封闭 · K 个元件（K 对得上才算成功）
# 错误格式：生成失败：xxx（后端 400 中文提示）

# 层 2：作品数据（localStorage 键 gms.draw.work.v1，v3 格式）
js("JSON.parse(localStorage.getItem('gms.draw.work.v1'))")  # strokes[].{points,render,height,axis,color}

# 层 3：API 直调（后端契约验证，最快）
# 优先使用项目脚本：从现有浏览器 tab 的 window.gms.export() 取得完整 payload，
# 再 POST /api/draw-model；不要手抄 export JSON，也不要只报告 strokes。
scripts/inspect-draw-model.sh http://localhost:8787/ > /tmp/draw-model-items.json
# 输出必须包含 source="POST /api/draw-model from window.gms.export()"、httpStatus=200、itemCount 和 items。
# items[].resourceId/position/rotation/scale 全可断言。

# 层 4：截图分析（验证 3D 预览渲染——readPixels 有 preserveDrawingBuffer 陷阱，永远用截图！）
p = capture_screenshot(path="/tmp/bh-check.png")
# 本地分析（/tmp/pv-venv/bin/python）：
#   预览背景深色 ≈ (16,21,28)/(20,26,35) 大量像素 = 渲染正常；全白/全浅 = 预览挂了

# 层 5：视觉模型核验（质量验收，替代人眼/ASCII 猜）
# 先准备既有截图和 API 数据；核验代理只读，不运行截图脚本或 grep 项目源码。
# 任务文件必须给：
#   - 5 张截图绝对路径；明确全部逐张 read。
#   - 现成命令：scripts/inspect-draw-model.sh http://localhost:8787/。
#   - 量化断言和 API 输出所需字段（itemCount、resourceId、position、scale）。
#   - 硬门禁：报告中的“数据核验”只能引用该命令输出；命令非零、httpStatus 非 200，
#     或无 source="POST /api/draw-model from window.gms.export()" 时，结论必须是“数据核验未完成”，不能判通过。
#   - 要求：审美角度（观感/比例/配色）+ 实现角度（结构/遮挡/悬空/缝隙）双角度报告，指出截图坐标。
#   - 强调：数据以服务端为准，观感问题标“待数据校准”；限制 bash 输出到摘要，禁止全仓 rg 或打印完整 export JSON。
# 主模型收到报告后仍须将每项分为「确认属实 / 部分成立 / 观感误判」三级。
# 命令模板：
#   python3 ~/.pi/agent/skills/isolated-model-evaluator/scripts/evaluate.py \
#     --root /home/h/genshin-model-studio --provider aijws --model gpt-5.6-sol --tools read,bash \
#     --task-file /tmp/visual-review-task.md --output-dir /tmp/visual-review --assert-no-changes
# 历史战绩（2026-08-09 R6）：视觉模型正确抓出“字母 A 上下颠倒”“笔画断裂”——ASCII 分析漏掉的真实缺陷
```

### 视觉核验任务模板

```markdown
# <对象>视觉终验任务（<provider>/<model>）

只读核验。截图已在 `<绝对目录>/view-{iso,top,front,side,handle}.png`；直接逐张 `read`，不要重截图、不要 grep 源码。

1. 运行 `scripts/inspect-draw-model.sh http://localhost:8787/ > /tmp/<对象>-items.json` 一次。
2. 仅当输出同时有 `source="POST /api/draw-model from window.gms.export()"`、`httpStatus: 200` 和 `items` 时，按下列断言核验：<断言>。
3. 对每个结论写截图坐标和 API 数值；数据命令失败则写“数据核验未完成”，不得以 export/strokes 代替 items，也不得判“通过”。
4. 先写 `# <对象>视觉核验报告`，再依序完成截图和数据核验；工具或 provider 出错时，仍交付已完成证据和未完成项，不要输出过程状态。

输出：总体结论（通过/需再修/数据核验未完成）、审美核验、数据核验、缺陷清单。
```

### 模型选择与职责

| 工作 | 首选 | 质量门禁 |
|---|---|---|
| 截图审美、坐标化缺陷、复杂视觉判断 | 具备稳定图片输入的视觉模型（本项目样本：gpt-5.6-sol） | 必须同时完成 API 脚本数据核验 |
| 独立复验、结构化报告、已给定 API 摘要的交叉检查 | 低延迟模型（本项目样本：qwen3.7-flash） | 不把其视觉结论当唯一验收；API 脚本失败即未完成 |
| 参数修复、算法定位和受约束代码修改 | 推理/编码模型（本项目样本：deepseek-v4-flash） | 明确基线、预算和断言；修复后必须交给独立视觉核验 |

这是按本次单样本流程的工作分配，不是通用模型排名。修复代理负责修改、单元/API 断言和候选截图；核验代理只负责独立截图+API 验收。核验发现缺陷后，必须派独立修复任务；修复任务不得自行宣布视觉通过。

**⚠ 欠费停用（2026-08-12）**：`qwen/qwen3.7-flash` 账户已欠费（电风扇修复轮一次 $2.44 超额消费导致），**禁止再调用 qwen provider**（evaluate.py --provider qwen 会返回空响应/直接失败）。视觉核验改用 `--provider aijws --model gpt-5.6-sol`；编码修复用 `--provider deepseek --model deepseek-v4-flash`。欠费恢复前不要再试 qwen。

**算法类问题（识别/拟合）优先本地复现**：浏览器导出笔画 → node 直跑 `generateModel`/`simplifyRdp`/`adaptiveEpsilon`，打印中间步骤（RDP 点数、转角、半径方差），比浏览器调试快 10 倍。识别失败时必查：RDP 后点数、corner 转角值、slice(0,-1) 闭合去重是否触发。

## 3.5 设计保真门（v1/v2 审美失败复盘 + 2026-09-09/10 MacBook 长跑实证升级，**强制**）

> 事故：v1 150 件、v2 570 件，三轮机器门禁全绿（`gms.verify ok` / 独立 AABB 0 缝隙 / 独立视觉复核 pass 0 blocker），
> 用户游戏实测一眼判定「**你做的不是 mac 的苹果电脑**」。根因：**全程没有真机参考图，没有一条门禁测「像不像」**。
> 次日长跑（3.5h 主体盲测到线 + gia 游戏导入 + 次日反馈连跑 r8→r12）验证了完整解法，工作流沉淀在 §12，本节是门禁层。
> 复盘：`docs/game-engine-knowledge/retrospective-2026-09-09-laptop-macbook-design-fidelity.md`；
> 长跑报告：仓库根 `REPORT-macbook-max-execution-analysis.md` / `HARVEST-longrun-intervention-2026-09-09.md`。

**建模前（缺一不可）**
1. 建 `reference/<产品>/design-reference.md`：真机尺寸/键盘/接口/底盖/材质 + 官方图存 `img/` + **每条带来源 URL**；写下**设计语言清单**（连续曲率、缝隙均匀、结构隐藏、栅格对齐、单一材质面）。
2. **规格落成标定档案，不是数字表**（长跑最佳形态：`src/model/macbook/spec.ts`）——每个尺寸带推导注释：来源图、自建标尺（官方图已知尺寸定 px/mm，如 USB-C 开口 8.27mm=50px→6.08px/mm）、多图交叉、旧值为何废。修 bug 改的是可审计档案，不是裸常数。**官方口径优先**：厂商支持页（如 support.apple.com/zh-cn/121553）精确值直接落 spec；官方文档 > 官方图实测 > 拆解图 > 二手转述，两个独立来源不一致时停下查口径，别平均。
3. 从数值规格**反推设计意图**：如「空格键 0.0780×0.0150」→ 意图 = 底排**中心件** + 左右修饰键 + 方向键倒 T；「圆角 R0.0100」→ 意图 = 外轮廓是**一条连续圆角折线**，所有墙/顶/底面沿它**裁切**（不是「矩形 + 补丁」）。

**交付前（三通道，缺一即降级）**
1. **同口径对照**：与真机图**同角度**渲染并排贴进 `DELIVERY*.md`。相机：`gmsPreview.setCamera({yaw,pitch,radius})` + `setTarget(x,y,z)`；`radius` 单位是米，微距要 0.10–0.15（0.3 还是全机视角）。⚠ 官方产品图多为**长焦近正交**——对照渲染必须用长焦/正交相机；fov24 近距强透视和官方图必然错位（长跑实测：自加长焦侧视后才对得上）。
2. **验收通道 = 用户实际看的通道**：draw 预览只做结构检查（平色、无纹理——三通道 mesh 无贴图位）；「像不像」在真实渲染通道判（photo.html PBR 页 + CDP 截图，或游戏内 gia）。逐项打勾：轮廓一致性 / 缝隙均匀 / 结构隐藏 / 键位语义 / 材质色 / 图例。
3. **盲测 A/B 才是「以假乱真」的硬门**（协议见 §12.4）；没有盲测数据时，门禁 `pass` 旁必须写「**未覆盖维度：设计保真（无盲测）**」——结构门禁不测像不像。

**高频破绽速查（全部实测，见到即返工）**

| 破绽 | 实测值 | 检查法 |
|---|---|---|
| 方角穿出圆角包络 | 每角 4.14 mm | 角心 (±(HX−R), ±(HZ−R))；件 AABB 角点距角心 > R+0.5 mm 即越界 |
| 板角穿出圆角管 | 2.14 mm | 管路径内缩 r，板仍是方角 |
| 圆角管平头接缝 | 0.32 mm 楔形缺口 | 相邻段夹角 θ → 缺口 ≈ r·tan(θ/2) |
| 轴端与侧壁齐平 | Ø4 mm 灰圆外露 | rod 端 \|x\| ≤ 侧壁 −1.5 mm |
| 盖板高出台面 | 0.6 mm | 铰链盖 maxY ≤ 顶面 y |
| 上盖后缘穿入机身 | 6.60 mm | 上盖件 AABB ∩ 机身（y<顶面）必须 = 0 |
| 键位语义错 | 空格键 x=+0.0950（应 ≈0） | 全机键间隙一致 0.0006±1e-4 |
| 扫描线镶嵌切圆角 | R20 角短 3.6mm → 角部露缝/透看 | 带孔平板镶嵌密度跟角半径走（24mm 网格对 R20 不够；长跑 r8 边框/角部实测） |
| 符号错误推墙外凸 | 前缘开口槽把底座前壁外推 1.5mm → 合盖错位 | 单参数符号对着官方图逐个审计（长跑 r11） |
| 部件深度/宽度错 | 上盖浅 8mm → 俯视露 11mm 台面；窄 1mm → 合盖台阶 | 合盖态俯视+侧视对照官方图（官方合盖上下绝对对齐；长跑 r10/r11） |

> 取证脚本模板：`.scratch/retro-laptop/audit.mjs`（读 spec+items 逐件 AABB → 越界/穿模/接缝报告，输出 audit.json）。

## 4. 工具能力速查（建模时按此选型）

| 目标 | 工具 | 参数 |
|---|---|---|
| 杯身/塔（空心，lathe 模式） | 母线折线（polyline） | 不标 render → 车削开口薄壁圆柱 |
| 底座/圆盘（实心） | 圆 | 柱体 solid + 高度（圆心与母线轴同 x） |
| 叶片/薄片（竖直圆盘） | 自由笔密点椭圆 | 柱体 + 水平 + 厚度 |
| 防护罩/杯口环 | 圆 | 杆（默认）+ 高度=抬升 |
| 把手/支架/辐条 | 直线 或 曲线(3点+双击) | 杆 + render:'rod'（lathe 模式必须显式标 rod） |
| 等角分布（叶片/辐条） | 旋转复制 | 选笔画 → 点中心 → 份数 2-12 |
| 手机机身 | 矩形 | 柱体 + 竖直 + 厚度 |
| 头/足球/球体件 | `gms.part('sphere')` | `r`（米）+ `color`；输出 10009002 球体（2026-09-05 新增基础元件覆盖） |
| 球体（真人 UI，2026-09-05） | 笔画弹层「元件类型 = 球体 10009002」 | 自动按轮廓填 `height=2r`、`lift=圆心高−r`（可改）；轮廓需圆/椭圆（矩形会中文报错）；等价 `opts.resourceId=10009002` |
| 笔画级粗细/抬升/变换（真人 UI，2026-09-05） | 弹层 `size` / `lift` / `z 偏移` / `旋转 αβγ` | 写 `stroke.size` / `stroke.lift` / `stroke.transform`；z 只改 `position[2]`，旋转保留副本 x/y 不双重生效 |
| 命名/连接/一键总检（真人 UI，2026-09-05） | 「组件/连接」面板（画布区下方） | 选中笔画→命名（自动识别 disc/el-disc/plate/rod/ring/sphere）→ 两组件声明连接(支持方向) → 一键总检；等价 `gms.part(name)` + `gms.link` + `gms.verify` |
| 发丝/马尾/3D 曲线 | `gms.part('poly')` | 世界坐标 `points:[[x,y,z],…]` + `size/color`；N 点 → N-1 根杆（有 z 不重采样，2026-09-06 新增，甘雨 v4 实测） |
| 角尖/收尖锥 | `gms.part('cone')` | `r`（底半径）+ `h`（高）+ `color`；输出 10009009 圆锥（2026-09-06 新增，甘雨角尖实测） |

- **标定**：画布可视区高 = `options.heightMeters`（默认 1 米）；`canvasHeightPx` 缺省时退回包络盒标定（画得越小模型越大）
- **固定原点标定（G15）**：`options.canvasWidthPx + canvasHeightPx` 决定世界原点（画面中心/底）；前端写笔画像素与服务器生成必须同原点，**任何重建 options 的路径都要保留这两个字段**（2026-09-05 足球运动员刷新解散实测，见坑 #17）
- **闭合**：几何工具/闭合曲线自动闭合；自由笔首尾距 < 对角线 20% 自动拉齐；solid 需要封闭
- **形状识别**：矩形（4 角 90°±15°）> 圆（宽高比<1.1 且半径方差<1%）> 椭圆（半径方差<10%）> 拒绝（多边形/怪异）
- **元件语义**：圆柱 10009008（scale=[直径,高,直径]）、长方体 10009001（scale=[宽,高,深]）；rotation YXZ 内旋
- **lathe 全局模式**：render='solid' 笔画独立柱体，其余照旧 lathe

## 5. 坑清单（每条都是真实事故）

1. **readPixels 全 0 ≠ 预览坏了**：WebGL 默认 preserveDrawingBuffer=false，合成后 buffer 清空。验证渲染 = 截图分析
2. **改 index.html 后页面"全死"**（按钮无响应、状态栏不动）= 内联 JS 语法错误（最常见：TS 语法混入）。先跑 §1 语法检查
3. **pkill 自杀**：`pkill -f "dist/web/server.js"` 会匹配 bash 命令行自身。用 `pkill -f "node dist/web/server"`
4. **弹层挡画布**：colorPopover 开着时 canvas 收不到事件。设完参数必须点外部关闭
5. **canvas 在视口外**：事件坐标超出视口全部丢失。画前必 scrollIntoView
6. **测试污染**：localStorage 残留旧作品 → 笔画索引错位（设参设到旧笔画）。每次 removeItem + reload
7. **自由笔点太稀**（< 20 点）→ RDP 抽稀后成多边形 → 识别拒绝。模拟轨迹用 40 点
8. **笔画首尾不闭合**：solid 报"需要封闭轮廓"。自由笔收笔要回到起点附近（< 20% 对角线）
9. **椭圆识别**：椭圆长轴两端抽稀后各留一个 109° 转角点 → 角数 2 放行；167° 近直线点不算角。若改阈值，跑 §3 本地复现验证五边形/梯形仍拒绝
10. **状态栏有两个**：`#status`（一期示例区）与 `#drawStatus`（二期画线区），别读错
11. **服务重启**：`(setsid env PORT=8902 node dist/web/server.js &)` 包在子 shell 里防挂；起不来就再起一次
12. **browser-harness 连旧 Edge UUID 报 404**：`agent-workspace/.env` 的 `BU_CDP_WS` 缓存了 OOM/重启前的 Edge 端点，删掉该行或更新为当前 `curl http://127.0.0.1:9222/json/version` 的 webSocketDebuggerUrl
13. **browser-harness 报 "chrome running FAIL / daemon 没起来"**：Edge 没启动。启动命令见 §1 第 5) 步（msedge.exe + 9222 + 独立 user-data-dir）；启动失败先 `tasklist.exe | grep msedge` 确认主进程存在，再 curl 9222 确认端口
14. **headless chromium 不可用**：本机 WebGL 浏览器一律用 Win11 宿主 Edge（9222），别起 WSL 内 chromium（此前踩过——见 2026-08-12 会话）；`--enable-unsafe-swiftshader` 只在无 GPU 环境才需要
13. **截图时先 gms.mode('lathe') + 画模型**：页面默认加载示例 box，直接截视角图得到的是正方体（yaw 0°/90° 相同，误判 setCamera 无效）
14. **后台标签页 WebGL**：toDataURL 与渲染不一致（返回旧帧），readPixels → 2D canvas → toDataURL 才与渲染一致
15. **/tmp/pv-venv/bin/python 不存在**（旧环境引用）：截图像素分析直接用系统 python3；venv 不在就跳过像素分析，改用 API 数据 + 截图存在性
16. **座舱等盘类厚度必须小于结构间隙**：双环 z=±0.12（内面 ±0.1075）时座舱厚 ≤0.20，厚 0.96 会穿环且 connectivity 最近中心匹配错位
17. **刷新后模型"解散"＝ options 丢了 canvasWidthPx（2026-09-05 足球运动员实测）**：
    画线 API 的 `gms.part` 依赖 `options.canvasWidthPx` 固定原点写像素坐标；若改 shape/选项触发
    `onOptionChange` 重建 options 时丢掉该字段，保存的 work 会缺标定；刷新后 `applyWork` 补上当前
    画布宽，服务端按**新原点**解释同一批像素 → 头/躯干/四肢/球散架。
    解法：任何重建 options 的路径必须保留 `canvasWidthPx`（`drawCanvas.clientWidth || 640`）；
    剧本收尾必须做「刷新页面 + 独立预览 preview-demo.html」二次加载验证（主页面正常 ≠ 持久化正确）。
18. **Edge 152 CDP mouseMoved ack 缺陷（2026-09-05 真人验证实测）**：`mousePressed` 后
    `Input.dispatchMouseEvent type=mouseMoved` 的事件**已派发到页面（页面 pointermove 已执行）**，
    但 CDP 请求永不返回 ack → 拖画超时。解法：画布轨迹改用 `PointerEvent` 合成
    （真实 UI 事件流：pointerdown/move/up，pointerId 一致），**不能改走 gms API**；
    元素点击仍可正常用 CDP press/release 或 DOM click。
19. **窄视口导致画布标定漂移（2026-09-05 真人验证实测）**：主页面 `@media (max-width:900px)`
    把画布压成 769×320，而脚本 work.json 标定是 575×460；验证前必须
    `Emulation.setDeviceMetricsOverride(width=1400, height=900, deviceScaleFactor=1)`，
    否则同批像素坐标系不同，link 接触间隙与总检会失败（球-环 gap 0.135 等）。
20. **独立预览 popup 可能被拦截**：`openPreview` 用 `window.open`；自动化环境下若列表无新 tab，
    改用 `new_tab('http://localhost:8787/draw/preview-demo.html')` 验证同一 localStorage 加载；
    该页断言 `✓ 已加载当前作品：23 笔笔画 · 54 个元件` 且截图无解散。
21. **mesh 条目颜色静默全白**（2026-09-09 长跑）：preview.js 的 `new THREE.Color()` 只吃 int/`#hex`；
    生成脚本输出 `'0x1d1d1f'` 字符串会解析失败**静默回退白色**。导出前 `parseInt(hex,16)` 转 int。
22. **browser-harness IPC 表达式 ~64KB 上限**（长跑实测）：大网格直接 evaluate 会截断——
    分块装配 `window.__m.vertices.push(...batch)` 逐批灌入。
23. **页面 fetch 挂起（WSL2 端口转发抽风）**：降级链 = 页面 fetch → CDP 直灌（Runtime.evaluate）；
    渲染验证用 CDP 截图，不依赖页面网络通路。
24. **CDP `unserializableValue` 假 NaN**（长跑实测）：`rotation.x = -0` 返回 unserializable → 读成 NaN
    触发 guard 误报。读 CDP 返回值先判 `unserializableValue` 字段再取 `value`。
25. **MediaRecorder/WebM 三坑**（长跑视频实测）：canvas 脱离 DOM → captureStream 永远只录第一帧；
    WebM seek 不可靠（用播放全程或 ffmpeg 抽帧验证）；流式容器缺 Duration 元素（部分播放器不能拖动）。
26. **Edge CDP 长跑会死**：一早死两次 → `scripts/max/ensure-edge.sh` 自动守护（检测+重启+刷新 WS 地址）；
    环境抖动用脚本消化，别手工重启吃掉轮次。
27. **draw 预览无纹理不是 bug**：三通道 mesh（vertices/faces/colors）没有贴图位；键帽字标/屏幕 UI
    只在渲染通道（photo.html）可见——表示层上限，别去改共享 preview.js。

## 6. 快速建模验证清单（水杯/风扇验收）

水杯（lathe 模式，见 §7.2 剧本）：母线折线(空心杯身) + 圆 solid(杯底) + 曲线 rod(把手) → 3 笔、杯身 scale≈[0.188,0.159,0.188]。当前短段合并后把手通常为 6 段，合计 8 个元件；验收以 API items 为准，不写死旧版 14 段/16 元件。
风扇：大圆环 + 直线辐条×旋转复制4 + 电机圆(solid 水平 0.04) + 自由笔叶×旋转复制3 + 支架直线 + 底座扁椭圆(solid 竖 0.03)
→ 11 笔、元件数按 [60, 240, 1, 3, 60, 1] 增量核对；截图确认预览有内容

**视角验证**（scripts/capture-views.sh）：预设 iso/top/front/side/handle 五视角，readPixels 截图到 /tmp/cup-views。
- 空心杯身 = top 视角杯口是圆环（内壁可见）；实心杯身 = 圆盘
- 把手贴合 = side/handle 视角（yaw 需偏离正侧 ±0.45，正侧时把手投影被杯壁遮挡）能看到杯壁外缘凸起把手
- pitch 是 Three.js Spherical 极角（0=正上方，π/2=水平）！俯视用 pitch≈0.3，正对用 pitch≈1.57

## 7. gms 命令建模（五期：AI 逐步协作建模）

网页暴露 `window.gms` 程序化建模命令层（web/index.html IIFE 内实现，AI 通过 `js()` 调用）。协作闭环：**AI 每画一笔 → `gms.summary()` 自检 → 截图给人类 → 等待人类反馈 → 修正或画下一笔**。所有命令返回最新 `summary()`；参数非法抛**中文 Error**（原因 + 当前值，会从 js() 抛出）。

### 7.1 命令表（坐标 = 画布 CSS 像素；索引支持负数，-1 = 最后一笔）

| 命令 | 参数 | 说明 |
|---|---|---|
| `gms.clear()` | — | 清空作品（等价清空按钮） |
| `gms.undo()` | — | 撤销上一批（等价撤销按钮；**delete 不进批次**，删了不复活） |
| `gms.circle(cx, cy, r, opts?)` | 圆心 + 半径 | 圆 = 24 等距点 + 首尾重合闭合点（与圆工具同构） |
| `gms.rect(x0, y0, x1, y1, opts?)` | 对角两点 | 矩形 = 4 顶点 + 闭合点 |
| `gms.line(x0, y0, x1, y1, opts?)` | 两点 | 直线 |
| `gms.curve(pts, closed?, opts?)` | 控制点 ≥2 | Catmull-Rom 采样（每段 24 点）；closed=true 封闭 |
| `gms.polyline(pts, opts?)` | 折线点 ≥2 | 直线段插值（每段 16 点）；**lathe 母线画法首选** |
| `gms.loop(pts, opts?)` | 轮廓点 ≥3 | 自由笔闭合轮廓（autoClose 拉齐首尾；距 > 对角线 20% 报错） |
| `gms.props(i, opts)` | 索引 | 设 render/height/axis/color，立即重生成 |
| `gms.rotate(i, cx, cy, n)` | 索引 + 中心 + 份数 | 旋转复制 2~12 份；副本插源后、一个撤销批次；操作前用 gms.list() 核对索引 |
| `gms.list()` | — | 每笔紧凑摘要（索引/点数/封闭/render/height/axis/中心），rotate/delete 前核对 |
| `gms.delete(i)` | 索引 | 删除笔画（不进撤销批次） |
| `gms.mode('extrude'\|'lathe')` | 模式名 | 切换全局生成模式（拉伸/车削），返回 summary |
| `gms.summary()` | — | 状态栏文本 + 每笔索引/参数/bbox（px 与米）+ 全局 options |
| `gms.px2m(px)` / `gms.m2px(m)` | 数值 | 尺寸换算（按当前标定） |
| `gms.export()` / `gms.import(data)` | — / 作品 JSON | 导出作品 JSON（可直接喂回 import）/ 导入并重生成 |

**opts 字段**（每命令可选）：`render: 'solid'（柱体）| 'rod'（杆，缺省）`——**没有 'line'**！；`height: 正数（米）`（solid = 柱体高度，rod = 抬升 z）；`axis: 'up'（缺省不写）| 'front' | 'side'`（仅 solid 有效，对杆笔画报错）；`color: '#hex'`（缺省 = 当前选中色；无"清除颜色"参数）。

**关键语义**：
- 标定：`options.canvasHeightPx` 像素 = `options.heightMeters` 米（`gms.summary().options.calibration` 直接给）；模型尺寸 = 像素 × heightMeters / canvasHeightPx；summary 的 bbox 同时给 px 与米
- 圆/矩形首尾重合 → 后端 3% 封闭检测命中；solid 必须封闭，否则后端 400「柱体渲染需要封闭轮廓」
- 命令自动 scheduleGen + saveLocal；生成结果以 `drawStatus` 为准：`✓ N 笔 · M 笔封闭 · K 个元件`（K 对得上才算成功）
- summary 里 render/height/axis 已归一化显示有效值（缺省 = 'rod' / 0 / 'up'）；color: null = 默认材质
- 十二期新增 `gms.list()`：紧凑列出每笔 {index, points, closed, render, height, axis, center}——rotate/delete/props 前先 list() 核对索引（基线复盘 2b：索引漂移曾致 6 辐条+1 叶重画）

### 7.2 分步协作剧本（每笔后 summary + 截图 + 等人类反馈）

每次只画一笔，画完 `summary()` 自检 → 截图 → **等待人类反馈** → 批准才画下一笔。禁止一次性画完整模型。

```python
def gms_step(label, note=""):
    print(js("JSON.stringify(window.gms.summary())"))        # 1) summary 自检（参数/bbox/元件数）
    capture_screenshot(path=f"/tmp/gms-{label}.png")         # 2) 截图给人类
    if note: print(f"  说明：{note}")
    input(f"⏳ 等待人类反馈（{label}）：批准请回车，修改请说明…")   # 3) 等反馈（无法交互时改用 sleep + 手动确认）

# 例：水杯 4 笔（lathe 模式！extrude 时代画法已废弃——见下方“lathe 画法铁律”）
js("window.gms.mode('lathe')")
js("window.gms.clear()")
# ① 杯身 = 母线（L 形折线，不标 render）→ 车削成 1 个开口薄壁空心圆柱（10009012）
#    母线轴 x=302（与杯底同心），底部 y=300 贴地；高度由画布像素决定（51px ≈ 0.16m @1m/320px）
js("""window.gms.polyline((() => { const p=[];
  for (let i=0;i<=20;i++) p.push([302+(30*i)/20,300]);
  for (let i=1;i<=20;i++) p.push([332,300-(51*i)/20]);
  return p })())""")
gms_step("1-cup-body", "空心杯身：母线车削 → 1 个开口薄壁圆柱（10009012），scale≈[0.188,0.159,0.188]")
# ② 杯底 = 实心薄盘（solid），圆心必须与母线轴同 x（否则杯底偏离杯身）
js("window.gms.circle(302, 250, 14, {render:'solid', height:0.005})")
gms_step("2-cup-bottom", "杯底：直径 ≈ 28px ≈ 0.088m，厚 5mm")
# ③ 把手 = 曲线 + render:'rod'（不标 rod 会被车削成小圆筒！）
#    y 控制点必须在杯身高度内（杯身顶 y≈249，低于 249 会悬空在杯口上方）
js("window.gms.curve([[332,255],[357,250],[332,282]], false, {render:'rod'})")
gms_step("3-handle", "把手：rod 杆，起点贴杯壁右缘 x=332，y∈[250,282] 贴杯身高度")

# --- lathe 画法铁律（2026-08-12 实测）---
# 1. 杯身绝不能用 circle+solid（生成实心柱 10009008，不是空心杯）；用母线折线车削（10009012 开口薄壁，双面可见内壁）
# 2. 母线/把手的 height 是“抬升”语义（position.y += height），不是高度！想定高就把画布像素画对（标定 1m/320px）
# 3. 把手必须 render:'rod'，否则在 lathe 模式被车削成小圆筒（10009012 scale≈[0.18,0.1,0.18]）
# 4. rod 按 RDP 锚点分段（不再碎成 count 段 4mm 小杆）；把手 y 控制点 < 杯顶 y 会悬空
# 5. 杯底/底座等实心件用 circle+solid，圆心 x 必须与母线轴 x 相同（对齐车削轴）
```

**人类反馈修正闭环**（任一步后人类指出问题 → 精确修正该笔，不要整单重画）：
- 尺寸/高度不对 → `gms.props(i, {height: 0.2})` 或 `gms.props(i, {render:'solid', height:0.1})`
- 颜色不对 → `gms.props(i, {color:'#E5484D'})`
- 位置/形状不对 → `gms.delete(i)` 后重画该笔（对照 summary 的 bbox）
- 等角分布（辐条/叶片）→ `gms.rotate(i, cx, cy, n)`（份数 2~12）
- 备份/恢复 → `d = js("window.gms.export()")`；`js(f"window.gms.import({json.dumps(d)})")` 往返一致
- 每笔后核对：`drawStatus` 格式 `✓ N 笔 · M 笔封闭 · K 个元件`；localStorage 键 `gms.draw.work.v1` 的 strokes 参数与 summary 一致

### 7.3 UI 等价入口（2026-09-05 补齐：真人不用写 JS 也能做 gms 命令层的事）

| gms 命令/参数 | UI 等价入口 | 说明 |
|---|---|---|
| `gms.part('sphere')` / `opts.resourceId=10009002` | 笔画弹层「元件类型 = 球体 10009002」 | 自动填 height/lift，可改；预览即 10009002 球体 |
| `opts.size`（笔画级粗细） | 弹层「粗细 size（米）」 | 写 `stroke.size`，>0 才写（如足球环线 0.006） |
| `opts.lift` | 弹层「抬升 lift（米，≥0，仅柱体）」 | 写 `stroke.lift` |
| `opts.transform = {position:[0,0,z], rotation}` | 弹层「z 偏移 + 旋转 α/β/γ」 | 旋转保留副本 x/y 位置，不双重生效 |
| `gms.part(name)` | 「组件/连接」面板：选中笔画 → 命名 | 自动识别 disc/el-disc/plate/rod/ring/sphere |
| `gms.link(a,b,{support})` | 面板：选 A/B + 支撑方向 → 声明连接 | 未接触中文报错并记入 badLinks |
| `gms.verify()` | 面板「一键总检」 | 输出 `{ok, links, floating, collides}` |
| `gms.touches(a,b)` / `gms.point(name,slot)` | 面板「查询接触」「查锚点」 | 高级查询同入口 |

## 8. 方法论 API 化建模（十八期：命名组件 + 受力链声明 + 自动校验）

流程源头：`genshin-model-studio/benchmark/METHODOLOGY.md`（连接图分析三步：受力关系 → 逐对核验 → 重叠/角色冲突）。
核心思想：**模型不再靠坐标心算"连接"**（那是悬空/重叠的根源），改用 gms API 声明受力关系，
API 做硬校验——`link` 未接触直接抛错（带间隙值），比文档约束可靠。

### 8.1 新增命令

| 命令 | 说明 |
|---|---|
| `gms.part(type, spec)` 加 `name` 字段 | 命名组件并登记世界几何（rod 线段 / disc·el-disc 圆柱 / ring 环管 / plate 盒体 / **sphere 球体 10009002**） |
| `gms.point(name, slot)` | 锚点世界坐标（米）：rod→end1/end2/mid/top/bottom；cyl→center/front/back/top/bottom；ring→center/top/bottom/left/right |
| `gms.touches(a, b)` | 两命名组件实体最近间隙 `{contact, gap}`（gap<0=相交；contact = gap≤0.001） |
| `gms.link(a, b, {support})` | **声明受力连接**：硬校验实体接触，未接触抛错（含间隙值）；support:'a'=a 支撑 b，'b'=b 支撑 a（语义记录） |
| `gms.floating()` | 悬空清单：无支撑链（接触+下方路径 BFS）到贴地组件的命名组件 |
| `gms.collides()` | 未声明（非 link）的重叠对（实体相交 > 5mm） |
| `gms.verify()` | 一键总检：`{ok, links, floating, collides}`（ok = links 全接触 + floating 空 + collides 空） |
| `gms.parts()` | 命名组件清单（含 bbox） |

> **UI 等价入口**：本表命令均可在页面「组件/连接」面板完成——选中笔画命名（按轮廓自动识别
> disc/el-disc/plate/rod/ring/sphere）→ 选 A/B + 支撑方向声明连接 → 查锚点/查询接触 →
> 一键总检；`gms.part(type,spec)` 的米制组件也可由「真人画轮廓 + 弹层参数 + 命名」复现（映射表见 §7.3）。

### 8.2 推荐工作流（物理正确建模）

```js
// 1) 组件全部命名（米制世界坐标）
gms.part('rod',  {name:'spoke30', x1:…, y1:…, x2:…, y2:…, z:0, size:0.012, color:'#999999'});
gms.part('disc', {name:'sbeam30', x:…, y:…, z:0, r:0.02, thick:0.235, axis:'front'});
// 2) 声明完整受力链（每对必须实体接触，未接触立即抛错带间隙）
gms.link('pole1','hub',{support:'a'});          // 支架支撑轮毂
gms.link('spoke30','hub',{support:'b'});
gms.link('spoke30','sbeam30',{support:'a'});    // 轮辐插入结构横杆
gms.link('sbeam30','ringA');                    // 横杆两端插环
gms.link('rope0','hbeam0',{support:'b'});       // 绳索挂悬挂横杆
gms.link('rope0','cabin0',{support:'a'});       // 绳索吊座舱
// 3) 一键自检，按清单修到 ok
var v = gms.verify();   // {ok:true, floating:[], collides:[]} 才算物理正确
```

### 8.3 关键语义（全部实测）

1. **el-disc 的 rotation 覆盖 axis 默认朝向**：`axis:'front'` 缺省导出轴向 Z（横躺圆柱）；
   要竖直必须显式 `rotation:[0,0,0]`（导出轴向 Y）。座舱/竖直盘必须写。
2. **el-disc 导出 = 圆柱 {直径=2×max(rx,ry)，高=thick}**：ry 不影响高度；规划座舱高度用 thick。
3. **支撑方向判定用"接触点局部 y"**（gms.floating 内部）：斜撑（顶在被支撑件中部）、
   大环（底远低于接触点）、悬挂（支撑者在被支撑者上方）均按接触点 y 判定，整件 bbox 判定会误报。
4. **结构件与悬挂件角色分离**：连接两环的结构横杆与挂绳索的悬挂横杆必须**分开设计并错开角度**
   （如 30° 间隔互错），否则转动时悬挂系与结构系重叠。
5. **rod 端点 = 中心线端点**：要"贴合"必须插入（端点深入对方组件半径+数毫米），
   数值相等在渲染上仍可能露缝——**插入 0.005~0.02** 才是视觉接触。
6. `gms.clear()` 会清空命名表与 link 记录；重复 name 抛错。
7. **基础元件覆盖（2026-09-05 新增）**：`gms.part('sphere', {name,x,y,z,r,color})` 直接拼官方球体
   10009002（足球/头等）；通用写法是 solid 圆轮廓 + `opts.resourceId=10009002`（scale=[D,D,D]）。
   其他官方基础元件可照此扩展白名单（src/draw/types.ts / generate.ts / src/web-shared.ts 三处）。
8. **options.canvasWidthPx 固定原点（2026-09-05 实测）**：gms.part 与服务器生成都依赖它做固定世界原点；
   任何重建 options 的路径（如 onOptionChange 切 shape）必须保留该字段，否则保存的 work 在
   刷新/独立预览时会按新原点解释 → 身体解散（详见坑 #17）。作品持久化后必须刷新+独立预览验证。

### 8.4 历史版本管理（十九期：网页查看与比对）
`benchmark/history/` 存持久版本（每版 work.json + meta.json）。网页「🕘 历史」按钮：
- **保存**：把当前作品存为新版本（输入版本名）；**加载**：一键 `gms.import` 恢复任意历史版本
- **删除**：确认后移除；列表按时间倒序，显示 笔画数/元件数/tags
- 后端 API：`GET /api/history`、`GET /api/history/get?id=`、`POST /api/history/save`、`POST /api/history/delete`
- **8787 历史条目契约（2026-09-09/10 长跑实测）**：`POST /api/history/save` body `{name, tags, work, items?}`；
  `work` 必须 `{version:3, strokes, options}`，stroke 带 `id/points/render/resourceId/kind`（**克隆近期好条目骨架最稳**，别从零拼）。
  颜色必须 **int**（`parseInt('#1d1d1f',16)`）——传 `'0x1d1d1f'` 字符串会**静默全白**（坑 #21）；
  `version:1` 旧条目/字符串色坏条目直接删别修；服务端保存自带网格清理（实测 3847→3837 面），
  存完 `GET /api/history/get` 回读验证再交付。
- 比对流程：8787 加载版本 A、8788 加载版本 B（两个页面共享同一历史目录）
- 注意：修改 server.ts 后需按 PID 重启服务（`pkill -f "node dist/web/server"` 会匹配 bash 自身——技能坑 #3）

### 8.5 离线核验（管道产物）

`python3 benchmark/connectivity-check.py <items.json>`：对 T6 摩天轮做 81 项连接点核验
（接触类 gap≤0 / 分离类 gap≥0），输出悬空/重叠清单。与 gms.verify() 互补（一个在浏览器内实时、
一个对落盘 items 离线重算，均可确定性重跑）。

### 8.6 工作节奏与调试模式（迭代实测：r1 失败 r2 成功的分水岭）

**铁律：先跑管道，后谈几何。** 第一步就是写初始组件脚本（30 分钟内）→ `scripts/run-gms-model.sh` →
看 summary/items。**禁止**任何离线几何推演/参数扫描/自写校验脚本（实测：自写 sweep.py 离线建模
21 次调用全耗在数学上，一次管道没跑，1500s 超时失败；直接跑管道的版本 24 次调用即成功）。

**脚本内置自检模板**（run-gms-model.sh 直接捕获，无需会 browser-harness js()）：
```js
// …全部组件（每个 part 带 name）+ link 受力链声明…
var __v = gms.verify();
if (!__v.ok) throw new Error('VERIFY_FAIL ' + JSON.stringify({floating: __v.floating, collides: __v.collides, badLinks: __v.links.filter(function(l){return !l.contact})}));
```
管道 summary.ok=false 且报错含 VERIFY_FAIL JSON → 按清单改参数重跑（每轮只改脚本参数，≤6 轮收敛）。

**最小调试脚本模式**（怀疑 API 行为时，别考古源码）：
```js
gms.clear();
gms.part('rod', {name:'a', …}); gms.part('rod', {name:'b', …});
JSON.stringify(gms.touches('a','b'));  // {contact, gap}
```

**已知行为澄清（实测）**：
- `gms.touches/link` **对参数顺序对称**（touches('a','b') === touches('b','a')）。
  注意：2026-08-16 修复过 segSegDist 交叉项符号（斜杆共端点场景曾双向不一致，水平/垂直时 b=0 掩盖），
  当前版本已对称；link 未接触报的间隙是真实坐标间隙——请修坐标。
- **共端点连接用锚点，禁止手算端点坐标**：下一组件起点 = `gms.point('hang3','end2')` 取上一组件端点
  （r2/r3 两轮独立子代理都在"挂杆端点=绳索上端"处手算差出 0.04——锚点 API 就是为此设计的）
- 盘/座舱厚度必须在结构间隙内：双环 z=±0.12 时座舱厚 ≤ 0.20，否则穿环且
  connectivity 按最近中心匹配会错位（实测 0.96 厚引发 5 项假 X）
- 修改 web 后页面必须 reload 才拿到新 index.html/preview.js；reload 会清空已建模，先 export 备份

### 8.7 复杂结构设计方法（以摩天轮为例——公式化推导，非固定答案）

没有设计方法时子代理会去考古参考实现（实测 r3/r4：读 validator/spec/历史 items 找尺寸，
24 次调用零产出）。设计方法必须**自足**：给出推导步骤与公式，任何模型用自己的参数即可推出全套尺寸。

**设计步骤（受力链驱动）**：
1. **选主尺寸**：轮半径 R（0.6~1.0）、轮心高 H（≥ R+0.4，保证最低吊舱不接地）
2. **双环**：z=±d。d 由座舱厚 t 决定：`2d − 环管直径 ≥ t + 0.015`（座舱在环间不穿）
3. **座舱**：竖直 el-disc（**必须 `rotation:[0,0,0]`**），直径 0.15~0.25，高 0.18~0.25（厚=高）
4. **轴盘**：r=0.04~0.07、thick=0.4~0.5（z 向，端面 = 支架接触面）
5. **支架**：4 根斜杆，底跨距 ≥ 0.8R，顶 z=±(thick/2 + 杆半径 + 0.001)（贴轴端面）
6. **轮辐**：6 根 60° 均布，线径 0.01~0.015；内端贴轴盘外缘、外端插结构横杆
7. **结构横杆**：与轮辐同角度，粗杆（0.03~0.05），长 = `2d − 环管直径 + 2×0.01`（两端插环）
8. **悬挂系**：角度与结构横杆错开 ≥25°（否则转动重叠）；挂杆从轮辐中段沿法向伸出，
   悬臂端半径必须 < 结构横杆表面半径（不穿）
9. **绳索**：上端 = 挂杆端点（**用 `gms.point('hangN','end2')` 取锚点，禁止手算端点坐标**），
   长 0.05~0.1，下端插座舱顶 0.01
10. **闭环**：全部命名 + link 受力链 + 脚本内置 verify 抛错 + connectivity-check 核验

**验收一致性（实测教训 r5：自选 R=0.6 导致支架/轮辐未进核验器分类，10 项漏检）**：
`benchmark/connectivity-check.py` 按 T6 参数表分类（环 0.025@z±0.12、轮辐 0.012×0.649、横杆 0.04、
挂杆 0.012×0.14、绳索 0.012×0.06、座舱 0.2、支架 0.025、轴盘 0.11）。**推荐直接用基准尺寸
（R=0.75、H=1.25、轴盘 r=0.055/thick=0.42、环 z=±0.12、支架底 ±0.85）**——这不是抄答案，是"验收量纲"
（核验器按它分类，全部角色才能被检查到）；若自选尺寸，无需改脚本：`python3 benchmark/connectivity-check.py items.json --param R=0.6 --param ringInnerZ=0.08`
（2026-08-16 已加 CLI 覆盖，未知参数报错列出可用键），并在 REPORT 说明覆盖值。
**禁止读 `benchmark/` 下任何文件考古**（validator/spec/历史 items 都不行）——设计参数要么自己推，要么用本文公式。
**一次写全**：先完整设计（参数表算好再落笔），目标 ≤3 轮管道收敛（r5 实测 11.8 分钟/33 调用全绿）。
**文件白名单（实测教训 r6 考古 src/web 超时；r8 抄 /tmp 历史 items 冒充产物）**：
可读 = 本技能 SKILL.md、`benchmark/METHODOLOGY.md`、`scripts/run-gms-model.sh`、`benchmark/connectivity-check.py`。
**禁止读**：`src/`、`web/`、`benchmark/` 其余一切、`benchmark/runs/`、**`/tmp/ferris-eval*` 等任何历史评估产物**。
核验的 items.json **必须来自本次 `run-gms-model.sh` 的输出**（cp 历史产物=作弊，验收作废）。
grep/sed 源码找实现=最大时间黑洞，API 语义以 §7/§8 为准，不许再验证。

## 9. 高精度建模方法（300 面档，2026-09-05 足球运动员 v3 实证）

> 从「能看」到「游戏可用精度」的核心方法。详细版：
> `genshin-model-studio/docs/game-engine-knowledge/method-2026-09-05-high-precision-modeling.md`。

1. **先定预算**（面/元件数），再把最高段数给最值得细分的曲环（球缝环等）。
2. **count 是精度主杠杆**：直线恒 1 段；闭环圆/椭圆 = `3×(count+1)` 段（`count=60 → 183 段`）。
   不要无脑拉满——会叠无数小杆，细节反而脏。
3. **三层组织**：轮廓层（sphere/el-disc/rod 定剪影）→ 贴附层（disc/ring 上色带/面板）→
   装饰层（细 rod 0.0028~0.006、小 disc r 0.005~0.02）。每条细节必须回答「让哪里更好读」，
   答不出就删（实例：胸前条纹+号码叠成“哑铃”，删条纹后立即清晰）。
4. **物理角色分离**：结构件命名+link+verify；装饰件不命名（避免 collides 误报）。
5. **标定铁律**：canvasWidthPx/canvasHeightPx 必须保留（坑 #17）；作品必须刷新+独立预览复现。
6. **视觉迭代闭环**：先轮廓 5 视角过关 → 逐层加细节 → 每次对比截图 → 近景无“看不懂的凸起/线头”才收敛。

本波实证：114 笔画 / **295 元件**（目标 300±20），count=60 → 球缝环 ≈183 段，其余 113 件做身体+球细节；
10009002 球体 ×3（头/头发/足球）+ 10009008 ×292；无地面/背景（聚焦球员+球）。

### 9.7 真人操作验证清单（2026-09-05 UI 补齐：程序化 API 与网页端一致）

**目的**：证明「真人用鼠标/键盘 + 页面控件（不写 JS、不调 `window.gms.*`）能复现
`scripts/draw-soccer-player.js` 等价作品」。新控件（弹层 size/lift/z/旋转/球体 +
组件命名/连接/查询/总检面板）覆盖脚本用到的全部能力。

**八类动作（全部有 UI 入口）**：
1. 矩形 solid + 高度 → 草皮（矩形工具 + 弹层「柱体」）
2. 自由笔椭圆 solid + 旋转 → 球鞋（自由笔闭口椭圆 + 弹层 α/β/γ）
3. 直线 + 粗细/颜色 → 小腿/大腿/手臂（直线工具 + 弹层 size/自定义色）
4. 圆 solid → 短裤/躯干/球衣徽/五官（圆工具 + 柱体/方向/高度）
5. 圆 → 元件类型「球体 10009002」→ 头/头发/足球（自动填 height/lift）
6. 圆（默认杆）+ size=0.006 → 足球环线
7. 圆 solid axis=front + z 偏移 → 五边形块
8. 命名 + 连接 + 一键总检（「组件/连接」面板：自动识别 kind → link(含 support) → verify）

**自动验证脚本**：`scripts/verify-ui-soccer-player.py`
（`browser-harness < scripts/verify-ui-soccer-player.py`；不调用 gms API，
仅 DOM 事件 + PointerEvent 合成 + 页面控件；需先 `Emulation.setDeviceMetricsOverride(1400×900)` 固定 575×460 画布）。

**本轮实测证据**（2026-09-05）：
- 状态栏：`✓ 23 笔 · 15 笔封闭 · 54 个元件`
- `POST /api/draw-model`（直接读 `delivery/ui-soccer/ui-work.json`，非 gms API）：
  httpStatus=200、strokeCount=23、itemCount=54、resourceIds = 10009001×1 / 10009008×50 / 10009002×3
- 语义对照：UI localStorage `delivery/ui-soccer/ui-work.json` 与脚本
  `delivery/soccer-player/work.json` 的 render/height/axis/size/lift/transform/resourceId
  **23 笔逐字段相等（0 mismatch）**
- 一键总检：`✓ 24 条连接全接触 · 无悬空 · 无重叠`（floating=0, collides=0,
  ball-ballRing gap=-0.003 与脚本一致）
- 截图：`delivery/ui-soccer/{main-page,view-iso,view-front,view-left,preview-demo}.png`
  read_image 复核：球员完整、球体贴合、徽章/五官可见、无悬空/穿模/解散；
  刷新主页面 + 独立预览页均 `23 笔 · 54 个元件` 不散架。

## 10. 表面网格 + 细节拆分工作流（2026-09-06，甘雨 v9-v18 实证）

### 10.1 新增 base 元件/部件（gms.part 类型与笔画级 resourceId）
| 类别 | 类型/参数 | 语义（实测） |
|---|---|---|
| 表面面板 | `gms.part('quad', {x,y,z,w,h,normal:[nx,ny,nz],color,thick})` → resourceId **10009003** 平面 | 零旋转平躺（法线+Y）；任意法线用 `rotation=[90+δ, 90°−θ, 0]`（δ=−asin(ny)、θ=atan2(nz,nx)）贴合曲面坡度 |
| 三角面片 | `gms.part('tri', {x,y,z,w,h,thick,axis})` → resourceId **10009006** 三棱锥（压扁=三角面） | 用于发尾/鞋楔/菱形饰 |
| 锥 | `gms.part('cone', {r,h,axis})` → **10009009** | 角尖/收尖 |
| 球 | sphere 10009002 / 柱 10009008 | — |

### 10.2 曲面生成 helpers（脚本内 JS 函数）
- `surface(rings, U, colorFn, thick)`：截面环（{y,cx,cz,rx,ry}）→ UV 方格网；法线=cross(dU,dV)（含坡度）；面片取 **w/h=1.0 满格共边（无面缝）**。
- `offsetRings(rings, d)`：衣物独立壳 = 身体表面外扩 d（球衣 0.008/短裤 0.006/袜 0.005）。
- `ringsBetween/ringAt/interp`：按测量环插值（衣装带、四肢加环）。
- `ribbon(pts, widths, color, axis)`：发丝飘带面（法线朝 axis 径向）。
- 批处理：脚本顶部 `window.__gmsBatch = true`，末尾 `window.__gmsBatchEnd()`（数百-数千笔一次成模）；`MAX_DRAW_STROKES=30000`。

### 10.3 剪影量化（对比验收）
- `window.gmsPreview.setGridVisible(false)` + `setBackground('#000000')` + `resetView()` → 干净剪影；
- `scripts/compare-ganyu.py`：剪影 bbox（**列数>12/行数>4，必须包含手足**）→ 等高/保宽高比 → 中心对齐 → **IoU**；宽度曲线用「宽/高」比值逐高度误差（目标 IoU≥0.70、关键行 ≤12%）。

### 10.4 细节拆分 ticket（像画画：轮廓→局部→细节）
- `scripts/parts-tool.py gen|list|update|run|compose`：按部位（torso/shorts/legs/arms/face/hair/shoes/patterns）切分维护 + `manifest.json` tickets；
  `run <ids>` 只跑局部（秒级，其余缓存），`compose` 汇总（version:3）→ POST → base64 分块导入 → 截图。
- `scripts/run-gms-parts.sh <out> <part.js>...`：局部生成+拼装流水线（等价旧式整跑，速度提升数倍）。
- 对照方法：`reference/details/01..13` 从原图三视图切局部细节图，逐张 read_image 核对后再改对应 part。

### 10.5 实测基准（甘雨 v18，6623 面）
- IoU 0.6366–0.6536（低模方格网剪影表达上界≈0.65，再上需轮廓级拟合）；
- 宽度逐行：腿/膝/髋/腰/头 1.6–10.5%（≤12% 达标）；细节 8/8 tickets done；
- 结论：**先做对框架（测量驱动+方格网+无缝面片+局部拆分），再逐细节调优**——这是复杂人物建模的正确姿态。

## 11. 网格-面片体系（2026-09-07）

> 适用于「自定义多边形 / 有机曲面」物体（脚、杯、曲面板）。与 §1–§10 的经典画线 route 并存；`gms.part('mesh', …)` 与面板化、门禁、放样全部来自 `src/mesh/`。

### 11.1 网格元件声明（gms.part('mesh')）
`gms.part('mesh', { mesh: { vertices, faces, colors? }, material? })` → resourceId **10009019**。
- `vertices` 为世界坐标（米）；`faces` 每 3 个下标 = 1 三角；`colors` 逐面 `0xRRGGBB`。
- **警告**：10009019 直出的 `.gia/.gil` **只携 resourceId + 变换，不携几何**（GIA/GIL 容器不含自定义网格；实测 c-mesh-direct 817B）。要产出真实几何必须**面板化**（见 §11.3 / export-mesh / contour-model）。

### 11.2 面板化规则（src/mesh/panelize.ts，确定性）
- 配对（共享边 + 法线 cos ≥ 0.999）→ 10009003 平面（显式局部基旋转，Y 向厚 0.005）。
- 未配对三角 → 10009006 三棱锥压扁（厚 0.002）。
- 退化面（面积 < 1e-9）→ 10009001 盒兜底（1.5mm）或 `{degenerate:'skip'}` 只计数。
- 颜色逐面透传；旋转 = 显式局部基 → YXZ 欧拉。

### 11.3 面板化出口 / CLI
```bash
npm run build --silent && node dist/src/cli/export-mesh.js <mesh.json> --out-dir <dir> --format both --budget <N>
npm run build --silent && node dist/src/cli/contour-model.js <input.json> --out-dir <dir> --points 64 --cap both --views
```
- `export-mesh`：吃 structure 超集或独立 mesh JSON（vertices/faces/colors），面板化 → `.structure/.gil/.gia/.summary`。
- `contour-model`：吃 `{topOutline+sideProfile}` 或 `{rings}` → 蒙皮成 mesh → 面板化 → 门禁 → 导出（同上）；`--views` 额外生成五视角 SVG。
- 两者都默认开启验证门禁；`--no-gate` 跳过（summary 记 `SKIPPED_GATE`）。

### 11.4 门禁阈值表（verify.ts 默认值）
| 检查 | 判据 | 默认阈值 |
|---|---|---|
| watertight | 每条边引用次数：2=闭合、1=开边、>2=非流形 | 开边/nonManifold=0 |
| seams | `weldTolerance` 近邻聚类 | 2e-4 m |
| normals | 面法线·(面心−质心)<0（仅闭网格强制） | 0 个朝内 |
| degenerate | 面积 < minArea | 1e-9 m² |
| skinny | minE/maxE < ratio 且占比 ≤ pct | 0.08 / 5% |
| areaRatio | p95/p5 ≤ maxRatio | 20 |
| budget | 单元数 vs `--budget` | requested=N，used=单元数 |

### 11.5 放样分辨率与瘦三角
- contour-loft 默认重采样 **200 点**（高保真）；**设计预算档 points=64**（cap 盖扇干净过门禁）。
- cap both 时盖扇三角 `minE/maxE ≈ 2π/points`：200 点 ≈ 3.1% < 8% → 门禁报「瘦长三角」；64 点 ≈ 9.8% > 8% → 通过。
- 高保真要 200 点 → `--no-gate` 并在摘要/交付说明标注 `SKIPPED_GATE`（仅演示，不作正式凭证）。

### 11.6 校准状态（docs/calibration-mesh-elements.md）
相关基元**均未校准**：10009003（朝向/双面/尺寸）、10009006（压扁/任意三角）、10009012（轴向/空心）、10009019（游戏侧是否按 vertices/faces 渲染几何）。未校准=游戏语义未验证，面板化产物按「候选」对待，**不写为已闭合**；用户把 `delivery/calibration-mesh/` 对照后果回传后才可闭合。
2026-09-09 长跑实测更新：面板化产物经 `scripts/max/build-macbook-gia.mjs`（spec+geometry → mesh JSON → `export-mesh`）产出 .gia（596,832B / 3004 单元），经 powershell base64 管道写入游戏目录、双侧 sha256 一致、游戏可导入——**容器级导出链已闭合**；游戏内渲染观感按用户口径（浏览器渲染 + 盲测为硬验收）未逐项核验，10009003/10009006 观感校准仍开放。

### 11.7 推荐链路（先轮廓→环→面板化→门禁→导出）
`reference-fit`（topOutline+sideProfile → rings）→ `contour-model`（loft → mesh.json）→ panelize（→ 单元序列）→ verify（门禁，默认开）→ export（.structure/.gil/.gia + 摘要）。每步用 `--format-txt text` 看 `mesh=`（faces/quads/tris/degenerate/units）与 `gate=`（passed/failed/skipped）。


### 11.8 环境事实与坑（2026-09-06 实践固化）
- **持久化**：作品存 `localStorage['gms.draw.work.v1']`（{version,strokes,options}）；刷新/导入走
  `applyWork` 白名单——v3.6 起保留 `resourceId 10009019 + mesh + material`（mesh 模型刷新不再丢）。
- **改 web/index.html 后必须 cache-bust**：`location.href='http://localhost:8787/?t='+Date.now()`
  （普通 reload 可能用旧缓存）。
- **预览相机**：`gms.part` 提交后自动 `fitCameraToContent` 会晚于手动 setCamera——先提交、
  sleep 等待、再 setTarget/setCamera、再截图。球坐标：yaw=0 相机在 +z（沿 −z 看）；模型脚沿 z 轴。
- **多视图验证台**：一次创建 >16 个 WebGL 上下文会被浏览器回收（画布空白）→ 用**单渲染器 +
  2D drawImage 拷贝**到多个画布。
- **导出按钮**：页面有两个“导出 .gia”——顶部一期（示例导出）与底部画线建模；
  要取 `document.querySelectorAll('button')` 里**最后一个**含“导出 .gia”的按钮，
  或直接 POST `/api/export?format=gia`（body `{data:{name,items}}`）。
- **服务端导出默认目录**：`scripts/web-server.js` 的 `/api/export` 会同步写
  `GMS_EXPORT_DIR`（默认用户游戏导出目录 `Beyond_Local_Export`）；响应头不可放中文路径（会 400）。

## 12. 照片级保真长跑工作流（2026-09-09/10 MacBook Pro 14 实证）

> 从「CAD 面片」到「盲测误判到线 + gia 游戏导入 + 演示视频」的完整长跑（3.5h 主体 + 次日反馈连跑 r8→r12，每轮 ~15-30min 修→commit→push 闭环）。
> 行为规律（90 秒架构锁定、评价器锚定、目标级纠偏可推翻锁定等）在全局记忆 [[LLM 长跑任务行为规律]]；本节只收建模技能可直接复用的部分。

### 12.1 核心原则：错误是常态，接错纪律才是产能

长跑全程错误不断——端口 z 整簇镜像、符号错误推墙外凸 1.5mm、上盖浅 8mm、float32 hash 噪声 bug、字符串色回退全白、两次仪器假警报——但每个错误都被**多源交叉验证 / 盲测 / 官方锚定 / 仪器自疑**接住并转化为收敛。高质量不来自不犯错，来自接错速度。写进流程的每条纪律（多源交叉、盲测、回读验证）都比「更小心」有效。

### 12.2 资产与管线（genshin-model-studio 内实测可用）

- **原语**：`src/geom/solids.ts`（圆角扫掠 / 带孔平板 plateWithHoles / 径向填充板）。
- **渲染**：`src/render/*`（零依赖路径追踪：SAH BVH + GGX/VNDF + MIS + 解析环境 + AgX + À-Trous 去噪）——实现细节在源码自文档，不复制进技能。
- **导出**：`scripts/max/build-macbook-gia.mjs`——spec + geometry → mesh JSON → `export-mesh` 面板化 → `.gia`（596KB / 3004 单元，游戏导入实测 ✓）。
- **页面双通道（职责勿混）**：`scripts/max/page-mesh.mjs` → `web/draw/macbook-current.json`（draw 结构预览）‖ `web/draw/photo.html`（three.js PBR + 材质标定 + 屏幕 UI 纹理）= 观感验收通道。draw 只查结构，photo 才判像不像。
- **屏幕纹理**：按真实逻辑分辨率制画布（1512×982、真实 px 字号：菜单栏 24 / 侧栏 13 / 图标标签 11 / Dock 48-64）+ mipmap/anisotropy，**锐利缩小、禁止放大采样**。

### 12.3 测量纪律（§3.5 的操作化）

- 自建标尺：官方图已知尺寸定 px/mm（USB-C 开口 8.27mm=50px→6.08px/mm），≥3-4 图交叉；官方支持页精确值优先。
- 对照协议对称：官方产品图=长焦近正交 → 对照渲染用长焦/正交；透视 vs 正交必错位。
- 转发来的测量数字只当注意力锚，自己重测再改 spec（端口案：转发 6.0 实为 7.7，阴影污染）。
- 推导链全写进 spec.ts 注释 = 可审计测量档案（修 bug 改档案，不改裸数）。

### 12.4 盲测 A/B 协议（「像不像」唯一硬门）

- 工具：`scripts/max/ab-{setup,stage,blind,score}.py`——独立裁判子代理；防作弊：刺激物重编码、key 即删、不透明目录、**每张图不同画布尺寸**（防聚类捷径）。
- **裁判判据 = debug 信息源**：像素测量的裁判揪出过渲染器 float32 hash bug（uSeed*37≈7.5e8 小数位全灭）——裁判赢了去修渲染器，不是修裁判。
- 分数趋势即进度（单轮噪声大）：多波 0%→41.7%（v7）→50%（我方图 9/18 首到线）；判据修完必须复测，别拿旧分当现状。

### 12.5 渲染与反馈经济学

- **分档渲染**：blockout 低 spp 快迭代 → 里程碑才高 spp。长跑无分档，渲染吃掉墙钟 74%（100 张里 57 张同一视角）——单视角隧道 + 无档全量 = 双重浪费。
- **看图几乎免费**（read_image 81 张共 7.3s）：每张渲染都看；最长盲飞 28min 恰是质量停滞期。
- **反馈轮纪律**：修 → commit → push → 回执里自报 HUD 版本号（`r10` 等）防用户看旧缓存报假 bug；环境抖动（Edge CDP 死）用守护脚本（`scripts/max/ensure-edge.sh`）消化，不手工重启吃轮次。
- **BUILD 戳必须是机制，不是记性**（2026-09-11 白线战：手工 bump 漏了五轮，用户截图显示 `r38` 而实际已是 `r43`，双方都无法确认看的是哪一代）。已实现：`scripts/web-server.js` 的 `sendFile()` 在响应 HTML 时把 `var BUILD = '…'` 字面量替换为 `git rev-parse --short HEAD`（工作区脏则加 `-dirty`，3 秒缓存）→ **用户截图里的代次恒等于真实代码代次**；注意改 `web-server.js` 后要重启服务（`curl` 探活后再起，避免 EADDRINUSE）。

### 12.6 伪影归属流程（2026-09-11「前唇白线」战固化：19 提交 / 32 轮 / 3.6h，全项目最贵的一条 bug）

**开战顺序：先修尺子 → 钉归属 → 再消融。** 白线战前 6 轮（≈1h40m）全花在「量错对象 + 空实验」上；正确顺序能把这段压到十几分钟。

- **① 先修尺子，复现先行（别用自选视角开战）**
  - 口径先对**已知好/坏样本**校准：白线战早期「全帧亮>200 占比」量到的其实是屏幕 Dock 图标（R47–R53 结论整批作废）；手输像素坐标三次锁错特征。
  - 复现用**用户的机位**（`node scripts/max/page-set.mjs --match 'photo\.html' --js "location.href='…?v=<epoch>'"` 重载 + 页面固定视角按钮，或 `__photo.shoot(view,w,h)`）：用户一次复现抵我五轮自选视角。
  - **判据升级会使结论反转**（filletTop 0.60 从「更差」反转为「更好」）→ 反转要公开重评，不护旧结论。
  - 每条读数必须绑定 **机位 + ROI + 指标** 三件套；不同口径的数字跨轮不可比。

- **② 归属工具箱（把「这条线是谁的」从猜数天变成 6 分钟）**
  顺序：**色标分组 → 隐藏单 mesh → ray-pick 全命中层**。
  - 色标：`geometry.ts` 临时加 `M.DBGPLATE: 23` + `mats[M.DBGPLATE] = makeMaterial({name:'dbg-deck-plate', baseColor:[0.95,0.12,0.35]})`，在目标件发射前后 `b.material(...)` 切回 → 页面按色分组、该件单独成 mesh。**生效判据 = 网格 colors 直方图里出现该色**（白线战一次色标没进网格，导致两次「隐藏扫掠」是空操作）。
  - 隐藏对照：`__photo.root.children.forEach(m => { …按材质色过滤… m.visible = false })` → 同机位重渲比像素。
  - `scripts/max/ray-pick.mjs`：**永远打印全部命中层**（首命中色/坐标/法线 + `nHit` + `next` 色与坐标 + 命中分类 LIP/BACK/WALL/TP-EDGE/KB…）。白线战靠它证伪 z-fight（第 2 命中是机身底面 `Δy=10.95mm`），并证明「最亮与最暗像素同属 z=110.600、法线 (0,0,1)、同一铝材质」→ 平面自己不可能一亮一暗 ⇒ 只能是着色法线被改写。
  - 备查仪器：`scripts/max/tri-at.mjs`（竖直柱内全部三角形堆栈）、`weld-audit.mjs`（共面打架扫描，带真值自检）、`deck-qa.mjs` / `curv-qa.mjs`。

- **③ 消融三件套：一次一件 / 验证改动真生效 / 看图**
  - 「真生效」= 补丁替换计数 ≥1 **且** 改 `src/**` 后 `npm run build` + `grep dist`（`scripts/max/page-mesh.mjs` **import 的是 `dist/`**）**且** 网格 verts/tris 或渲染 md5 变化（例：唇口圆角 8→24 段使网格 7.69→9.62MB = 生效证人）。
  - 静默空实验的两个常客：python `str.replace` 锚点不匹配 → **0 次替换且不报错**；`cp x .scratch/r54/y && python …` → 目录不存在时 cp 失败、`&&` 短路吞掉整段。
  - 读数不变时，**先证伪「实验没发生」，再解释成「假设不成立」**。看图永远不能省（`read_image`）。

- **④ 区域边界 = 伪影温床**
  - 「凡特殊处理区，都有制度接缝」：位移窗口边界、法线域边界、采样加密带边界、开孔谓词边界。伪影**沿轮廓走** ⇒ 先查边界。
  - 白线战两处实证：点状白虚线 = 解析法线区（窗口内）与平均法线区（窗口外）的接缝 → 法线单源化即消；沿凹槽轮廓的亮带 = 位移窗口上界与「是否被位移过」判据重合。
  - 边界伪影的正解是**单源化**（每段可见面只归一个机制/一张网格，交接处共享顶点环），不是加细分、不是加材质、不是调圆角半径。

- **⑤ 一条投诉 = 多个缺陷叠加**（前半场补遗 9）。用户说的「白线」实为 ≥3 个独立缺陷（缝亮 / 黑带+对比错觉 / 虚线锯齿）；**自己的单项指标过 ≠ 用户核验过**。用户说「问题依旧」时先问「这是几个缺陷里的哪一个」，不在上次修法上再叠一层。
- **⑥ 尺子债连本带息**（补遗 10）。发现口径/归属 bug 后只修尺子不够——**用坏尺子得出的上游结论必须主动作废重测**（白线战作废了 r41–r43 全部，战役才可解）。坏尺子的污染半径 ≥ 所有信任过它的轮次。
- **⑦ 被替换的旧结构要删净**（补遗 11）。r40→r41 把缝改由台面板的孔提供后，旧哑光领圈没删 → `y=deckY` 共面重叠 417 面，死代码成新病灶。→ 每次改几何先 diff「这次替换了什么」。
- **⑧ 代码假设要与执行域一致**（补遗 12）。解析梯度处处假设 `(SCOOP_D+0.06)`，而 0.06 的下沉只执行在 flatTop 顶点 → 边界台阶。→ 改参数后问「这个假设谁在执行、是不是同一批顶点」。
- **⑨ 未竟线索立即上面板**（补遗 13）。真机制 17:37 就现过一次身（位移带边界 = 存储法线符号翻转分界），却因跨 turn 丢失、晚 80 分钟才回收。→ **机制假设一成形马上写 `.scratch/ISSUE-BOARD.md`**，哪怕当轮没空验证。
- **转折点是基建，不是修复**（补遗 14）。本战真正的转折 = 16:32 归属工具 + 16:59 用户机位复现；此前用户三次纠偏全花在「你看的地方就不对」上，此后一次都没有。→ 长跑战役**第一笔预算投给尺子与归属**。
- 完整战例（15 行错误谱系表 R39→R72 + 逐轮读数 + 用户纠偏逐字）：`docs/game-engine-knowledge/retrospective-2026-09-11-front-lip-white-line.md`；同源规则见本仓 `AGENTS.md` 铁律 11 与 `diagnosing-bugs` 技能 Phase 4/5。另四条通用规律（真值按特征分型不做统一阈值 / 分清真缺陷与衬托层 / 已验证的牌别丢 / 诚实纪律是底座）见该文档 §三、§四。

### 12.7 孔角 / 轮廓的亚像素伪影（2026-09-10 R76 固化：触控板四角「小的白线」）

- **症状 → 归属**：断续的**点状白虚线 / 亮斑**（间距 ~10–15px）≠ 着色问题、≠ z-fight。判据 = 用
  `ray-pick` 打点取命中三角形，**三个顶点近共线**（R76 实测 `[67.45,11.5,102] / [67.424,11.5,97.421] / [67.45,11.5,97.2]`
  = 0.026mm 宽 × 4.8mm 长的针形三角），且顶点法线全同（(0,1,0)）⇒ 亚像素宽长条光栅化必然断续。
- **反模式**：**扫描线开孔 + 三角扇补角**。扫描线只在带中点取一次孔区间 → 方阶梯；三角扇从方角拉，
  在弧的**切点附近**三角形必然退化成针 → 修好了方阶梯却引入点状虚线（R74 → R76）。
- **正解**：孔保留**真实圆角**，逐角**精确投影裁剪**（直边区把 x/z 推到边、角区沿弧心径向推到弧），
  孔的 z 两端再按**弧长**补断点（每带跨角 ≤11.25°，弦高 ≤ rr(1−cos5.6°)），
  断点必须加在 `snap()`（近重合并档）**之后**，否则近切点处的密断点被吃掉。
- **边界判定必须严格**：点正好落在孔的上/下直边（= 边界）**不算孔内**。否则「投影 → 复检仍在孔内 → 再投影」
  六轮推不出去 → 整块面作废 → 孔边缺一条料（R76 实测 0.36mm）。
- **多孔/相切孔**：吸附只用「该 x 断点**所属的孔**」的边界；两孔重叠区推不出去的角 → 该面作废，
  绝不硬塞成覆盖空腔的面。
- **换算法要换尺子**：旧指标（`hole-arc-qa.mjs` 用「只被一个三角形使用的边」当孔边界）在出现梯形裁剪后
  不再可比（同网格改写算法后读数反而变大）→ 换**点包含扫掠**的独立尺子 `scripts/max/hole-boundary-scan.mjs`
  （`--cx/--cz/--r/--sx/--sz` 从弧心按角度向外找**首块料**；+Δr = 缺料、−Δr = 料越界）。
- **每个被投诉的角都要有固定机位**：`tpFR/tpFL/tpBR/tpBL`（相机在被看角外侧、弧心为注视点）；
  改完先跑四角 + 旧验收机位（`wellcorner`/`lipfront`/`groove34`）做同口径回归，再报「已修」。

### 12.8 渲染算力纪律（2026-09-10 教室环境长跑固化：CPU 全核渲染冻住用户整机，~55min 后才切 GPU——先探算力本可全免）

**重渲染战役（盲测出图、高 spp、视频序列）第一笔预算投给「算力拓扑盘点」，不是调 spp。**

- **探针三连（开工 1 分钟）**：
  ① WSL GPU 直通：`ls /dev/dxg` + `/usr/lib/wsl/lib/nvidia-smi`（**2026-09-10 22:27 WSL 重启后已生效**：RTX 3060 Laptop 6GB、驱动 610.88、CUDA 13.3；此前"本机不存在"是重启前旧观测——**探测结论会随 WSL 重启翻转，别把单次观测写成永久事实**）；
  ② 宿主 GPU（WSL interop 直接查 Windows）：`timeout 20 /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command "Get-CimInstance win32_VideoController | Select Name,DriverVersion"`——实测本机有 **RTX 3060 Laptop 6GB + Iris Xe**（nvidia-smi 口径；Win32_VideoController 报 4GB 是共享内存假象）。**WSL 里看不到 GPU ≠ 机器没有 GPU**；
  ③ `nproc` 核数（8 核即 CPU 上限）。
- **GPU 首选通道 = 宿主 Edge WebGL2（CDP 9222）**，零依赖合法（浏览器 API 不算第三方依赖）。已验证管线：
  `scripts/max/gpu-render.mjs`（驱动：连 Edge → 注入 → 收图）→ `gpu-scene.mjs`（`packScene` 场景打包）→
  `gpu-trace.js`（注入页面的 WebGL2 路径追踪器：BVH/三角形/材质全纹理化 + 分段批量渲染 + 浮点累加缓冲 + base64 分块上传 `window.__scene`）。
  实测对比（gpu-render.mjs 头部记录）：CPU 0.13 Ms/s、720×540@192spp 一张 9 分钟且占满 7 核、拖慢同机其他会话；GPU 快两个数量级且不占 WSL 一分 CPU/内存。
- **⚠ GPU 也分两种用法，验收通道必须是「光栅页」不是「路径追踪」（2026-09-10 23:00 用户二次纠偏后定案）**：
  GPU 路径追踪一张 640×480@192spp = 3900 万次采样、192 个 draw call、**连续 60+ 秒把 GPU 压满**（实测 GPU 利用率 4%→100%、功耗 20.6W→44~49W、温度 58→64°C）——笔记本整机照样被拖死，「简单 GPU 测试也卡机」即此。
  **正解 = MacBook 实证的 photo.html 模式**：three.js 光栅化页（PBR + PMREM IBL + ACES + 胶片颗粒）渲**一帧（毫秒级）→ CDP 截图**，几何多一个数量级也「轻轻松松」；配套 `shoot()` 截图 API。
  路径追踪（含 GPU 版）只可用于小图快速迭代/交叉验证，**禁止作为验收出图通道**——先把"这张图需要几帧、每帧多久"算清楚再动手。
- **WSL GPU 直通的真实用途 = 视频硬编解码（NVENC/NVDEC），不是渲染**：直通虽已生效，但 ① WSL CUDA 与 Windows 宿主共享 VRAM——实测仅剩 ~600MB/6GB（宿主桌面/Edge/串流占 90%），大 CUDA 负载跑不动；② 零依赖 JS 用 CUDA 需原生绑定 = 违反铁律，渲染仍首选 Edge WebGL2。视频导出一律 `ffmpeg -vcodec h264_nvenc`（快 10-30×、不占 WSL 核；Arch ffmpeg 自带；NVENC 会话仅 ~100-200MB VRAM）。**Arch 侧永远不装 `nvidia`/`nvidia-utils` 驱动包**——Linux 驱动遮蔽宿主注入的 shim（/usr/lib/wsl/lib），装了直通反而坏；纯 NVENC 也不需要 `cuda` toolkit 包（那是编译 CUDA 代码才用的 4-5GB 大件）。
- **GPU 通道启用前必须过熔炉测试（furnace test）**：全白材质 + 平环境，每个像素理论上必须精确 = 1.0；GPU/CPU 双通道对图（`f-gpu.jpg` vs `f-cpu.jpg`）互证后才可用于交付出图。渲染器对拍和建模对拍同理：**双通道一致才可信，单通道自洽不算数**。
- **CPU 渲染只作后备/交叉验证，且必须限流**：worker ≤ ⌈nproc/2⌉（**不是 `cpus()-1`**——8 核留 1 核照样冻机：实测 load 5.4/8 + swap 1GB，用户侧症状「你一跑脚本，WSL 里其他程序就停摆」）；命令前缀 `nice -n 19 ionice -c3`（调度优先级降级，交互程序不再被平等抢占）；长渲染一律后台 job，不阻塞自己回合。
- **「留出系统余量」必须数字化**：≥ 半数核空闲 + 优先级降级 + 后台化，写进渲染台默认值。字面兑现（cores-1）≠ 精神兑现——承诺兑现的判据是用户侧体感，不是参数表。
- **坑：`hexToLinear` 只认 `#` 前缀**——模板字符串里 `0xffffff` 会被字符串化成 `"16777215"` → 无效 hex → NaN/垃圾 albedo → **全图黑**，且症状极像光照/光传输 bug（教室长跑实付一轮：先猜 NEE 方差，真因是颜色解析）。排查顺序：先查颜色链，再查光传输。
