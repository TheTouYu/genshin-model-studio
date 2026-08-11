/**
 * genshin-model-studio 二期 · 画线建模：Three.js 实时预览渲染器
 *
 * 文件：web/draw/preview.js（原生 JS，无构建、零 npm 依赖）
 * 依赖：全局 THREE —— 由页面通过 CDN <script> 引入（见 preview-demo.html 的多源 fallback 加载）
 *
 * 接口（docs/phase2-drawing-prd.md §5.3）：
 *   createPreview(canvasEl) → { setItems(items), dispose() }
 *     setItems(items)  拍平后的 structure item 数组；每次调用清空并重建场景
 *     dispose()        释放渲染器 / 几何 / 材质 / 事件监听
 *
 * items 字段语义（docs/input-format.md）：
 *   resourceId  官方基础元件 ID（资源速查表）
 *   position    [x, y, z]  米，相对模型原点
 *   rotation    [α, β, γ]  度，编辑器 YXZ 内旋：R = Ry(β)·Rx(α)·Rz(γ)
 *   scale       [x, y, z]  尺寸语义随资源不同（速查表）
 *
 * 旋转约定核对（input-format.md「坐标语义」）：
 *   Three.js Euler 在 order='YXZ' 时生成的旋转矩阵为 Ry(β)·Rx(α)·Rz(γ)
 *   （与 order='XYZ' → Rx·Ry·Rz 同构类推），与编辑器 YXZ 内旋逐项一致。
 *   因此直接 mesh.rotation.set(rad(α), rad(β), rad(γ), 'YXZ') 即得相同姿态，
 *   无需手算复合矩阵；唯一要处理的是角度单位（度 → 弧度）。
 */
