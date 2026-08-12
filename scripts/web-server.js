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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveStructure } from '../dist/src/core/structure.js';
import { encodeStructure } from '../dist/src/core/encoder.js';
import { encodeGia } from '../dist/src/gia/gia-encoder.js';
import { DOCS_FILES, exampleMeta, toGiaInput, attachmentName, docsPage, parseDrawModelRequest, drawModelResult, } from '../dist/src/web-shared.js';
const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8787);
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
    // 开发期一律 no-cache：本地页面每次刷新都拿最新（否则浏览器启发式缓存会让用户/脚本看到旧版）
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache, no-store, must-revalidate' });
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
