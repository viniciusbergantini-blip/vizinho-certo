// Recurso encerrado; compatibilidade com clientes antigos.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ error: 'A área de eventos foi encerrada.' });
};
