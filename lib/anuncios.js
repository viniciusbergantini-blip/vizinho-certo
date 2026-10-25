const { createClient } = require('@supabase/supabase-js');
const { coordenadasValidas, numeroFinito } = require('./localizacao');
const { TIPOS_ANUNCIO, obterPlano } = require('./planos-anuncios');
const { cleanText } = require('./api-security');

function getSupabaseClient() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_KEY nao configurada');
  }

  return createClient(
    process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co',
    key
  );
}

function montarAnuncio(session, perfil) {
  const meta = session.metadata || {};
  const dias = parseInt(meta.dias, 10) || 10;
  const plano = obterPlano(dias);
  if (!plano) throw new Error('Plano de anuncio invalido');
  if (!TIPOS_ANUNCIO.has(meta.tipo)) throw new Error('Categoria de anuncio invalida');
  if (session.mode !== 'payment' || session.currency !== 'brl') throw new Error('Pagamento incompatível');
  if (Number(session.amount_total) !== plano.centavos || Number(meta.preco) !== plano.centavos) {
    throw new Error('Valor do pagamento divergente');
  }

  const expiraEm = new Date();
  expiraEm.setDate(expiraEm.getDate() + dias);
  if (!coordenadasValidas(perfil)) throw new Error('Perfil sem localizacao valida');

  return {
    usuario_id: meta.usuario_id || null,
    nome: cleanText(meta.nome, 120),
    tipo: meta.tipo,
    descricao: cleanText(meta.desc, 500, { multiline: true }),
    telefone: String(meta.tel || '').replace(/\D/g, '').slice(0, 15),
    icon: cleanText(meta.icon || '🏪', 8),
    lat: numeroFinito(perfil.lat),
    lon: numeroFinito(perfil.lon),
    raio_km: plano.raio_km,
    dias,
    destaque: plano.destaque,
    stripe_session_id: session.id,
    ativo: true,
    expira_em: expiraEm.toISOString(),
  };
}

async function publicarAnuncioPago(session) {
  if (!session || !session.id) {
    throw new Error('Sessao de pagamento invalida');
  }

  if (session.payment_status !== 'paid') {
    return { published: false, reason: 'Pagamento ainda nao confirmado' };
  }

  const sb = getSupabaseClient();
  const usuarioId = session.metadata?.usuario_id || session.client_reference_id || null;
  if (!usuarioId || session.metadata?.usuario_id !== session.client_reference_id) {
    throw new Error('Identidade do pagamento divergente');
  }
  let perfil = null;
  if (usuarioId) {
    const resultado = await sb
      .from('usuarios')
      .select('id, lat, lon')
      .eq('id', usuarioId)
      .maybeSingle();
    if (resultado.error) throw resultado.error;
    perfil = resultado.data;
  }

  const anuncio = montarAnuncio(session, perfil);
  if (!anuncio.nome || !anuncio.tipo || !anuncio.usuario_id) {
    throw new Error('Metadata do anuncio incompleta');
  }

  const { data: existente, error: buscaErro } = await sb
    .from('anuncios')
    .select('id')
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  if (buscaErro) {
    throw buscaErro;
  }

  if (existente) {
    return { published: true, duplicated: true, id: existente.id };
  }

  const { data, error } = await sb
    .from('anuncios')
    .insert(anuncio)
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return { published: true, duplicated: false, id: data && data.id };
}

module.exports = { publicarAnuncioPago };
