/**
 * 零依赖渲染内核 · 几何与 BVH
 * 三角形汤 + 双精度射线 + 扁平 SAH BVH；所有变换在构建期烘焙。
 */
import { Vec3, v3, add, sub, cross, dot, norm, len2 } from './math.js';

export interface MeshData {
  /** 顶点位置 xyz */
  pos: Float32Array;
  /** 顶点法线 xyz（平滑法线，构建期已归一） */
  nrm: Float32Array;
  /** 顶点 uv */
  uv: Float32Array;
  /** 三角形索引 */
  idx: Uint32Array;
  /** 每三角形材质 id */
  mat: Uint32Array;
  /** 每三角形平滑标志 1=用顶点法线 0=用面法线 */
  smooth: Uint8Array;
}

export const RAYSTATS = { on: false, intersect: 0, occluded: 0, nodes: 0, tris: 0 };

export interface Hit {
  t: number;
  tri: number;
  u: number;
  v: number;
  px: number; py: number; pz: number;
  nx: number; ny: number; nz: number;
  uu: number; vv: number;
  backface: boolean;
}

export const makeHit = (): Hit => ({
  t: Infinity, tri: -1, u: 0, v: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0, uu: 0, vv: 0, backface: false,
});

export class Scene {
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  idx: Uint32Array;
  triMat: Uint32Array;
  triSmooth: Uint8Array;
  numTri: number;
  // BVH 节点：8 float = minx,miny,minz,maxx,maxy,maxz,leftFirstOrStart,count
  nodes!: Float32Array;
  nodeCount = 0;
  triOrder!: Uint32Array;
  // 快速三角形数据（按 BVH 顺序重排）
  tv0!: Float32Array; tv1!: Float32Array; tv2!: Float32Array;
  tn!: Float32Array;  // 面法线（未归一化长度无关，存归一化）
  tSrc!: Uint32Array; // 映射回原始三角形索引
  bounds = { min: v3(Infinity, Infinity, Infinity), max: v3(-Infinity, -Infinity, -Infinity) };

  constructor(m: MeshData) {
    this.pos = m.pos; this.nrm = m.nrm; this.uv = m.uv; this.idx = m.idx;
    this.triMat = m.mat; this.triSmooth = m.smooth;
    this.numTri = m.idx.length / 3;
  }

  build(maxLeaf = 8): void {
    const n = this.numTri;
    const centroids = new Float32Array(n * 3);
    const tb = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const i0 = this.idx[i * 3], i1 = this.idx[i * 3 + 1], i2 = this.idx[i * 3 + 2];
      const ax = this.pos[i0 * 3], ay = this.pos[i0 * 3 + 1], az = this.pos[i0 * 3 + 2];
      const bx = this.pos[i1 * 3], by = this.pos[i1 * 3 + 1], bz = this.pos[i1 * 3 + 2];
      const cx = this.pos[i2 * 3], cy = this.pos[i2 * 3 + 1], cz = this.pos[i2 * 3 + 2];
      centroids[i * 3] = (ax + bx + cx) / 3;
      centroids[i * 3 + 1] = (ay + by + cy) / 3;
      centroids[i * 3 + 2] = (az + bz + cz) / 3;
      tb[i * 6] = Math.min(ax, bx, cx); tb[i * 6 + 1] = Math.min(ay, by, cy); tb[i * 6 + 2] = Math.min(az, bz, cz);
      tb[i * 6 + 3] = Math.max(ax, bx, cx); tb[i * 6 + 4] = Math.max(ay, by, cy); tb[i * 6 + 5] = Math.max(az, bz, cz);
    }
    this.triOrder = new Uint32Array(n);
    for (let i = 0; i < n; i++) this.triOrder[i] = i;
    this.nodes = new Float32Array(Math.max(16, n * 2 * 8));
    this.nodeCount = 0;
    const self = this;
    const tmpIdx = new Uint32Array(Math.max(1, n));
    let nodeCap = Math.max(16, n * 2);

    const alloc = (): number => {
      if (self.nodeCount >= nodeCap) {
        const bigger = new Float32Array(nodeCap * 2 * 8);
        bigger.set(self.nodes);
        self.nodes = bigger; nodeCap *= 2;
      }
      return self.nodeCount++;
    };

