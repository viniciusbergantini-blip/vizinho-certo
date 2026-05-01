const { createClient } = require('@supabase/supabase-js');

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

function montarAnuncio(session) {
  const meta = session.metadata || {};
  const dias = parseInt(meta.dias, 10) || 10;
  const expiraEm = new Date();
  expiraEm.setDate(expiraEm.getDate() + dias);

  return {
    usuario_id: meta.usuario_id || null,
    nome: meta.nome,
    tipo: meta.tipo,
    descricao: meta.desc || '',
    telefone: meta.tel || '',
    icon: meta.icon || '🏪',
    lat: meta.lat ? parseFloat(meta.lat) : null,
    lon: meta.lon ? parseFloat(meta.lon) : null,
    raio_km: dias === 10 ? 1.5 : dias === 20 ? 3 : 5,
    dias,
    destaque: dias >= 20,
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

  const anuncio = montarAnuncio(session);
  if (!anuncio.nome || !anuncio.tipo) {
    throw new Error('Metadata do anuncio incompleta');
  }

  const sb = getSupabaseClient();
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
