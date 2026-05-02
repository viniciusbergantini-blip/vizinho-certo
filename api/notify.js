const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { titulo, corpo, url, usuario_ids, lat, lon, raio } = req.body;

  if (!titulo || !corpo) return res.status(400).json({ error: 'titulo e corpo são obrigatórios' });

  const hasTargetUsers = Array.isArray(usuario_ids) && usuario_ids.length > 0;
  const origemLat = parseFloat(lat);
  const origemLon = parseFloat(lon);
  const raioMetros = parseFloat(raio);
  const hasGeoTarget = Number.isFinite(origemLat) && Number.isFinite(origemLon) && Number.isFinite(raioMetros);

  if (!hasTargetUsers && !hasGeoTarget) {
    return res.status(400).json({ error: 'lat, lon e raio são obrigatórios para notificações por proximidade' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  // Busca tokens por destinatário direto ou por proximidade geográfica.
  let query = sb.from('push_tokens').select('token, usuario_id');
  if (hasTargetUsers) {
    query = query.in('usuario_id', usuario_ids);
  }

  const { data: tokens, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  if (!tokens || tokens.length === 0) return res.json({ sent: 0 });

  let tokensFiltrados = tokens;
  if (hasGeoTarget) {
    const usuarioIds = [...new Set(tokens.map(({ usuario_id }) => usuario_id).filter(Boolean))];
    if (usuarioIds.length === 0) return res.json({ sent: 0, total: tokens.length, filtered: 0 });

    const { data: usuarios, error: usuariosError } = await sb
      .from('usuarios')
      .select('id, lat, lon')
      .in('id', usuarioIds);

    if (usuariosError) return res.status(500).json({ error: usuariosError.message });

    const usuariosNoRaio = new Set((usuarios || [])
      .filter(usuario => distanciaMetros(origemLat, origemLon, usuario.lat, usuario.lon) <= raioMetros)
      .map(usuario => usuario.id));

    tokensFiltrados = tokens.filter(({ usuario_id }) => usuariosNoRaio.has(usuario_id));
  }

  if (tokensFiltrados.length === 0) return res.json({ sent: 0, total: tokens.length, filtered: 0 });

  const payload = JSON.stringify({
    title: titulo,
    body: corpo,
    url: url || '/app'
  });

  let sent = 0;
  const falhos = [];

  await Promise.all(tokensFiltrados.map(async ({ token, usuario_id }) => {
    try {
      const sub = JSON.parse(token);
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (err) {
      // Token inválido — remove do banco
      if (err.statusCode === 410 || err.statusCode === 404) {
        falhos.push(token);
      }
    }
  }));

  // Remove tokens inválidos
  if (falhos.length > 0) {
    await sb.from('push_tokens').delete().in('token', falhos);
  }

  res.json({ sent, total: tokens.length, filtered: tokensFiltrados.length });
};

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const aLat = parseFloat(lat1);
  const aLon = parseFloat(lon1);
  const bLat = parseFloat(lat2);
  const bLon = parseFloat(lon2);

  if (![aLat, aLon, bLat, bLon].every(Number.isFinite)) return Infinity;

  const rad = Math.PI / 180;
  const raioTerraMetros = 6371000;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;

  return 2 * raioTerraMetros * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
