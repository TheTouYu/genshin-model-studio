/**
 * side-views.mjs —— 侧视取证（与 Apple 官方侧视图同口径比对用）
 * 用法：node scripts/max/page-probe.mjs --w 1200 --h 520 \
 *         --url 'http://localhost:8787/draw/photo.html?v=side' --script scripts/max/side-views.mjs
 *
 * 官方侧视图（reference/macbook/img/official-mbp14-ports-1/2.jpg，818×274，6.04 px/mm）
 * 是判定「合盖闭合线是否严丝闭合」「接口是否粗糙」的权威口径。本脚本用同一机位口径
 * （正侧视 elev=0 + 长焦小 fov）出图，只调 cam()，不动 photo.html。
 */
export default async ({ evalJS, shoot, sleep }) => {
  const out = { shots: [] };
  const jobs = [
    // 接口簇特写：dist 0.80 + fov 1.6 → 可见高 22.3mm；1200×520 → 可见宽 51.5mm
    { name: 'L', azim: 270, dist: 0.80, fov: 1.6, target: [0, 0.008, -0.058] },
    { name: 'R', azim: 90, dist: 0.80, fov: 1.6, target: [0, 0.008, -0.058] },
  ];
  for (const j of jobs) {
    await evalJS(`__photo.cam(${JSON.stringify({ azim: j.azim, elev: 0, dist: j.dist, fov: j.fov, target: j.target })})`);
    await sleep(200);
    const f = `.scratch/r15/side-${j.name}.png`;
    await shoot(f);
    out.shots.push({ name: j.name, file: f });
  }
  out.canvas = await evalJS('JSON.stringify({w:document.getElementById("canvas").width,h:document.getElementById("canvas").height})');
  return out;
};
