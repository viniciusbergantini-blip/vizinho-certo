const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const TRUSTED_ORIGINS = new Set([
  'https://vizinho-certo.vercel.app',
  'https://vizinhocerto.com.br',
  'https://www.vizinhocerto.com.br',
  'capacitor://localhost',
  'ionic://localhost',
]);
const rateWindows = new Map();

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_KEY nao configurada');
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearerToken(req) {
  return String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

async function authenticate(req, res, sb = serviceClient()) {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Login obrigatorio' });
    return null;
  }

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: 'Sessao invalida' });
    return null;
  }
  return { user: data.user, token, sb };
}

function originAllowed(origin) {
  const value = String(origin || '').trim();
  if (!value) return true;
  if (TRUSTED_ORIGINS.has(value)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value);
}

function enforceTrustedOrigin(req, res) {
  if (originAllowed(req.headers?.origin)) return true;
  res.status(403).json({ error: 'Origem nao permitida' });
  return false;
}

function clientIp(req) {
  return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'desconhecido')
    .split(',')[0]
    .trim()
    .slice(0, 100);
}

function consumeRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now >= current.resetAt) {
    rateWindows.set(key, { count: 1, resetAt: now + windowMs });
    pruneRateWindows(now);
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function enforceRateLimit(req, res, scope, options, subject = clientIp(req)) {
  if (consumeRateLimit(`${scope}:${subject}`, options)) return true;
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil(options.windowMs / 1000))));
  res.status(429).json({ error: 'Muitas tentativas. Aguarde e tente novamente.' });
  return false;
}

function pruneRateWindows(now) {
  if (rateWindows.size < 5000) return;
  for (const [key, value] of rateWindows) {
    if (now >= value.resetAt) rateWindows.delete(key);
  }
}

function enforceBodyLimit(req, res, maxBytes = 32 * 1024) {
  const declared = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    res.status(413).json({ error: 'Requisicao muito grande' });
    return false;
  }
  try {
    if (Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8') > maxBytes) {
      res.status(413).json({ error: 'Requisicao muito grande' });
      return false;
    }
  } catch {
    res.status(400).json({ error: 'Corpo da requisicao invalido' });
    return false;
  }
  return true;
}

function cleanText(value, maxLength, { multiline = false } = {}) {
  const text = String(value ?? '').replace(/\0/g, '').trim();
  const normalized = multiline ? text.replace(/\r\n/g, '\n') : text.replace(/\s+/g, ' ');
  return normalized.slice(0, maxLength);
}

function safeRecordId(value) {
  const id = String(value || '').trim();
  return /^\d{1,20}$/.test(id)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

function serverError(res, label, error) {
  console.error(label, error);
  if (!res.headersSent) res.status(500).json({ error: 'Erro interno. Tente novamente.' });
}

module.exports = {
  SUPABASE_URL,
  TRUSTED_ORIGINS,
  authenticate,
  bearerToken,
  cleanText,
  clientIp,
  consumeRateLimit,
  enforceBodyLimit,
  enforceRateLimit,
  enforceTrustedOrigin,
  noStore,
  originAllowed,
  safeRecordId,
  serverError,
  serviceClient,
};
