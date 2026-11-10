function normalizeSubscription(value) {
  const sub = typeof value === 'string' ? JSON.parse(value) : value;
  const endpoint = new URL(sub?.endpoint);
  const host = endpoint.hostname;
  const trusted = host === 'fcm.googleapis.com' || host === 'android.googleapis.com'
    || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.apple.com')
    || host.endsWith('.notify.windows.com');
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password || !trusted
    || !/^[A-Za-z0-9_-]{80,100}={0,2}$/.test(sub?.keys?.p256dh || '')
    || !/^[A-Za-z0-9_-]{20,30}={0,2}$/.test(sub?.keys?.auth || '')) throw new Error('Invalid subscription');
  return JSON.stringify({ endpoint: endpoint.href, expirationTime: sub.expirationTime || null,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
}

module.exports = async function notificationHandler(req, res, sb, userId) {
  let token;
  try { token = normalizeSubscription(req.body?.subscription); }
  catch { return res.status(400).json({ error: 'Inscrição de notificações inválida.' }); }
  const action = req.body.action;
  if (action === 'push-test' || action === 'push-test-sos') return res.status(410).json({ error: 'Os testes de notificação foram removidos. Atualize o aplicativo.' });
  if (action === 'push-register') {
    const { data: existing, error: lookupError } = await sb.from('push_tokens')
      .select('automaticas,plataforma').eq('usuario_id', userId).eq('token', token).maybeSingle();
    if (lookupError) throw lookupError;
    const platform = req.body.platform === 'android' ? 'android' : (existing?.plataforma || 'web');
    const { error: cleanupError } = await sb.from('push_tokens').delete().eq('token', token).neq('usuario_id', userId);
    if (cleanupError) throw cleanupError;
    const automaticas = existing?.automaticas === true;
    const { error } = await sb.from('push_tokens').upsert({ usuario_id: userId, token,
      plataforma: platform, automaticas }, { onConflict: 'usuario_id,token' });
    if (error) throw error;
    return res.json({ registered: true, automaticas });
  }
  const { data: own, error } = await sb.from('push_tokens').select('id,token,plataforma,automaticas')
    .eq('usuario_id', userId).eq('token', token).maybeSingle();
  if (error) throw error;
  if (action === 'push-status') return res.json({ registered: Boolean(own), automaticas: own?.automaticas === true });
  if (action === 'push-unregister' && !own) return res.json({ registered: false });
  if (!own) return res.status(404).json({ error: 'Ative as notificações neste aparelho primeiro.' });
  if (action === 'push-preferences') {
    if (own.plataforma !== 'android') return res.status(409).json({ error: 'O resumo está disponível no app Android.' });
    if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'Preferência inválida.' });
    const result = await sb.from('push_tokens').update({ automaticas: req.body.enabled }).eq('id', own.id).eq('usuario_id', userId);
    if (result.error) throw result.error;
    return res.json({ automaticas: req.body.enabled });
  }
  if (action === 'push-unregister') {
    const result = await sb.from('push_tokens').delete().eq('id', own.id).eq('usuario_id', userId);
    if (result.error) throw result.error;
    return res.json({ registered: false });
  }
  return res.status(400).json({ error: 'Ação de notificações inválida.' });
};
module.exports.normalizeSubscription = normalizeSubscription;
