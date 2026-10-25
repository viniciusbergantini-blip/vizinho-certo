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
  ['rua', { id: 'rua', nome: 'Plano Rua', dias: 10, centavos: 990, raio_km: 1.5, alcance_tipo: 'raio', destaque: false }],
  ['bairro', { id: 'bairro', nome: 'Plano Bairro', dias: 20, centavos: 1990, raio_km: 3, alcance_tipo: 'raio', destaque: true }],
  ['regiao', { id: 'regiao', nome: 'Plano Região', dias: 30, centavos: 2790, raio_km: 5, alcance_tipo: 'raio', destaque: true }],
  ['cidade', { id: 'cidade', nome: 'Plano Cidade', dias: 30, centavos: 3990, preco_referencia_centavos: 4990, raio_km: 0, alcance_tipo: 'cidade', destaque: true }],
]);

const PLANOS_LEGADOS_POR_DIAS = new Map([
  [10, 'rua'],
  [20, 'bairro'],
  [30, 'regiao'],
]);

function obterPlano(identificador) {
  const chaveDireta = String(identificador || '').trim().toLowerCase();
  if (PLANOS_ANUNCIO.has(chaveDireta)) return PLANOS_ANUNCIO.get(chaveDireta);
  const chaveLegada = PLANOS_LEGADOS_POR_DIAS.get(Number(identificador));
  return chaveLegada ? PLANOS_ANUNCIO.get(chaveLegada) : null;
}

module.exports = { ICONES_ANUNCIO, PLANOS_ANUNCIO, TIPOS_ANUNCIO, obterPlano };
