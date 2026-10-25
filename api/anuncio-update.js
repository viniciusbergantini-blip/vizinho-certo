const { createClient } = require('@supabase/supabase-js');
const { ICONES_ANUNCIO, TIPOS_ANUNCIO } = require('../lib/planos-anuncios');
const {
  cleanText,
  enforceBodyLimit,
  enforceRateLimit,
  enforceTrustedOrigin,
  noStore,
  safeRecordId,
  serverError,
} = require('../lib/api-security');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);
  if (!enforceTrustedOrigin(req, res) || !enforceBodyLimit(req, res, 16 * 1024)) return;

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Login obrigatório' });

  const id = safeRecordId(req.body?.id);
  const tipo = cleanText(req.body?.tipo, 60);
  const nome = cleanText(req.body?.nome, 120);
  const descricao = cleanText(req.body?.descricao, 500, { multiline: true });
  const telefone = String(req.body?.telefone || '').replace(/\D/g, '').slice(0, 15);
  if (!id || !tipo || !nome || !descricao || !telefone) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  if (!TIPOS_ANUNCIO.has(tipo)) {
    return res.status(400).json({ error: 'Categoria inválida' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY não configurada' });

  try {
    const sb = createClient(SUPABASE_URL, serviceKey);
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData.user) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }
    if (!enforceRateLimit(req, res, 'ad-update', { limit: 20, windowMs: 10 * 60_000 }, userData.user.id)) return;

    const updates = {
      tipo,
      nome,
      descricao,
      telefone,
      icon: ICONES_ANUNCIO.get(tipo) || '🏪',
    };

    const { data, error } = await sb
      .from('anuncios')
      .update(updates)
      .eq('id', id)
      .eq('usuario_id', userData.user.id)
      .eq('ativo', true)
    .select('id, usuario_id, nome, tipo, descricao, telefone, icon, plano_id, raio_km, alcance_tipo, cidade_alvo, uf_alvo, dias, destaque, ativo, expira_em, criado_em')
      .single();

    if (error || !data) {
      console.error('Anuncio update error:', error);
      return res.status(403).json({ error: 'Você só pode editar seus próprios anúncios' });
    }

    res.json({ anuncio: data });
  } catch (e) {
    return serverError(res, 'Anuncio update error:', e);
  }
};
