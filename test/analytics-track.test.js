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
    senha: 'nao-pode-ser-armazenada',
    password: 'tambem-nao-pode',
    landing_city: '<script>',
    link_url: '/campanha',
    platform: 'ios',
    source: 'app_profile',
    status: 'accepted',
    action: 'install_accepted',
    geo: { latitude: -23 },
  }), {
    utm_source: 'instagram',
    link_url: '/campanha',
    platform: 'ios',
    source: 'app_profile',
    status: 'accepted',
    action: 'install_accepted',
  });
});

test('armazena acao de adocao sem exigir um novo tipo na tabela', () => {
  assert.deepEqual(_private.prepararEventoPersistido('install_accepted', { source: 'app' }), {
    eventType: 'cta_click',
    metadata: { source: 'app', action: 'install_accepted' },
  });
  assert.deepEqual(_private.prepararEventoPersistido('cta_click', { action: 'forjada' }), {
    eventType: 'cta_click',
    metadata: {},
  });
  assert.deepEqual(_private.prepararEventoPersistido('existing_account_recovered', { status: 'user_already_exists' }), {
    eventType: 'cta_click',
    metadata: { status: 'user_already_exists', action: 'existing_account_recovered' },
  });
});

test('classifica dispositivo e automacao sem armazenar o user agent', () => {
  assert.equal(_private.classificarDispositivo({ 'user-agent': 'Mozilla/5.0 (iPhone; Mobile)' }), 'mobile');
  assert.equal(_private.classificarDispositivo({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)' }), 'desktop');
  assert.equal(_private.classificarTrafego({ 'user-agent': 'Googlebot/2.1' }), 'suspected_bot');
  assert.equal(_private.classificarTrafego({ 'user-agent': 'Mozilla/5.0 Safari/605.1.15' }), 'human');
});
