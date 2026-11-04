const { createClient } = require('@supabase/supabase-js');
const { coordenadasValidas, numeroFinito } = require('./localizacao');
const { ICONES_ANUNCIO, TIPOS_ANUNCIO, obterPlano } = require('./planos-anuncios');
const { cleanText } = require('./api-security');
const { normalizarTelefoneBrasil } = require('./contato');

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

function montarCamposAnuncio(meta, perfil, plano) {
  if (!TIPOS_ANUNCIO.has(meta.tipo)) throw new Error('Categoria de anuncio invalida');
  const expiraEm = new Date();
  expiraEm.setDate(expiraEm.getDate() + plano.dias);
  if (!coordenadasValidas(perfil)) throw new Error('Perfil sem localizacao valida');
  const cidadeAlvo = cleanText(perfil.cidade, 120);
  const ufAlvo = cleanText(perfil.uf, 2).toUpperCase();
  if (plano.alcance_tipo === 'cidade' && (!cidadeAlvo || !/^[A-Z]{2}$/.test(ufAlvo))) {
    throw new Error('Perfil sem cidade valida');
  }

  const telefone = normalizarTelefoneBrasil(meta.tel);
  if (!telefone) throw new Error('Telefone invalido');
  const nome = cleanText(meta.nome, 120);
  const descricao = cleanText(meta.desc, 500, { multiline: true });
  if (!nome || !descricao) throw new Error('Dados do anuncio incompletos');
  return {
    usuario_id: meta.usuario_id || null,
    nome,
    tipo: meta.tipo,
    descricao,
    telefone,
    icon: ICONES_ANUNCIO.get(meta.tipo) || '🏪',
    lat: numeroFinito(perfil.lat),
    lon: numeroFinito(perfil.lon),
    raio_km: plano.raio_km,
    plano_id: plano.id,
    alcance_tipo: plano.alcance_tipo,
    cidade_alvo: cidadeAlvo || null,
    uf_alvo: /^[A-Z]{2}$/.test(ufAlvo) ? ufAlvo : null,
    dias: plano.dias,
    destaque: plano.destaque,
    ativo: true,
    expira_em: expiraEm.toISOString(),
  };
}

function montarAnuncio(session, perfil) {
  const meta = session.metadata || {};
  const plano = obterPlano(meta.plano_id || meta.dias);
  if (!plano) throw new Error('Plano de anuncio invalido');
  if (session.mode !== 'payment' || session.currency !== 'brl') throw new Error('Pagamento incompatível');
  if (Number(session.amount_total) !== plano.centavos || Number(meta.preco) !== plano.centavos) {
    throw new Error('Valor do pagamento divergente');
  }
  return {
    ...montarCamposAnuncio(meta, perfil, plano),
    stripe_session_id: session.id,
    payment_provider: 'stripe',
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
      .select('id, lat, lon, cidade, uf')
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

async function publicarAnuncioGooglePlay({ usuarioId, plano, purchaseTokenHash, dados }, sb = getSupabaseClient()) {
  if (!usuarioId || !plano || !purchaseTokenHash) throw new Error('Compra Google Play incompleta');
  const { data: perfil, error: perfilError } = await sb
    .from('usuarios')
    .select('id, lat, lon, cidade, uf')
    .eq('id', usuarioId)
    .maybeSingle();
  if (perfilError) throw perfilError;
  if (!perfil) throw new Error('Perfil do anunciante nao encontrado');

  const { data: existente, error: buscaErro } = await sb
    .from('anuncios')
    .select('id')
    .eq('google_play_purchase_hash', purchaseTokenHash)
    .maybeSingle();
  if (buscaErro) throw buscaErro;
  if (existente) return { published: true, duplicated: true, id: existente.id };

  const anuncio = {
    ...montarCamposAnuncio({
      usuario_id: usuarioId,
      nome: cleanText(dados?.nome, 120),
      tipo: cleanText(dados?.tipo, 60),
      desc: cleanText(dados?.desc, 500, { multiline: true }),
      tel: String(dados?.tel || '').replace(/\D/g, '').slice(0, 15),
    }, perfil, plano),
    stripe_session_id: null,
    payment_provider: 'google_play',
    google_play_purchase_hash: purchaseTokenHash,
  };
  if (!anuncio.nome || !anuncio.tipo || !anuncio.usuario_id) throw new Error('Dados do anuncio incompletos');

  const { data, error } = await sb.from('anuncios').insert(anuncio).select('id').single();
  if (error) throw error;
  return { published: true, duplicated: false, id: data?.id };
}

module.exports = { publicarAnuncioGooglePlay, publicarAnuncioPago };