    const buildAt = (node: number, start: number, count: number): void => {
      let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
      let cmnx = Infinity, cmny = Infinity, cmnz = Infinity, cmxx = -Infinity, cmxy = -Infinity, cmxz = -Infinity;
      for (let k = 0; k < count; k++) {
        const t = self.triOrder[start + k];
        const b = t * 6;
        if (tb[b] < mnx) mnx = tb[b];
        if (tb[b + 1] < mny) mny = tb[b + 1];
        if (tb[b + 2] < mnz) mnz = tb[b + 2];
        if (tb[b + 3] > mxx) mxx = tb[b + 3];
        if (tb[b + 4] > mxy) mxy = tb[b + 4];
        if (tb[b + 5] > mxz) mxz = tb[b + 5];
        const c = t * 3;
        if (centroids[c] < cmnx) cmnx = centroids[c];
        if (centroids[c + 1] < cmny) cmny = centroids[c + 1];
        if (centroids[c + 2] < cmnz) cmnz = centroids[c + 2];
        if (centroids[c] > cmxx) cmxx = centroids[c];
        if (centroids[c + 1] > cmxy) cmxy = centroids[c + 1];
        if (centroids[c + 2] > cmxz) cmxz = centroids[c + 2];
      }
      const o = node * 8;
      self.nodes[o] = mnx; self.nodes[o + 1] = mny; self.nodes[o + 2] = mnz;
      self.nodes[o + 3] = mxx; self.nodes[o + 4] = mxy; self.nodes[o + 5] = mxz;
      if (mnx < self.bounds.min.x) self.bounds.min.x = mnx;
      if (mny < self.bounds.min.y) self.bounds.min.y = mny;
      if (mnz < self.bounds.min.z) self.bounds.min.z = mnz;
      if (mxx > self.bounds.max.x) self.bounds.max.x = mxx;
      if (mxy > self.bounds.max.y) self.bounds.max.y = mxy;
      if (mxz > self.bounds.max.z) self.bounds.max.z = mxz;
      if (count <= maxLeaf) {
        self.nodes[o + 6] = start; self.nodes[o + 7] = count;
        return;
      }
      const ex = cmxx - cmnx, ey = cmxy - cmny, ez = cmxz - cmnz;
      let axis = 0, ext = ex;
      if (ey > ext) { axis = 1; ext = ey; }
      if (ez > ext) { axis = 2; ext = ez; }
      const B = 12;
      const cb = axis === 0 ? cmnx : axis === 1 ? cmny : cmnz;
      const ce = axis === 0 ? cmxx : axis === 1 ? cmxy : cmxz;
      const scale = ext > 1e-12 ? B / (ce - cb + 1e-12) : 0;
      const counts = new Float32Array(B);
      const bmin = new Float32Array(B * 3).fill(Infinity);
      const bmax = new Float32Array(B * 3).fill(-Infinity);
      for (let k = 0; k < count; k++) {
        const t = self.triOrder[start + k];
        let bi = ext > 1e-12 ? Math.floor((centroids[t * 3 + axis] - cb) * scale) : 0;
        if (bi < 0) bi = 0; if (bi >= B) bi = B - 1;
        counts[bi]++;
        const b = t * 6;
        for (let a = 0; a < 3; a++) {
          const lo = tb[b + a], hi = tb[b + 3 + a];
          if (lo < bmin[bi * 3 + a]) bmin[bi * 3 + a] = lo;
          if (hi > bmax[bi * 3 + a]) bmax[bi * 3 + a] = hi;
        }
      }
      const leftArea = new Float32Array(B), leftCnt = new Float32Array(B);
      const rightArea = new Float32Array(B), rightCnt = new Float32Array(B);
      let area = 0, cnt = 0;
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < B; i++) {
        if (counts[i] > 0) {
          for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], bmin[i * 3 + a]); mx[a] = Math.max(mx[a], bmax[i * 3 + a]); }
          cnt += counts[i];
          area = surfaceArea(mn, mx);
        }
        leftArea[i] = area; leftCnt[i] = cnt;
      }
      area = 0; cnt = 0; mn = [Infinity, Infinity, Infinity]; mx = [-Infinity, -Infinity, -Infinity];
      for (let i = B - 1; i >= 0; i--) {
        if (counts[i] > 0) {
          for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], bmin[i * 3 + a]); mx[a] = Math.max(mx[a], bmax[i * 3 + a]); }
          cnt += counts[i];
          area = surfaceArea(mn, mx);
        }
        rightArea[i] = area; rightCnt[i] = cnt;
      }
      let best = -1, bestCost = Infinity;
      for (let i = 0; i < B - 1; i++) {
        if (leftCnt[i] === 0 || rightCnt[i + 1] === 0) continue;
        const c = leftArea[i] * leftCnt[i] + rightArea[i + 1] * rightCnt[i + 1];
        if (c < bestCost) { bestCost = c; best = i; }
      }
      let mid: number;
      if (best < 0) {
        const arr = Array.prototype.slice.call(self.triOrder.subarray(start, start + count));
        arr.sort((a: number, b: number) => centroids[a * 3 + axis] - centroids[b * 3 + axis]);
        for (let k = 0; k < count; k++) tmpIdx[k] = arr[k];
        for (let k = 0; k < count; k++) self.triOrder[start + k] = tmpIdx[k];
        mid = count >> 1;
      } else {
        let l = 0, r = count - 1;
        for (let k = 0; k < count; k++) {
          const t = self.triOrder[start + k];
          let bi = ext > 1e-12 ? Math.floor((centroids[t * 3 + axis] - cb) * scale) : 0;
          if (bi < 0) bi = 0; if (bi >= B) bi = B - 1;
          if (bi <= best) tmpIdx[l++] = t; else tmpIdx[r--] = t;
        }
        mid = l;
        if (mid === 0 || mid === count) mid = count >> 1;
        for (let k = 0; k < count; k++) self.triOrder[start + k] = tmpIdx[k];
      }
      // 先分配两个孩子，保证 right === left + 1
      const left = alloc();
      const right = alloc();
      self.nodes[o + 6] = left; self.nodes[o + 7] = 0;
      void right;
      buildAt(left, start, mid);
      buildAt(left + 1, start + mid, count - mid);
    };
    buildAt(alloc(), 0, n);
    this.flatten();
  }

  private flatten(): void {
    const n = this.numTri;
    this.tv0 = new Float32Array(n * 3); this.tv1 = new Float32Array(n * 3); this.tv2 = new Float32Array(n * 3);
    this.tn = new Float32Array(n * 3); this.tSrc = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const src = this.triOrder[i];
      this.tSrc[i] = src;
      const i0 = this.idx[src * 3], i1 = this.idx[src * 3 + 1], i2 = this.idx[src * 3 + 2];
      const ax = this.pos[i0 * 3], ay = this.pos[i0 * 3 + 1], az = this.pos[i0 * 3 + 2];
      const bx = this.pos[i1 * 3], by = this.pos[i1 * 3 + 1], bz = this.pos[i1 * 3 + 2];
      const cx = this.pos[i2 * 3], cy = this.pos[i2 * 3 + 1], cz = this.pos[i2 * 3 + 2];
      this.tv0[i * 3] = ax; this.tv0[i * 3 + 1] = ay; this.tv0[i * 3 + 2] = az;
      this.tv1[i * 3] = bx; this.tv1[i * 3 + 1] = by; this.tv1[i * 3 + 2] = bz;
      this.tv2[i * 3] = cx; this.tv2[i * 3 + 1] = cy; this.tv2[i * 3 + 2] = cz;
      const e1 = v3(bx - ax, by - ay, bz - az), e2 = v3(cx - ax, cy - ay, cz - az);
      const nn = norm(cross(e1, e2));
      this.tn[i * 3] = nn.x; this.tn[i * 3 + 1] = nn.y; this.tn[i * 3 + 2] = nn.z;
    }
  }

  /** 最近命中；返回是否命中（写入 hit） */
  intersect(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tmax: number, hit: Hit): boolean {
    if (RAYSTATS.on) RAYSTATS.intersect++;
    const nodes = this.nodes;
    const tv0 = this.tv0, tv1 = this.tv1, tv2 = this.tv2;
    const stack = this.stack;
    let sp = 0;
    stack[sp++] = 0;
    const invx = 1 / dx, invy = 1 / dy, invz = 1 / dz;
    let best = tmax, bestTri = -1, bu = 0, bv = 0;
    while (sp > 0) {
      const node = stack[--sp];
      if (RAYSTATS.on) RAYSTATS.nodes++;
      const o = node * 8;
      const mnx = nodes[o], mny = nodes[o + 1], mnz = nodes[o + 2];
      const mxx = nodes[o + 3], mxy = nodes[o + 4], mxz = nodes[o + 5];
      // slab 测试
      let t0 = (mnx - ox) * invx, t1 = (mxx - ox) * invx;
      let tmin = Math.min(t0, t1), tmx = Math.max(t0, t1);
      t0 = (mny - oy) * invy; t1 = (mxy - oy) * invy;
      tmin = Math.max(tmin, Math.min(t0, t1)); tmx = Math.min(tmx, Math.max(t0, t1));
      t0 = (mnz - oz) * invz; t1 = (mxz - oz) * invz;
      tmin = Math.max(tmin, Math.min(t0, t1)); tmx = Math.min(tmx, Math.max(t0, t1));
      if (tmx < 0 || tmin > tmx || tmin > best) continue;
      const cnt = nodes[o + 7];
      const first = nodes[o + 6] | 0;
      if (cnt > 0) {
        if (RAYSTATS.on) RAYSTATS.tris += cnt;
        for (let k = 0; k < cnt; k++) {
          const ti = first + k;
          const a = ti * 3;
          const ax = tv0[a], ay = tv0[a + 1], az = tv0[a + 2];
          const e1x = tv1[a] - ax, e1y = tv1[a + 1] - ay, e1z = tv1[a + 2] - az;
          const e2x = tv2[a] - ax, e2y = tv2[a + 1] - ay, e2z = tv2[a + 2] - az;
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (det > -1e-14 && det < 1e-14) continue;
          const inv = 1 / det;
          const sx = ox - ax, sy = oy - ay, sz = oz - az;
          const u = (sx * px + sy * py + sz * pz) * inv;
          if (u < -1e-7 || u > 1 + 1e-7) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const vv = (dx * qx + dy * qy + dz * qz) * inv;
          if (vv < -1e-7 || u + vv > 1 + 1e-7) continue;
          const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (t > 1e-6 && t < best) { best = t; bestTri = ti; bu = u; bv = vv; }
        }
      } else {
        // 内部节点：右孩子 = first+1（构建期保证）。按距离排序，先近后远 → 远子可被 best 剔除
        if (sp + 2 <= this.stack.length) {
          const o2 = (first + 1) * 8;
          let s0 = (nodes[o2] - ox) * invx, s1 = (nodes[o2 + 3] - ox) * invx;
          let nmin = Math.min(s0, s1);
          s0 = (nodes[o2 + 1] - oy) * invy; s1 = (nodes[o2 + 4] - oy) * invy;
          nmin = Math.max(nmin, Math.min(s0, s1));
          s0 = (nodes[o2 + 2] - oz) * invz; s1 = (nodes[o2 + 5] - oz) * invz;
          nmin = Math.max(nmin, Math.min(s0, s1));
          if (nmin < tmin) { stack[sp++] = first + 1; stack[sp++] = first; }
          else { stack[sp++] = first; stack[sp++] = first + 1; }
        }
      }
    }
    if (bestTri < 0) return false;
    hit.t = best; hit.tri = bestTri; hit.u = bu; hit.v = bv;
    hit.px = ox + dx * best; hit.py = oy + dy * best; hit.pz = oz + dz * best;
    const a = bestTri * 3;
    const w = 1 - bu - bv;
    const src = this.tSrc[bestTri];
    if (this.triSmooth[src]) {
      const i0 = this.idx[src * 3], i1 = this.idx[src * 3 + 1], i2 = this.idx[src * 3 + 2];
      let nx = w * this.nrm[i0 * 3] + bu * this.nrm[i1 * 3] + bv * this.nrm[i2 * 3];
      let ny = w * this.nrm[i0 * 3 + 1] + bu * this.nrm[i1 * 3 + 1] + bv * this.nrm[i2 * 3 + 1];
      let nz = w * this.nrm[i0 * 3 + 2] + bu * this.nrm[i1 * 3 + 2] + bv * this.nrm[i2 * 3 + 2];
      const l = Math.hypot(nx, ny, nz) || 1;
      hit.nx = nx / l; hit.ny = ny / l; hit.nz = nz / l;
      hit.uu = w * this.uv[i0 * 2] + bu * this.uv[i1 * 2] + bv * this.uv[i2 * 2];
      hit.vv = w * this.uv[i0 * 2 + 1] + bu * this.uv[i1 * 2 + 1] + bv * this.uv[i2 * 2 + 1];
    } else {
      hit.nx = this.tn[a]; hit.ny = this.tn[a + 1]; hit.nz = this.tn[a + 2];
      const i0 = this.idx[src * 3], i1 = this.idx[src * 3 + 1], i2 = this.idx[src * 3 + 2];
      hit.uu = w * this.uv[i0 * 2] + bu * this.uv[i1 * 2] + bv * this.uv[i2 * 2];
      hit.vv = w * this.uv[i0 * 2 + 1] + bu * this.uv[i1 * 2 + 1] + bv * this.uv[i2 * 2 + 1];
    }
    const fn = this.tn[a], fd = hit.nx * fn + hit.ny * this.tn[a + 1] + hit.nz * this.tn[a + 2];
    hit.backface = fd < 0;
    return true;
  }

  /** 遮挡测试（阴影射线） */
  occluded(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tmax: number): boolean {
    if (RAYSTATS.on) RAYSTATS.occluded++;
    const nodes = this.nodes;
    const tv0 = this.tv0, tv1 = this.tv1, tv2 = this.tv2;
    const stack = this.stack;
    let sp = 0;
    stack[sp++] = 0;
    const invx = 1 / dx, invy = 1 / dy, invz = 1 / dz;
    while (sp > 0) {
      const node = stack[--sp];
      const o = node * 8;
      let t0 = (nodes[o] - ox) * invx, t1 = (nodes[o + 3] - ox) * invx;
      let tmin = Math.min(t0, t1), tmx = Math.max(t0, t1);
      t0 = (nodes[o + 1] - oy) * invy; t1 = (nodes[o + 4] - oy) * invy;
      tmin = Math.max(tmin, Math.min(t0, t1)); tmx = Math.min(tmx, Math.max(t0, t1));
      t0 = (nodes[o + 2] - oz) * invz; t1 = (nodes[o + 5] - oz) * invz;
      tmin = Math.max(tmin, Math.min(t0, t1)); tmx = Math.min(tmx, Math.max(t0, t1));
      if (tmx < 0 || tmin > tmx || tmin > tmax) continue;
      const cnt = nodes[o + 7];
      const first = nodes[o + 6] | 0;
      if (cnt > 0) {
        if (RAYSTATS.on) RAYSTATS.tris += cnt;
        for (let k = 0; k < cnt; k++) {
          const ti = first + k;
          const a = ti * 3;
          const ax = tv0[a], ay = tv0[a + 1], az = tv0[a + 2];
          const e1x = tv1[a] - ax, e1y = tv1[a + 1] - ay, e1z = tv1[a + 2] - az;
          const e2x = tv2[a] - ax, e2y = tv2[a + 1] - ay, e2z = tv2[a + 2] - az;
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (det > -1e-14 && det < 1e-14) continue;
          const inv = 1 / det;
          const sx = ox - ax, sy = oy - ay, sz = oz - az;
          const u = (sx * px + sy * py + sz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const vv = (dx * qx + dy * qy + dz * qz) * inv;
          if (vv < 0 || u + vv > 1) continue;
          const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (t > 1e-6 && t < tmax) return true;
        }
      } else {
        if (sp + 2 <= this.stack.length) { stack[sp++] = first; stack[sp++] = first + 1; }
      }
    }
    return false;
  }
  private stack = new Int32Array(256);
}

