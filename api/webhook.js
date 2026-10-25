const Stripe = require('stripe');
const { publicarAnuncioPago } = require('../lib/anuncios');

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

const MAX_WEBHOOK_BYTES = 1024 * 1024;

const getRawBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let total = 0;
  req.on('data', chunk => {
    total += chunk.length;
    if (total > MAX_WEBHOOK_BYTES) {
      reject(new Error('Webhook body too large'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Webhook Stripe secrets are missing');
    return res.status(503).json({ error: 'Webhook indisponivel' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Assinatura ausente' });
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (error) {
    console.error('Webhook body error:', error.message);
    return res.status(413).json({ error: 'Webhook invalido' });
  }
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    console.error('Webhook signature error:', e.message);
    return res.status(400).json({ error: 'Assinatura invalida' });
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
