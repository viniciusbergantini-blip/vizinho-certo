const { createClient } = require('@supabase/supabase-js');
const { EVENTOS, EVENTOS_ADOCAO } = require('../lib/analytics-dashboard');
const {
  enforceBodyLimit,
  enforceRateLimit,
  enforceTrustedOrigin,
  noStore,
} = require('../lib/api-security');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const CITIES = Object.freeze({
  geral: null,
  saojoao: 'São João da Boa Vista',
  maringa: 'Maringá',
  londrina: 'Londrina',
  indaiatuba: 'Indaiatuba',
});
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
  'ad_id',
  'surface',
]);

module.exports = async (req, res) => {
  if (req.method === 'GET' && getQueryValue(req, 'view') === 'public-stats') {
    if (!enforceRateLimit(req, res, 'public-stats', { limit: 60, windowMs: 60_000 })) return;
    return publicStats(req, res);
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);
  if (!enforceTrustedOrigin(req, res) || !enforceBodyLimit(req, res, 16 * 1024)) return;
  if (!enforceRateLimit(req, res, 'analytics', { limit: 180, windowMs: 60_000 })) return;

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY nao configurada' });

  const body = req.body || {};
  const eventType = String(body.event_type || '').trim();
  const sessionId = String(body.session_id || '').trim();
  const path = normalizarLink(body.path);

  if (!EVENTOS.has(eventType)) return res.status(400).json({ error: 'event_type invalido' });
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(sessionId)) {
    return res.status(400).json({ error: 'session_id invalido' });
  }

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
    return res.status(500).json({ error: 'Nao foi possivel registrar o evento' });
  }

  res.json({ ok: true });
};

async function publicStats(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Estatísticas indisponíveis' });

  const cityKey = normalizeCityKey(getQueryValue(req, 'city'));
  const cityName = CITIES[cityKey];
  const sb = createClient(SUPABASE_URL, serviceKey);
  const totalQuery = sb.from('usuarios').select('id', { count: 'exact', head: true });
  const cityQuery = cityName
    ? sb.from('usuarios').select('id', { count: 'exact', head: true }).eq('cidade', cityName)
    : Promise.resolve({ count: null, error: null });
  const [totalResult, cityResult] = await Promise.all([totalQuery, cityQuery]);

  if (totalResult.error || cityResult.error) {
    console.error('Public stats error:', totalResult.error || cityResult.error);
    return res.status(500).json({ error: 'Estatísticas indisponíveis' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  return res.json({
    city: cityKey,
    registered_total: roundPublicCount(totalResult.count),
    registered_city: roundPublicCount(cityResult.count),
  });
}

function getQueryValue(req, key) {
  if (req.query && req.query[key] !== undefined) return String(req.query[key]);
  return new URL(req.url || '/', 'http://localhost').searchParams.get(key) || '';
}

function normalizeCityKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CITIES, key) ? key : 'geral';
}

function roundPublicCount(value) {
  const count = Number(value || 0);
  return count >= 10 ? Math.floor(count / 10) * 10 : 0;
}

function sanitizarMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!METADATA_KEYS.has(key)) continue;
    if (key === 'ad_id') {
      const id = String(raw || '').trim().toLowerCase();
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) result[key] = id;
      continue;
    }
    if (key === 'surface') {
      const surface = String(raw || '').trim().toLowerCase();
      if (['feed', 'services'].includes(surface)) result[key] = surface;
      continue;
    }
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
  CITIES,
  geolocalizacaoAproximada,
  classificarDispositivo,
  classificarTrafego,
  normalizarLink,
  prepararEventoPersistido,
  sanitizarMetadata,
  sanitizarSlug,
  normalizeCityKey,
  roundPublicCount,
};
