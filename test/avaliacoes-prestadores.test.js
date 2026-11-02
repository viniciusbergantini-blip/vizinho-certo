const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ratings = require('../api/avaliacoes-prestadores')._private;
const visibleAds = require('../api/anuncios-visiveis')._private;
const posts = require('../api/posts')._private;

function queryResult(data) {
  return {
    select() { return this; },
    in() { return Promise.resolve({ data, error: null }); },
    eq() { return this; },
  };
}

test('resumo de avaliacao preserva o prestador para atualizar a interface apos salvar', async () => {
  const prestadorId = '11111111-1111-5111-8111-111111111111';
  const sb = {
    from(table) {
      if (table === 'avaliacoes_prestadores_resumo') {
        return queryResult([{ prestador_id: prestadorId, media: '4.5', quantidade: 2 }]);
      }
      return queryResult([{ prestador_id: prestadorId, estrelas: 4 }]);
    },
  };

  const resultado = await ratings.carregarAvaliacoes(sb, [prestadorId], 'morador-id');
  assert.deepEqual(resultado[prestadorId], {
    prestador_id: prestadorId,
    media: 4.5,
    quantidade: 2,
    minha_nota: 4,
  });
});

test('localizacao temporaria aceita coordenada zero e rejeita valores ausentes ou fora da faixa', () => {
  const perfil = { id: 'morador', lat: -22.1, lon: -46.7 };
  const zero = { headers: { 'x-vizinho-latitude': '0', 'x-vizinho-longitude': '0' } };
  const ausente = { headers: {} };
  const invalida = { headers: { 'x-vizinho-latitude': '91', 'x-vizinho-longitude': '0' } };

  assert.deepEqual(visibleAds.aplicarLocalizacaoTemporaria(zero, perfil), { ...perfil, lat: 0, lon: 0 });
  assert.deepEqual(posts.aplicarLocalizacaoTemporaria(zero, perfil), { ...perfil, lat: 0, lon: 0 });
  assert.equal(visibleAds.aplicarLocalizacaoTemporaria(ausente, perfil), perfil);
  assert.equal(posts.aplicarLocalizacaoTemporaria(invalida, perfil), perfil);
});

test('migration mantem avaliacoes fechadas ao cliente e usa view com permissoes do chamador', () => {
  const sql = fs.readFileSync(path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20261102182551_add_provider_ratings.sql',
  ), 'utf8');

  assert.match(sql, /alter table public\.avaliacoes_prestadores enable row level security/i);
  assert.match(sql, /revoke all on table public\.avaliacoes_prestadores from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.avaliacoes_prestadores to service_role/i);
  assert.match(sql, /with \(security_invoker = true\)/i);
  assert.doesNotMatch(sql, /create\s+policy/i);
});
