const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { coordenadasValidas } = require('../lib/localizacao');
const { TIPOS_ANUNCIO, obterPlano } = require('../lib/planos-anuncios');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const ORIGENS_PERMITIDAS = new Set([
  'https://vizinho-certo.vercel.app',
  'https://vizinhocerto.com.br',
  'https://www.vizinhocerto.com.br',
]);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Login obrigatorio' });

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY nao configurada' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'STRIPE_SECRET_KEY nao configurada' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const { nome, tipo, dias, icon, desc, tel } = req.body || {};
  const plano = obterPlano(dias);

  if (!nome || !tipo || !plano) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  if (!TIPOS_ANUNCIO.has(tipo)) return res.status(400).json({ error: 'Categoria invalida' });

  try {
    const sb = createClient(SUPABASE_URL, serviceKey);
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData?.user) return res.status(401).json({ error: 'Sessao invalida' });

    const { data: perfil, error: perfilError } = await sb
      .from('usuarios')
      .select('id, lat, lon')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (perfilError) throw perfilError;
    if (!perfil || !coordenadasValidas(perfil)) {
      return res.status(409).json({
        error: 'Confirme sua localizacao no perfil antes de comprar o anuncio.',
        code: 'LOCATION_REQUIRED',
      });
    }

    const customerEmail = userData.user.email || undefined;
    const retorno = obterOrigemRetorno(req.headers.origin);
    const session = await stripe.checkout.sessions.create({
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Vizinho Certo - ${nome}`,
            description: `Plano ${dias} dias - ${tipo}`,
          },
          unit_amount: plano.centavos,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${retorno}?pagamento=sucesso&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${retorno}?pagamento=cancelado`,
      metadata: {
        nome,
        tipo,
        dias: String(dias),
        preco: String(plano.centavos),
        icon: icon || '🏪',
        desc: desc || '',
        tel: tel || '',
        usuario_id: userData.user.id,
        lat: String(perfil.lat),
        lon: String(perfil.lon),
      },
      client_reference_id: userData.user.id,
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('Stripe error:', e);
    res.status(500).json({ error: e.message });
  }
};

function obterOrigemRetorno(origem) {
  const valor = String(origem || '');
  if (ORIGENS_PERMITIDAS.has(valor)) return `${valor}/app`;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(valor)) return `${valor}/app`;
  return 'https://vizinho-certo.vercel.app/app';
}