function surfaceArea(mn: number[], mx: number[]): number {
  const dx = mx[0] - mn[0], dy = mx[1] - mn[1], dz = mx[2] - mn[2];
  return 2 * (dx * dy + dy * dz + dz * dx);
}

// ---------------------------------------------------------------- 网格构建器

export class MeshBuilder {
  private P: number[] = [];
  private N: number[] = [];
  private T: number[] = [];
  private I: number[] = [];
  private M: number[] = [];
  private S: number[] = [];
  private curMat = 0;
  private curSmooth = 1;

  material(id: number): void { this.curMat = id; }
  smooth(s: boolean): void { this.curSmooth = s ? 1 : 0; }

  vertex(p: Vec3, n: Vec3, u: number, v: number): number {
    const i = this.P.length / 3;
    this.P.push(p.x, p.y, p.z);
    this.N.push(n.x, n.y, n.z);
    this.T.push(u, v);
    return i;
  }
  tri(a: number, b: number, c: number): void {
    this.I.push(a, b, c);
    this.M.push(this.curMat);
    this.S.push(this.curSmooth);
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c); this.tri(a, c, d);
  }
  /** 直接推入三角形（自带法线，平滑） */
  addTri(p0: Vec3, p1: Vec3, p2: Vec3, n0: Vec3, n1: Vec3, n2: Vec3, uv0: number[], uv1: number[], uv2: number[]): void {
    const a = this.vertex(p0, n0, uv0[0], uv0[1]);
    const b = this.vertex(p1, n1, uv1[0], uv1[1]);
    const c = this.vertex(p2, n2, uv2[0], uv2[1]);
    this.tri(a, b, c);
  }
  get triCount(): number { return this.I.length / 3; }

  build(): MeshData {
    return {
      pos: new Float32Array(this.P), nrm: new Float32Array(this.N), uv: new Float32Array(this.T),
      idx: new Uint32Array(this.I), mat: new Uint32Array(this.M), smooth: new Uint8Array(this.S),
    };
  }
}

