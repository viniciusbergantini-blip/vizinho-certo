const TIPOS_ANUNCIO = new Set([
  'Encanador',
  'Eletricista',
  'Diarista',
  'Comércio',
  'Costureira',
  'Jardineiro',
  'Pedreiro',
  'Marido de Aluguel',
  'Anúncio',
  'Outros Serviços',
]);

const ICONES_ANUNCIO = new Map([
  ['Encanador', '🔧'],
  ['Eletricista', '⚡'],
  ['Diarista', '🧹'],
  ['Comércio', '🍕'],
  ['Costureira', '🧵'],
  ['Jardineiro', '🌿'],
  ['Pedreiro', '🏗️'],
  ['Marido de Aluguel', '🔨'],
  ['Anúncio', '🛒'],
  ['Outros Serviços', '🛠️'],
]);

const PLANOS_ANUNCIO = new Map([
  [10, { centavos: 990, raio_km: 1.5, destaque: false }],
  [20, { centavos: 1990, raio_km: 3, destaque: true }],
  [30, { centavos: 2790, raio_km: 5, destaque: true }],
]);

function obterPlano(dias) {
  return PLANOS_ANUNCIO.get(Number(dias)) || null;
}

module.exports = { ICONES_ANUNCIO, PLANOS_ANUNCIO, TIPOS_ANUNCIO, obterPlano };
