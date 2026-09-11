---
name: blender-headless-bridge
description: 本机执行桥——把 blender-* / text-to-blender / reference-* 技能栈的 Python 配方在 Windows Blender 5.2 headless 跑通。这些技能原文假设 blender-mcp socket(port 9876),本机没有 MCP 通道:用 `blender.exe -b -P <script.py>` 等价替换 mcp__blender__execute_blender_code,输出经 /mnt/c 回读。任何要驱动 Blender 的任务(渲染/建模/烘焙/导出)先读这个技能拿执行通道与环境事实。
when_to_use: 使用任何 Blender 技能(blender-modeling/materials/lighting/cameras/rendering/export、text-to-blender、reference-look-calibration 等)之前;或任何"用 Blender 出图/烘焙 AO/转格式"的请求。
allowed-tools: Read Write Bash Glob
---

# Blender Headless Bridge(WSL → Windows Blender 5.2)

## 环境事实(先记牢)

- **Blender 可执行文件**:`"/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"`(Windows 侧 5.2,与 cc-blender-skill 的 5.x 兼容层对版)
- **WSL 内无 blender**;WSLg DISPLAY 为空 → 不要指望 GUI 交互,headless 是唯一稳定通道
- **VRAM 仅 ~600MB 可用**(宿主占 5.5/6GB)→ Cycles 用 `CPU` 设备 + OIDN 降噪为默认;GPU/OptiX 不保证
- **8 核 CPU**:30k quads 场景 1600×1200 CPU 渲染分钟级,完全可接受
- 跨界调用:blender.exe 是 Windows 进程,**看不见 WSL 的 /tmp**——脚本与输出必须走 `/mnt/c/...` 路径,传参时转成 `C:\...` 形式

## 执行通道(替代 mcp__blender__execute_blender_code)

cc-blender-skill 栈的所有 Python 配方原样可用,只是运输层换成:

1. 把配方 Python 写到 `/mnt/c/Users/touyu/AppData/Local/Temp/<name>.py`(用 write 工具)
2. 运行:
   ```bash
   "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -noaudio \
     --python 'C:\Users\touyu\AppData\Local\Temp\<name>.py'
   ```
3. 输出(渲染 PNG/EXR、烘焙贴图、导出 glTF)同样写到 `C:\Users\touyu\AppData\Local\Temp\`,从 WSL 侧 `/mnt/c/Users/touyu/AppData/Local/Temp/` 回读

加载已有 .blend:`-b <path.blend>`;脚本里需要场景对象时用 `bpy.data.objects['名字']`(每次 -b 都是全新进程,状态靠 .blend 文件传递,不靠会话)。

## 默认渲染头(贴进任何渲染脚本)

```python
import bpy, time
scn = bpy.context.scene
scn.render.engine = 'CYCLES'
scn.cycles.device = 'CPU'          # VRAM 不足,GPU 不保证
scn.cycles.samples = 128
scn.cycles.use_denoising = True
scn.cycles.denoiser = 'OPENIMAGEDENOISE'
scn.view_settings.view_transform = 'AgX'   # Blender 5.x 默认色彩管理
scn.render.image_settings.file_format = 'PNG'
scn.render.filepath = r'C:\Users\touyu\AppData\Local\Temp\out.png'
t0=time.time(); bpy.ops.render.render(write_still=True)
print('RENDER_DONE', round(time.time()-t0,1), 's')
```

## 与 cc-blender-skill 栈的对接

- 兄弟技能都在 `~/.agents/skills/`(blender-modeling / blender-materials / blender-lighting / blender-cameras / blender-rendering / blender-export / reference-look-calibration / multiview-fit-loop 等 31 个),编排器 `text-to-blender` 按"意图→子技能"表路由,经 Read 加载——路径都在同一 skills 根下,引用按名字即成立
- 技能文中的 `mcp__blender__execute_blender_code` → 本桥的"写 .py + blender.exe -b -P";`get_viewport_screenshot` → 渲染小图回看;`get_scene_info/get_object_info` → 脚本里 print(bpy.data.scenes/objects 摘要)
- 配方知识(材质节点、三点布光、Cycles 采样、AgX、参考图锁定校准)原样有效——**要改的只是运输层,不是配方**

## 交互备选(可选,不默认)

若需要人在 GUI 里看实时结果:Windows 侧 Blender 装 ahujasid/blender-mcp addon(端口 9876),WSL `.wslconfig` 为 Mirrored 网络 → `localhost:9876` 可达,可写 Node/shell 小桥说它的 JSON 协议。批渲染/烘焙仍优先 headless。

## 冒烟验证记录

2026-09-12:`-b --factory-startup --python-expr "import bpy;print(bpy.app.version_string)"` → 5.2;Cycles CPU 160×120×16spp 默认立方体渲染成功出 PNG。全链路(WSL 写脚本→Windows 渲染→/mnt/c 回读)通。
