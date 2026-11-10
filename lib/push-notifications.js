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
    .filter(user => {
      const distance = distanciaMetros(lat, lon, user.lat, user.lon);
      return distance !== null && distance <= radius;
    })
    .map(user => user.id));
  if (excludeUserId && nearby.size) {
    const { data: blocks, error: blocksError } = await sb.from('bloqueios_usuarios')
      .select('bloqueador_id,bloqueado_id')
      .or(`bloqueador_id.eq.${excludeUserId},bloqueado_id.eq.${excludeUserId}`);
    if (blocksError) throw blocksError;
    for (const block of blocks || []) nearby.delete(block.bloqueador_id === excludeUserId ? block.bloqueado_id : block.bloqueador_id);
  }
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
  if (!configureWebPush()) return { sent: 0, notified_users: 0, failed: tokens.length };
  const emergency = String(payload?.title || '').includes('🆘');
  const safePayload = JSON.stringify({
    title: String(payload?.title || 'Vizinho Certo').slice(0, 80),
    body: String(payload?.body || 'Nova atividade na sua vizinhanca.').slice(0, 180),
    url: '/app',
    tag: String(payload?.tag || '').slice(0, 80) || undefined,
    expiresAt: Date.now() + (emergency ? 10 * 60_000 : 24 * 60 * 60_000),
  });
  let sent = 0;
  const notifiedUsers = new Set();
  const invalid = [];

  await Promise.all(tokens.slice(0, 1000).map(async ({ token, usuario_id }) => {
    try {
      const subscription = JSON.parse(token);
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return;
      await webpush.sendNotification(subscription, safePayload, {
        TTL: emergency ? 600 : 86400, urgency: 'high', timeout: 8000,
      });
      sent += 1;
      if (usuario_id) notifiedUsers.add(usuario_id);
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) invalid.push(token);
      else console.error('Push delivery failed:', error?.statusCode || 'transport');
    }
  }));

  if (invalid.length) await sb.from('push_tokens').delete().in('token', invalid);
  return { sent, notified_users: notifiedUsers.size, failed: tokens.length - sent };
}

module.exports = { notifyNearby, notifyUsers, sendTokens };
