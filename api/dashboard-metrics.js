const { createClient } = require('@supabase/supabase-js');
const { buildWindow } = require('../lib/analytics-dashboard');
const {
  buildPaidAdsOverview,
} = require('../lib/dashboard-operations');
const { enforceRateLimit, noStore, serverError } = require('../lib/api-security');
const moderacaoAdmin = require('../lib/moderacao-admin-handler');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';

module.exports = async (req, res) => {
  if (req.query?.rota === 'moderacao') return moderacaoAdmin(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY nao configurada' });

  const adminEmails = getAdminEmails();
  if (adminEmails.size === 0) return res.status(500).json({ error: 'DASHBOARD_ADMIN_EMAILS nao configurado' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Login obrigatorio' });

  const sb = createClient(SUPABASE_URL, serviceKey);
  const { data: userData, error: userError } = await sb.auth.getUser(token);
  const email = userData?.user?.email?.toLowerCase();
  if (userError || !email) return res.status(401).json({ error: 'Sessao invalida' });
  if (!adminEmails.has(email)) return res.status(403).json({ error: 'Acesso restrito a admins' });
  if (!enforceRateLimit(req, res, 'dashboard', { limit: 30, windowMs: 60_000 }, userData.user.id)) return;

  const now = new Date();
  const todayStart = startOfSaoPauloDay(now);
  const sevenDaysStart = new Date(todayStart);
  sevenDaysStart.setDate(sevenDaysStart.getDate() - 6);
  const lastMonthStart = new Date(todayStart);
  lastMonthStart.setDate(lastMonthStart.getDate() - 29);

  const [{ events, error }, paidAds] = await Promise.all([
    fetchAnalyticsEvents(sb),
    fetchPaidAdsOverview(sb, now),
  ]);

  if (error) {
    return serverError(res, 'Dashboard metrics error:', error);
  }

  res.json({
    generated_at: now.toISOString(),
    windows: {
      today: buildWindow(events || [], todayStart, now),
      seven_days: buildWindow(events || [], sevenDaysStart, now),
      last_month: buildWindow(events || [], lastMonthStart, now),
      all_time: buildWindow(events || [], null, now)
    },
    operations: {
      paid_ads: paidAds,
    },
  });
};

function getAdminEmails() {
  return new Set(String(process.env.DASHBOARD_ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean));
}

function startOfSaoPauloDay(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00-03:00`);
}

async function fetchAnalyticsEvents(sb) {
  const pageSize = 1000;
  let from = 0;
  const events = [];

  while (true) {
    const { data, error } = await sb
      .from('analytics_events')
      .select('event_type, session_id, city, path, metadata, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { events, error };
    events.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return { events, error: null };
}

async function fetchPaidAdsOverview(sb, now) {
  const { data: anuncios, error } = await sb
    .from('anuncios')
    .select('id, nome, tipo, plano_id, dias, alcance_tipo, cidade_alvo, uf_alvo, stripe_session_id, ativo, criado_em, expira_em')
    .not('stripe_session_id', 'is', null)
    .order('criado_em', { ascending: false })
    .limit(500);

  if (error) {
    console.error('Dashboard paid ads database error:', error);
    return {
      ...buildPaidAdsOverview({ agora: now }),
      aviso: 'Não foi possível consultar os anúncios publicados.',
    };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return {
      ...buildPaidAdsOverview({ anuncios: anuncios || [], agora: now }),
      aviso: 'Stripe não configurado neste ambiente; publicações exibidas sem confirmação do débito.',
    };
  }

  try {
    const stripe = require('stripe')(stripeKey);
    const sessoes = await fetchStripeCheckoutSessions(stripe);
    return buildPaidAdsOverview({
      anuncios: anuncios || [],
      sessoes,
      stripeDisponivel: true,
      agora: now,
    });
  } catch (stripeError) {
    console.error('Dashboard paid ads Stripe error:', stripeError);
    return {
      ...buildPaidAdsOverview({ anuncios: anuncios || [], agora: now }),
      aviso: 'O Stripe não respondeu; os anúncios continuam visíveis, mas o débito não pôde ser confirmado agora.',
    };
  }
}

async function fetchStripeCheckoutSessions(stripe) {
  const sessoes = [];
  let startingAfter;

  for (let pagina = 0; pagina < 5; pagina += 1) {
    const resposta = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    sessoes.push(...(resposta.data || []));
    if (!resposta.has_more || !resposta.data?.length) break;
    startingAfter = resposta.data.at(-1).id;
  }

  return sessoes;
}
