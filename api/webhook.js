const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    console.error('Webhook signature error:', e.message);
    return res.status(400).json({ error: `Webhook error: ${e.message}` });
  }
  if (event.type === 'checkout.session.completed') {
    const session = [event.data](http://event.data).object;
    const meta = session.metadata;
    const sb = createClient(
      process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co',
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
    );
    const dias = parseInt(meta.dias) || 10;
    const expiraEm = new Date();
    expiraEm.setDate(expiraEm.getDate() + dias);
    const raioKm = dias === 10 ? 1.5 : dias === 20 ? 3 : 5;
    const { error } = await sb.from('anuncios').insert({
      usuario_id: meta.usuario_id || null,
      nome: meta.nome,
      tipo: meta.tipo,
      descricao: meta.desc,
      telefone: [meta.tel](http://meta.tel),
      icon: meta.icon || '🏪',
      lat: [meta.lat](http://meta.lat) ? parseFloat([meta.lat](http://meta.lat)) : null,
      lon: meta.lon ? parseFloat(meta.lon) : null,
      raio_km: raioKm,
      dias,
      destaque: dias >= 20,
      stripe_session_id: [session.id](http://session.id),
      ativo: true,
      expira_em: expiraEm.toISOString(),
    });
    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Erro ao salvar anúncio' });
    }
    console.log('Anúncio salvo:', meta.nome);
  }
  res.json({ received: true });
};
