const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Login obrigatório' });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID do anúncio obrigatório' });

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY não configurada' });

  try {
    const sb = createClient(SUPABASE_URL, serviceKey);
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData.user) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }

    const { data, error } = await sb
      .from('anuncios')
      .update({ ativo: false })
      .eq('id', id)
      .eq('usuario_id', userData.user.id)
      .select('id')
      .single();

    if (error || !data) {
      console.error('Anuncio delete error:', error);
      return res.status(403).json({ error: 'Você só pode excluir seus próprios anúncios' });
    }

    res.json({ deleted: true, id: data.id });
  } catch (e) {
    console.error('Anuncio delete error:', e);
    res.status(500).json({ error: e.message });
  }
};
