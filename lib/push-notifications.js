const webpush = require('web-push');
const { distanciaMetros, numeroFinito } = require('./localizacao');

let configured = false;

function configureWebPush() {
  if (configured) return true;
  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

async function notifyNearby(sb, profile, payload, { excludeUserId = null } = {}) {
  const lat = numeroFinito(profile?.lat);
  const lon = numeroFinito(profile?.lon);
  const radius = Math.min(Math.max(numeroFinito(profile?.raio) || 150, 50), 500);
  if (lat === null || lon === null || !configureWebPush()) return { sent: 0 };

  const { data: tokens, error } = await sb.from('push_tokens').select('token, usuario_id');
  if (error) throw error;
  const userIds = [...new Set((tokens || []).map(item => item.usuario_id).filter(Boolean))];
  if (!userIds.length) return { sent: 0 };

  const { data: users, error: usersError } = await sb
    .from('usuarios')
    .select('id, lat, lon')
    .in('id', userIds);
  if (usersError) throw usersError;

  const nearby = new Set((users || [])
    .filter(user => user.id !== excludeUserId)
    .filter(user => distanciaMetros(lat, lon, user.lat, user.lon) <= radius)
    .map(user => user.id));
  return sendTokens(sb, (tokens || []).filter(item => nearby.has(item.usuario_id)), payload);
}

async function notifyUsers(sb, userIds, payload) {
  if (!configureWebPush()) return { sent: 0 };
  const targets = [...new Set((userIds || []).filter(Boolean))].slice(0, 20);
  if (!targets.length) return { sent: 0 };
  const { data: tokens, error } = await sb
    .from('push_tokens')
    .select('token, usuario_id')
    .in('usuario_id', targets);
  if (error) throw error;
  return sendTokens(sb, tokens || [], payload);
}

async function sendTokens(sb, tokens, payload) {
  const safePayload = JSON.stringify({
    title: String(payload?.title || 'Vizinho Certo').slice(0, 80),
    body: String(payload?.body || 'Nova atividade na sua vizinhanca.').slice(0, 180),
    url: '/app',
  });
  let sent = 0;
  const invalid = [];

  await Promise.all(tokens.slice(0, 1000).map(async ({ token }) => {
    try {
      const subscription = JSON.parse(token);
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return;
      await webpush.sendNotification(subscription, safePayload);
      sent += 1;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) invalid.push(token);
    }
  }));

  if (invalid.length) await sb.from('push_tokens').delete().in('token', invalid);
  return { sent };
}

module.exports = { notifyNearby, notifyUsers };
