const test = require('node:test');
const assert = require('node:assert/strict');
const { metricasPorAnuncio, ordenarAnunciosPorPrioridade } = require('../lib/anuncio-metrics');

test('calcula alcance único e contatos por anúncio sem contar o proprietário', () => {
  const eventos = [
    { user_id: 'vizinho-1', session_id: 's1', metadata: { action: 'ad_impression', ad_id: 'a1' } },
    { user_id: 'vizinho-1', session_id: 's1', metadata: { action: 'ad_impression', ad_id: 'a1' } },
    { user_id: null, session_id: 'visitante-2', metadata: { action: 'ad_impression', ad_id: 'a1' } },
    { user_id: 'vizinho-1', session_id: 's1', metadata: { action: 'ad_whatsapp_click', ad_id: 'a1' } },
    { user_id: 'vizinho-2', session_id: 's2', metadata: { action: 'ad_phone_click', ad_id: 'a1' } },
    { user_id: 'dono', session_id: 'owner-session', metadata: { action: 'ad_whatsapp_click', ad_id: 'a1' } },
    { user_id: 'vizinho-1', session_id: 's1', metadata: { action: 'ad_impression', ad_id: 'a2' } },
  ];

  const metricas = metricasPorAnuncio(eventos, [{ id: 'a1' }, { id: 'a2' }], 'dono');
  assert.deepEqual(metricas.get('a1'), { alcance: 2, whatsapp: 1, ligacoes: 1 });
  assert.deepEqual(metricas.get('a2'), { alcance: 1, whatsapp: 0, ligacoes: 0 });
});

test('coloca o plano Cidade no topo e mantém destaque e recência nos demais', () => {
  const ordenados = ordenarAnunciosPorPrioridade([
    { id: 'rua-novo', plano_id: 'rua', destaque: false, criado_em: '2026-10-25T12:00:00Z' },
    { id: 'bairro', plano_id: 'bairro', destaque: true, criado_em: '2026-10-24T12:00:00Z' },
    { id: 'cidade', plano_id: 'cidade', destaque: true, criado_em: '2026-10-20T12:00:00Z' },
    { id: 'rua-antigo', plano_id: 'rua', destaque: false, criado_em: '2026-10-23T12:00:00Z' },
  ]);
  assert.deepEqual(ordenados.map(item => item.id), ['cidade', 'bairro', 'rua-novo', 'rua-antigo']);
});
