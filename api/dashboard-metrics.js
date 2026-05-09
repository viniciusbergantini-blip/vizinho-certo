const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const CITIES = ['indaiatuba', 'maringa', 'londrina'];

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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

  const now = new Date();
  const todayStart = startOfSaoPauloDay(now);
  const sevenDaysStart = new Date(todayStart);
  sevenDaysStart.setDate(sevenDaysStart.getDate() - 6);
  const lastMonthStart = new Date(todayStart);
  lastMonthStart.setDate(lastMonthStart.getDate() - 29);

  const { events, error } = await fetchAnalyticsEvents(sb);

  if (error) {
    console.error('Dashboard metrics error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({
    generated_at: now.toISOString(),
    windows: {
      today: buildWindow(events || [], todayStart, now),
      seven_days: buildWindow(events || [], sevenDaysStart, now),
      last_month: buildWindow(events || [], lastMonthStart, now),
      all_time: buildWindow(events || [], null, now)
    }
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

function buildWindow(events, start, end) {
  const scoped = events.filter(event => {
    const createdAt = new Date(event.created_at);
    return (!start || createdAt >= start) && createdAt <= end;
  });

  const byCity = {};
  for (const city of CITIES) {
    const views = sessions(scoped, 'landing_view', city);
    const clicks = sessions(scoped, 'cta_click', city);
    const signups = sessions(scoped, 'signup_completed', city);
    const conversions = intersection(views, signups);
    const notRegistered = difference(views, signups);

    byCity[city] = {
      visitors: views.size,
      cta_clicks: clicks.size,
      signups: signups.size,
      conversions: conversions.size,
      not_registered: notRegistered.size,
      conversion_rate: rate(conversions.size, views.size),
      abandonment_rate: rate(notRegistered.size, views.size)
    };
  }

  const directSignups = sessions(scoped.filter(event => !event.city), 'signup_completed');
  const totals = CITIES.reduce((acc, city) => {
    const item = byCity[city];
    acc.visitors += item.visitors;
    acc.cta_clicks += item.cta_clicks;
    acc.signups += item.signups;
    acc.conversions += item.conversions;
    acc.not_registered += item.not_registered;
    return acc;
  }, { visitors: 0, cta_clicks: 0, signups: 0, conversions: 0, not_registered: 0, direct_signups: directSignups.size });

  totals.conversion_rate = rate(totals.conversions, totals.visitors);
  totals.abandonment_rate = rate(totals.not_registered, totals.visitors);

  return {
    start: start ? start.toISOString() : null,
    end: end.toISOString(),
    totals,
    cities: byCity
  };
}

async function fetchAnalyticsEvents(sb) {
  const pageSize = 1000;
  let from = 0;
  const events = [];

  while (true) {
    const { data, error } = await sb
      .from('analytics_events')
      .select('event_type, session_id, city, user_id, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { events, error };
    events.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return { events, error: null };
}

function sessions(events, type, city) {
  return new Set(events
    .filter(event => event.event_type === type && (city === undefined || event.city === city))
    .map(event => event.session_id)
    .filter(Boolean));
}

function intersection(a, b) {
  return new Set([...a].filter(item => b.has(item)));
}

function difference(a, b) {
  return new Set([...a].filter(item => !b.has(item)));
}

function rate(value, total) {
  return total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;
}
