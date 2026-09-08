#!/usr/bin/env node
/* L4-G7：页面标题/面板与构建报告口径 = 终态实际值。 */
import fs from 'node:fs';
import { loadReport, loadMesh, report } from './lib/l4-common.mjs';
const rep = loadReport(); const mesh = loadMesh();
const html = fs.readFileSync('/home/h/genshin-model-studio/web/draw/hanfu-cage.html', 'utf8');
const web = JSON.parse(fs.readFileSync('/home/h/genshin-model-studio/web/draw/hanfu-cage.json', 'utf8'));
const faces = rep.faces;
const checks = [
  { name: '页面标题含 L4 阶段', ok: /L4/.test(html) && /语义控制图/.test(html), detail: (html.match(/<title>([^<]+)<\/title>/) || [])[1] },
  { name: '页面标题不再写 ≤300 面', ok: !/≤300/.test(html), detail: /≤300/.test(html) ? '仍含 ≤300' : '已更新' },
  { name: '页面预算口径 ≤1200', ok: /≤1200/.test(html), detail: '预算 ≤1200' },
  { name: 'web json 面数=终态', ok: web.summary.faces === faces, detail: `web=${web.summary.faces} 终态=${faces}` },
  { name: 'web json stage=L4', ok: /L4/.test(web.summary.stage), detail: web.summary.stage },
  { name: 'web json 网格=终态顶点数', ok: web.items[0].vertices.length === mesh.vertices.length,
    detail: `web=${web.items[0].vertices.length} 终态=${mesh.vertices.length}` },
  { name: 'cage.json iteration=38 / stage=L4', ok: (() => {
      const c = JSON.parse(fs.readFileSync('/home/h/genshin-model-studio/delivery/hanfu-cage/cage.json', 'utf8'));
      return c.iteration === 38 && /L4/.test(c.stage);
    })(), detail: 'iteration=38 stage=L4-sheets' },
];
report('L4-G7 标签一致', checks);
