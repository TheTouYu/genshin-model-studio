/**
 * ray-pick.mjs —— 在**活页面**里对指定像素射线取证（资产）
 *
 * 用途：看图发现"一条不该有的边 / 一块颜色突变"，但无法判断它属于哪张网格、什么材质时，
 * 直接从渲染像素反查：命中点世界坐标 / 材质色 / 该面法线 / 这条射线上一共有几张面（重合面 → z-fighting）。
 * 相比"改代码加标记再重建"，这个探针**零重建**，秒级出结论。
 *
 * 用法（透视/倍率必须与出图一致，否则像素坐标对不上）：
 *   node scripts/max/page-probe.mjs --w 1300 --h 700 \
 *     --url "http://localhost:8787/draw/photo.html?v=$(date +%s)&view=scoopend&pick=400,320;440,315;470,310;500,300" \
 *     --script scripts/max/ray-pick.mjs
 *
 * URL 参数：view=<VIEWS 里的机位名>、pick=x,y;x,y;...（画布像素，左上原点）
 * 输出：JSON —— 每个像素的 {px,py,hit,p(mm),col,face,meshName,nHit,coincident}
 *   nHit>1 表示该像素射线上还有别的面（重合面/背面），coincident=前两层是否在 1µm 内重合。
 */
export default async ({ evalJS, sleep }) => {
  const q = await evalJS('location.search');
  const params = new URLSearchParams(q.replace(/^\?/, ''));
  const view = params.get('view') || 'hero';
  // ⚠ 画布口径必须与出图一致，否则像素坐标全错（r40 踩过：默认 1300×700 去打 1400×500 的图）
  const W = Number(params.get('w') || 1300), H = Number(params.get('h') || 700);
  const picks = (params.get('pick') || '650,350')
    .split(';').map((s) => s.split(',').map(Number)).filter((a) => a.length === 2 && a.every((v) => Number.isFinite(v)));

  // 用 __photo.shoot 把画布尺寸/机位固定成与出图完全一致的口径
  const shot = await evalJS(`(()=>{const r=__photo.shoot(${JSON.stringify(view)},${W},${H});return JSON.stringify(r)})()`);
  await sleep(300);

  const code = `(() => {
    const cv = document.getElementById('canvas');
    const rc = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const picks = ${JSON.stringify(picks)};
    const out = [];
    for (const [px, py] of picks) {
      ndc.x = (px / cv.width) * 2 - 1;
      ndc.y = -(py / cv.height) * 2 + 1;
      rc.setFromCamera(ndc, __photo.camera);
      const hits = rc.intersectObject(__photo.root, true).filter(h => h.object.visible);
      const rec = { px, py, canvas: [cv.width, cv.height], nHit: hits.length };
      if (!hits.length) { rec.hit = null; out.push(rec); continue; }
      const h = hits[0];
      const mm = (v) => +(v * 1000).toFixed(4);
      rec.p = [mm(h.point.x), mm(h.point.y), mm(h.point.z)];
      rec.col = h.object.material && h.object.material.color ? '#' + h.object.material.color.getHexString() : null;
      rec.matName = h.object.material && h.object.material.name ? h.object.material.name : null;
      rec.face = h.face ? [h.face.normal.x, h.face.normal.y, h.face.normal.z].map(v => +v.toFixed(4)) : null;
      rec.meshName = h.object.name || null;
      if (hits.length > 1) {
        const g = hits[1];
        rec.p2 = [mm(g.point.x), mm(g.point.y), mm(g.point.z)];
        rec.col2 = g.object.material && g.object.material.color ? '#' + g.object.material.color.getHexString() : null;
        rec.coincident = Math.abs(h.distance - g.distance) < 1e-6;
      }
      out.push(rec);
    }
    return JSON.stringify(out);
  })()`;
  const res = await evalJS(code);
  const rows = JSON.parse(res);
  // 同时给一份**紧凑文本表**：日志混排时 JSON 不好解析（r40 踩过两次）
  const table = rows.map((r) => {
    const p = r.p ? r.p.map((v) => v.toFixed(3)).join(',') : 'MISS';
    return `px=${r.px},${r.py} col=${r.col} p=(${p}) nHit=${r.nHit} next=${r.col2 || '-'}`;
  }).join('\n');
  return { view, shot, table, picks: rows };
};
