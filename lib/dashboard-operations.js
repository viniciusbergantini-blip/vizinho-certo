const { obterPlano } = require('./planos-anuncios');

const EVENTOS_ATRASO_MS = 36 * 60 * 60 * 1000;

function inteiroNaoNegativo(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? Math.round(numero) : 0;
}

function dataIso(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function instanteSessao(session) {
  const criado = Number(session?.created);
  return Number.isFinite(criado) ? new Date(criado * 1000).toISOString() : null;
}

function pareceCheckoutDeAnuncio(session) {
  const metadata = session?.metadata || {};
  return Boolean(metadata.usuario_id && metadata.nome && metadata.tipo && metadata.dias);
}

function valorEsperado(session, anuncio) {
  const metadata = session?.metadata || {};
  const informado = Number(metadata.preco);
  if (Number.isFinite(informado) && informado >= 0) return Math.round(informado);
  const plano = obterPlano(metadata.dias || anuncio?.dias);
  return plano?.centavos ?? null;
}

function estadoPublicacao(anuncio, agora) {
  if (!anuncio) return 'ausente';
  const expiracao = anuncio.expira_em ? new Date(anuncio.expira_em) : null;
  if (!anuncio.ativo) return 'inativo';
  if (expiracao && !Number.isNaN(expiracao.getTime()) && expiracao < agora) return 'expirado';
  return 'ativo';
}

function montarLinha(session, anuncio, stripeDisponivel, agora) {
  const pagamento = !stripeDisponivel
    ? 'nao_verificado'
    : session?.payment_status === 'paid'
      ? 'pago'
      : session
        ? 'nao_pago'
        : 'nao_encontrado';
  const publicacao = estadoPublicacao(anuncio, agora);
  let conciliacao = 'nao_verificada';
  if (stripeDisponivel && pagamento === 'pago' && anuncio) conciliacao = 'conciliado';
  if (stripeDisponivel && pagamento === 'pago' && !anuncio) conciliacao = 'pagamento_sem_publicacao';
  if (stripeDisponivel && pagamento !== 'pago' && anuncio) conciliacao = 'publicacao_sem_pagamento';

  return {
    id: anuncio?.id || session?.id || null,
    nome: anuncio?.nome || session?.metadata?.nome || 'Anúncio sem nome',
    tipo: anuncio?.tipo || session?.metadata?.tipo || '',
    dias: inteiroNaoNegativo(anuncio?.dias || session?.metadata?.dias),
    criado_em: dataIso(anuncio?.criado_em) || instanteSessao(session),
    expira_em: dataIso(anuncio?.expira_em),
    valor_esperado_centavos: valorEsperado(session, anuncio),
    valor_pago_centavos: pagamento === 'pago' ? inteiroNaoNegativo(session?.amount_total) : null,
    moeda: String(session?.currency || 'brl').toUpperCase(),
    pagamento,
    publicacao,
    conciliacao,
  };
}

function buildPaidAdsOverview({ anuncios = [], sessoes = [], stripeDisponivel = false, agora = new Date() } = {}) {
  const dataAtual = agora instanceof Date ? agora : new Date(agora);
  const anunciosPorSessao = new Map(
    anuncios.filter(item => item?.stripe_session_id).map(item => [item.stripe_session_id, item])
  );
  const sessoesDeAnuncio = sessoes.filter(pareceCheckoutDeAnuncio);
  const sessoesPorId = new Map(sessoesDeAnuncio.map(item => [item.id, item]));
  const linhas = [];

  for (const session of sessoesDeAnuncio) {
    const anuncio = anunciosPorSessao.get(session.id) || null;
    if (session.payment_status !== 'paid' && !anuncio) continue;
    linhas.push(montarLinha(session, anuncio, stripeDisponivel, dataAtual));
  }

  for (const anuncio of anuncios) {
    if (sessoesPorId.has(anuncio.stripe_session_id)) continue;
    linhas.push(montarLinha(null, anuncio, stripeDisponivel, dataAtual));
  }

  linhas.sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0));
  const totalPago = linhas.reduce((soma, item) => soma + (item.valor_pago_centavos || 0), 0);
  const divergencias = linhas.filter(item => [
    'pagamento_sem_publicacao',
    'publicacao_sem_pagamento',
  ].includes(item.conciliacao)).length;

  return {
    stripe_disponivel: Boolean(stripeDisponivel),
    resumo: {
      pagamentos_confirmados: linhas.filter(item => item.pagamento === 'pago').length,
      anuncios_publicados: linhas.filter(item => item.publicacao !== 'ausente').length,
      anuncios_ativos: linhas.filter(item => item.publicacao === 'ativo').length,
      divergencias,
      total_pago_centavos: stripeDisponivel ? totalPago : null,
    },
    anuncios: linhas,
  };
}

function buildEventsAutomationOverview({ coletas = [], ultimaAtualizacaoEvento = null, proximosEventos = 0, agora = new Date() } = {}) {
  const dataAtual = agora instanceof Date ? agora : new Date(agora);
  const ultimaColeta = coletas[0] || null;
  const referencia = dataIso(ultimaColeta?.executado_em) || dataIso(ultimaAtualizacaoEvento);
  const atrasado = !referencia || (dataAtual.getTime() - new Date(referencia).getTime()) > EVENTOS_ATRASO_MS;
  let status = 'em_dia';
  if (!referencia) status = 'sem_execucao';
  else if (atrasado) status = 'atrasado';
  else if (ultimaColeta?.status === 'falha') status = 'falha';
  else if (ultimaColeta?.status === 'parcial') status = 'parcial';

  return {
    status,
    ultima_execucao_em: referencia,
    origem_status: ultimaColeta ? 'registro_coleta' : 'atualizacao_evento',
    programacao: 'Diariamente às 06:00 (horário de Brasília; o GitHub pode iniciar com atraso)',
    proximos_eventos: inteiroNaoNegativo(proximosEventos),
    ultima_coleta: ultimaColeta ? {
      status: ultimaColeta.status,
      encontrados: inteiroNaoNegativo(ultimaColeta.encontrados),
      inseridos: inteiroNaoNegativo(ultimaColeta.inseridos),
      atualizados: inteiroNaoNegativo(ultimaColeta.atualizados),
      preservados: inteiroNaoNegativo(ultimaColeta.preservados),
      calendario: inteiroNaoNegativo(ultimaColeta.calendario),
      noticias: inteiroNaoNegativo(ultimaColeta.noticias),
      falhas: Array.isArray(ultimaColeta.falhas) ? ultimaColeta.falhas.slice(0, 5) : [],
      erro: ultimaColeta.erro || null,
    } : null,
  };
}

module.exports = {
  EVENTOS_ATRASO_MS,
  buildEventsAutomationOverview,
  buildPaidAdsOverview,
  pareceCheckoutDeAnuncio,
};
