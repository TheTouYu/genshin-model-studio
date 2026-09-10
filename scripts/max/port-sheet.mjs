/**
 * port-sheet.mjs —— 逐口特写核验（用户反馈标准的机位：一个开口占满画面）
 * 用法：node scripts/max/page-probe.mjs --w 1000 --h 420 --url '...?v=<epoch>' \
 *         --script scripts/max/port-sheet.mjs
 * 输出：.scratch/portsheet/<side>-<kind>.png —— 每个开口一张，供逐张放大核对
 *      （教训：四口同框的出图在 780px 宽下看不出开口中段缺面，必须逐口看）
 */
export default async ({ evalJS, shoot, sleep }) => {
  const OUT = process.env.PORT_OUT || '.scratch/portsheet';
  await evalJS(`window.__meshLoaded=null; __photo.loadMesh('./macbook-closed.json', ()=>{});`);
  for (let i = 0; i < 60; i++) { if (Number(await evalJS('window.__meshLoaded ? 1 : 0')) === 1) break; await sleep(500); }
  await evalJS(`__photo.preset('dark')`); await sleep(300);
  const ports = [
    ['L-magsafe', -1, -0.0825], ['L-usbc1', -1, -0.0642], ['L-usbc2', -1, -0.0494], ['L-jack', -1, -0.0366],
    ['R-hdmi', 1, -0.0830], ['R-usbc', 1, -0.0647], ['R-sdxc', 1, -0.0398],
  ];
  const files = [];
  for (const [name, side, z] of ports) {
    const azim = side < 0 ? 270 : 90;
    await evalJS(`__photo.cam({azim:${azim}, elev:3, dist:0.055, fov:20, target:[${side * 0.1563}, 0.0077, ${z}]})`);
    await sleep(260);
    const f = `${OUT}/${name}.png`;
    await shoot(f);
    files.push(f);
  }
  return { files };
};
