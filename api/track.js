const { createClient } = require('@supabase/supabase-js');
const { EVENTOS, EVENTOS_ADOCAO } = require('../lib/analytics-dashboard');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const METADATA_KEYS = new Set([
  'title',
  'link_url',
  'landing_city',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'ref',
  'src',
  'referrer_host',
  'cta_text',
  'cta_href',
  'cta_position',
  'platform',
  'source',
  'status',
  'action',
]);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY nao configurada' });

  const body = req.body || {};
  const eventType = String(body.event_type || '').trim();
  const sessionId = String(body.session_id || '').trim();
  const path = normalizarLink(body.path);

  if (!EVENTOS.has(eventType)) return res.status(400).json({ error: 'event_type invalido' });
  if (!sessionId) return res.status(400).json({ error: 'session_id obrigatorio' });

  const sb = createClient(SUPABASE_URL, serviceKey);
  const metadata = sanitizarMetadata(body.metadata);
  const landingCity = sanitizarSlug(body.city);
  if (landingCity) metadata.landing_city = landingCity;
  metadata.link_url = normalizarLink(metadata.link_url || path);
  metadata.geo = geolocalizacaoAproximada(req.headers || {});
  metadata.device = classificarDispositivo(req.headers || {});
  metadata.traffic_quality = classificarTrafego(req.headers || {});
  const persisted = prepararEventoPersistido(eventType, metadata);

  const userId = await usuarioAutenticado(sb, req.headers?.authorization);
  const { error } = await sb.from('analytics_events').insert({
    event_type: persisted.eventType,
    session_id: sessionId.slice(0, 120),
    city: null,
    path: path || null,
    user_id: userId,
    metadata: persisted.metadata,
  });

  if (error) {
    console.error('Track error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
};

function sanitizarMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!METADATA_KEYS.has(key)) continue;
    if (key === 'landing_city') {
      const slug = sanitizarSlug(raw);
      if (slug) result[key] = slug;
      continue;
    }
    const text = String(raw || '').trim().slice(0, 300);
    if (text) result[key] = text;
  }
  return result;
}

function prepararEventoPersistido(eventType, metadata) {
  const safeMetadata = { ...metadata };
  if (EVENTOS_ADOCAO.has(eventType)) safeMetadata.action = eventType;
  else delete safeMetadata.action;
  return {
    eventType: EVENTOS_ADOCAO.has(eventType) ? 'cta_click' : eventType,
    metadata: safeMetadata,
  };
}

function geolocalizacaoAproximada(headers) {
  return {
    city: lerHeader(headers, 'x-vercel-ip-city', 100),
    region: lerHeader(headers, 'x-vercel-ip-country-region', 100),
    country: lerHeader(headers, 'x-vercel-ip-country', 20),
  };
}

function lerHeader(headers, name, max) {
  const value = Array.isArray(headers[name]) ? headers[name][0] : headers[name];
  if (!value) return null;
  try {
    return decodeURIComponent(String(value)).trim().slice(0, max) || null;
  } catch {
    return String(value).trim().slice(0, max) || null;
  }
}

function classificarDispositivo(headers) {
  const userAgent = lerHeader(headers, 'user-agent', 300) || '';
  return /mobile|android|iphone|ipad/i.test(userAgent) ? 'mobile' : 'desktop';
}

function classificarTrafego(headers) {
  const userAgent = lerHeader(headers, 'user-agent', 300) || '';
  return /bot|crawler|spider|headless|preview|facebookexternalhit|whatsapp|slurp|bingpreview/i.test(userAgent)
    ? 'suspected_bot'
    : 'human';
}

function normalizarLink(value) {
  const raw = String(value || '').trim().replace(/[\r\n]/g, '').slice(0, 300);
  if (!raw) return '/';
  try {
    const parsed = new URL(raw, 'https://vizinhocerto.com.br');
    if (parsed.protocol !== 'https:' || !['vizinhocerto.com.br', 'www.vizinhocerto.com.br'].includes(parsed.hostname)) return '/';
    return `${parsed.pathname}${parsed.search}`.slice(0, 300) || '/';
  } catch {
    return '/';
  }
}

function sanitizarSlug(value) {
  const slug = String(value || '').trim().toLowerCase().slice(0, 80);
  return /^[a-z0-9_-]+$/.test(slug) ? slug : null;
}

async function usuarioAutenticado(sb, authorization) {
  const token = String(authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data?.user?.id || null;
}

module.exports._private = {
  geolocalizacaoAproximada,
  classificarDispositivo,
  classificarTrafego,
  normalizarLink,
  prepararEventoPersistido,
  sanitizarMetadata,
  sanitizarSlug,
};
