const Stripe = require('stripe');
const { publicarAnuncioPago } = require('../lib/anuncios');
const {
  authenticate,
  enforceBodyLimit,
  enforceRateLimit,
  enforceTrustedOrigin,
  noStore,
  serverError,
  serviceClient,
} = require('../lib/api-security');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);
  if (!enforceTrustedOrigin(req, res) || !enforceBodyLimit(req, res, 8 * 1024)) return;

  try {
    const auth = await authenticate(req, res, serviceClient());
    if (!auth) return;
    if (!enforceRateLimit(req, res, 'checkout-status', { limit: 20, windowMs: 60_000 }, auth.user.id)) return;
    const sessionId = String(req.body?.session_id || '').trim();
    if (!/^cs_(test|live)_[A-Za-z0-9_]{10,240}$/.test(sessionId)) {
      return res.status(400).json({ error: 'Sessao de pagamento invalida' });
    }
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY nao configurada');

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const ownerId = session.client_reference_id || session.metadata?.usuario_id;
    if (!ownerId || ownerId !== auth.user.id) {
      return res.status(403).json({ error: 'Pagamento nao pertence a esta conta' });
    }
    const result = await publicarAnuncioPago(session);

    res.json({
      paid: session.payment_status === 'paid',
      status: session.status,
      ...result,
    });
  } catch (e) {
    return serverError(res, 'Checkout status error:', e);
  }
};
