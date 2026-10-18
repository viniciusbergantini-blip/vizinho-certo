const test = require('node:test');
const assert = require('node:assert/strict');
const { _private } = require('../api/track');

test('le geolocalizacao aproximada dos cabecalhos da Vercel', () => {
  assert.deepEqual(_private.geolocalizacaoAproximada({
    'x-vercel-ip-city': 'S%C3%A3o%20Paulo',
    'x-vercel-ip-country-region': 'SP',
    'x-vercel-ip-country': 'BR',
    'x-vercel-ip-latitude': '-23.5',
  }), {
    city: 'São Paulo',
    region: 'SP',
    country: 'BR',
  });
});

test('aceita apenas links internos e remove a origem', () => {
  assert.equal(_private.normalizarLink('/saojoao?utm_source=instagram'), '/saojoao?utm_source=instagram');
  assert.equal(_private.normalizarLink('https://www.vizinhocerto.com.br/oferta?ref=bairro'), '/oferta?ref=bairro');
  assert.equal(_private.normalizarLink('https://exemplo.com/coleta'), '/');
});

test('mantem apenas metadados de campanha permitidos', () => {
  assert.deepEqual(_private.sanitizarMetadata({
    utm_source: 'instagram',
    email: 'privado@example.com',
    cep: '00000-000',
    landing_city: '<script>',
    link_url: '/campanha',
    geo: { latitude: -23 },
  }), {
    utm_source: 'instagram',
    link_url: '/campanha',
  });
});
