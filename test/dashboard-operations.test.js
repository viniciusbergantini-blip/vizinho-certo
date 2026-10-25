const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEventsAutomationOverview,
  buildPaidAdsOverview,
} = require('../lib/dashboard-operations');

test('concilia pagamento pago com anúncio publicado e soma o valor debitado', () => {
  const overview = buildPaidAdsOverview({
    stripeDisponivel: true,
    agora: new Date('2026-10-25T12:00:00.000Z'),
    sessoes: [{
      id: 'cs_1', payment_status: 'paid', amount_total: 990, currency: 'brl', created: 1792920000,
      metadata: { usuario_id: 'u1', nome: 'Diarista', tipo: 'Diarista', dias: '10', preco: '990' },
    }],
    anuncios: [{
      id: 'a1', stripe_session_id: 'cs_1', nome: 'Diarista', tipo: 'Diarista', dias: 10,
      ativo: true, criado_em: '2026-10-25T10:00:00.000Z', expira_em: '2026-11-04T10:00:00.000Z',
    }],
  });

  assert.equal(overview.resumo.pagamentos_confirmados, 1);
  assert.equal(overview.resumo.anuncios_publicados, 1);
  assert.equal(overview.resumo.divergencias, 0);
  assert.equal(overview.resumo.total_pago_centavos, 990);
  assert.equal(overview.anuncios[0].conciliacao, 'conciliado');
});

test('sinaliza pagamento confirmado sem publicação', () => {
  const overview = buildPaidAdsOverview({
    stripeDisponivel: true,
    sessoes: [{
      id: 'cs_2', payment_status: 'paid', amount_total: 1990, currency: 'brl', created: 1792920000,
      metadata: { usuario_id: 'u2', nome: 'Eletricista', tipo: 'Eletricista', dias: '20' },
    }],
  });

  assert.equal(overview.resumo.divergencias, 1);
  assert.equal(overview.anuncios[0].publicacao, 'ausente');
  assert.equal(overview.anuncios[0].conciliacao, 'pagamento_sem_publicacao');
});

test('marca a automação em dia e detecta atraso superior a 36 horas', () => {
  const emDia = buildEventsAutomationOverview({
    agora: new Date('2026-10-25T15:00:00.000Z'),
    coletas: [{ executado_em: '2026-10-25T13:30:00.000Z', status: 'sucesso', encontrados: 3 }],
    proximosEventos: 2,
  });
  assert.equal(emDia.status, 'em_dia');
  assert.equal(emDia.proximos_eventos, 2);

  const atrasada = buildEventsAutomationOverview({
    agora: new Date('2026-10-25T15:00:00.000Z'),
    ultimaAtualizacaoEvento: '2026-10-23T01:00:00.000Z',
  });
  assert.equal(atrasada.status, 'atrasado');
});
