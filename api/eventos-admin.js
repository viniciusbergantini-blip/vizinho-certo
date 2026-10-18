const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const STATUS_MODERACAO = new Set(['aprovado', 'rejeitado', 'cancelado']);

module.exports = async (req, res) => {
  if (!['GET', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY nao configurada' });

  const adminEmails = new Set(String(process.env.DASHBOARD_ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean));
  if (!adminEmails.size) return res.status(500).json({ error: 'DASHBOARD_ADMIN_EMAILS nao configurado' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Login obrigatorio' });

  const sb = createClient(SUPABASE_URL, serviceKey);
  const { data: userData, error: userError } = await sb.auth.getUser(token);
  const email = userData?.user?.email?.toLowerCase();
  if (userError || !email) return res.status(401).json({ error: 'Sessao invalida' });
  if (!adminEmails.has(email)) return res.status(403).json({ error: 'Acesso restrito a admins' });

  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('eventos')
      .select('id, titulo, descricao, categoria, inicio_em, local_nome, bairro, cidade, uf, endereco, gratuito, preco_texto, fonte_tipo, fonte_nome, fonte_url, status, criado_em')
      .eq('status', 'pendente')
      .order('criado_em', { ascending: true })
      .limit(100);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ eventos: data || [] });
  }

  const id = String(req.body?.id || '').trim();
  const status = String(req.body?.status || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Evento invalido' });
  }
  if (!STATUS_MODERACAO.has(status)) return res.status(400).json({ error: 'Status invalido' });

  const atualizacao = {
    status,
    atualizado_em: new Date().toISOString(),
    verificado_em: status === 'aprovado' ? new Date().toISOString() : null,
  };
  const { data, error } = await sb
    .from('eventos')
    .update(atualizacao)
    .eq('id', id)
    .eq('status', 'pendente')
    .select('id, titulo, status, verificado_em')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(409).json({ error: 'O evento já foi moderado ou não existe.' });
  return res.json({ evento: data });
};
