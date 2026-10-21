const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntime } = require('../app-runtime');

test('mantem chamadas relativas no webapp atual', () => {
  const runtime = createRuntime({ location: { protocol: 'https:' } });

  assert.equal(runtime.platform, 'web');
  assert.equal(runtime.native, false);
  assert.equal(runtime.apiOrigin, '');
  assert.equal(runtime.apiUrl('/api/eventos?periodo=semana'), '/api/eventos?periodo=semana');
});

test('usa a API de producao quando executado em um container nativo', () => {
  const runtime = createRuntime({
    location: { protocol: 'capacitor:' },
    Capacitor: { isNativePlatform: () => true }
  });

  assert.equal(runtime.platform, 'native');
  assert.equal(runtime.apiUrl('/api/anuncios-visiveis'), 'https://www.vizinhocerto.com.br/api/anuncios-visiveis');
});

test('aceita origem configurada e normaliza barras', () => {
  const runtime = createRuntime({
    location: { protocol: 'https:' },
    __VIZINHO_CERTO_CONFIG__: { apiOrigin: 'https://preview.exemplo.com.br///' }
  });

  assert.equal(runtime.apiOrigin, 'https://preview.exemplo.com.br');
  assert.equal(runtime.apiUrl('api/checkout-status'), 'https://preview.exemplo.com.br/api/checkout-status');
});
