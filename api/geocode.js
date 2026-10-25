const { normalizarCep, normalizarTexto } = require('../lib/localizacao');
const { enforceBodyLimit, noStore } = require('../lib/api-security');

const JANELA_MS = 60 * 1000;
const LIMITE_POR_JANELA = 10;
const acessos = new Map();

const ORIGENS_PERMITIDAS = new Set([
  'https://vizinho-certo.vercel.app',
  'https://vizinhocerto.com.br',
  'https://www.vizinhocerto.com.br',
]);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);
  if (!enforceBodyLimit(req, res, 8 * 1024)) return;

  const origem = String(req.headers.origin || '');
  const origemLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
  if (origem && !origemLocal && !ORIGENS_PERMITIDAS.has(origem)) {
    return res.status(403).json({ error: 'Origem nao permitida' });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'desconhecido')
    .split(',')[0]
    .trim();
  if (!consumirLimite(ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto.' });

  const rua = limpar(req.body?.rua, 140);
  const numero = limpar(req.body?.numero, 20);
  const cidade = limpar(req.body?.cidade, 100);
  const uf = limpar(req.body?.uf, 2).toUpperCase();
  const cep = String(req.body?.cep || '').replace(/\D/g, '').slice(0, 8);
  if (!rua || !cidade || !/^[A-Z]{2}$/.test(uf)) {
    return res.status(400).json({ error: 'Endereco incompleto' });
  }

  try {
    const resultado = await buscarEndereco({ rua, numero, cidade, uf });
    if (!resultado && numero) {
      const aproximado = await buscarEndereco({ rua, numero: '', cidade, uf });
      if (aproximado) return res.json({ ...aproximado, precision: 'street' });
    }
    if (cep) {
      const aproximadoCep = await buscarCep({ cep, cidade, uf });
      if (aproximadoCep) return res.json({ ...aproximadoCep, precision: 'cep' });
    }
    if (!resultado) return res.status(404).json({ error: 'Endereco nao localizado' });
    return res.json({ ...resultado, precision: numero ? 'number' : 'street' });
  } catch (error) {
    console.error('Geocode error:', error);
    return res.status(502).json({ error: 'Servico de localizacao indisponivel' });
  }
};

function limpar(valor, limite) {
  return String(valor || '').trim().slice(0, limite);
}

function consumirLimite(chave) {
  const agora = Date.now();
  const atual = acessos.get(chave);
  if (!atual || agora - atual.inicio >= JANELA_MS) {
    acessos.set(chave, { inicio: agora, total: 1 });
    return true;
  }
  if (atual.total >= LIMITE_POR_JANELA) return false;
  atual.total += 1;
  return true;
}

async function buscarEndereco({ rua, numero, cidade, uf }) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('street', `${numero ? `${numero} ` : ''}${rua}`);
  url.searchParams.set('city', cidade);
  url.searchParams.set('state', uf);
  url.searchParams.set('country', 'Brasil');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '3');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('addressdetails', '1');

  const resposta = await fetch(url, {
    headers: {
      'Accept-Language': 'pt-BR',
      'User-Agent': 'VizinhoCerto/1.0 (https://vizinho-certo.vercel.app)',
    },
  });
  if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`);

  const dados = await resposta.json();
  const item = (dados || []).find(resultado => resultadoValido(resultado, cidade, uf));
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function buscarCep({ cep, cidade, uf }) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('postalcode', formatarCep(cep));
  url.searchParams.set('city', cidade);
  url.searchParams.set('state', uf);
  url.searchParams.set('country', 'Brasil');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '3');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('addressdetails', '1');

  const resposta = await fetch(url, {
    headers: {
      'Accept-Language': 'pt-BR',
      'User-Agent': 'VizinhoCerto/1.0 (https://vizinho-certo.vercel.app)',
    },
  });
  if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`);
  const dados = await resposta.json();
  const item = (dados || []).find(resultado =>
    resultadoValido(resultado, cidade, uf)
    && normalizarCep(resultado.address?.postcode) === normalizarCep(cep));
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function resultadoValido(resultado, cidade, uf) {
  const endereco = resultado?.address || {};
  if (endereco.country_code !== 'br') return false;
  const isoUf = String(endereco['ISO3166-2-lvl4'] || '').toUpperCase();
  if (isoUf && isoUf !== `BR-${uf}`) return false;

  const esperado = normalizarTexto(cidade);
  const localidades = [endereco.city, endereco.town, endereco.municipality, endereco.village]
    .map(normalizarTexto)
    .filter(Boolean);
  return Boolean(esperado && localidades.includes(esperado));
}

function formatarCep(cep) {
  const digitos = normalizarCep(cep);
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}