(function (global) {
  'use strict'

  var D2R = Math.PI / 180
  var MIN_RADIUS = 0.5
  var MAX_RADIUS = 300

  // 每类几何一个浅色（默认材质；本期无色，颜色二期按 group 附着）
  var COLORS = {
    box: 0x7ea6e0, // 长方体 · 蓝（已闭合）
    sphere: 0x8fd694, // 球体 · 绿（已闭合）
    plane: 0x9aa5b1, // 平面 · 灰（未校准）
    prism3: 0xe8a86a, // 三棱柱 · 橙（已闭合）
    prism5: 0xcaa8e8, // 五棱柱 · 紫（已闭合）
    pyramid: 0xe8d26a, // 三棱锥 · 黄（未校准）
    cylinder: 0x6fc3c9, // 圆柱 · 青（已闭合）
    cone: 0xe87a7a, // 圆锥 · 红（未校准）
    wire: 0x5b6672, // 线框类（未校准）
    placeholder: 0xff3d9e, // 未知资源 ID 占位 · 提示色
  }

  function clamp(v, lo, hi) {
    return Math.min(Math.max(v, lo), hi)
  }

  /**
   * 正 n 棱柱（n=3 三棱柱 / n=5 五棱柱）：高 1，底面外接半径 0.5，高度轴 Y，一个顶点朝 -Z。
   * 速查表：10009004 三棱柱 底面正三角形外接圆直径 1（边长 0.866）；
   *         10009005 五棱柱 底面正五边形外接圆直径 1（边长 0.588）。
   * 实现：Shape 画在 XY 平面（首个顶点取 +Y 方向，i 递增逆时针均布），沿 +Z 挤出深度 1，
   *       rotateX(-π/2) 把挤出轴 +Z 转成高度轴 +Y、2D 的 +Y 顶点转到 -Z（速查表「顶点朝 -Z」），
   *       最后 translate(0, -0.5, 0) 沿高度居中（与长方体/圆柱的居中语义一致）。
   * 边长相核：弦长 = 2·r·sin(π/n)：n=3 → 0.866 ✓；n=5 → 0.588 ✓
   */
  function makePrism(sides) {
    var r = 0.5
    var shape = new THREE.Shape()
    for (var i = 0; i < sides; i++) {
      var a = Math.PI / 2 + (i * 2 * Math.PI) / sides
      var x = r * Math.cos(a)
      var y = r * Math.sin(a)
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    var geo = new THREE.ExtrudeGeometry(shape, {
      depth: 1, // 沿 +Z 挤出 1
      bevelEnabled: false,
      curveSegments: 1, // 多边形直边，无曲线分段
      steps: 1,
    })
    geo.rotateX(-Math.PI / 2) // (x, y, z) → (x, z, -y)
    geo.translate(0, -0.5, 0) // 高度方向居中
    return geo
  }

  /**
   * 单个 item → 场景对象（Mesh 或 LineSegments）。
   * 几何体每 item 独立 new 一份：scale 要原地作用于几何（geometry.scale）。
   */
  function buildItemMesh(item, mats, warnedIds) {
    var id = item.resourceId
    var geo = null
    var kind = null
    var isLine = false
    var uncalibrated = false

    switch (id) {
      case 10009001: // 长方体：1×1×1，X/Y/Z 对应三条边；scale=[宽, 高, 长]，长轴=局部 Z（已闭合）
        geo = new THREE.BoxGeometry(1, 1, 1)
        kind = 'box'
        break
      case 10009002: // 球体：直径 1（已闭合*）
        geo = new THREE.SphereGeometry(0.5, 32, 16)
        kind = 'sphere'
        break
      case 10009004: // 三棱柱：高 1，底面外接圆直径 1，顶点朝 -Z（已闭合）
        geo = makePrism(3)
        kind = 'prism3'
        break
      case 10009005: // 五棱柱：高 1，底面外接圆直径 1，顶点朝 -Z（已闭合）
        geo = makePrism(5)
        kind = 'prism5'
        break
      case 10009008: // 圆柱：截面直径 1，零旋转轴向 Y；scale=[截面直径, 轴向长度, 截面直径]（已闭合）
        geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24)
        kind = 'cylinder'
        break
      case 10009009: // 圆锥（未校准：速查表仅登记 ID，形状为合理猜测）
        geo = new THREE.ConeGeometry(0.5, 1, 24)
        kind = 'cone'
        uncalibrated = true
        break
      case 10009003: // 平面 1×1（未校准：按 examples/box.json「盖板」用法横放于 XZ 平面，scale.y=厚度）
        geo = new THREE.PlaneGeometry(1, 1)
        geo.rotateX(-Math.PI / 2)
        kind = 'plane'
        uncalibrated = true
        break
      case 10009006: // 三棱锥（未校准：合理形状为正四面体，外接半径 0.5）
        geo = new THREE.TetrahedronGeometry(0.5, 0)
        kind = 'pyramid'
        uncalibrated = true
        break
      case 10009010: // 线框长方体（未校准：按名称给线框形状）
        geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
        kind = 'wire'
        isLine = true
        uncalibrated = true
        break
      case 10009011: // 线框圆柱（未校准：按名称给线框形状）
        geo = new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 4))
        kind = 'wire'
        isLine = true
        uncalibrated = true
        break
      default: // 几何缺失：提示色立方体占位（位置/旋转/缩放仍生效）
        console.warn('[preview] 未知资源 ID ' + id + '：无几何映射，使用提示色立方体占位（变换仍生效）')
        geo = new THREE.BoxGeometry(1, 1, 1)
        kind = 'placeholder'
    }

    if (uncalibrated && !warnedIds[id]) {
      // 未校准元件只提醒一次（抑制刷屏）：预览形状为近似，不代表游戏内最终视觉
      console.warn(
        '[preview] 资源 ID ' + id + ' 未校准（docs/input-format.md 速查表）：' +
          '预览形状为合理近似，不代表游戏内最终视觉'
      )
      warnedIds[id] = true
    }

    // 材质：每类几何共享一个（默认材质，本期无色）
    var mat
    if (isLine) {
      mat = new THREE.LineBasicMaterial({ color: COLORS.wire })
    } else {
      if (!mats.has(kind)) {
        mats.set(
          kind,
          new THREE.MeshStandardMaterial({
            color: COLORS[kind] || COLORS.placeholder,
            roughness: 0.85,
            metalness: 0.05,
          })
        )
      }
      mat = mats.get(kind)
    }
    var obj = isLine ? new THREE.LineSegments(geo, mat) : new THREE.Mesh(geo, mat)

    // 变换（input-format.md 坐标语义）
    var p = item.position || [0, 0, 0]
    var r = item.rotation || [0, 0, 0]
    var s = item.scale || [1, 1, 1]
    obj.position.set(p[0], p[1], p[2])
    // 度 → 弧度；编辑器 YXZ 内旋 R = Ry(β)·Rx(α)·Rz(γ) = Three.js Euler order 'YXZ'
    obj.rotation.set(r[0] * D2R, r[1] * D2R, r[2] * D2R, 'YXZ')
    geo.scale(s[0], s[1], s[2]) // scale 原地作用于几何体（速查表尺寸语义）
    return obj
  }

  /**
   * 创建预览：createPreview(canvasEl) → { setItems, dispose }
   * - 拖拽旋转（yaw/pitch，抓取模型手感）、滚轮缩放、触摸拖拽 + 双指捏合缩放
   * - rAF 动画循环常开（几何量小，双缓冲由 WebGL 上下文承担）
   */
  function createPreview(canvasEl) {
    if (!canvasEl) throw new Error('createPreview: 需要 canvas 元素')
    if (!global.THREE) {
      throw new Error(
        'createPreview: 未检测到全局 THREE。请先通过 CDN <script> 引入 three.js（见 web/draw/preview-demo.html）'
      )
    }
    var THREE = global.THREE

    // ---- 渲染器 / 场景 / 相机 ----
    var renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true })
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2))

    var scene = new THREE.Scene()
    scene.background = new THREE.Color(0x141a23)

    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500)

    // ---- 光照（PRD §5.3）：环境光 + 方向光（加一盏弱补光避免背光面全黑）----
    scene.add(new THREE.AmbientLight(0xffffff, 0.65))
    var dirLight = new THREE.DirectionalLight(0xffffff, 1.1)
    dirLight.position.set(5, 8, 4)
    scene.add(dirLight)
    var fillLight = new THREE.DirectionalLight(0xffffff, 0.35)
    fillLight.position.set(-4, 2, -5)
    scene.add(fillLight)

    // ---- 地面网格 + 坐标轴辅助（便于判断朝向：x=红，y=绿，z=蓝；地面 y=0）----
    var grid = new THREE.GridHelper(10, 10, 0x8b96a3, 0x3a4350)
    scene.add(grid)
    var axes = new THREE.AxesHelper(0.8)
    scene.add(axes)

    var itemsGroup = new THREE.Group()
    scene.add(itemsGroup)

    // ---- 轨道状态（球坐标：yaw=绕 Y 方位角 theta，pitch=极角 phi，radius=视距）----
    var orbit = { yaw: 0.65, pitch: 0.85, radius: 6, target: new THREE.Vector3(0, 0, 0) }

    function applyCamera() {
      var phi = clamp(orbit.pitch, 0.05, Math.PI - 0.05) // 防止越过天顶/地底导致翻转
      var offset = new THREE.Vector3().setFromSpherical(new THREE.Spherical(orbit.radius, phi, orbit.yaw))
      camera.position.copy(orbit.target).add(offset)
      camera.lookAt(orbit.target)
    }

    // ---- 交互：拖拽旋转 / 滚轮缩放 / 触摸（Pointer Events + capture）----
    var pointers = new Map() // pointerId → {x, y}
    var pinchDist = 0

    function onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      try {
        canvasEl.setPointerCapture(e.pointerId)
      } catch (err) {
        /* 忽略捕获失败 */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        var pts = Array.from(pointers.values())
        pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      }
    }

    function onPointerMove(e) {
      if (!pointers.has(e.pointerId)) return
      var prev = pointers.get(e.pointerId)
      var dx = e.clientX - prev.x
      var dy = e.clientY - prev.y
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointers.size === 1) {
        // 拖拽旋转（抓取模型手感：模型表面跟随光标方向）
        orbit.yaw += dx * 0.006
        orbit.pitch -= dy * 0.006
      } else if (pointers.size === 2 && pinchDist > 0) {
        // 双指捏合缩放
        var two = Array.from(pointers.values())
        var d = Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y)
        if (d > 0) orbit.radius = clamp(orbit.radius * (pinchDist / d), MIN_RADIUS, MAX_RADIUS)
        pinchDist = d
      }
    }

    function onPointerUp(e) {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchDist = 0
    }

    function onWheel(e) {
      e.preventDefault()
      orbit.radius = clamp(orbit.radius * Math.exp(e.deltaY * 0.0012), MIN_RADIUS, MAX_RADIUS)
    }

    // ---- 尺寸自适应（devicePixelRatio 适配；CSS 布局决定显示尺寸，不改 style）----
    function resize() {
      var w = canvasEl.clientWidth
      var h = canvasEl.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }

    var ro = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(resize)
      ro.observe(canvasEl)
    }
    global.addEventListener('resize', resize)

    canvasEl.style.touchAction = 'none' // 触摸拖拽不触发页面滚动
    canvasEl.addEventListener('pointerdown', onPointerDown)
    canvasEl.addEventListener('pointermove', onPointerMove)
    canvasEl.addEventListener('pointerup', onPointerUp)
    canvasEl.addEventListener('pointercancel', onPointerUp)
    canvasEl.addEventListener('wheel', onWheel, { passive: false })

    // ---- 动画循环常开（几何量小，无需按需渲染）----
    renderer.setAnimationLoop(function render() {
      applyCamera()
      renderer.render(scene, camera)
    })

    // ---- 内容管理 ----
    var mats = new Map() // kind → 共享 MeshStandardMaterial
    var lineMats = [] // LineBasicMaterial（每 item 独立，单独跟踪释放）
    var warnedIds = {} // 未校准警告去重

    function clearItems() {
      while (itemsGroup.children.length > 0) {
        var child = itemsGroup.children[0]
        itemsGroup.remove(child)
        if (child.geometry) child.geometry.dispose()
      }
      // 共享材质统一在 dispose() 释放；线框材质这里随重建一起释放
      for (var i = 0; i < lineMats.length; i++) lineMats[i].dispose()
      lineMats.length = 0
    }

    function setItems(items) {
      clearItems()
      if (!Array.isArray(items)) {
        console.warn('[preview] setItems: 入参不是数组，已清空场景')
        return
      }
      for (var i = 0; i < items.length; i++) {
        var item = items[i]
        if (!item || typeof item.resourceId !== 'number') {
          console.warn('[preview] setItems: 跳过无效 item #' + i + '（缺少 resourceId）')
          continue
        }
        var obj = buildItemMesh(item, mats, warnedIds)
        if (obj.isLineSegments) lineMats.push(obj.material)
        itemsGroup.add(obj)
      }
      fitCameraToContent()
    }

    // 依据内容包围盒自动取景（保留当前 yaw/pitch，仅重算中心与视距）
    function fitCameraToContent() {
      var box = new THREE.Box3().setFromObject(itemsGroup)
      if (box.isEmpty()) {
        orbit.target.set(0, 0.5, 0)
        orbit.radius = 4
        return
      }
      box.getCenter(orbit.target)
      var diag = box.getSize(new THREE.Vector3()).length()
      orbit.radius = Math.max(diag, 2) * 1.2
    }

    function dispose() {
      renderer.setAnimationLoop(null)
      global.removeEventListener('resize', resize)
      if (ro) ro.disconnect()
      canvasEl.removeEventListener('pointerdown', onPointerDown)
      canvasEl.removeEventListener('pointermove', onPointerMove)
      canvasEl.removeEventListener('pointerup', onPointerUp)
      canvasEl.removeEventListener('pointercancel', onPointerUp)
      canvasEl.removeEventListener('wheel', onWheel)
      clearItems()
      mats.forEach(function (m) {
        m.dispose()
      })
      mats.clear()
      grid.geometry.dispose()
      grid.material.dispose()
      axes.geometry.dispose()
      axes.material.dispose()
      renderer.dispose()
    }

    resize()
    fitCameraToContent()

    return { setItems: setItems, dispose: dispose }
  }

  global.createPreview = createPreview
})(typeof window !== 'undefined' ? window : globalThis)
