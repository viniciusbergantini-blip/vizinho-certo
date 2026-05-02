const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const EVENT_TYPES = new Set(['landing_view', 'cta_click', 'signup_started', 'signup_completed']);
const CITIES = new Set(['indaiatuba', 'maringa', 'londrina']);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY nao configurada' });

  const body = req.body || {};
  const eventType = String(body.event_type || '').trim();
  const sessionId = String(body.session_id || '').trim();
  const city = body.city ? String(body.city).trim().toLowerCase() : null;
  const path = String(body.path || '').trim().slice(0, 300);
  const userId = body.user_id ? String(body.user_id).trim() : null;
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

  if (!EVENT_TYPES.has(eventType)) return res.status(400).json({ error: 'event_type invalido' });
  if (!sessionId) return res.status(400).json({ error: 'session_id obrigatorio' });
  if (city && !CITIES.has(city)) return res.status(400).json({ error: 'city invalida' });

  const sb = createClient(SUPABASE_URL, serviceKey);
  const { error } = await sb.from('analytics_events').insert({
    event_type: eventType,
    session_id: sessionId.slice(0, 120),
    city,
    path: path || null,
    user_id: userId,
    metadata
  });

  if (error) {
    console.error('Track error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
};
