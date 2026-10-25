const ACOES_ANUNCIO = new Set([
  'ad_impression',
  'ad_whatsapp_click',
  'ad_phone_click',
]);

function metricasPorAnuncio(eventos = [], anuncios = [], proprietarioId = null) {
  const ids = new Set(anuncios.map(item => String(item?.id || '')).filter(Boolean));
  const metricas = new Map([...ids].map(id => [id, {
    alcance: new Set(),
    whatsapp: 0,
    ligacoes: 0,
  }]));

  for (const evento of eventos) {
    const metadata = evento?.metadata || {};
    const action = String(metadata.action || '');
    const adId = String(metadata.ad_id || '');
    if (!ACOES_ANUNCIO.has(action) || !ids.has(adId)) continue;
    if (proprietarioId && evento.user_id === proprietarioId) continue;
    const item = metricas.get(adId);
    const visitante = evento.user_id || evento.session_id;
    if (action === 'ad_impression' && visitante) item.alcance.add(String(visitante));
    if (action === 'ad_whatsapp_click') item.whatsapp += 1;
    if (action === 'ad_phone_click') item.ligacoes += 1;
  }

  return new Map([...metricas].map(([id, item]) => [id, {
    alcance: item.alcance.size,
    whatsapp: item.whatsapp,
    ligacoes: item.ligacoes,
  }]));
}

function ordenarAnunciosPorPrioridade(anuncios = []) {
  return [...anuncios].sort((a, b) => {
    const cidade = Number(b?.plano_id === 'cidade') - Number(a?.plano_id === 'cidade');
    if (cidade) return cidade;
    const destaque = Number(Boolean(b?.destaque)) - Number(Boolean(a?.destaque));
    if (destaque) return destaque;
    return new Date(b?.criado_em || 0).getTime() - new Date(a?.criado_em || 0).getTime();
  });
}

module.exports = { ACOES_ANUNCIO, metricasPorAnuncio, ordenarAnunciosPorPrioridade };
