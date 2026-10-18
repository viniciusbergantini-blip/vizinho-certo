const { createClient } = require('@supabase/supabase-js');
const { avaliarVisibilidadeAnuncio, coordenadasValidas } = require('../lib/localizacao');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Login obrigatorio' });

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY nao configurada' });

  const sb = createClient(SUPABASE_URL, serviceKey);
  const { data: userData, error: userError } = await sb.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: 'Sessao invalida' });

  const { data: visitante, error: visitanteError } = await sb
    .from('usuarios')
    .select('id, rua, cep, lat, lon')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (visitanteError) return res.status(500).json({ error: visitanteError.message });
  if (!visitante) return res.status(409).json({ error: 'Complete seu cadastro antes de ver os anuncios' });

  const campos = 'id, usuario_id, nome, tipo, descricao, telefone, icon, raio_km, dias, destaque, ativo, expira_em, criado_em, lat, lon';
  const agora = new Date().toISOString();
  const [resultadoPublicos, resultadoProprios] = await Promise.all([
    sb
      .from('anuncios')
      .select(campos)
      .eq('ativo', true)
      .gt('expira_em', agora)
      .order('destaque', { ascending: false })
      .order('criado_em', { ascending: false }),
    sb
      .from('anuncios')
      .select(campos)
      .eq('usuario_id', userData.user.id)
      .eq('ativo', true)
      .order('criado_em', { ascending: false }),
  ]);

  if (resultadoPublicos.error) return res.status(500).json({ error: resultadoPublicos.error.message });
  if (resultadoProprios.error) return res.status(500).json({ error: resultadoProprios.error.message });
  const anuncios = resultadoPublicos.data || [];
  const anunciosProprios = resultadoProprios.data || [];

  const proprietariosIds = [...new Set((anuncios || []).map(item => item.usuario_id).filter(Boolean))];
  let proprietarios = [];
  if (proprietariosIds.length > 0) {
    const resultado = await sb
      .from('usuarios')
      .select('id, rua, cep, lat, lon')
      .in('id', proprietariosIds);
    if (resultado.error) return res.status(500).json({ error: resultado.error.message });
    proprietarios = resultado.data || [];
  }

  const proprietariosPorId = new Map(proprietarios.map(item => [item.id, item]));
  const visiveis = [];

  for (const anuncio of anuncios || []) {
    const resultado = avaliarVisibilidadeAnuncio({
      anuncio,
      anunciante: proprietariosPorId.get(anuncio.usuario_id),
      visitante,
    });
    if (!resultado.visivel) continue;

    const { lat, lon, ...seguro } = anuncio;
    visiveis.push({
      ...seguro,
      distancia_metros: resultado.distancia_metros,
      proximidade: resultado.proximidade,
      pode_gerenciar: anuncio.usuario_id === userData.user.id,
    });
  }

  const meusAnuncios = anunciosProprios.map(anuncio => {
    const { lat, lon, ...seguro } = anuncio;
    return {
      ...seguro,
      distancia_metros: 0,
      proximidade: 'proprio',
      pode_gerenciar: true,
      status: new Date(anuncio.expira_em).getTime() > Date.now() ? 'ativo' : 'expirado',
    };
  });

  return res.json({
    anuncios: visiveis,
    meus_anuncios: meusAnuncios,
    location_status: coordenadasValidas(visitante) ? 'precise' : 'same_street_only',
  });
};
