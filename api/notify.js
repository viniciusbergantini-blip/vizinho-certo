const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { titulo, corpo, url, usuario_ids } = req.body;

  if (!titulo || !corpo) return res.status(400).json({ error: 'titulo e corpo são obrigatórios' });

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  // Busca tokens — se usuario_ids fornecido, filtra; senão envia pra todos
  let query = sb.from('push_tokens').select('token, usuario_id');
  if (usuario_ids && usuario_ids.length > 0) {
    query = query.in('usuario_id', usuario_ids);
  }

  const { data: tokens, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  if (!tokens || tokens.length === 0) return res.json({ sent: 0 });

  const payload = JSON.stringify({
    title: titulo,
    body: corpo,
    url: url || '/app'
  });

  let sent = 0;
  const falhos = [];

  await Promise.all(tokens.map(async ({ token, usuario_id }) => {
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

  res.json({ sent, total: tokens.length });
};
