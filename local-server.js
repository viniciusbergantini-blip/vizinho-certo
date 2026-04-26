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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/')) {
      await runApi(req, res, url.pathname);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(port, host, () => {
  console.log(`Vizinho Certo local: http://${host}:${port}`);
  console.log('Use .env.local for GROQ_API_KEY and MP_ACCESS_TOKEN when testing API flows.');
});

function serveStatic(requestPath, res) {
  let filePath = requestPath;
  if (filePath === '/') filePath = '/index.html';
  if (filePath === '/app' || filePath.startsWith('/app/')) filePath = '/app.html';

  const resolved = path.resolve(root, `.${decodeURIComponent(filePath)}`);
  if (!resolved.startsWith(root)) {
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
  const apiPath = path.join(root, 'api', `${apiName}.js`);

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
    req.on('data', chunk => {
      raw += chunk;
    });
    req.on('end', () => {
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
    req.on('error', reject);
  });
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
