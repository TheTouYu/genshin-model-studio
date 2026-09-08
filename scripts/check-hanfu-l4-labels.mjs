#!/usr/bin/env node
/* 标签一致（L4-G7 → L5-G7 同一判据，去硬编码）：页面标题/面板 + web json + cage.json
   三者口径 = **终态实际值**（阶段标签与迭代号从 cage.json 动态读，不再写死 L4/38/1200）。 */
import fs from 'node:fs';
import { loadReport, loadMesh, report, ROOT } from './lib/l4-common.mjs';
const rep = loadReport(); const mesh = loadMesh();
const html = fs.readFileSync(`${ROOT}/web/draw/hanfu-cage.html`, 'utf8');
const web = JSON.parse(fs.readFileSync(`${ROOT}/web/draw/hanfu-cage.json`, 'utf8'));
const cage = JSON.parse(fs.readFileSync(`${ROOT}/delivery/hanfu-cage/cage.json`, 'utf8'));
const faces = rep.faces;
const stageTag = String(cage.stage || '').split('-')[0];          // 'L5-sheets-colors' → 'L5'
const budget = Number((html.match(/≤(\d+)\s*面/) || [])[1] || 0);
const checks = [
  { name: `页面标题含终态阶段 ${stageTag}`, ok: html.includes(stageTag) && /语义控制图/.test(html),
    detail: (html.match(/<title>([^<]+)<\/title>/) || [])[1] },
  { name: '页面标题不再写 ≤300 面', ok: !/≤300/.test(html), detail: /≤300/.test(html) ? '仍含 ≤300' : '已更新' },
  { name: '页面预算 ≥ 终态面数', ok: budget >= faces, detail: `页面 ≤${budget} / 终态 ${faces}` },
  { name: 'web json 面数=终态', ok: web.summary.faces === faces, detail: `web=${web.summary.faces} 终态=${faces}` },
  { name: 'web json stage=终态 stage', ok: web.summary.stage.includes(stageTag), detail: web.summary.stage },
  { name: 'web json 网格=终态顶点数', ok: web.items[0].vertices.length === mesh.vertices.length,
    detail: `web=${web.items[0].vertices.length} 终态=${mesh.vertices.length}` },
  { name: `cage.json iteration=${cage.iteration} / stage=${cage.stage}`, ok: typeof cage.iteration === 'number' && web.summary.stage.endsWith(cage.stage),
    detail: `cage=${cage.iteration}/${cage.stage} web=${web.summary.stage}` },
];
report(`${stageTag}-G7 标签一致`, checks);
