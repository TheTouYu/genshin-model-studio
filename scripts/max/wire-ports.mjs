// wire-ports.mjs —— 接口特写线框取证：看端口底板到底由哪些三角形拼成（找"凸耳/梳齿"的来源）
// 用法：node scripts/max/page-probe.mjs --w 1000 --h 420 --url "<photo.html?v=...>" --script scripts/max/wire-ports.mjs
export default async function ({ evalJS, shoot, sleep }) {
  await evalJS(`window.__photo.preset('dark'); window.__photo.setLid(0); window.__photo.wireframe(true); return 1;`);
  await sleep(400);
  // 左壁接口特写（与 portclose 同机位，略推近）
  await evalJS(`window.__photo.cam({azim:270, elev:3, dist:0.13, fov:24, target:[-0.152,0.0077,-0.052]}); return 1;`);
  await sleep(600);
  const a = await shoot('wire-portsL', 1000, 420);
  // 右壁
  await evalJS(`window.__photo.cam({azim:90, elev:3, dist:0.13, fov:24, target:[0.152,0.0077,-0.052]}); return 1;`);
  await sleep(600);
  const b = await shoot('wire-portsR', 1000, 420);
  await evalJS(`window.__photo.wireframe(false); return 1;`);
  return { a, b };
}
