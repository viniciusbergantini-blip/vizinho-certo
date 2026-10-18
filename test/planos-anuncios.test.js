const test = require('node:test');
const assert = require('node:assert/strict');
const { ICONES_ANUNCIO, TIPOS_ANUNCIO, obterPlano } = require('../lib/planos-anuncios');

test('mantem precos e raios definidos no servidor', () => {
  assert.deepEqual(obterPlano(10), { centavos: 990, raio_km: 1.5, destaque: false });
  assert.deepEqual(obterPlano(20), { centavos: 1990, raio_km: 3, destaque: true });
  assert.deepEqual(obterPlano(30), { centavos: 2790, raio_km: 5, destaque: true });
});

test('recusa plano nao cadastrado', () => {
  assert.equal(obterPlano(999), null);
});

test('reconhece diarista e recusa categoria arbitraria', () => {
  assert.equal(TIPOS_ANUNCIO.has('Diarista'), true);
  assert.equal(TIPOS_ANUNCIO.has('Administrador'), false);
  assert.equal(ICONES_ANUNCIO.get('Diarista'), '🧹');
});
