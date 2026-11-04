const { ICONES_ANUNCIO, TIPOS_ANUNCIO } = require('../lib/planos-anuncios');
const { normalizarTelefoneBrasil } = require('../lib/contato');
const {
  authenticate,
  cleanText,
  enforceBodyLimit,
  enforceRateLimit,
  enforceTrustedOrigin,
  noStore,
  safeRecordId,
  serverError,
  serviceClient,
} = require('../lib/api-security');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);
  if (!enforceTrustedOrigin(req, res) || !enforceBodyLimit(req, res, 16 * 1024)) return;

  const action = String(req.query?.action || req.body?.action || '').trim().toLowerCase();
  if (!['update', 'delete'].includes(action)) {
    return res.status(400).json({ error: 'Ação inválida' });
  }

  const id = safeRecordId(req.body?.id);
  if (!id) return res.status(400).json({ error: 'ID do anúncio obrigatório' });

  try {
    const sb = serviceClient();
    const auth = await authenticate(req, res, sb);
    if (!auth) return;

    if (action === 'delete') {
      if (!enforceRateLimit(req, res, 'ad-delete', { limit: 10, windowMs: 10 * 60_000 }, auth.user.id)) return;
      return deleteAd(sb, auth.user.id, id, res);
    }

    if (!enforceRateLimit(req, res, 'ad-update', { limit: 20, windowMs: 10 * 60_000 }, auth.user.id)) return;
    return updateAd(sb, auth.user.id, id, req.body, res);
  } catch (error) {
    return serverError(res, `Anuncio ${action} error:`, error);
  }
};

async function deleteAd(sb, userId, id, res) {
  const { data, error } = await sb
    .from('anuncios')
    .update({ ativo: false })
    .eq('id', id)
    .eq('usuario_id', userId)
    .select('id')
    .single();

  if (error || !data) {
    console.error('Anuncio delete error:', error);
    return res.status(403).json({ error: 'Você só pode excluir seus próprios anúncios' });
  }
  return res.json({ deleted: true, id: data.id });
}

async function updateAd(sb, userId, id, body, res) {
  const tipo = cleanText(body?.tipo, 60);
  const nome = cleanText(body?.nome, 120);
  const descricao = cleanText(body?.descricao, 500, { multiline: true });
  const telefone = normalizarTelefoneBrasil(body?.telefone);
  if (!tipo || !nome || !descricao || !telefone) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  if (!TIPOS_ANUNCIO.has(tipo)) {
    return res.status(400).json({ error: 'Categoria inválida' });
  }

  const { data, error } = await sb
    .from('anuncios')
    .update({ tipo, nome, descricao, telefone, icon: ICONES_ANUNCIO.get(tipo) || '🏪' })
    .eq('id', id)
    .eq('usuario_id', userId)
    .eq('ativo', true)
    .select('id, usuario_id, nome, tipo, descricao, telefone, icon, plano_id, raio_km, alcance_tipo, cidade_alvo, uf_alvo, dias, destaque, ativo, expira_em, criado_em')
    .single();

  if (error || !data) {
    console.error('Anuncio update error:', error);
    return res.status(403).json({ error: 'Você só pode editar seus próprios anúncios' });
  }
  return res.json({ anuncio: data });
}

module.exports._private = { deleteAd, updateAd };
