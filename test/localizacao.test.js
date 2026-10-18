const test = require('node:test');
const assert = require('node:assert/strict');
const {
  avaliarVisibilidadeAnuncio,
  distanciaMetros,
  mesmaRua,
} = require('../lib/localizacao');

test('considera visivel um anuncio dentro do raio', () => {
  const resultado = avaliarVisibilidadeAnuncio({
    anuncio: { usuario_id: 'a', lat: -23.0, lon: -46.0, raio_km: 1.5 },
    anunciante: { id: 'a', rua: 'Rua A', cep: '00000-000' },
    visitante: { id: 'b', lat: -23.001, lon: -46.001, rua: 'Rua B', cep: '00000-001' },
  });
  assert.equal(resultado.visivel, true);
  assert.equal(resultado.proximidade, 'distancia');
  assert.ok(resultado.distancia_metros < 1500);
});

test('oculta um anuncio fora do raio', () => {
  const resultado = avaliarVisibilidadeAnuncio({
    anuncio: { usuario_id: 'a', lat: -23.0, lon: -46.0, raio_km: 1.5 },
    anunciante: { id: 'a', rua: 'Rua A', cep: '00000-000' },
    visitante: { id: 'b', lat: -24.0, lon: -46.0, rua: 'Rua B', cep: '00000-001' },
  });
  assert.equal(resultado.visivel, false);
});

test('usa mesma rua e CEP quando as coordenadas estao ausentes', () => {
  const resultado = avaliarVisibilidadeAnuncio({
    anuncio: { usuario_id: 'a', lat: null, lon: null, raio_km: 1.5 },
    anunciante: { id: 'a', rua: 'Rua São José', cep: '12345-678', lat: null, lon: null },
    visitante: { id: 'b', rua: 'rua sao jose', cep: '12345678', lat: null, lon: null },
  });
  assert.equal(resultado.visivel, true);
  assert.equal(resultado.proximidade, 'mesma_rua');
});

test('nao usa fallback quando o CEP e diferente', () => {
  assert.equal(
    mesmaRua(
      { rua: 'Rua São José', cep: '12345-678' },
      { rua: 'Rua Sao Jose', cep: '12345-679' },
    ),
    false,
  );
});

test('calcula distancia zero sem confundir coordenada zero com valor ausente', () => {
  assert.equal(distanciaMetros(0, 0, 0, 0), 0);
});
