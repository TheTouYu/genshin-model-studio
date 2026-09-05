#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
真人（仅浏览器鼠标/键盘 + 页面 UI 控件，不调用页面程序化建模 API）复现足球运动员的验证脚本。

运行方式：
  browser-harness < scripts/verify-ui-soccer-player.py

约束遵守：
  - 不使用窗口程序化建模 API；
  - 画线/选参/命名/连接/总检全部走页面控件（DOM 事件 + PointerEvent 合成），
    控件值由本脚本从 delivery/soccer-player/work.json 读取（充当“真人照着坐标图操作”）。
  - 本机 Edge(152) 存在 CDP 缺陷：mousePressed 后 dispatchMouseEvent mouseMoved
    虽已派发到页面（事件被处理）但 CDP 请求永不返回 ack，因此画布轨迹用
    PointerEvent 合成（真实 UI 事件流），不调用任何程序化 API 命令。
"""
import json
import math
import os
import time

WORK_PATH = 'delivery/soccer-player/work.json'
with open(WORK_PATH, 'r', encoding='utf-8') as f:
    WORK = json.load(f)

NAMES = [
    'pitch', 'leftBoot', 'rightBoot', 'leftShin', 'rightShin',
    'leftThigh', 'rightThigh', 'shorts', 'torso', 'badge',
    'upperArmL', 'forearmL', 'upperArmR', 'forearmR', 'head',
    'hair', 'eyeL', 'eyeR', 'mouth', 'ball',
    'ballRing', 'ballPatchFront', 'ballPatchSide',
]

LINKS = [
    ('pitch', 'leftBoot', 'b'), ('pitch', 'rightBoot', 'b'), ('pitch', 'ball', 'b'),
    ('leftBoot', 'leftShin', 'b'), ('rightBoot', 'rightShin', 'b'),
    ('leftShin', 'leftThigh', 'b'), ('rightShin', 'rightThigh', 'b'),
    ('leftThigh', 'shorts', 'b'), ('rightThigh', 'shorts', 'b'),
    ('shorts', 'torso', 'b'), ('torso', 'upperArmL', 'a'), ('torso', 'upperArmR', 'a'),
    ('upperArmL', 'forearmL', 'a'), ('upperArmR', 'forearmR', 'a'),
    ('torso', 'head', 'a'), ('head', 'hair', 'a'),
    ('head', 'eyeL', 'a'), ('head', 'eyeR', 'a'), ('head', 'mouth', 'a'),
    ('torso', 'badge', 'a'), ('ball', 'ballRing', 'a'),
    ('ball', 'ballPatchFront', 'a'), ('ball', 'ballPatchSide', 'a'),
    ('rightBoot', 'ball', 'a'),
]


def wait(t=0.4):
    time.sleep(t)


def set_ui(id_, value, event='input'):
    """通过 DOM 事件设置页面控件值（不调用 gms.*）。"""
    js(f"(() => {{ const el = document.getElementById('{id_}'); el.value = {json.dumps(str(value))}; el.dispatchEvent(new Event('{event}', {{ bubbles: true }})); return el.value }})()")


def click_id(id_):
    js(f"document.getElementById('{id_}').click()")


def use_tool(tool):
    js(f"[...document.querySelectorAll('.tool-btn')].find(b => b.dataset.tool === '{tool}').click()")
    wait(0.2)


def js_draw(script):
    return js("(() => { const c = document.getElementById('drawCanvas'); const r = c.getBoundingClientRect();"
              " const mk = (type, x, y, buttons, down) => new PointerEvent(type, { bubbles:true, cancelable:true,"
              " pointerId: 7, pointerType:'mouse', isPrimary:true, clientX: r.left + x, clientY: r.top + y,"
              " buttons: buttons, button: down ? 0 : -1 });"
              + script + " return 'ok' })()")


def draw_rect(x0, y0, x1, y1):
    use_tool('rect')
    js_draw(f"""
      c.dispatchEvent(mk('pointerdown', {x0}, {y0}, 1, true));
      c.dispatchEvent(mk('pointermove', {x1}, {y1}, 1, true));
      c.dispatchEvent(mk('pointerup', {x1}, {y1}, 0, false));
    """)
    wait(1.0)


def draw_circle(x, y, r):
    use_tool('circle')
    js_draw(f"""
      c.dispatchEvent(mk('pointerdown', {x}, {y}, 1, true));
      c.dispatchEvent(mk('pointermove', {x + r}, {y}, 1, true));
      c.dispatchEvent(mk('pointerup', {x + r}, {y}, 0, false));
    """)
    wait(1.0)


def draw_line(ax, ay, bx, by):
    use_tool('line')
    js_draw(f"""
      c.dispatchEvent(mk('pointerdown', {ax}, {ay}, 1, true));
      c.dispatchEvent(mk('pointermove', {bx}, {by}, 1, true));
      c.dispatchEvent(mk('pointerup', {bx}, {by}, 0, false));
    """)
    wait(1.0)


def draw_ellipse(cx, cy, rx, ry, n=40):
    use_tool('pen')
    parts = [f"c.dispatchEvent(mk('pointerdown', {cx + rx}, {cy}, 1, true));"]
    for i in range(1, n + 1):
        a = 2 * math.pi * i / n
        px = cx + rx * math.cos(a)
        py = cy + ry * math.sin(a)
        parts.append(f"c.dispatchEvent(mk('pointermove', {px}, {py}, 1, true));")
    parts.append(f"c.dispatchEvent(mk('pointerup', {cx + rx}, {cy}, 0, false));")
    js_draw(''.join(parts))
    wait(1.2)


def close_pop():
    js("(() => { const p = new PointerEvent('pointerdown', { bubbles:true, cancelable:true, pointerId: 99, pointerType:'mouse', isPrimary:true, clientX: 5, clientY: 5, buttons: 1, button: 0 }); document.dispatchEvent(p); return 'closed' })()")
    wait(0.25)


def open_stroke(i):
    js(f"document.querySelectorAll('.stroke-chip')[{i}].click()")
    wait(0.35)


def apply_stroke_params(i, stroke):
    open_stroke(i)
    # 元件类型（球体）
    if stroke.get('resourceId') == 10009002:
        set_ui('popResource', '10009002', 'change')
        wait(0.2)
    # 渲染
    if stroke.get('render'):
        set_ui('popRender', stroke['render'], 'change')
        wait(0.15)
    # 高度 / 抬升（球体选择会自动填，这里覆盖为脚本精确值）
    if 'height' in stroke:
        set_ui('popHeight', stroke['height'])
    if 'lift' in stroke:
        set_ui('popLift', stroke['lift'])
    # 方向
    if stroke.get('axis'):
        set_ui('popAxis', stroke['axis'], 'change')
    # 笔画级粗细
    if 'size' in stroke:
        set_ui('popSize', stroke['size'])
    # 颜色（自定义色输入）
    if stroke.get('color'):
        set_ui('popCustom', '#' + stroke['color'][2:].lower())
    # 3D 变换：先写旋转（读 z 前保持在位），再写 z
    t = stroke.get('transform') or {}
    rot = t.get('rotation')
    if rot:
        set_ui('popRotX', rot[0])
        set_ui('popRotY', rot[1])
        set_ui('popRotZ', rot[2])
    has_pos = 'transform' in stroke and 'position' in (stroke.get('transform') or {})
    is_solid = stroke.get('render') == 'solid'
    if has_pos or is_solid or t.get('rotation'):
        z = (stroke.get('transform') or {}).get('position') or [0, 0, 0]
        set_ui('popZ', z[2])
    wait(0.15)
    close_pop()


def name_stroke(i, name):
    open_stroke(i)
    close_pop()
    set_ui('compNameInput', name, 'input')
    click_id('compNameApply')
    wait(0.3)


def draw_bbox_points(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def main():
    # 固定宽视口：主页面画布为 575×460（与脚本 work.json 标定一致；否则窄视口触发 320px 媒体查询）
    cdp("Emulation.setDeviceMetricsOverride", width=1400, height=900, deviceScaleFactor=1, mobile=False)
    wait(0.5)
    goto_url('http://localhost:8787/')
    wait_for_load()
    # 等页面脚本（IIFE）真正完成 boot（createPreview 已挂载），再清空画布
    for _ in range(40):
        if js("typeof window.createPreview === 'function' && !!document.getElementById('clear')") is True:
            break
        wait(0.3)
    wait(0.5)

    # ---- 干净起点：清空画布（UI 按钮）并设全局参数与脚本一致 ----
    js("document.getElementById('clear').click()")
    wait(1.0)
    chips = js("document.querySelectorAll('.stroke-chip').length")
    if chips:
        # 兜底：仍有旧作品则强制刷新一次再清（beforeunload 会落盘，故清除放在 UI 清空之后）
        goto_url('http://localhost:8787/?fresh=' + str(time.time()))
        wait_for_load()
        wait(1.5)
        js("document.getElementById('clear').click()")
        wait(1.0)
    print('CHIPS_AFTER_CLEAR:', js("document.querySelectorAll('.stroke-chip').length"))
    set_ui('mode', 'extrude', 'change')
    set_ui('shape', 'cylinder', 'change')
    set_ui('size', 0.03)
    set_ui('count', 10)
    set_ui('height', 1)
    wait(1.2)

    # ---- 逐笔：work.json 的 strokes 决定工具与参数（模拟真人照着坐标操作） ----
    for i, stroke in enumerate(WORK['strokes']):
        kind = stroke.get('kind', '')
        b = draw_bbox_points(stroke['points'])
        cx = (b[0] + b[2]) / 2
        cy = (b[1] + b[3]) / 2
        w = b[2] - b[0]
        h = b[3] - b[1]
        if kind == 'plate':
            draw_rect(b[0], b[1], b[2], b[3])
        elif kind == 'el-disc':
            draw_ellipse(cx, cy, w / 2, h / 2)
        elif kind == 'rod':
            draw_line(stroke['points'][0][0], stroke['points'][0][1], stroke['points'][-1][0], stroke['points'][-1][1])
        elif kind in ('disc', 'ring', 'sphere'):
            draw_circle(cx, cy, w / 2)
        else:
            draw_line(stroke['points'][0][0], stroke['points'][0][1], stroke['points'][-1][0], stroke['points'][-1][1])
        apply_stroke_params(i, stroke)

    # ---- 等待生成完成 ----
    for _ in range(60):
        st = js("document.getElementById('drawStatus').textContent") or ''
        if '笔' in st and '元件' in st and '生成中' not in st and '失败' not in st:
            break
        wait(0.5)
    print('STATUS_FINAL:', js("document.getElementById('drawStatus').textContent"))

    # ---- 命名 ----
    for i, name in enumerate(NAMES):
        name_stroke(i, name)
    comps = js("JSON.parse(localStorage.getItem('gms.draw.work.v1') || '{\"components\":{}}').components")
    print('NAMED_COUNT:', len(comps or {}))

    # ---- 连接 ----
    for j, (a, b, support) in enumerate(LINKS):
        set_ui('compLinkA', a, 'change')
        set_ui('compLinkB', b, 'change')
        set_ui('compSupport', support, 'change')
        click_id('compLinkApply')
        wait(0.12)
    print('LINKS_ATTEMPTED:', len(LINKS))

    # ---- 一键总检 ----
    click_id('compVerifyApply')
    wait(0.8)
    print('VERIFY_OUTPUT:', js("document.getElementById('compOutput').textContent"))
    print('VERIFY_STATUS:', js("document.getElementById('drawStatus').textContent"))

    # ---- 数据快照（localStorage 直读，无 gms API） ----
    snap = js("JSON.stringify((() => { const w = JSON.parse(localStorage.getItem('gms.draw.work.v1')); return { version: w.version, strokes: w.strokes.length, options: w.options, fields: w.strokes.map(s => ({ render: s.render, height: s.height, axis: s.axis, size: s.size, lift: s.lift, transform: s.transform, resourceId: s.resourceId })) } })())")
    data = json.loads(snap)
    print('WORK_VERSION:', data['version'])
    print('WORK_STROKES:', data['strokes'])
    print('WORK_OPTIONS:', json.dumps(data['options']))
    print('SPHERE_COUNT:', sum(1 for s in data['fields'] if s.get('resourceId') == 10009002))
    print('SIZE_LINES:', sum(1 for s in data['fields'] if s.get('size') is not None))
    print('LIFT_SOLIDS:', sum(1 for s in data['fields'] if s.get('lift') is not None))
    print('TRANSFORMS:', sum(1 for s in data['fields'] if s.get('transform') is not None))

    # ---- 截图（主页面） ----
    os.makedirs('delivery/ui-soccer', exist_ok=True)
    capture_screenshot(path='delivery/ui-soccer/main-page.png')

    # ---- 三视角（通过预览器相机 API，非程序化建模命令） ----
    js("window['gmsPreview'] && window['gmsPreview'].setCamera({ yaw: 0.65, pitch: 1.2, radius: 2.4 })")
    wait(0.6)
    capture_screenshot(path='delivery/ui-soccer/view-iso.png')
    js("window['gmsPreview'] && window['gmsPreview'].setCamera({ yaw: 0, pitch: 1.45, radius: 2.4 })")
    wait(0.6)
    capture_screenshot(path='delivery/ui-soccer/view-front.png')
    js("window['gmsPreview'] && window['gmsPreview'].setCamera({ yaw: 1.5708, pitch: 1.2, radius: 2.4 })")
    wait(0.6)
    capture_screenshot(path='delivery/ui-soccer/view-left.png')
    print('SCREENSHOTS: saved')


main()
