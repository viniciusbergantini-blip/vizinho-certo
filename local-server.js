const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

loadEnv(path.join(root, '.env.local'));

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
});

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
const publicStaticFiles = new Set([
  '/index.html', '/app.html', '/dashboard.html', '/saojoao.html', '/maringa.html',
  '/londrina.html', '/indaiatuba.html', '/offline.html', '/app-runtime.js',
  '/install-app.js', '/engagement.js', '/landing-analytics.js', '/landing-page.js',
  '/landing-session.js', '/sw.js', '/landing.css', '/manifest.json', '/icon.svg',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
]);

const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/')) {
      req.query = Object.fromEntries(url.searchParams.entries());
      await runApi(req, res, url.pathname);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(error.statusCode || 500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: error.statusCode === 413 ? 'Requisicao muito grande' : 'Erro interno' }));
  }
});

server.listen(port, host, () => {
  console.log(`Vizinho Certo local: http://${host}:${port}`);
  console.log('Use .env.local for Supabase, Stripe, Groq and VAPID credentials when testing API flows.');
});

function serveStatic(requestPath, res) {
  let filePath = requestPath;
  if (filePath === '/') filePath = '/index.html';
  if (filePath === '/app' || filePath.startsWith('/app/')) filePath = '/app.html';
  if (filePath.startsWith('/cadastro-saojoao')) filePath = '/app.html';
  if (filePath === '/dashboard' || filePath.startsWith('/dashboard/')) filePath = '/dashboard.html';
  if (filePath === '/indaiatuba' || filePath.startsWith('/indaiatuba/')) filePath = '/indaiatuba.html';
  if (filePath === '/maringa' || filePath.startsWith('/maringa/')) filePath = '/maringa.html';
  if (filePath === '/londrina' || filePath.startsWith('/londrina/')) filePath = '/londrina.html';
  if (filePath.startsWith('/saojoao')) filePath = '/app.html';

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(filePath);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }
  if (!publicStaticFiles.has(decodedPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const resolved = path.resolve(root, `.${decodedPath}`);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolved, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(resolved)] || 'application/octet-stream' });
    res.end(content);
  });
}

async function runApi(req, res, pathname) {
  const apiName = pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const apiFileName = apiName === 'eventos-admin' ? 'eventos' : apiName;
  const apiPath = path.join(root, 'api', `${apiFileName}.js`);

  if (!fs.existsSync(apiPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'API route not found' }));
    return;
  }

  req.body = await readJsonBody(req);

  const vercelRes = createVercelResponse(res);
  const moduleUrl = `${pathToFileURL(apiPath).href}?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  await mod.default(req, vercelRes);
}

function createVercelResponse(res) {
  return {
    headersSent: false,
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(data) {
      this.headersSent = true;
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(data));
    },
    end(data) {
      this.headersSent = true;
      res.end(data);
    },
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      resolve(undefined);
      return;
    }

    let raw = '';
    let settled = false;
    req.on('data', chunk => {
      if (settled) return;
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > 64 * 1024) {
        settled = true;
        const error = new Error('Request body too large');
        error.statusCode = 413;
        reject(error);
      }
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=(), payment=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.clarity.ms https://cdn.vercel-insights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://xurtdibicsxmouvzfxvb.supabase.co https://*.clarity.ms https://c.bing.com; connect-src 'self' https://xurtdibicsxmouvzfxvb.supabase.co wss://xurtdibicsxmouvzfxvb.supabase.co https://viacep.com.br https://*.clarity.ms https://vitals.vercel-insights.com; worker-src 'self' blob:; manifest-src 'self'; frame-src 'none'");
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