/** 从参数曲面生成网格：f(u,v)->{p,n}，uv 空间 [0,1]^2，nu×nv 网格 */
export function tessellate(
  b: MeshBuilder,
  f: (u: number, v: number) => { p: Vec3; n: Vec3 },
  nu: number, nv: number,
  uvScale: [number, number] = [1, 1], uvOffset: [number, number] = [0, 0],
): void {
  const grid: number[][] = [];
  const pts: Vec3[][] = [];
  for (let j = 0; j <= nv; j++) {
    const row: number[] = []; const prow: Vec3[] = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const r = f(u, v);
      row.push(b.vertex(r.p, r.n, uvOffset[0] + u * uvScale[0], uvOffset[1] + v * uvScale[1]));
      prow.push(r.p);
    }
    grid.push(row); pts.push(prow);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    b.quad(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
  }
  void pts;
}

/** 自适应细分的参数曲面（按弦高误差），返回三角形 */
export function tessellateAdaptive(
  b: MeshBuilder,
  f: (u: number, v: number) => { p: Vec3; n: Vec3 },
  u0: number, u1: number, v0: number, v1: number,
  tol: number, depth = 6,
  uvScale: [number, number] = [1, 1], uvOffset: [number, number] = [0, 0],
): void {
  const evalPt = (u: number, v: number): { p: Vec3; n: Vec3 } => f(u, v);
  const rec = (a0: number, a1: number, b0: number, b1: number, d: number): void => {
    const c00 = evalPt(a0, b0), c10 = evalPt(a1, b0), c11 = evalPt(a1, b1), c01 = evalPt(a0, b1);
    const cm = evalPt((a0 + a1) / 2, (b0 + b1) / 2);
    const edgeMid = (p: Vec3, q: Vec3): Vec3 => v3((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
    const errs = [
      len2(sub(cm.p, edgeMid(c00.p, c11.p))),
      len2(sub(cm.p, edgeMid(c10.p, c01.p))),
      len2(sub(evalPt((a0 + a1) / 2, b0).p, edgeMid(c00.p, c10.p))),
      len2(sub(evalPt((a0 + a1) / 2, b1).p, edgeMid(c01.p, c11.p))),
      len2(sub(evalPt(a0, (b0 + b1) / 2).p, edgeMid(c00.p, c01.p))),
      len2(sub(evalPt(a1, (b0 + b1) / 2).p, edgeMid(c10.p, c11.p))),
    ];
    const maxErr = Math.sqrt(Math.max(...errs));
    if (d < depth && maxErr > tol) {
      const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
      rec(a0, am, b0, bm, d + 1); rec(am, a1, b0, bm, d + 1);
      rec(a0, am, bm, b1, d + 1); rec(am, a1, bm, b1, d + 1);
      return;
    }
    const uv = (u: number, v: number): [number, number] =>
      [uvOffset[0] + (u - u0) / (u1 - u0) * uvScale[0], uvOffset[1] + (v - v0) / (v1 - v0) * uvScale[1]];
    const i00 = b.vertex(c00.p, c00.n, ...uv(a0, b0));
    const i10 = b.vertex(c10.p, c10.n, ...uv(a1, b0));
    const i11 = b.vertex(c11.p, c11.n, ...uv(a1, b1));
    const i01 = b.vertex(c01.p, c01.n, ...uv(a0, b1));
    b.quad(i00, i10, i11, i01);
  };
  rec(u0, u1, v0, v1, 0);
}

/** 由两个方向求正交基（用于扫掠） */
export function frameFromDir(d: Vec3): { t: Vec3; b: Vec3 } {
  const up = Math.abs(d.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  const t = norm(cross(up, d));
  const b = norm(cross(d, t));
  return { t, b };
}

export { add, sub, cross, dot, norm, v3 };
