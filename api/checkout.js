const Stripe = require('stripe');
const { coordenadasValidas } = require('../lib/localizacao');
const { ICONES_ANUNCIO, TIPOS_ANUNCIO, obterPlano } = require('../lib/planos-anuncios');
const {
  authenticate,
  cleanText,
  enforceBodyLimit,
  enforceRateLimit,
  enforceTrustedOrigin,
  noStore,
  serverError,
  serviceClient,
} = require('../lib/api-security');

const ORIGENS_PERMITIDAS = new Set([
  'https://vizinho-certo.vercel.app',
  'https://vizinhocerto.com.br',
  'https://www.vizinhocerto.com.br',
]);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);
  if (!enforceTrustedOrigin(req, res) || !enforceBodyLimit(req, res, 16 * 1024)) return;

  try {
    const sb = serviceClient();
    const auth = await authenticate(req, res, sb);
    if (!auth) return;
    if (!enforceRateLimit(req, res, 'checkout', { limit: 10, windowMs: 10 * 60_000 }, auth.user.id)) return;
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY nao configurada');

    const nome = cleanText(req.body?.nome, 120);
    const tipo = cleanText(req.body?.tipo, 60);
    const planoId = cleanText(req.body?.plano_id, 30).toLowerCase();
    const diasLegados = Number(req.body?.dias);
    const desc = cleanText(req.body?.desc, 500, { multiline: true });
    const tel = String(req.body?.tel || '').replace(/\D/g, '').slice(0, 15);
    const plano = obterPlano(planoId || diasLegados);
    if (!nome || !tipo || !plano) return res.status(400).json({ error: 'Dados incompletos' });
    if (!TIPOS_ANUNCIO.has(tipo)) return res.status(400).json({ error: 'Categoria invalida' });

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    const { data: perfil, error: perfilError } = await sb
      .from('usuarios')
      .select('id, lat, lon, cidade, uf')
      .eq('id', auth.user.id)
      .maybeSingle();
    if (perfilError) throw perfilError;
    if (!perfil || !coordenadasValidas(perfil)) {
      return res.status(409).json({
        error: 'Confirme sua localizacao no perfil antes de comprar o anuncio.',
        code: 'LOCATION_REQUIRED',
      });
    }

    const customerEmail = auth.user.email || undefined;
    const retorno = obterOrigemRetorno(req.headers.origin);
    const session = await stripe.checkout.sessions.create({
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Vizinho Certo - ${nome}`,
            description: `${plano.nome} · ${plano.dias} dias · ${tipo}`,
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
        plano_id: plano.id,
        alcance_tipo: plano.alcance_tipo,
        dias: String(plano.dias),
        preco: String(plano.centavos),
        icon: ICONES_ANUNCIO.get(tipo) || '🏪',
        desc,
        tel,
        usuario_id: auth.user.id,
        lat: String(perfil.lat),
        lon: String(perfil.lon),
      },
      client_reference_id: auth.user.id,
    });

    res.json({ url: session.url });
  } catch (e) {
    return serverError(res, 'Stripe error:', e);
  }
};

function obterOrigemRetorno(origem) {
  const valor = String(origem || '');
  if (ORIGENS_PERMITIDAS.has(valor)) return `${valor}/app`;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(valor)) return `${valor}/app`;
  return 'https://vizinho-certo.vercel.app/app';
}
