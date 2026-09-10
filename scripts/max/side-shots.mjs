/**
 * side-shots.mjs —— 官方口径侧视取证（合盖网格）
 * 用法：SIDE_OUT=.scratch/r27 node scripts/max/page-probe.mjs --w 1400 --h 600 \
 *         --url 'http://localhost:8787/draw/photo.html?v=<epoch>' --script scripts/max/side-shots.mjs
 *
 * 三张：
 *  L / R  —— 正侧视（elev 0 + 长焦 fov 1.6），与 reference/macbook/img/official-mbp14-ports-{1,2}.jpg
 *            同口径（818×274、6.04 px/mm），用于判「接口细不细」「合盖闭合线是否一条线」。
 *  seam34  —— 用户在页面上看的那个 3/4 俯视角（azim 254 elev 20 dist 0.34），用于判「侧面看闭合线」。
 */
export default async ({ evalJS, shoot, sleep }) => {
  const OUT = process.env.SIDE_OUT || '.scratch/r27';
  const out = { shots: [] };
  // 1) 载入合盖网格（页面默认是开盖的 macbook-current.json）
  await evalJS(`window.__meshLoaded=null; __photo.loadMesh('./macbook-closed.json', ()=>{});`);
  for (let i = 0; i < 60; i++) {
    const done = await evalJS(`window.__meshLoaded ? 1 : 0`);
    if (Number(done) === 1) break;
    await sleep(500);
  }
  await evalJS(`__photo.preset('dark')`);
  await sleep(300);
  const jobs = [
    { name: 'L', cam: { azim: 270, elev: 0, dist: 0.80, fov: 1.6, target: [0, 0.008, -0.058] } },
    { name: 'R', cam: { azim: 90, elev: 0, dist: 0.80, fov: 1.6, target: [0, 0.008, -0.058] } },
    { name: 'seam34', cam: { azim: 254, elev: 20, dist: 0.34, fov: 32, target: [-0.09, 0.02, -0.015] } },
  ];
  for (const j of jobs) {
    await evalJS(`__photo.cam(${JSON.stringify(j.cam)})`);
    await sleep(250);
    const f = `${OUT}/side-${j.name}.png`;
    await shoot(f);
    out.shots.push({ name: j.name, file: f });
  }
  out.mesh = await evalJS('String(window.__meshLoaded)');
  out.canvas = await evalJS('JSON.stringify({w:document.getElementById("canvas").width,h:document.getElementById("canvas").height})');
  return out;
};
