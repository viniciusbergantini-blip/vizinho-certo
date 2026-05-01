const Stripe = require('stripe');
const { publicarAnuncioPago } = require('../lib/anuncios');

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

const getRawBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    console.error('Webhook signature error:', e.message);
    return res.status(400).json({ error: `Webhook error: ${e.message}` });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    try {
      const result = await publicarAnuncioPago(event.data.object);
      console.log('Anuncio processado:', event.data.object.id, result);
    } catch (e) {
      console.error('Supabase insert error:', e);
      return res.status(500).json({ error: 'Erro ao salvar anuncio' });
    }
  }

  res.json({ received: true });
};
