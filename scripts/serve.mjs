import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4188);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2':'font/woff2' };
http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = name === '/' ? 'index.html' : name.slice(1);
    // Serve only shipping files, never documents, tests or local project metadata.
    if (!['index.html', 'favicon.svg'].includes(relative) && !/^src\/[a-z-]+\.(js|css)$/.test(relative) && !/^src\/fonts\/[a-zA-Z0-9_.-]+\.woff2$/.test(relative)) {
      res.writeHead(404).end('Not found'); return;
    }
    const file = path.resolve(root, relative);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Dice Abyss ready: http://127.0.0.1:${port}`));
