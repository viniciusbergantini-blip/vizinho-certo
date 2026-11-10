const { createHmac, timingSafeEqual } = require('node:crypto');

function createReceipt(userId, installationId, tag, now = Date.now()) {
  const key = process.env.VAPID_PRIVATE_KEY;
  if (!key || !userId || !installationId) return undefined;
  const body = Buffer.from(JSON.stringify({ userId, installationId,
    tag: String(tag || '').slice(0, 80), expires: now + 25 * 60 * 60_000 })).toString('base64url');
  return body + '.' + createHmac('sha256', key).update('push-receipt:' + body).digest('base64url');
}

function verifyReceipt(token, now = Date.now()) {
  const key = process.env.VAPID_PRIVATE_KEY;
  if (!key || typeof token !== 'string' || token.length > 1024) return null;
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra) return null;
  const expected = createHmac('sha256', key).update('push-receipt:' + body).digest();
  const supplied = Buffer.from(mac, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!Number.isFinite(claims.expires) || claims.expires < now || claims.expires > now + 26 * 60 * 60_000) return null;
    return claims;
  } catch { return null; }
}

function handleReceipt(req, res) {
  const claims = verifyReceipt(req.body?.receipt);
  const status = req.body?.status;
  if (!claims || !['received', 'display_requested', 'display_failed', 'expired'].includes(status)) {
    return res.status(403).json({ error: 'Comprovante inválido.' });
  }
  const permission = ['granted', 'denied', 'default'].includes(req.body.permission) ? req.body.permission : 'unknown';
  const errorName = ['NotAllowedError', 'AbortError', 'TypeError', 'InvalidStateError', 'SecurityError'].includes(req.body.error_name) ? req.body.error_name : undefined;
  const clientTime = Number(req.body.client_time);
  console.info('push_receipt', JSON.stringify({ recipient_id: claims.userId, installation_id: claims.installationId,
    tag: claims.tag, status, permission, error_name: errorName,
    clock_offset_ms: Number.isFinite(clientTime) && clientTime > 0 ? Math.round(clientTime - Date.now()) : undefined }));
  return res.json({ received: true });
}

module.exports = { createReceipt, verifyReceipt, handleReceipt };
