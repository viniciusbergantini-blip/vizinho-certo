const test = require('node:test');
const assert = require('node:assert/strict');
const { ICONES_ANUNCIO, TIPOS_ANUNCIO, obterPlano, obterPlanoPorProdutoPlay } = require('../lib/planos-anuncios');

test('mantem precos e raios definidos no servidor', () => {
  assert.deepEqual(obterPlano(10), { id: 'rua', play_product_id: 'anuncio_rua_10d', nome: 'Plano Rua', dias: 10, centavos: 990, raio_km: 1.5, alcance_tipo: 'raio', destaque: false });
  assert.deepEqual(obterPlano(20), { id: 'bairro', play_product_id: 'anuncio_bairro_20d', nome: 'Plano Bairro', dias: 20, centavos: 1990, raio_km: 3, alcance_tipo: 'raio', destaque: true });
  assert.deepEqual(obterPlano(30), { id: 'regiao', play_product_id: 'anuncio_regiao_30d', nome: 'Plano Região', dias: 30, centavos: 2790, raio_km: 5, alcance_tipo: 'raio', destaque: true });
});

test('mapeia produtos consumiveis da Google Play para planos internos', () => {
  assert.equal(obterPlanoPorProdutoPlay('anuncio_bairro_20d')?.id, 'bairro');
  assert.equal(obterPlanoPorProdutoPlay('produto_inventado'), null);
});

test('oferece plano municipal com preço controlado no servidor', () => {
  const plano = obterPlano('cidade');
  assert.equal(plano.centavos, 3990);
  assert.equal('preco_referencia_centavos' in plano, false);
  assert.equal(plano.alcance_tipo, 'cidade');
  assert.equal(plano.dias, 30);
});

test('oferece categorias profissionais sem misturar pedreiro e pintor', () => {
  assert.equal(TIPOS_ANUNCIO.has('Limpeza e Diarista'), true);
  assert.equal(TIPOS_ANUNCIO.has('Pedreiro'), true);
  assert.equal(TIPOS_ANUNCIO.has('Pintor'), true);
  assert.equal(TIPOS_ANUNCIO.has('Comércio Local'), true);
  assert.equal(ICONES_ANUNCIO.get('Pintor'), '🎨');
});

test('recusa plano nao cadastrado', () => {
  assert.equal(obterPlano(999), null);
});

test('reconhece diarista e recusa categoria arbitraria', () => {
  assert.equal(TIPOS_ANUNCIO.has('Diarista'), true);
  assert.equal(TIPOS_ANUNCIO.has('Administrador'), false);
  assert.equal(ICONES_ANUNCIO.get('Diarista'), '🧹');
});
