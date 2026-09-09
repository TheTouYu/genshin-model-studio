/**
 * genshin-model-studio 本地网页服务器（零依赖，node:http）
 *
 *   npm run web
 *   打开 http://localhost:8787
 *
 * Vercel 部署版使用 api/*.ts serverless functions（同一套共享逻辑 src/web-shared.ts）。
 * 端点与 serverless 版一一对应：
 *   GET  /                       页面
 *   GET  /draw/*                 二期静态资源（web/draw/：preview.js 等）
 *   GET  /api/examples           示例列表
 *   GET  /api/examples/<name>    单个示例
 *   POST /api/draw-model         二期画线建模（strokes+options → items/fitted/closed）
 *   POST /api/export?format=gil|gia    导出文件
 *   GET  /docs?file=...          文档页（Markdown 渲染）
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { resolveStructure } from '../dist/src/core/structure.js';
import { encodeStructure } from '../dist/src/core/encoder.js';
import { encodeGia } from '../dist/src/gia/gia-encoder.js';
import { DOCS_FILES, exampleMeta, toGiaInput, attachmentName, docsPage, parseDrawModelRequest, drawModelResult, validateModelResult, } from '../dist/src/web-shared.js';
const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8787);
// 默认导出目录（用户游戏导出根）：网页"导出 .gif/.gia"会同步写一份到这里。
const EXPORT_DIR = process.env.GMS_EXPORT_DIR
    || '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export';
// 十九期：历史版本目录（benchmark/history/<id>/{work.json,meta.json}）——与 web/server.ts 同一套语义
const HISTORY_DIR = join(ROOT, 'benchmark', 'history');
const MIME = {
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
};
function sendFile(res, file, fallbackType) {
    try {
        const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
        send(res, 200, readFileSync(file), MIME[ext] ?? fallbackType);
    }
    catch {
        send(res, 404, 'not found');
    }
}
function send(res, code, body, type = 'text/plain; charset=utf-8') {
    // 预览页/贴图每轮都在改：一律 no-store，避免用户打开页面看到上一轮的缓存
    // （实测 web/draw/photo.html 被缓存后，画布尺寸仍是旧值 → 只看到一片黑）
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store, must-revalidate' });
    res.end(body);
}
const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/') {
        send(res, 200, readFileSync(join(ROOT, 'web', 'index.html')), 'text/html; charset=utf-8');
        return;
    }
    // 二期静态资源：web/draw/*（preview.js 等；Vercel 端由 public/ 静态直达）
    if (req.method === 'GET' && url.pathname.startsWith('/draw/')) {
        let rel;
        try {
            rel = decodeURIComponent(url.pathname.slice('/draw/'.length));
        }
        catch {
            send(res, 400, 'bad path');
            return;
        }
        const drawDir = join(ROOT, 'web', 'draw');
        const file = join(drawDir, rel);
        if (!file.startsWith(drawDir + '/') && file !== drawDir) {
            send(res, 403, 'forbidden');
            return;
        }
        sendFile(res, file, 'application/octet-stream');
        return;
    }
    if (req.method === 'GET' && url.pathname === '/docs') {
        try {
            const fileKey = url.searchParams.get('file') ?? 'README.md';
            if (!(fileKey in DOCS_FILES)) {
                send(res, 404, `unknown doc file: ${fileKey}`);
                return;
            }
            send(res, 200, docsPage(fileKey), 'text/html; charset=utf-8');
        }
        catch (e) {
            send(res, 500, `docs render failed: ${e.message}`);
        }
        return;
    }
    // 十九期：历史版本管理（benchmark/history/）——端点与 web/server.ts 一一对应
    const histIdOk = (id) => id.length >= 1 && id.length <= 80 && !id.includes('/') && !id.includes('\\') && !id.includes('..');
    const historyList = () => {
        if (!existsSync(HISTORY_DIR))
            return [];
        const out = [];
        for (const id of readdirSync(HISTORY_DIR)) {
            if (!histIdOk(id))
                continue;
            const metaFile = join(HISTORY_DIR, id, 'meta.json');
            if (!existsSync(metaFile))
                continue;
            try {
                const m = JSON.parse(readFileSync(metaFile, 'utf8'));
                out.push({ id, name: m.name || id, time: m.time || '', strokes: m.strokes || 0, items: m.items || 0, tags: m.tags || '' });
            }
            catch {
                /* 跳过损坏 meta */
            }
        }
        out.sort((a, b) => (a.time < b.time ? 1 : -1));
        return out;
    };
    if (req.method === 'GET' && url.pathname === '/api/history') {
        send(res, 200, JSON.stringify(historyList()), 'application/json');
        return;
    }
    if (req.method === 'GET' && url.pathname === '/api/history/get') {
        const id = url.searchParams.get('id') ?? '';
        const file = join(HISTORY_DIR, id, 'work.json');
        if (!histIdOk(id) || !file.startsWith(HISTORY_DIR) || !existsSync(file)) {
            send(res, 404, 'history not found');
            return;
        }
        send(res, 200, readFileSync(file), 'application/json');
        return;
    }
    if (req.method === 'POST' && url.pathname === '/api/history/save') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            try {
                const reqBody = JSON.parse(body);
                const work = reqBody.work;
                if (!work || typeof work !== 'object' || !Array.isArray(work.strokes))
                    throw new Error('work 非法（需 {strokes, options}）');
                const name = String(reqBody.name || '未命名').slice(0, 40);
                const tags = String(reqBody.tags || '').slice(0, 60);
                const id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                mkdirSync(join(HISTORY_DIR, id), { recursive: true });
                writeFileSync(join(HISTORY_DIR, id, 'work.json'), JSON.stringify(work));
                const meta = {
                    id, name, tags,
                    time: new Date().toISOString(),
                    strokes: work.strokes.length,
                    items: Number(reqBody.items) || 0,
                };
                writeFileSync(join(HISTORY_DIR, id, 'meta.json'), JSON.stringify(meta, null, 1));
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(meta));
            }
            catch (e) {
                send(res, 400, e.message);
            }
        });
        return;
    }
    if (req.method === 'POST' && url.pathname === '/api/history/delete') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            try {
                const { id } = JSON.parse(body);
                if (!histIdOk(id))
                    throw new Error('id 非法');
                rmSync(join(HISTORY_DIR, id), { recursive: true, force: true });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true }));
            }
            catch (e) {
                send(res, 400, e.message);
            }
        });
        return;
    }
    if (req.method === 'GET' && url.pathname === '/api/examples') {
        send(res, 200, JSON.stringify(exampleMeta(), null, 2), 'application/json');
        return;
    }
    if (req.method === 'GET' && url.pathname === '/api/examples/get') {
        const name = url.searchParams.get('name') ?? '';
        const file = join(ROOT, 'examples', name.endsWith('.json') ? name : name + '.json');
        if (!file.startsWith(join(ROOT, 'examples')) || !file.endsWith('.json')) {
            send(res, 400, 'bad example name');
            return;
        }
        send(res, 200, readFileSync(file), 'application/json');
        return;
    }
    if (req.method === 'POST' && url.pathname === '/api/draw-model') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            try {
                const { strokes, options } = parseDrawModelRequest(body);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(drawModelResult(strokes, options)));
            }
            catch (e) {
                send(res, 400, e.message);
            }
        });
        return;
    }
    if (req.method === 'POST' && url.pathname === '/api/validate-model') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            try {
                const result = validateModelResult(body); // 先校验（可能抛错），再写响应头
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(result));
            }
            catch (e) {
                send(res, 400, e.message);
            }
        });
        return;
    }
    if (req.method === 'POST' && url.pathname === '/api/export') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            try {
                const { data } = JSON.parse(body);
                const format = url.searchParams.get('format') || 'gil';
                let bytes, filename, contentType;
                if (format === 'gia') {
                    bytes = encodeGia(toGiaInput(data));
                    filename = `${data.model?.name ?? data.name ?? 'model'}.gia`;
                    contentType = 'application/octet-stream';
                }
                else {
                    const resolved = resolveStructure(data);
                    bytes = encodeStructure(resolved);
                    filename = `${resolved.name}.gil`;
                    contentType = 'application/octet-stream';
                }
                // 默认导出目录（游戏）：GMS_EXPORT_DIR 可覆盖；成功产出时同步写一份到该目录。
                // 与浏览器下载并行；失败仅告警不影响下载。
                try {
                    mkdirSync(EXPORT_DIR, { recursive: true });
                    const outPath = join(EXPORT_DIR, filename);
                    writeFileSync(outPath, Buffer.from(bytes));
                    console.log(`export-dir: ${outPath} (${bytes.length} bytes)`);
                }
                catch (e) {
                    console.warn(`export-dir write skipped: ${e.message}`);
                }
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Content-Disposition': attachmentName(filename),
                    'Content-Length': bytes.length,
                });
                res.end(Buffer.from(bytes));
            }
            catch (e) {
                send(res, 400, `导出失败: ${e.message}`);
            }
        });
        return;
    }
    send(res, 404, 'not found');
});
server.listen(PORT, () => {
    console.log(`genshin-model-studio web: http://localhost:${PORT}`);
});
