const CATEGORIAS_EVENTO = Object.freeze([
  'Feira',
  'Show',
  'Cultura',
  'Esporte',
  'Infantil',
  'Gastronomia',
  'Curso',
  'Comunidade',
  'Outros',
]);

const PERIODOS_EVENTO = Object.freeze(['hoje', '7dias', '30dias']);

function limparTexto(valor, limite) {
  return String(valor ?? '').trim().replace(/\s+/g, ' ').slice(0, limite);
}

function limparTextoLongo(valor, limite) {
  return String(valor ?? '').trim().replace(/\r\n/g, '\n').slice(0, limite);
}

function normalizarPeriodo(valor) {
  return PERIODOS_EVENTO.includes(valor) ? valor : '7dias';
}

function inicioDoDiaSaoPaulo(data) {
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

function calcularJanela(periodo, agora = new Date()) {
  const normalizado = normalizarPeriodo(periodo);
  const inicio = normalizado === 'hoje' ? inicioDoDiaSaoPaulo(agora) : new Date(agora);
  const fim = new Date(inicio);

  if (normalizado === 'hoje') fim.setDate(fim.getDate() + 1);
  if (normalizado === '7dias') fim.setDate(fim.getDate() + 7);
  if (normalizado === '30dias') fim.setDate(fim.getDate() + 30);

  return { periodo: normalizado, inicio, fim };
}

function urlHttpSegura(valor) {
  const texto = limparTexto(valor, 500);
  if (!texto) return null;

  try {
    const url = new URL(texto);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function validarSugestaoEvento(body, agora = new Date()) {
  const titulo = limparTexto(body?.titulo, 120);
  const descricao = limparTextoLongo(body?.descricao, 1000);
  const categoria = limparTexto(body?.categoria, 40);
  const localNome = limparTexto(body?.local_nome, 120);
  const bairro = limparTexto(body?.bairro, 100);
  const endereco = limparTexto(body?.endereco, 180);
  const precoTexto = limparTexto(body?.preco_texto, 80);
  const fonteUrlInformada = limparTexto(body?.fonte_url, 500);
  const fonteUrl = urlHttpSegura(fonteUrlInformada);
  const gratuito = body?.gratuito !== false;
  const inicioEm = new Date(body?.inicio_em);
  const fimEm = body?.fim_em ? new Date(body.fim_em) : null;
  const erros = [];

  if (titulo.length < 3) erros.push('Informe um título com pelo menos 3 caracteres.');
  if (!CATEGORIAS_EVENTO.includes(categoria)) erros.push('Escolha uma categoria válida.');
  if (localNome.length < 2) erros.push('Informe o local do evento.');
  if (Number.isNaN(inicioEm.getTime())) erros.push('Informe uma data e horário válidos.');
  if (fonteUrlInformada && !fonteUrl) erros.push('O link da fonte deve começar com http:// ou https://.');
  if (!gratuito && !precoTexto) erros.push('Informe o valor ou como consultar o preço.');

  if (!Number.isNaN(inicioEm.getTime())) {
    const toleranciaPassado = new Date(agora.getTime() - (2 * 60 * 60 * 1000));
    const limiteFuturo = new Date(agora);
    limiteFuturo.setFullYear(limiteFuturo.getFullYear() + 1);
    if (inicioEm < toleranciaPassado) erros.push('O evento precisa começar agora ou no futuro.');
    if (inicioEm > limiteFuturo) erros.push('Cadastre eventos com até um ano de antecedência.');
  }

  if (fimEm) {
    if (Number.isNaN(fimEm.getTime())) erros.push('Informe um horário de término válido.');
    else if (!Number.isNaN(inicioEm.getTime()) && fimEm < inicioEm) erros.push('O término não pode ser anterior ao início.');
  }

  if (erros.length) return { ok: false, erros };

  return {
    ok: true,
    evento: {
      titulo,
      descricao,
      categoria,
      inicio_em: inicioEm.toISOString(),
      fim_em: fimEm ? fimEm.toISOString() : null,
      local_nome: localNome,
      bairro: bairro || null,
      endereco: endereco || null,
      gratuito,
      preco_texto: gratuito ? null : precoTexto,
      fonte_url: fonteUrl,
    },
  };
}

function eventoDentroDaJanela(evento, janela) {
  const inicio = new Date(evento.inicio_em);
  const fim = new Date(evento.fim_em || evento.inicio_em);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return false;
  return inicio < janela.fim && fim >= janela.inicio;
}

module.exports = {
  CATEGORIAS_EVENTO,
  PERIODOS_EVENTO,
  calcularJanela,
  eventoDentroDaJanela,
  normalizarPeriodo,
  urlHttpSegura,
  validarSugestaoEvento,
};
