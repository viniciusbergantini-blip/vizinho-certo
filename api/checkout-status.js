const Stripe = require('stripe');
const { publicarAnuncioPago } = require('../lib/anuncios');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ error: 'session_id obrigatorio' });

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const result = await publicarAnuncioPago(session);

    res.json({
      paid: session.payment_status === 'paid',
      status: session.status,
      ...result,
    });
  } catch (e) {
    console.error('Checkout status error:', e);
    res.status(500).json({ error: e.message });
  }
};
