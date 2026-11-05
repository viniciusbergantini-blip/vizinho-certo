const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  avaliarVisibilidadeAnuncio,
  distanciaMetros,
  mesmaCidade,
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

test('mostra anúncio municipal em toda a mesma cidade e UF', () => {
  const resultado = avaliarVisibilidadeAnuncio({
    anuncio: { usuario_id: 'a', alcance_tipo: 'cidade', cidade_alvo: 'São João da Boa Vista', uf_alvo: 'SP' },
    anunciante: { id: 'a' },
    visitante: { id: 'b', cidade: 'sao joao da boa vista', uf: 'sp', lat: -22.0, lon: -47.0 },
  });
  assert.deepEqual(resultado, { visivel: true, proximidade: 'cidade', distancia_metros: null });
  assert.equal(mesmaCidade({ cidade: 'Maringá', uf: 'PR' }, { cidade: 'maringa', uf: 'PR' }), true);
});

test('não mostra anúncio municipal em outra cidade ou UF', () => {
  const base = { usuario_id: 'a', alcance_tipo: 'cidade', cidade_alvo: 'São João da Boa Vista', uf_alvo: 'SP' };
  assert.equal(avaliarVisibilidadeAnuncio({ anuncio: base, anunciante: {}, visitante: { id: 'b', cidade: 'Maringá', uf: 'PR' } }).visivel, false);
  assert.equal(avaliarVisibilidadeAnuncio({ anuncio: base, anunciante: {}, visitante: { id: 'b', cidade: 'São João da Boa Vista', uf: 'MG' } }).visivel, false);
});

test('cadastro aceita GPS e busca por rua sem tornar CEP obrigatório', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  assert.match(app, /usarGpsCadastro\(\)/);
  assert.match(app, /action:'address_search'/);
  assert.match(app, /localizacaoJaConfirmada/);
  assert.doesNotMatch(app, /if\(cep\.length!==8\)/);
});

test('geocodificacao valida o número encontrado e oferece busca reversa', () => {
  const geocode = fs.readFileSync(path.join(__dirname, '..', 'api', 'geocode.js'), 'utf8');
  assert.match(geocode, /confirmed_number/);
  assert.match(geocode, /action === 'reverse'/);
  assert.match(geocode, /proximaConsultaEm = Date\.now\(\) \+ 1100/);
});

test('busca de vizinhos usa PostGIS privado e distancia pública arredondada', () => {
  const posts = fs.readFileSync(path.join(__dirname, '..', 'api', 'posts.js'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261104170000_add_geographic_locations.sql'), 'utf8');
  assert.match(posts, /rpc\('vizinhos_no_raio_v2'/);
  assert.match(posts, /arredondarDistanciaPublica/);
  assert.match(migration, /using gist \(localizacao\)/i);
  assert.match(migration, /revoke all on function public\.vizinhos_no_raio_v2[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
});
