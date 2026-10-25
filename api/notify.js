module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({
    error: 'Rota desativada. Notificacoes agora sao geradas apenas por acoes validadas no servidor.',
  });
};
