const crypto = require('node:crypto');
const cheerio = require('cheerio');

const CIDADE = 'São João da Boa Vista';
const UF = 'SP';
const FONTE_NOME = 'Prefeitura de São João da Boa Vista';
const BASE_URL = 'https://www.saojoao.sp.gov.br';
const FEED_URL = 'https://ecrie20.com.br/saojoao.sp.gov.br/feed.xml';
const USER_AGENT = 'Mozilla/5.0 (compatible; VizinhoCertoEventos/1.0; +https://www.vizinhocerto.com.br)';
const MESES = Object.freeze({
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
});
const PALAVRAS_EVENTO = /\b(evento|agenda|feira|show|concerto|festival|fest[aã]o|apresenta[cç][aã]o|espet[aá]culo|teatro|dan[cç]a|m[uú]sica|exposi[cç][aã]o|oficina|curso|audi[eê]ncia|encontro|maratona|corrida|campeonato|programa[cç][aã]o|atividade cultural)\b/i;
const MAX_RESPOSTA_BYTES = 2 * 1024 * 1024;

function limparTexto(valor, limite = 1000) {
  return String(valor ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, limite);
}

function removerAcentos(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function uuidDeterministico(valor) {
  const bytes = crypto.createHash('sha256').update(`vizinho-certo:evento:${valor}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function dataSaoPaulo(ano, mes, dia, hora = 12, minuto = 0) {
  const pad = valor => String(valor).padStart(2, '0');
  const data = new Date(`${ano}-${pad(mes)}-${pad(dia)}T${pad(hora)}:${pad(minuto)}:00-03:00`);
  return Number.isNaN(data.getTime()) ? null : data;
}

function inicioDiaSaoPaulo(data) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(data).reduce((acc, parte) => {
    if (parte.type !== 'literal') acc[parte.type] = parte.value;
    return acc;
  }, {});
  return new Date(`${partes.year}-${partes.month}-${partes.day}T00:00:00-03:00`);
}

function dentroDaJanela(data, agora, diasFuturos = 180) {
  if (!data || Number.isNaN(data.getTime())) return false;
  const inicio = inicioDiaSaoPaulo(agora);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + diasFuturos);
  return data >= inicio && data < fim;
}

function extrairHorario(texto) {
  const normalizado = limparTexto(texto, 300);
  const match = normalizado.match(/\b(\d{1,2})(?:h|:)(\d{2})?(?:\s*(?:a|as|à|às|ate|até|-)\s*(\d{1,2})(?:h|:)(\d{2})?)?/i);
  if (!match) return { hora: 12, minuto: 0, fimHora: null, fimMinuto: null, encontrado: false };
  const hora = Number(match[1]);
  const minuto = Number(match[2] || 0);
  const fimHora = match[3] == null ? null : Number(match[3]);
  const fimMinuto = match[3] == null ? null : Number(match[4] || 0);
  if (hora > 23 || minuto > 59 || (fimHora != null && (fimHora > 23 || fimMinuto > 59))) {
    return { hora: 12, minuto: 0, fimHora: null, fimMinuto: null, encontrado: false };
  }
  return { hora, minuto, fimHora, fimMinuto, encontrado: true };
}

function categoriaEvento(titulo, descricao = '') {
  const texto = removerAcentos(`${titulo} ${descricao}`)
    .replace(/\b(?:segunda|terca|quarta|quinta|sexta)-feira\b/g, '');
  if (/\b(feira|bazar|artesanato)\b/.test(texto)) return 'Feira';
  if (/\b(show|concerto|musica|orquestra|banda|baterista|festival musical)\b/.test(texto)) return 'Show';
  if (/\b(esporte|maratona|corrida|campeonato|torneio|jogo|ciclismo)\b/.test(texto)) return 'Esporte';
  if (/\b(infantil|crianca|kids|brincadeira)\b/.test(texto)) return 'Infantil';
  if (/\b(gastronomia|comida|cerveja|vinho|food)\b/.test(texto)) return 'Gastronomia';
  if (/\b(curso|oficina|workshop|palestra)\b/.test(texto)) return 'Curso';
  if (/\b(audiencia|comunidade|reuniao|encontro publico|plano diretor)\b/.test(texto)) return 'Comunidade';
  if (/\b(cultura|teatro|danca|exposicao|museu|literatura|cinema)\b/.test(texto)) return 'Cultura';
  return 'Outros';
}

function urlOficial(valor, base = BASE_URL) {
  try {
    const url = new URL(valor, base);
    const host = url.hostname.toLowerCase();
    if (!['saojoao.sp.gov.br', 'www.saojoao.sp.gov.br'].includes(host)) return null;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

function criarEvento({ titulo, descricao, inicio, fim, localNome, endereco, fonteUrl, gratuito }) {
  const fonte = urlOficial(fonteUrl);
  const tituloLimpo = limparTexto(titulo, 120);
  const localLimpo = limparTexto(localNome, 120);
  if (!fonte || tituloLimpo.length < 3 || localLimpo.length < 2 || !inicio) return null;

  return {
    id: uuidDeterministico(fonte),
    titulo: tituloLimpo,
    descricao: limparTexto(descricao, 1000),
    categoria: categoriaEvento(tituloLimpo, descricao),
    inicio_em: inicio.toISOString(),
    fim_em: fim ? fim.toISOString() : null,
    local_nome: localLimpo,
    bairro: null,
    cidade: CIDADE,
    uf: UF,
    endereco: limparTexto(endereco, 180) || null,
    gratuito: Boolean(gratuito),
    preco_texto: gratuito ? null : 'Consulte a fonte oficial',
    fonte_tipo: 'oficial',
    fonte_nome: FONTE_NOME,
    fonte_url: fonte,
    status: 'aprovado',
  };
}

function parseListaCalendario(html, agora = new Date()) {
  const $ = cheerio.load(html);
  const eventos = [];

  $('.eventos-item').each((_, elemento) => {
    const item = $(elemento);
    const titulo = limparTexto(item.find('.eventos-item__title').text(), 120);
    const fonteUrl = urlOficial(item.find('.eventos-item__title a').attr('href') || item.find('a').first().attr('href'));
    const dataMatch = item.find('.eventos-item__date').text().match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const horarioTexto = limparTexto(item.find('.eventos-item__meta').text(), 100);
    if (!titulo || !fonteUrl || !dataMatch) return;

    const horario = extrairHorario(horarioTexto);
    const inicio = dataSaoPaulo(Number(dataMatch[3]), Number(dataMatch[2]), Number(dataMatch[1]), horario.hora, horario.minuto);
    if (!dentroDaJanela(inicio, agora)) return;
    const fim = horario.fimHora == null
      ? null
      : dataSaoPaulo(Number(dataMatch[3]), Number(dataMatch[2]), Number(dataMatch[1]), horario.fimHora, horario.fimMinuto);

    eventos.push({ titulo, fonteUrl, inicio, fim, horarioTexto });
  });

  return eventos;
}

function parseDetalheCalendario(html) {
  const $ = cheerio.load(html);
  const conteudo = $('.eventos-conteudo');
  const campos = {};
  conteudo.find('p').each((_, elemento) => {
    const texto = limparTexto($(elemento).text(), 500);
    const match = texto.match(/^([^:]{2,40}):\s*(.+)$/s);
    if (match) campos[removerAcentos(match[1])] = limparTexto(match[2], 300);
  });

  const descricao = limparTexto(conteudo.find('.eventos-detalhe__html').text(), 1000);
  return {
    localNome: campos.local || null,
    endereco: campos.endereco || null,
    descricao,
    gratuito: /gratuit|entrada livre/i.test(`${descricao} ${conteudo.text()}`),
  };
}

function parseFeed(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const vistos = new Set();
  const itens = [];

  $('item').each((_, elemento) => {
    const item = $(elemento);
    const link = urlOficial(item.find('link').first().text());
    if (!link || vistos.has(link)) return;
    vistos.add(link);
    const conteudoHtml = String(item.find('description').first().text() || '').slice(0, 12000);
    const resumo = limparTexto(cheerio.load(conteudoHtml).text(), 2000);
    itens.push({
      titulo: limparTexto(item.find('title').first().text(), 160),
      resumo,
      conteudoHtml,
      publicadoEm: new Date(item.find('pubDate').first().text()),
      link,
    });
  });

  return itens;
}

function textoArtigo(html) {
  const $ = cheerio.load(html);
  const artigo = $('.post-text').first();
  if (!artigo.length) return '';
  artigo.find('script, style, noscript, .post-image').remove();
  const comQuebras = (artigo.html() || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n');
  const fragmento = cheerio.load(`<div id="texto-evento">${comQuebras}</div>`);
  return limparTexto(fragmento('#texto-evento').text(), 12000);
}

function localAposData(trecho) {
  const porRotulo = trecho.match(/\bLocal\s*:\s*([^\n.;]{2,120})/i);
  if (porRotulo) return limparTexto(porRotulo[1], 120);
  const porPreposicao = trecho.match(/(?:,|\s)\b(?:na|no|ao|à|em)\s+([^\n.;]{2,120})/i);
  if (porPreposicao) return limparTexto(porPreposicao[1], 120);
  const porTravessao = trecho.match(/[—–-]\s*([^\n.;]{2,120})/);
  return porTravessao ? limparTexto(porTravessao[1], 120) : null;
}

function parseArtigoEventos(html, metadados, agora = new Date()) {
  const corpo = textoArtigo(html);
  const titulo = limparTexto(metadados?.titulo, 120);
  const fonteBase = urlOficial(metadados?.link);
  const publicadoEm = metadados?.publicadoEm instanceof Date && !Number.isNaN(metadados.publicadoEm.getTime())
    ? metadados.publicadoEm
    : agora;
  if (!corpo || !titulo || !fonteBase || !PALAVRAS_EVENTO.test(`${titulo} ${metadados?.resumo || ''} ${corpo.slice(0, 1500)}`)) return [];

  const anoPadrao = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(publicadoEm));
  const eventos = [];
  const datasVistas = new Set();
  const padraoData = /\b(?:dia\s+)?(\d{1,2})\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?/giu;

  const datasExplicitas = [...corpo.matchAll(padraoData)].map(match => ({
    match,
    index: match.index,
    dia: Number(match[1]),
    mes: MESES[match[2].toLowerCase()],
    ano: Number(match[3] || anoPadrao),
  }));
  const datasParciais = [...corpo.matchAll(/\b(?:no\s+)?dia\s+(\d{1,2})(?!\s+de\b)/giu)].map(match => {
    const proxima = datasExplicitas.find(data => data.index > match.index && data.index - match.index <= 400);
    const anterior = [...datasExplicitas].reverse().find(data => data.index < match.index && match.index - data.index <= 400);
    const referencia = proxima || anterior;
    return referencia ? {
      match,
      index: match.index,
      dia: Number(match[1]),
      mes: referencia.mes,
      ano: referencia.ano,
    } : null;
  }).filter(Boolean);
  const datas = [...datasExplicitas, ...datasParciais].sort((a, b) => a.index - b.index);

  for (let indice = 0; indice < datas.length; indice += 1) {
    const dataCandidata = datas[indice];
    const { dia, mes, ano } = dataCandidata;
    const trechoAntes = corpo.slice(Math.max(0, dataCandidata.index - 30), dataCandidata.index);
    const proximaData = datas[indice + 1]?.index ?? Number.POSITIVE_INFINITY;
    const proximaQuebraRelativa = corpo.slice(dataCandidata.index).indexOf('\n');
    const proximaQuebra = proximaQuebraRelativa < 0 ? Number.POSITIVE_INFINITY : dataCandidata.index + proximaQuebraRelativa;
    const fimTrecho = Math.min(dataCandidata.index + 260, proximaData, proximaQuebra);
    const trecho = corpo.slice(dataCandidata.index, fimTrecho);
    const horario = extrairHorario(trecho);
    let localNome = localAposData(trecho);

    if (!localNome) {
      const blocoServico = corpo.slice(Math.max(0, dataCandidata.index - 180), dataCandidata.index + 420);
      if (/(?:^|\n)\s*(?:Data|Horário|Local)\s*:/i.test(blocoServico)) localNome = localAposData(blocoServico);
    }
    if (!horario.encontrado || !localNome) continue;

    const inicio = dataSaoPaulo(ano, mes, dia, horario.hora, horario.minuto);
    if (!dentroDaJanela(inicio, agora)) continue;
    const chaveData = inicio.toISOString();
    if (datasVistas.has(chaveData)) continue;
    datasVistas.add(chaveData);

    const fim = horario.fimHora == null ? null : dataSaoPaulo(ano, mes, dia, horario.fimHora, horario.fimMinuto);
    const fonteUrl = `${fonteBase.split('#')[0]}#evento-${inicio.toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
    const contexto = limparTexto(`${trechoAntes}${trecho}`, 700);
    const gratuito = /gratuit|entrada livre|aberto a todos|audi[eê]ncias? p[uú]blicas?/i.test(`${titulo} ${corpo} ${metadados?.resumo || ''}`);
    const evento = criarEvento({
      titulo,
      descricao: contexto,
      inicio,
      fim,
      localNome,
      endereco: null,
      fonteUrl,
      gratuito,
    });
    if (evento) eventos.push(evento);
  }

  return eventos;
}

async function buscarTexto(url, fetchImpl) {
  const resposta = await fetchImpl(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9',
      'user-agent': USER_AGENT,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!resposta.ok) throw new Error(`Fonte respondeu HTTP ${resposta.status}: ${url}`);
  const tamanho = Number(resposta.headers.get('content-length') || 0);
  if (tamanho > MAX_RESPOSTA_BYTES) throw new Error(`Fonte excedeu ${MAX_RESPOSTA_BYTES} bytes: ${url}`);
  const texto = await resposta.text();
  if (Buffer.byteLength(texto, 'utf8') > MAX_RESPOSTA_BYTES) throw new Error(`Fonte excedeu ${MAX_RESPOSTA_BYTES} bytes: ${url}`);
  return texto;
}

async function coletarCalendario(agora, fetchImpl) {
  const referencias = [];
  for (let deslocamento = 0; deslocamento < 4; deslocamento += 1) {
    const referencia = new Date(agora);
    referencia.setUTCDate(1);
    referencia.setUTCMonth(referencia.getUTCMonth() + deslocamento);
    referencias.push({ mes: referencia.getUTCMonth() + 1, ano: referencia.getUTCFullYear() });
  }

  const candidatos = [];
  for (const referencia of referencias) {
    const url = `${BASE_URL}/eventos?mes=${referencia.mes}&ano=${referencia.ano}`;
    const html = await buscarTexto(url, fetchImpl);
    candidatos.push(...parseListaCalendario(html, agora));
  }

  const eventos = [];
  for (const candidato of candidatos) {
    const detalheHtml = await buscarTexto(candidato.fonteUrl, fetchImpl);
    const detalhe = parseDetalheCalendario(detalheHtml);
    const evento = criarEvento({
      titulo: candidato.titulo,
      descricao: detalhe.descricao,
      inicio: candidato.inicio,
      fim: candidato.fim,
      localNome: detalhe.localNome,
      endereco: detalhe.endereco,
      fonteUrl: candidato.fonteUrl,
      gratuito: detalhe.gratuito,
    });
    if (evento) eventos.push(evento);
  }
  return eventos;
}

async function coletarNoticias(agora, fetchImpl) {
  const feed = parseFeed(await buscarTexto(FEED_URL, fetchImpl));
  const limitePublicacao = new Date(agora);
  limitePublicacao.setDate(limitePublicacao.getDate() - 45);
  const candidatos = feed
    .filter(item => item.publicadoEm >= limitePublicacao && PALAVRAS_EVENTO.test(`${item.titulo} ${item.resumo}`))
    .slice(0, 20);

  const eventos = [];
  for (const candidato of candidatos) {
    const html = `<article class="post-text">${candidato.conteudoHtml || ''}</article>`;
    eventos.push(...parseArtigoEventos(html, candidato, agora));
  }
  return eventos;
}

async function coletarEventosSaoJoaoSemSalvar({ fetchImpl = fetch, agora = new Date() } = {}) {
  const falhas = [];
  const calendario = [];
  let noticias = [];

  try {
    noticias = await coletarNoticias(agora, fetchImpl);
  } catch (error) {
    falhas.push({ fonte: 'noticias', erro: error.message });
    console.error('[eventos:sao-joao] Falha no feed oficial', error);
  }

  if (falhas.length) throw new Error(`A fonte oficial falhou: ${falhas.map(item => item.erro).join('; ')}`);
  return { eventos: [...calendario, ...noticias], calendario: calendario.length, noticias: noticias.length, falhas };
}

function normalizarEventosRecebidos(eventos, agora = new Date()) {
  if (!Array.isArray(eventos) || eventos.length > 100) throw new Error('Carga de eventos inválida');

  return eventos.map(evento => {
    const inicio = new Date(evento?.inicio_em);
    const fim = evento?.fim_em ? new Date(evento.fim_em) : null;
    if (!dentroDaJanela(inicio, agora)) throw new Error('Evento recebido fora da janela permitida');
    if (fim && (Number.isNaN(fim.getTime()) || fim < inicio)) throw new Error('Término de evento inválido');
    const normalizado = criarEvento({
      titulo: evento?.titulo,
      descricao: evento?.descricao,
      inicio,
      fim,
      localNome: evento?.local_nome,
      endereco: evento?.endereco,
      fonteUrl: evento?.fonte_url,
      gratuito: evento?.gratuito === true,
    });
    if (!normalizado) throw new Error('Evento recebido possui campos inválidos');
    return normalizado;
  });
}

async function salvarEventos(supabase, eventos, agora = new Date()) {
  const porId = [...new Map(eventos.map(evento => [evento.id, evento])).values()];
  const unicos = [...new Map(porId.map(evento => [
    `${evento.inicio_em}|${removerAcentos(evento.local_nome)}`,
    evento,
  ])).values()];
  if (!unicos.length) return { encontrados: 0, inseridos: 0, atualizados: 0, preservados: 0 };

  const ids = unicos.map(evento => evento.id);
  const { data: existentes, error: consultaError } = await supabase
    .from('eventos')
    .select('id, status, verificado_em')
    .in('id', ids);
  if (consultaError) throw new Error(`Falha ao consultar eventos existentes: ${consultaError.message}`);

  const existentesPorId = new Map((existentes || []).map(evento => [evento.id, evento]));
  const verificadoEm = agora.toISOString();
  const linhas = unicos.map(evento => {
    const existente = existentesPorId.get(evento.id);
    const preservarModeracao = existente && ['rejeitado', 'cancelado'].includes(existente.status);
    return {
      ...evento,
      status: preservarModeracao ? existente.status : 'aprovado',
      verificado_em: preservarModeracao ? existente.verificado_em : verificadoEm,
      atualizado_em: verificadoEm,
    };
  });

  const { error: upsertError } = await supabase.from('eventos').upsert(linhas, { onConflict: 'id' });
  if (upsertError) throw new Error(`Falha ao salvar eventos: ${upsertError.message}`);

  return {
    encontrados: linhas.length,
    inseridos: linhas.filter(evento => !existentesPorId.has(evento.id)).length,
    atualizados: linhas.filter(evento => existentesPorId.has(evento.id)).length,
    preservados: linhas.filter(evento => ['rejeitado', 'cancelado'].includes(evento.status)).length,
  };
}

async function coletarEventosSaoJoao({ supabase, fetchImpl = fetch, agora = new Date() }) {
  const coleta = await coletarEventosSaoJoaoSemSalvar({ fetchImpl, agora });
  const resultado = await salvarEventos(supabase, coleta.eventos, agora);
  return { ...resultado, calendario: coleta.calendario, noticias: coleta.noticias, falhas: coleta.falhas };
}

module.exports = {
  BASE_URL,
  CIDADE,
  FEED_URL,
  USER_AGENT,
  categoriaEvento,
  coletarEventosSaoJoao,
  coletarEventosSaoJoaoSemSalvar,
  normalizarEventosRecebidos,
  parseArtigoEventos,
  parseDetalheCalendario,
  parseFeed,
  parseListaCalendario,
  salvarEventos,
  textoArtigo,
  uuidDeterministico,
};
