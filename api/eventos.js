const { createClient } = require('@supabase/supabase-js');
const {
  calcularJanela,
  eventoDentroDaJanela,
  validarSugestaoEvento,
} = require('../lib/eventos');
const handleEventosAdmin = require('../lib/eventos-admin-handler');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const CAMPOS_PUBLICOS = 'id, titulo, descricao, categoria, inicio_em, fim_em, local_nome, bairro, cidade, uf, endereco, gratuito, preco_texto, fonte_tipo, fonte_nome, fonte_url, status, verificado_em, criado_em';

module.exports = async (req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  if (requestUrl.pathname.endsWith('/eventos-admin') || requestUrl.searchParams.get('rota') === 'admin') {
    return handleEventosAdmin(req, res);
  }

  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY nao configurada' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Login obrigatorio' });

  const sb = createClient(SUPABASE_URL, serviceKey);
  const { data: userData, error: userError } = await sb.auth.getUser(token);
  const usuario = userData?.user;
  if (userError || !usuario) return res.status(401).json({ error: 'Sessao invalida' });

  const { data: perfil, error: perfilError } = await sb
    .from('usuarios')
    .select('id, cidade, uf, bairro')
    .eq('id', usuario.id)
    .maybeSingle();

  if (perfilError) return res.status(500).json({ error: perfilError.message });
  if (!perfil?.cidade || !perfil?.uf) return res.status(409).json({ error: 'Atualize sua cidade no perfil para ver eventos locais.' });

  if (req.method === 'GET') return listarEventos(req, res, sb, usuario, perfil);
  return sugerirEvento(req, res, sb, usuario, perfil);
};

async function listarEventos(req, res, sb, usuario, perfil) {
  const url = new URL(req.url, 'http://localhost');
  const janela = calcularJanela(url.searchParams.get('periodo'));
  const limiteBusca = new Date(janela.fim);
  limiteBusca.setDate(limiteBusca.getDate() + 1);

  const [publicos, proprios] = await Promise.all([
    sb
      .from('eventos')
      .select(CAMPOS_PUBLICOS)
      .eq('status', 'aprovado')
      .eq('cidade', perfil.cidade)
      .eq('uf', perfil.uf)
      .lt('inicio_em', limiteBusca.toISOString())
      .or(`fim_em.gte.${janela.inicio.toISOString()},and(fim_em.is.null,inicio_em.gte.${janela.inicio.toISOString()})`)
      .order('inicio_em', { ascending: true })
      .limit(100),
    sb
      .from('eventos')
      .select('id, titulo, inicio_em, status, criado_em')
      .eq('criado_por', usuario.id)
      .order('criado_em', { ascending: false })
      .limit(10),
  ]);

  if (publicos.error) return res.status(500).json({ error: publicos.error.message });
  if (proprios.error) return res.status(500).json({ error: proprios.error.message });

  const eventos = (publicos.data || []).filter(evento => eventoDentroDaJanela(evento, janela));
  return res.json({
    periodo: janela.periodo,
    cidade: perfil.cidade,
    uf: perfil.uf,
    eventos,
    minhas_sugestoes: proprios.data || [],
  });
}

async function sugerirEvento(req, res, sb, usuario, perfil) {
  const validacao = validarSugestaoEvento(req.body);
  if (!validacao.ok) return res.status(400).json({ error: validacao.erros[0], errors: validacao.erros });

  const desde = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
  const { count, error: countError } = await sb
    .from('eventos')
    .select('id', { count: 'exact', head: true })
    .eq('criado_por', usuario.id)
    .gte('criado_em', desde);

  if (countError) return res.status(500).json({ error: countError.message });
  if ((count || 0) >= 5) return res.status(429).json({ error: 'Você já enviou 5 sugestões nas últimas 24 horas.' });

  const { data, error } = await sb
    .from('eventos')
    .insert({
      ...validacao.evento,
      bairro: validacao.evento.bairro || perfil.bairro || null,
      cidade: perfil.cidade,
      uf: perfil.uf,
      fonte_tipo: 'comunidade',
      fonte_nome: 'Comunidade Vizinho Certo',
      status: 'pendente',
      criado_por: usuario.id,
    })
    .select('id, titulo, inicio_em, status, criado_em')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ evento: data, message: 'Sugestão enviada para análise.' });
}
