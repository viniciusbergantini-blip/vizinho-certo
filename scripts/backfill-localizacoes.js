const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { coordenadasValidas, normalizarCep, normalizarTexto } = require('../lib/localizacao');

carregarEnvLocal();

const aplicar = process.argv.includes('--apply');
const limiteArg = process.argv.find(item => item.startsWith('--limit='));
const limite = limiteArg ? Math.max(1, Number(limiteArg.split('=')[1]) || 1) : Infinity;
const supabaseUrl = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY nao configurada');

const sb = createClient(supabaseUrl, serviceKey);

async function executar() {
  const { data: usuarios, error } = await sb
    .from('usuarios')
    .select('id, rua, numero, cidade, uf, cep, lat, lon')
    .order('id');
  if (error) throw error;

  const candidatos = (usuarios || [])
    .filter(usuario => !coordenadasValidas(usuario))
    .filter(usuario => usuario.rua && usuario.cidade && usuario.uf)
    .slice(0, limite);

  const resumo = {
    modo: aplicar ? 'apply' : 'dry-run',
    usuarios_sem_coordenadas: (usuarios || []).filter(usuario => !coordenadasValidas(usuario)).length,
    candidatos: candidatos.length,
    atualizados: 0,
    nao_localizados: 0,
    erros: 0,
    anuncios_atualizados: 0,
  };

  if (!aplicar) {
    console.log(JSON.stringify(resumo, null, 2));
    return;
  }

  for (let indice = 0; indice < candidatos.length; indice++) {
    const usuario = candidatos[indice];
    try {
      const coordenadas = await geocodificar(usuario);
      if (!coordenadas) {
        resumo.nao_localizados += 1;
        console.log(`[${indice + 1}/${candidatos.length}] ${prefixo(usuario.id)} nao localizado`);
      } else {
        const { error: updateError } = await sb
          .from('usuarios')
          .update({ lat: coordenadas.lat, lon: coordenadas.lon })
          .eq('id', usuario.id);
        if (updateError) throw updateError;
        resumo.atualizados += 1;
        console.log(`[${indice + 1}/${candidatos.length}] ${prefixo(usuario.id)} atualizado (${coordenadas.precision})`);
      }
    } catch (erro) {
      resumo.erros += 1;
      console.error(`[${indice + 1}/${candidatos.length}] ${prefixo(usuario.id)} erro: ${erro.message}`);
    }
    if (indice < candidatos.length - 1) await esperar(1100);
  }

  resumo.anuncios_atualizados = await atualizarAnuncios();
  console.log(JSON.stringify(resumo, null, 2));
}

async function geocodificar(usuario) {
  const exato = await consultarNominatim(usuario, true);
  if (exato) return { ...exato, precision: 'number' };
  await esperar(1100);
  const rua = await consultarNominatim(usuario, false);
  if (rua) return { ...rua, precision: 'street' };
  if (!usuario.cep) return null;
  await esperar(1100);
  const cep = await consultarCep(usuario);
  return cep ? { ...cep, precision: 'cep' } : null;
}

async function consultarNominatim(usuario, incluirNumero) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('street', `${incluirNumero && usuario.numero ? `${usuario.numero} ` : ''}${usuario.rua}`);
  url.searchParams.set('city', usuario.cidade);
  url.searchParams.set('state', usuario.uf);
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
  const item = (dados || []).find(resultado => resultadoValido(resultado, usuario));
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (!coordenadaBrasil(lat, lon)) return null;
  return { lat, lon };
}

async function consultarCep(usuario) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('postalcode', formatarCep(usuario.cep));
  url.searchParams.set('city', usuario.cidade);
  url.searchParams.set('state', usuario.uf);
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
    resultadoValido(resultado, usuario)
    && normalizarCep(resultado.address?.postcode) === normalizarCep(usuario.cep));
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (!coordenadaBrasil(lat, lon)) return null;
  return { lat, lon };
}

function resultadoValido(resultado, usuario) {
  const endereco = resultado?.address || {};
  if (endereco.country_code !== 'br') return false;
  const isoUf = String(endereco['ISO3166-2-lvl4'] || '').toUpperCase();
  if (isoUf && isoUf !== `BR-${String(usuario.uf).toUpperCase()}`) return false;
  const esperado = normalizarTexto(usuario.cidade);
  const localidades = [endereco.city, endereco.town, endereco.municipality, endereco.village]
    .map(normalizarTexto)
    .filter(Boolean);
  return Boolean(esperado && localidades.includes(esperado));
}

function formatarCep(cep) {
  const digitos = normalizarCep(cep);
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

async function atualizarAnuncios() {
  const { data: anuncios, error } = await sb
    .from('anuncios')
    .select('id, usuario_id, lat, lon')
    .or('lat.is.null,lon.is.null');
  if (error) throw error;

  let atualizados = 0;
  for (const anuncio of anuncios || []) {
    if (!anuncio.usuario_id) continue;
    const { data: usuario, error: usuarioError } = await sb
      .from('usuarios')
      .select('lat, lon')
      .eq('id', anuncio.usuario_id)
      .maybeSingle();
    if (usuarioError) throw usuarioError;
    if (!coordenadasValidas(usuario)) continue;

    const { error: updateError } = await sb
      .from('anuncios')
      .update({ lat: usuario.lat, lon: usuario.lon })
      .eq('id', anuncio.id);
    if (updateError) throw updateError;
    atualizados += 1;
  }
  return atualizados;
}

function coordenadaBrasil(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -34 && lat <= 6
    && lon >= -74 && lon <= -34;
}

function prefixo(id) {
  return `${String(id).slice(0, 8)}...`;
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function carregarEnvLocal() {
  const arquivo = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    if (!/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(linha)) continue;
    const indice = linha.indexOf('=');
    const chave = linha.slice(0, indice).trim();
    const valor = linha.slice(indice + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

executar().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
