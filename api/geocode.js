const { normalizarCep, normalizarTexto } = require('../lib/localizacao');
const { enforceBodyLimit, noStore } = require('../lib/api-security');

const JANELA_MS = 60 * 1000;
const LIMITE_POR_JANELA = 10;
const CACHE_MS = 24 * 60 * 60 * 1000;
const acessos = new Map();
const cache = new Map();
let proximaConsultaEm = 0;

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
    .split(',')[0].trim();
  if (!consumirLimite(ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto.' });
  try {
    if (req.body?.action === 'address_search') return responderBuscaEndereco(req, res);
    if (req.body?.action === 'reverse') return responderReverso(req, res);
    return responderDireto(req, res);
  } catch (error) {
    console.error('Geocode error:', error);
    return res.status(502).json({ error: 'Servico de localizacao indisponivel' });
  }
};

async function responderBuscaEndereco(req, res) {
  const uf = limpar(req.body?.uf, 2).toUpperCase();
  const cidade = limpar(req.body?.cidade, 100);
  const rua = limpar(req.body?.rua, 140);
  if (!/^[A-Z]{2}$/.test(uf) || cidade.length < 3 || rua.length < 3) {
    return res.status(400).json({ error: 'Informe estado, cidade e pelo menos 3 letras da rua ou bairro.' });
  }
  const chave = `viacep:${uf}|${cidade.toLowerCase()}|${rua.toLowerCase()}`;
  const salvo = cache.get(chave);
  if (salvo && Date.now() - salvo.em < CACHE_MS) return res.json({ addresses: salvo.valor });
  const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(cidade)}/${encodeURIComponent(rua)}/json/`;
  const resposta = await fetch(url, { headers: { 'User-Agent': 'VizinhoCerto/1.0' } });
  if (!resposta.ok) throw new Error(`ViaCEP respondeu ${resposta.status}`);
  const dados = await resposta.json();
  const addresses = (Array.isArray(dados) ? dados : []).slice(0, 20).map(item => ({
    cep: String(item.cep || '').replace(/\D/g, '').slice(0, 8),
    rua: limpar(item.logradouro, 140), bairro: limpar(item.bairro, 100),
    cidade: limpar(item.localidade, 100), uf: limpar(item.uf, 2).toUpperCase(),
  })).filter(item => item.rua && item.cidade && item.uf);
  cache.set(chave, { em: Date.now(), valor: addresses });
  return res.json({ addresses });
}

async function responderDireto(req, res) {
  const entrada = {
    rua: limpar(req.body?.rua, 140), numero: limpar(req.body?.numero, 20),
    cidade: limpar(req.body?.cidade, 100), uf: limpar(req.body?.uf, 2).toUpperCase(),
    cep: String(req.body?.cep || '').replace(/\D/g, '').slice(0, 8),
  };
  if (!entrada.rua || !entrada.cidade || !/^[A-Z]{2}$/.test(entrada.uf)) {
    return res.status(400).json({ error: 'Endereco incompleto' });
  }
  const resultados = await consultarNominatim('search', {
    street: `${entrada.numero ? `${entrada.numero} ` : ''}${entrada.rua}`,
    city: entrada.cidade, state: entrada.uf, country: 'Brasil', countrycodes: 'br',
    addressdetails: '1', limit: '5',
  });
  let item = (resultados || []).find(resultado => resultadoValido(resultado, entrada.cidade, entrada.uf));
  let precisao = classificarPrecisao(item, entrada.numero);
  if (!item && entrada.numero) {
    const porRua = await consultarNominatim('search', {
      street: entrada.rua, city: entrada.cidade, state: entrada.uf,
      country: 'Brasil', countrycodes: 'br', addressdetails: '1', limit: '5',
    });
    item = (porRua || []).find(resultado => resultadoValido(resultado, entrada.cidade, entrada.uf));
    precisao = item ? 'street' : 'unknown';
  }
  if (!item && entrada.cep) {
    const porCep = await consultarNominatim('search', {
      postalcode: formatarCep(entrada.cep), city: entrada.cidade, state: entrada.uf,
      country: 'Brasil', countrycodes: 'br', addressdetails: '1', limit: '5',
    });
    item = (porCep || []).find(resultado => resultadoValido(resultado, entrada.cidade, entrada.uf));
    precisao = item ? 'postal_code' : 'unknown';
  }
  if (!item) return res.status(404).json({ error: 'Endereco nao localizado' });
  return res.json(normalizarResultado(item, precisao, entrada.numero));
}

async function responderReverso(req, res) {
  const lat = Number(req.body?.lat), lon = Number(req.body?.lon), accuracy = Number(req.body?.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)
    || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Coordenadas invalidas' });
  }
  const item = await consultarNominatim('reverse', {
    lat: String(lat), lon: String(lon), zoom: '18', addressdetails: '1',
  });
  if (!item || item.address?.country_code !== 'br') return res.status(404).json({ error: 'Endereco nao localizado' });
  return res.json({
    ...normalizarResultado(item, 'gps', item.address?.house_number || ''), lat, lon,
    accuracy_m: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
  });
}

async function consultarNominatim(rota, parametros) {
  const chave = `${rota}:${JSON.stringify(parametros)}`;
  const salvo = cache.get(chave);
  if (salvo && Date.now() - salvo.em < CACHE_MS) return salvo.valor;
  const espera = Math.max(0, proximaConsultaEm - Date.now());
  if (espera) await new Promise(resolve => setTimeout(resolve, espera));
  proximaConsultaEm = Date.now() + 1100;
  const url = new URL(`https://nominatim.openstreetmap.org/${rota}`);
  for (const [nome, valor] of Object.entries(parametros)) url.searchParams.set(nome, valor);
  url.searchParams.set('format', 'jsonv2');
  const resposta = await fetch(url, { headers: {
    'Accept-Language': 'pt-BR',
    'User-Agent': 'VizinhoCerto/1.0 (https://www.vizinhocerto.com.br; contato: vizinhocerto1@gmail.com)',
  }});
  if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`);
  const valor = await resposta.json();
  cache.set(chave, { em: Date.now(), valor });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return valor;
}

function normalizarResultado(item, precision, numeroEsperado) {
  const endereco = item.address || {}, numeroEncontrado = limpar(endereco.house_number, 20);
  return {
    lat: Number(item.lat), lon: Number(item.lon), precision,
    confirmed_number: Boolean(numeroEsperado && numeroEncontrado
      && normalizarTexto(numeroEsperado) === normalizarTexto(numeroEncontrado)),
    address: {
      rua: limpar(endereco.road || endereco.pedestrian || endereco.residential, 140),
      numero: numeroEncontrado,
      bairro: limpar(endereco.suburb || endereco.neighbourhood || endereco.city_district, 100),
      cidade: limpar(endereco.city || endereco.town || endereco.municipality || endereco.village, 100),
      uf: limpar(String(endereco['ISO3166-2-lvl4'] || '').replace(/^BR-/i, ''), 2).toUpperCase(),
      cep: normalizarCep(endereco.postcode),
    },
  };
}

function classificarPrecisao(item, numeroEsperado) {
  if (!item) return 'unknown';
  const encontrado = limpar(item.address?.house_number, 20);
  if (numeroEsperado && encontrado
    && normalizarTexto(numeroEsperado) === normalizarTexto(encontrado)) return 'number';
  if (item.type === 'house' || item.addresstype === 'building') return 'rooftop';
  return 'street';
}

function limpar(valor, limite) { return String(valor || '').trim().slice(0, limite); }
function consumirLimite(chave) {
  const agora = Date.now(), atual = acessos.get(chave);
  if (!atual || agora - atual.inicio >= JANELA_MS) {
    acessos.set(chave, { inicio: agora, total: 1 }); return true;
  }
  if (atual.total >= LIMITE_POR_JANELA) return false;
  atual.total += 1; return true;
}
function resultadoValido(resultado, cidade, uf) {
  const endereco = resultado?.address || {};
  if (endereco.country_code !== 'br') return false;
  const isoUf = String(endereco['ISO3166-2-lvl4'] || '').toUpperCase();
  if (isoUf && isoUf !== `BR-${uf}`) return false;
  const esperado = normalizarTexto(cidade);
  const localidades = [endereco.city, endereco.town, endereco.municipality, endereco.village]
    .map(normalizarTexto).filter(Boolean);
  return Boolean(esperado && localidades.includes(esperado));
}
function formatarCep(cep) {
  const digitos = normalizarCep(cep);
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}
