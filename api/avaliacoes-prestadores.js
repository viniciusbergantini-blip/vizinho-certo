const { createClient } = require('@supabase/supabase-js');
const {
  enforceBodyLimit,
  enforceRateLimit,
  enforceTrustedOrigin,
  noStore,
  safeRecordId,
  serverError,
} = require('../lib/api-security');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const MAX_PRESTADORES = 50;

module.exports = async (req, res) => {
  noStore(res);
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (req.method === 'POST' && (!enforceTrustedOrigin(req, res) || !enforceBodyLimit(req, res, 8 * 1024))) return;

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Avaliações indisponíveis no momento.' });

  try {
    const sb = createClient(SUPABASE_URL, serviceKey);
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });

    if (req.method === 'GET') {
      if (!enforceRateLimit(req, res, 'provider-rating-read', { limit: 90, windowMs: 60_000 }, user.id)) return;
      const rawIds = getQueryValue(req, 'ids').split(',').map(value => value.trim()).filter(Boolean);
      if (rawIds.length > MAX_PRESTADORES) return res.status(400).json({ error: 'Consulte até 50 prestadores por vez.' });
      const prestadores = [...new Set(rawIds.map(safeRecordId).filter(Boolean))];
      if (prestadores.length !== new Set(rawIds).size) return res.status(400).json({ error: 'Lista de prestadores inválida.' });
      if (!prestadores.length) return res.json({ avaliacoes: {} });

      const avaliacoes = await carregarAvaliacoes(sb, prestadores, user.id);
      return res.json({ avaliacoes });
    }

    const anuncioId = safeRecordId(req.body?.anuncio_id);
    const estrelas = req.body?.estrelas;
    if (!anuncioId || !Number.isInteger(estrelas) || estrelas < 1 || estrelas > 5) {
      return res.status(400).json({ error: 'Escolha uma nota de 1 a 5 estrelas.' });
    }
    if (!enforceRateLimit(req, res, 'provider-rating-write', { limit: 10, windowMs: 10 * 60_000 }, user.id)) return;

    const { data: anuncio, error: anuncioError } = await sb
      .from('anuncios')
      .select('id, usuario_id, ativo, expira_em')
      .eq('id', anuncioId)
      .maybeSingle();
    if (anuncioError) return serverError(res, 'Provider rating ad lookup error:', anuncioError);
    const expiraEm = Date.parse(anuncio?.expira_em || '');
    if (!anuncio || !anuncio.ativo || !Number.isFinite(expiraEm) || expiraEm <= Date.now()) {
      return res.status(404).json({ error: 'Este anúncio não está mais ativo.' });
    }
    if (!anuncio.usuario_id || anuncio.usuario_id === user.id) {
      return res.status(403).json({ error: 'Você não pode avaliar seu próprio anúncio.' });
    }

    const { error: saveError } = await sb
      .from('avaliacoes_prestadores')
      .upsert({ prestador_id: anuncio.usuario_id, usuario_id: user.id, estrelas }, { onConflict: 'prestador_id,usuario_id' });
    if (saveError) return serverError(res, 'Provider rating save error:', saveError);

    const avaliacoes = await carregarAvaliacoes(sb, [anuncio.usuario_id], user.id);
    return res.json({ avaliacao: avaliacoes[anuncio.usuario_id] });
  } catch (error) {
    return serverError(res, 'Provider ratings error:', error);
  }
};

async function carregarAvaliacoes(sb, prestadores, userId) {
  const [resumo, minhas] = await Promise.all([
    sb.from('avaliacoes_prestadores_resumo')
      .select('prestador_id, media, quantidade')
      .in('prestador_id', prestadores),
    sb.from('avaliacoes_prestadores')
      .select('prestador_id, estrelas')
      .eq('usuario_id', userId)
      .in('prestador_id', prestadores),
  ]);
  if (resumo.error) throw resumo.error;
  if (minhas.error) throw minhas.error;

  const resultado = Object.fromEntries(prestadores.map(id => [id, { media: 0, quantidade: 0, minha_nota: 0 }]));
  for (const item of resumo.data || []) {
    resultado[item.prestador_id] = {
      ...resultado[item.prestador_id],
      media: Number(item.media) || 0,
      quantidade: Number(item.quantidade) || 0,
    };
  }
  for (const item of minhas.data || []) {
    resultado[item.prestador_id] = { ...resultado[item.prestador_id], minha_nota: Number(item.estrelas) || 0 };
  }
  return resultado;
}

function getQueryValue(req, key) {
  if (req.query && req.query[key] !== undefined) return String(req.query[key]);
  return new URL(req.url || '/', 'http://localhost').searchParams.get(key) || '';
}

module.exports._private = { carregarAvaliacoes, getQueryValue };
