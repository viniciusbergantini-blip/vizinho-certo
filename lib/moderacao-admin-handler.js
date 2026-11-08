const { createClient } = require('@supabase/supabase-js');
const { enforceBodyLimit, enforceRateLimit, enforceTrustedOrigin, noStore, serverError } = require('./api-security');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['discard', 'review', 'remove']);

function adminEmails() {
  return new Set(String(process.env.DASHBOARD_ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean));
}

async function authenticate(req, res, sb) {
  const allowed = adminEmails();
  if (!allowed.size) { res.status(500).json({ error: 'DASHBOARD_ADMIN_EMAILS nao configurado' }); return null; }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) { res.status(401).json({ error: 'Login obrigatorio' }); return null; }
  const { data, error } = await sb.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) { res.status(401).json({ error: 'Sessao invalida' }); return null; }
  if (!allowed.has(email)) { res.status(403).json({ error: 'Acesso restrito a admins' }); return null; }
  return { id: data.user.id, email };
}

async function contentSnapshot(sb, report) {
  const id = report.conteudo_id;
  let query = null;
  if (report.tipo_conteudo === 'post') query = sb.from('posts').select('id, apelido_autor, tipo, texto, criado_em').eq('id', id);
  if (report.tipo_conteudo === 'comentario') query = sb.from('comentarios').select('id, post_id, apelido_autor, texto, criado_em').eq('id', id);
  if (report.tipo_conteudo === 'anuncio') query = sb.from('anuncios').select('id, nome, tipo, descricao, ativo, criado_em').eq('id', id);
  if (report.tipo_conteudo === 'perfil' && UUID.test(id)) query = sb.from('usuarios').select('id, apelido, nome, criado_em').eq('id', id);
  if (!query) return null;
  const { data } = await query.maybeSingle();
  return data;
}

async function removeContent(sb, report) {
  const id = report.conteudo_id;
  if (report.tipo_conteudo === 'perfil') throw Object.assign(new Error('Perfis exigem revisão manual e não são excluídos por esta tela.'), { status: 400 });
  if (report.tipo_conteudo === 'post') {
    const comments = await sb.from('comentarios').delete().eq('post_id', id);
    if (comments.error) throw comments.error;
    const post = await sb.from('posts').delete().eq('id', id);
    if (post.error) throw post.error;
    return;
  }
  if (report.tipo_conteudo === 'comentario') {
    const comment = await sb.from('comentarios').delete().eq('id', id);
    if (comment.error) throw comment.error;
    return;
  }
  if (report.tipo_conteudo === 'anuncio') {
    const ad = await sb.from('anuncios').update({ ativo: false }).eq('id', id);
    if (ad.error) throw ad.error;
    return;
  }
  throw Object.assign(new Error('Tipo de conteúdo não suportado.'), { status: 400 });
}

module.exports = async function moderacaoAdmin(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);
  if (req.method === 'PATCH' && (!enforceTrustedOrigin(req, res) || !enforceBodyLimit(req, res, 12 * 1024))) return;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY nao configurada' });
  const sb = createClient(SUPABASE_URL, serviceKey);
  const admin = await authenticate(req, res, sb);
  if (!admin) return;
  if (!enforceRateLimit(req, res, 'moderation-admin', { limit: 60, windowMs: 60_000 }, admin.id)) return;

  if (req.method === 'GET') {
    const { data, error } = await sb.from('denuncias_conteudo')
      .select('id, denunciante_id, denunciado_id, tipo_conteudo, conteudo_id, motivo, status, criado_em')
      .eq('status', 'pendente').order('criado_em', { ascending: true }).limit(100);
    if (error) return serverError(res, 'Moderation list error:', error);
    const reports = await Promise.all((data || []).map(async report => ({ ...report, conteudo: await contentSnapshot(sb, report) })));
    return res.json({ denuncias: reports });
  }

  const id = String(req.body?.id || '').trim();
  const action = String(req.body?.action || '').trim();
  const note = String(req.body?.note || '').trim();
  if (!UUID.test(id)) return res.status(400).json({ error: 'Denuncia invalida' });
  if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Acao invalida' });
  if (note.length > 1000) return res.status(400).json({ error: 'Observacao muito longa' });

  const { data: report, error: readError } = await sb.from('denuncias_conteudo')
    .select('id, tipo_conteudo, conteudo_id, status').eq('id', id).eq('status', 'pendente').maybeSingle();
  if (readError) return serverError(res, 'Moderation read error:', readError);
  if (!report) return res.status(409).json({ error: 'A denúncia já foi analisada ou não existe.' });
  try {
    if (action === 'remove') await removeContent(sb, report);
    const status = action === 'discard' ? 'descartada' : action === 'remove' ? 'removida' : 'analisada';
    const decisao = action === 'discard' ? 'sem_violacao' : action === 'remove' ? 'conteudo_removido' : (report.tipo_conteudo === 'perfil' ? 'perfil_revisado' : 'sem_violacao');
    const { data, error } = await sb.from('denuncias_conteudo').update({
      status, decisao, observacao_admin: note || null, moderador_email: admin.email, analisado_em: new Date().toISOString(),
    }).eq('id', id).eq('status', 'pendente').select('id, status, decisao, analisado_em').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'A denúncia foi analisada em outra sessão.' });
    return res.json({ denuncia: data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    return serverError(res, 'Moderation update error:', error);
  }
};
