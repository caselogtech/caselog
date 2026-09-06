// Test-only server: exercise built assets and real HTTP API on one browser origin.
import { createServer, request } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('apps/web/dist/caselog-web/browser');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const server = createServer(async (incoming, outgoing) => {
  if (incoming.url?.startsWith('/api/')) {
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port: 3137,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on('error', () => {
      outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(incoming.url ?? '/', 'http://localhost').pathname);
    let path = resolve(root, `.${pathname}`);
    if (!path.startsWith(`${root}${sep}`) && path !== root) throw new Error('Invalid path');
    try {
      if (!(await stat(path)).isFile()) path = resolve(root, 'index.html');
    } catch {
      path = resolve(root, 'index.html');
    }
    outgoing.writeHead(200, {
      'content-type': types[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    outgoing.end(await readFile(path));
  } catch {
    outgoing.writeHead(404);
    outgoing.end();
  }
});
server.listen(4317, '127.0.0.1');
process.once('SIGTERM', () => {
  server.closeAllConnections();
  server.close();
});
