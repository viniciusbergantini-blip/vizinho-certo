const test = require('node:test');
const assert = require('node:assert/strict');
const { ICONES_ANUNCIO, TIPOS_ANUNCIO, obterPlano } = require('../lib/planos-anuncios');

test('mantem precos e raios definidos no servidor', () => {
  assert.deepEqual(obterPlano(10), { id: 'rua', nome: 'Plano Rua', dias: 10, centavos: 990, raio_km: 1.5, alcance_tipo: 'raio', destaque: false });
  assert.deepEqual(obterPlano(20), { id: 'bairro', nome: 'Plano Bairro', dias: 20, centavos: 1990, raio_km: 3, alcance_tipo: 'raio', destaque: true });
  assert.deepEqual(obterPlano(30), { id: 'regiao', nome: 'Plano Região', dias: 30, centavos: 2790, raio_km: 5, alcance_tipo: 'raio', destaque: true });
});

test('oferece plano municipal com preço promocional controlado no servidor', () => {
  const plano = obterPlano('cidade');
  assert.equal(plano.centavos, 3990);
  assert.equal(plano.preco_referencia_centavos, 4990);
  assert.equal(plano.alcance_tipo, 'cidade');
  assert.equal(plano.dias, 30);
});

test('recusa plano nao cadastrado', () => {
  assert.equal(obterPlano(999), null);
});

test('reconhece diarista e recusa categoria arbitraria', () => {
  assert.equal(TIPOS_ANUNCIO.has('Diarista'), true);
  assert.equal(TIPOS_ANUNCIO.has('Administrador'), false);
  assert.equal(ICONES_ANUNCIO.get('Diarista'), '🧹');
});
