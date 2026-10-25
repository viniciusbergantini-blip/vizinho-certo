const test = require('node:test');
const assert = require('node:assert/strict');
const {
  categoriaEvento,
  USER_AGENT,
  normalizarEventosRecebidos,
  parseArtigoEventos,
  parseDetalheCalendario,
  parseFeed,
  parseListaCalendario,
  salvarEventos,
  uuidDeterministico,
} = require('../lib/eventos-coletor-sao-joao');

test('identifica o coletor em formato compatível com a fonte oficial', () => {
  assert.match(USER_AGENT, /^Mozilla\/5\.0/);
  assert.match(USER_AGENT, /VizinhoCertoEventos\/1\.0/);
  assert.match(USER_AGENT, /vizinhocerto\.com\.br/);
});

test('gera o mesmo UUID para a mesma fonte e UUIDs diferentes para fontes distintas', () => {
  const primeiro = uuidDeterministico('https://www.saojoao.sp.gov.br/eventos/feira');
  const repetido = uuidDeterministico('https://www.saojoao.sp.gov.br/eventos/feira');
  const outro = uuidDeterministico('https://www.saojoao.sp.gov.br/eventos/show');

  assert.equal(primeiro, repetido);
  assert.notEqual(primeiro, outro);
  assert.match(primeiro, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('interpreta a listagem estruturada da agenda municipal', () => {
  const html = `
    <article class="eventos-item">
      <div class="eventos-item__info">
        <h3 class="eventos-item__title"><a href="/eventos/feira-junto">Feira Juntô</a></h3>
        <p class="eventos-item__meta">14h às 20h</p>
      </div>
      <div class="eventos-item__date"><span>24/10/2026</span></div>
    </article>
    <article class="eventos-item">
      <h3 class="eventos-item__title"><a href="https://exemplo.invalid/evento">Evento externo</a></h3>
      <div class="eventos-item__date"><span>25/10/2026</span></div>
    </article>`;

  const eventos = parseListaCalendario(html, new Date('2026-10-21T12:00:00.000Z'));
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].titulo, 'Feira Juntô');
  assert.equal(eventos[0].inicio.toISOString(), '2026-10-24T17:00:00.000Z');
  assert.equal(eventos[0].fim.toISOString(), '2026-10-24T23:00:00.000Z');
});

test('extrai local e gratuidade do detalhe do calendário', () => {
  const detalhe = parseDetalheCalendario(`
    <div class="eventos-conteudo">
      <p><b>Horário:</b> 14h às 20h</p>
      <p><b>Local:</b> Teatro Municipal</p>
      <p><b>Endereço:</b> Praça da Catedral, 22</p>
      <div class="eventos-detalhe__html"><p>Entrada gratuita para toda a comunidade.</p></div>
    </div>`);

  assert.equal(detalhe.localNome, 'Teatro Municipal');
  assert.equal(detalhe.endereco, 'Praça da Catedral, 22');
  assert.equal(detalhe.gratuito, true);
});

test('deduplica links repetidos no feed oficial', () => {
  const itens = parseFeed(`<?xml version="1.0"?><rss><channel>
    <item><title>Feira local</title><link>https://saojoao.sp.gov.br/feira-local</link><description><![CDATA[<p>Feira em 24 de outubro de 2026, às 14h, na Praça Central.</p>]]></description><pubDate>Wed, 21 Oct 2026 10:00:00 -0300</pubDate></item>
    <item><title>Feira local repetida</title><link>https://saojoao.sp.gov.br/feira-local</link><pubDate>Wed, 21 Oct 2026 10:00:00 -0300</pubDate></item>
  </channel></rss>`);

  assert.equal(itens.length, 1);
  assert.equal(itens[0].titulo, 'Feira local');
  assert.match(itens[0].conteudoHtml, /Praça Central/);
});

test('extrai somente eventos futuros com data, horário e local claros da notícia oficial', () => {
  const html = `
    <article class="post-text">
      <p>A primeira reunião ocorreu em 14 de outubro de 2026, às 19h — Escola Municipal.</p>
      <p>Próximas audiências: no dia 22, às 19h, no Teatro Estação das Artes; e no dia 27 de outubro de 2026, às 17h, na Câmara Municipal.</p>
      <p>Atividades gratuitas e abertas à população.</p>
    </article>`;

  const eventos = parseArtigoEventos(html, {
    titulo: 'Audiências públicas do Plano Diretor',
    resumo: 'Programação aberta à comunidade',
    publicadoEm: new Date('2026-10-15T12:00:00.000Z'),
    link: 'https://saojoao.sp.gov.br/noticias/audiencias-plano-diretor',
  }, new Date('2026-10-21T12:00:00.000Z'));

  assert.equal(eventos.length, 2);
  assert.deepEqual(eventos.map(evento => evento.local_nome), ['Teatro Estação das Artes', 'Câmara Municipal']);
  assert.deepEqual(eventos.map(evento => evento.inicio_em), ['2026-10-22T22:00:00.000Z', '2026-10-27T20:00:00.000Z']);
  assert.ok(eventos.every(evento => evento.status === 'aprovado' && evento.gratuito));
});

test('classifica categorias locais comuns', () => {
  assert.equal(categoriaEvento('Concerto da Orquestra'), 'Show');
  assert.equal(categoriaEvento('Audiência Pública do Plano Diretor'), 'Comunidade');
  assert.equal(categoriaEvento('Audiência Pública', 'Será realizada na terça-feira'), 'Comunidade');
  assert.equal(categoriaEvento('Maratona estudantil'), 'Esporte');
});

test('salvamento é idempotente e preserva cancelamento feito no dashboard', async () => {
  const operacoes = [];
  const supabase = {
    from(tabela) {
      assert.equal(tabela, 'eventos');
      return {
        select() {
          return {
            in: async () => ({ data: [{ id: '11111111-1111-5111-8111-111111111111', status: 'cancelado', verificado_em: null }], error: null }),
          };
        },
        async upsert(linhas, opcoes) {
          operacoes.push({ linhas, opcoes });
          return { error: null };
        },
      };
    },
  };

  const resultado = await salvarEventos(supabase, [{
    id: '11111111-1111-5111-8111-111111111111',
    titulo: 'Evento cancelado',
    descricao: '',
    categoria: 'Outros',
    inicio_em: '2026-10-27T20:00:00.000Z',
    fim_em: null,
    local_nome: 'Praça Central',
    bairro: null,
    cidade: 'São João da Boa Vista',
    uf: 'SP',
    endereco: null,
    gratuito: true,
    preco_texto: null,
    fonte_tipo: 'oficial',
    fonte_nome: 'Prefeitura de São João da Boa Vista',
    fonte_url: 'https://saojoao.sp.gov.br/evento-cancelado',
    status: 'aprovado',
  }], new Date('2026-10-21T15:00:00.000Z'));

  assert.equal(resultado.atualizados, 1);
  assert.equal(resultado.preservados, 1);
  assert.equal(operacoes[0].opcoes.onConflict, 'id');
  assert.equal(operacoes[0].linhas[0].status, 'cancelado');
});

test('remove notícias duplicadas que apontam para o mesmo local e horário', async () => {
  let linhasSalvas = [];
  const supabase = {
    from() {
      return {
        select() {
          return { in: async () => ({ data: [], error: null }) };
        },
        async upsert(linhas) {
          linhasSalvas = linhas;
          return { error: null };
        },
      };
    },
  };
  const base = {
    descricao: '',
    categoria: 'Comunidade',
    inicio_em: '2026-10-27T22:00:00.000Z',
    fim_em: null,
    local_nome: 'Salão do Lions Clube',
    bairro: null,
    cidade: 'São João da Boa Vista',
    uf: 'SP',
    endereco: null,
    gratuito: true,
    preco_texto: null,
    fonte_tipo: 'oficial',
    fonte_nome: 'Prefeitura de São João da Boa Vista',
    status: 'aprovado',
  };

  const resultado = await salvarEventos(supabase, [
    { ...base, id: '11111111-1111-5111-8111-111111111111', titulo: 'Primeira notícia', fonte_url: 'https://saojoao.sp.gov.br/noticia-1' },
    { ...base, id: '22222222-2222-5222-8222-222222222222', titulo: 'Segunda notícia', fonte_url: 'https://saojoao.sp.gov.br/noticia-2' },
  ], new Date('2026-10-21T15:00:00.000Z'));

  assert.equal(resultado.encontrados, 1);
  assert.equal(linhasSalvas.length, 1);
});

test('revalida a carga recebida pelo workflow e força os campos de origem', () => {
  const eventos = normalizarEventosRecebidos([{
    titulo: 'Feira local',
    descricao: 'Evento divulgado pela Prefeitura.',
    inicio_em: '2026-10-24T17:00:00.000Z',
    fim_em: null,
    local_nome: 'Praça Central',
    endereco: 'Centro',
    gratuito: true,
    fonte_url: 'https://saojoao.sp.gov.br/noticias/feira-local#evento-2026-10-24',
    status: 'cancelado',
    cidade: 'Outra cidade',
  }], new Date('2026-10-21T12:00:00.000Z'));

  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].cidade, 'São João da Boa Vista');
  assert.equal(eventos[0].uf, 'SP');
  assert.equal(eventos[0].status, 'aprovado');
  assert.equal(eventos[0].fonte_tipo, 'oficial');
});

test('recusa fonte externa na carga do workflow', () => {
  assert.throws(() => normalizarEventosRecebidos([{
    titulo: 'Evento externo',
    inicio_em: '2026-10-24T17:00:00.000Z',
    local_nome: 'Praça Central',
    gratuito: true,
    fonte_url: 'https://exemplo.invalid/evento',
  }], new Date('2026-10-21T12:00:00.000Z')), /campos inválidos/);
});
