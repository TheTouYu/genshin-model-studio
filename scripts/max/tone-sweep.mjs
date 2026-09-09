/**
 * tone-sweep.mjs — 铝面亮度校准扫描（page-probe --script 用）
 *
 * 依据：用户参考图 `/mnt/e/模型/笔记本/俯视图.png`（闭合上盖白底产品照）
 * 实测 lid 中心 mean 214 / p5 202 / p95 242（窄带）。
 * 我的白底预设下 p50 242 / p5 103（过曝 + 对比过强）→ 扫 envScale × exposure 找匹配点。
 */
export default async function ({ evalJS, shoot, sleep }) {
  const out = []
  await evalJS("window.__photo.loadMesh('./macbook-closed.json')")
  for (let i = 0; i < 60; i++) { if (await evalJS("window.__meshLoaded === './macbook-closed.json'")) break; await sleep(300) }
  await evalJS("window.__photo.preset('white')")
  await sleep(700)
  const ks = [0.15, 0.22, 0.30]
  const exps = [0.55, 0.65]
  for (const k of ks) {
    for (const e of exps) {
      await evalJS(`window.__photo.envScale(${k}); window.__photo.post({exposure:${e}}); window.__photo.shoot('closedtop',700,420,{seed:7})`)
      const p = `.scratch/max/tone/k${k}_e${e}.png`
      await shoot(p, 700, 420)
      out.push({ k, e, path: p })
    }
  }
  return out
}
