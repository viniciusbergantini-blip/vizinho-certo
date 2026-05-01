const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const ALLOWED_TYPES = new Set([
  'Encanador',
  'Eletricista',
  'Diarista',
  'Comércio',
  'Costureira',
  'Jardineiro',
  'Pedreiro',
  'Marido de Aluguel',
  'Anúncio',
  'Outros Serviços',
]);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Login obrigatório' });

  const { id, tipo, nome, descricao, telefone, icon } = req.body || {};
  if (!id || !tipo || !nome || !descricao || !telefone) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  if (!ALLOWED_TYPES.has(tipo)) {
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

    const updates = {
      tipo,
      nome: String(nome).trim().slice(0, 120),
      descricao: String(descricao).trim().slice(0, 500),
      telefone: String(telefone).trim().slice(0, 40),
      icon: icon || '🏪',
    };

    const { data, error } = await sb
      .from('anuncios')
      .update(updates)
      .eq('id', id)
      .eq('usuario_id', userData.user.id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('Anuncio update error:', error);
      return res.status(403).json({ error: 'Você só pode editar seus próprios anúncios' });
    }

    res.json({ anuncio: data });
  } catch (e) {
    console.error('Anuncio update error:', e);
    res.status(500).json({ error: e.message });
  }
};
