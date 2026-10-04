// 本地预览：node scripts/serve.mjs  → http://localhost:8080
// （直接双击 index.html 打不开，浏览器不允许 file:// 加载 ES 模块）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '');
  if (path.startsWith('..')) return res.writeHead(403).end();
  try {
    const body = await readFile(join(root, path || 'index.html'));
    res.writeHead(200, { 'Content-Type': `${TYPES[extname(path || '.html')] || 'application/octet-stream'}; charset=utf-8` }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}`));
