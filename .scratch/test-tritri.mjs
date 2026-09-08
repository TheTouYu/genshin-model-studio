import fs from 'node:fs';
// extract the detector by re-implementing the same functions (copy from audit for a self-test)
import { Vector3 } from 'three';
function segTri(p, q, tri) {
  const n = new Vector3().subVectors(tri[1], tri[0]).cross(new Vector3().subVectors(tri[2], tri[0]));
  const d0 = new Vector3().subVectors(p, tri[0]).dot(n);
  const d1 = new Vector3().subVectors(q, tri[0]).dot(n);
  if ((d0 > 0 && d1 > 0) || (d0 < 0 && d1 < 0)) return false;
  const dir = new Vector3().subVectors(q, p);
  const dv = new Vector3().subVectors(tri[0], p);
  const da = dir.dot(n);
  let t;
  if (Math.abs(da) > 1e-12) { t = dv.dot(n) / da; if (t < -1e-9 || t > 1 + 1e-9) return false; }
  else { if (Math.abs(dv.dot(n)) > 1e-9) return false; t = 0.5; }
  const ip = new Vector3().copy(p).addScaledVector(dir, t);
  const a = new Vector3().subVectors(tri[1], tri[0]);
  const b = new Vector3().subVectors(tri[2], tri[0]);
  const c = new Vector3().subVectors(ip, tri[0]);
  const d00 = a.dot(a), d01 = a.dot(b), d11 = b.dot(b), d20 = c.dot(a), d21 = c.dot(b);
  const den = d00 * d11 - d01 * d01;
  if (Math.abs(den) < 1e-18) return false;
  const u = (d11 * d20 - d01 * d21) / den;
  const v = (d00 * d21 - d01 * d20) / den;
  return u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9;
}
const trisIntersect = (A, B) => segTri(A[0], A[1], B) || segTri(A[1], A[2], B) || segTri(A[2], A[0], B) || segTri(B[0], B[1], A) || segTri(B[1], B[2], A) || segTri(B[2], B[0], A);
const T = (a,b,c)=>[new Vector3(...a), new Vector3(...b), new Vector3(...c)];
// 1. perpendicular cross through center
console.log('cross-perp:', trisIntersect(T([0,0,-1],[0,0,1],[1,0,0]), T([0,-1,0],[0,1,0],[0,0,1])));
// 2. coplanar overlap
console.log('coplanar-overlap:', trisIntersect(T([0,0,0],[2,0,0],[0,2,0]), T([0.5,0.5,0],[2,2,0],[0.5,2,0])));
// 3. parallel planes, no contact
console.log('parallel-apart:', trisIntersect(T([0,0,0],[1,0,0],[0,1,0]), T([0,0,1],[1,0,1],[0,1,1])));
// 4. skew pass-by (no hit)
console.log('skew-miss:', trisIntersect(T([0,0,0],[1,0,0],[0,1,0]), T([2,0.5,-1],[2,0.5,1],[3,0.5,0])));
// 5. vertex-touch (adjacency excluded by ADJ anyway)
console.log('touch-at-vertex:', trisIntersect(T([0,0,0],[1,0,0],[0,1,0]), T([0,0,0],[-1,0,0],[0,-1,0])));
