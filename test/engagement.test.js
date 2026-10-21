const test = require('node:test');
const assert = require('node:assert/strict');
const {
  filterServices,
  isReturningVisit,
  summarizeActivity,
  summarizeNeighborhood,
} = require('../engagement');

test('resume conteudo real e ignora posts de boas-vindas', () => {
  const summary = summarizeNeighborhood({
    posts: [
      { id: 'bv1' },
      { id: 'post-1', criado_em: '2026-10-21T12:00:00.000Z' },
      { id: 'anun-1', isAnuncio: true, criado_em: '2026-10-21T13:00:00.000Z' },
    ],
    eventCount: 2,
    lastVisit: '2026-10-21T11:00:00.000Z',
  });

  assert.deepEqual(summary, { posts: 1, services: 1, events: 2, newItems: 2, total: 4 });
});

test('busca servicos sem diferenciar acentos e respeita categoria', () => {
  const items = [
    { nome: 'Elétrica João', tipo: 'Eletricista', descricao: 'Instalação residencial' },
    { nome: 'Casa Limpa', tipo: 'Diarista', descricao: 'Limpeza semanal' },
    { nome: 'Meu anúncio', tipo: 'Diarista', pode_gerenciar: true },
  ];

  assert.deepEqual(filterServices(items, { query: 'eletrica' }).map(item => item.nome), ['Elétrica João']);
  assert.deepEqual(filterServices(items, { category: 'Diarista' }).map(item => item.nome), ['Casa Limpa']);
});

test('considera retorno somente depois do intervalo minimo', () => {
  assert.equal(isReturningVisit('2026-10-21T08:00:00.000Z', '2026-10-21T15:00:00.000Z'), true);
  assert.equal(isReturningVisit('2026-10-21T12:00:00.000Z', '2026-10-21T15:00:00.000Z'), false);
});

test('resume apenas a atividade pertencente ao usuario', () => {
  assert.deepEqual(summarizeActivity({
    posts: [{ id: '1', usuario_id: 'u1' }, { id: '2', usuario_id: 'u2' }, { id: 'bv1', usuario_id: 'u1' }],
    userId: 'u1',
    ads: [{ id: 'a1' }],
    suggestions: [{ id: 'e1' }, { id: 'e2' }],
  }), { posts: 1, ads: 1, suggestions: 2 });
});
