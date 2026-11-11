const Stripe = require('stripe');
const { publicarAnuncioGooglePlay } = require('../lib/anuncios');
const { consumirCompra, hashToken, verificarCompra, verificarProdutoGooglePlay, verificarAcessoComprasGooglePlay } = require('../lib/google-play-billing');
const { coordenadasValidas } = require('../lib/localizacao');
const { ICONES_ANUNCIO, TIPOS_ANUNCIO, obterPlano, obterPlanoPorProdutoPlay } = require('../lib/planos-anuncios');
const { normalizarTelefoneBrasil } = require('../lib/contato');
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
    if (req.body?.provider === 'google_play') {
      if (req.body.action === 'preflight') {
        const plano = obterPlanoPorProdutoPlay(req.body.product_id);
        if (!plano) return res.status(400).json({ error: 'Plano inválido.' });
        try {
          await Promise.all([
            verificarProdutoGooglePlay(plano.play_product_id),
            verificarAcessoComprasGooglePlay(),
          ]);
        } catch (error) {
          console.error('Google Play checkout unavailable:', error);
          return res.status(503).json({ error: 'O pagamento pela Google Play está temporariamente indisponível.' });
        }
        return res.json({ ready: true });
      }
      return await processarCompraGooglePlay(req, res, sb, auth);
    }
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY nao configurada');

    const nome = cleanText(req.body?.nome, 120);
    const tipo = cleanText(req.body?.tipo, 60);
    const planoId = cleanText(req.body?.plano_id, 30).toLowerCase();
    const diasLegados = Number(req.body?.dias);
    const desc = cleanText(req.body?.desc, 500, { multiline: true });
    const tel = normalizarTelefoneBrasil(req.body?.tel);
    const plano = obterPlano(planoId || diasLegados);
    if (!nome || !tipo || !desc || !tel || !plano) return res.status(400).json({ error: 'Dados incompletos ou telefone invalido' });
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

async function processarCompraGooglePlay(req, res, sb, auth) {
  const productId = cleanText(req.body?.product_id, 80).toLowerCase();
  const purchaseToken = String(req.body?.purchase_token || '').trim();
  const plano = obterPlanoPorProdutoPlay(productId);
  const dados = normalizarDadosAnuncio(req.body?.anuncio);
  if (!plano || !purchaseToken || purchaseToken.length > 4096) {
    return res.status(400).json({ error: 'Compra Google Play invalida' });
  }
  if (!dados.nome || !dados.desc || !dados.tel || !TIPOS_ANUNCIO.has(dados.tipo)) {
    return res.status(400).json({ error: 'Dados do anuncio incompletos' });
  }

  const purchaseTokenHash = hashToken(purchaseToken);
  let registro = await buscarCompra(sb, purchaseTokenHash);
  if (registro && registro.usuario_id !== auth.user.id) {
    return res.status(403).json({ error: 'Esta compra ja pertence a outra conta' });
  }

  const compra = await verificarCompra({ productId, purchaseToken });
  if (compra.purchaseState === 'PENDING') {
    return res.status(409).json({ error: 'O pagamento ainda esta pendente na Google Play', code: 'PURCHASE_PENDING' });
  }
  if (compra.purchaseState !== 'PURCHASED') {
    return res.status(409).json({ error: 'A Google Play nao confirmou esta compra', code: 'PURCHASE_NOT_CONFIRMED' });
  }
  if (compra.consumptionState === 'CONSUMPTION_STATE_CONSUMED' && !registro?.anuncio_id) {
    return res.status(409).json({ error: 'Esta compra ja foi utilizada', code: 'PURCHASE_ALREADY_CONSUMED' });
  }

  if (!registro) {
    const { error } = await sb.from('google_play_purchases').insert({
      purchase_token_hash: purchaseTokenHash,
      usuario_id: auth.user.id,
      product_id: productId,
      plano_id: plano.id,
      order_id: cleanText(compra.orderId, 160) || null,
      compra_teste: compra.testPurchase,
      status: 'verificada',
    });
    if (error && error.code !== '23505') throw error;
    registro = await buscarCompra(sb, purchaseTokenHash);
    if (!registro || registro.usuario_id !== auth.user.id) {
      return res.status(409).json({ error: 'Nao foi possivel reservar esta compra' });
    }
  }

  const publicacao = await publicarAnuncioGooglePlay({
    usuarioId: auth.user.id,
    plano,
    purchaseTokenHash,
    dados,
  }, sb);
  const agora = new Date().toISOString();
  const { error: atualizacaoErro } = await sb.from('google_play_purchases').update({
    anuncio_id: publicacao.id,
    status: 'publicada',
    atualizado_em: agora,
  }).eq('purchase_token_hash', purchaseTokenHash).eq('usuario_id', auth.user.id);
  if (atualizacaoErro) throw atualizacaoErro;

  let consumed = compra.consumptionState === 'CONSUMPTION_STATE_CONSUMED';
  if (!consumed) {
    try {
      await consumirCompra({ productId, purchaseToken });
      consumed = true;
      await sb.from('google_play_purchases').update({ status: 'consumida', atualizado_em: new Date().toISOString() })
        .eq('purchase_token_hash', purchaseTokenHash).eq('usuario_id', auth.user.id);
    } catch (error) {
      console.error('Google Play consume error:', error);
    }
  }

  return res.json({ paid: true, consumed, provider: 'google_play', ...publicacao });
}

function normalizarDadosAnuncio(valor) {
  return {
    nome: cleanText(valor?.nome, 120),
    tipo: cleanText(valor?.tipo, 60),
    desc: cleanText(valor?.desc, 500, { multiline: true }),
    tel: normalizarTelefoneBrasil(valor?.tel),
  };
}

async function buscarCompra(sb, purchaseTokenHash) {
  const { data, error } = await sb.from('google_play_purchases')
    .select('purchase_token_hash, usuario_id, product_id, plano_id, status, anuncio_id')
    .eq('purchase_token_hash', purchaseTokenHash)
    .maybeSingle();
  if (error) throw error;
  return data;
}

module.exports._private = { normalizarDadosAnuncio };
