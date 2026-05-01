const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const { nome, tipo, dias, preco, icon, desc, tel, retorno, usuario_id, lat, lon } = req.body || {};

  if (!nome || !tipo || !dias || !preco || !retorno) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'pix'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Vizinho Certo - ${nome}`,
            description: `Plano ${dias} dias - ${tipo}`,
          },
          unit_amount: preco,
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
        preco: String(preco),
        icon: icon || '🏪',
        desc: desc || '',
        tel: tel || '',
        usuario_id: usuario_id || '',
        lat: lat ? String(lat) : '',
        lon: lon ? String(lon) : '',
      },
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('Stripe error:', e);
    res.status(500).json({ error: e.message });
  }
};
