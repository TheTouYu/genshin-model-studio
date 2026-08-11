/**
 * 四期曲线工具：Catmull-Rom 样条采样（PRD §3/§5.1）。
 *
 * 算法：uniform Catmull-Rom（经典形式，经过所有控制点、局部控制、C1 平滑；
 * 不用高次多项式插值——龙格振荡；不用贝塞尔/B 样条——不经过控制点）。
 *
 * 采样：每个控制点段（弦）内按参数 t 均匀取 samplesPerSeg 个点（“按弦长等距”），
 * 输出恒包含全部控制点（段边界点按输入原样拷贝，无浮点回舍）：
 * - open：首尾端点精确，总点数 = 1 + (n-1)×samplesPerSeg；
 * - closed：环绕采样（P[-1]=P[n-1]、P[n]=P[0]、P[n+1]=P[1]），首尾衔接 C1 平滑，
 *   输出末尾精确重复首点（总点数 = n×samplesPerSeg + 1），保证后端封闭检测（首尾
 *   距离 < 3% 对角线）必然命中——若不带重复点，末段采样点距首点恰为一个采样间距，
 *   稀疏采样时可能漏检为开放。
 *
 * 边界：<2 点原样返回；2 点 = 直线（等距采样，含两端）。
 */
export type SplinePoint = [number, number]

function crPoint(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  t: number
): SplinePoint {
  const t2 = t * t
  const t3 = t2 * t
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  ]
}

export function catmullRom(
  pts: ReadonlyArray<readonly [number, number]>,
  closed: boolean,
  samplesPerSeg: number
): SplinePoint[] {
  const per = Math.max(1, Math.floor(samplesPerSeg))
  const n = pts.length
  if (n < 2) return pts.map((p): SplinePoint => [p[0], p[1]])
  // 2 点 = 直线：按弦等距采样，含两端点（浮点精确，与 Catmull-Rom 端点复制法不同——
  // 端点复制下两点曲线会在中段轻微隆起，并非严格直线）。
  if (n === 2) {
    const [ax, ay] = pts[0]
    const [bx, by] = pts[1]
    const out: SplinePoint[] = []
    for (let i = 0; i <= per; i++) {
      const t = i / per
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t])
    }
    return out
  }
  // 环绕索引：closed 取模回绕；open 端点复制（P[-1]=P[0]、P[n]=P[n-1]）。
  const idx = (i: number): number => {
    if (closed) return ((i % n) + n) % n
    return i < 0 ? 0 : i >= n ? n - 1 : i
  }
  const out: SplinePoint[] = []
  const segCount = closed ? n : n - 1
  for (let s = 0; s < segCount; s++) {
    const p0 = pts[idx(s - 1)]
    const p1 = pts[idx(s)]
    const p2 = pts[idx(s + 1)]
    const p3 = pts[idx(s + 2)]
    // t=0 精确落于控制点：直接拷贝输入点，避免 0.5×(2p) 之外的浮点误差
    out.push([p1[0], p1[1]])
    for (let i = 1; i < per; i++) {
      out.push(crPoint(p0, p1, p2, p3, i / per))
    }
  }
  // 末点：open = 最后控制点（t=1 精确）；closed = 精确重复首点（闭环衔接）
  const [lx, ly] = closed ? pts[0] : pts[n - 1]
  out.push([lx, ly])
  return out
}
