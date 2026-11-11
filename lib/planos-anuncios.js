const TIPOS_ANUNCIO = new Set([
  'Encanador',
  'Eletricista',
  'Portões Automáticos',
  'Alarmes e Cercas Elétricas',
  'Limpeza e Diarista',
  'Diarista',
  'Pintor',
  'Jardinagem',
  'Montagem e Reparos',
  'Ar-condicionado',
  'Assistência Técnica',
  'Beleza e Bem-estar',
  'Aulas e Reforço',
  'Cuidados',
  'Alimentação',
  'Transporte e Fretes',
  'Comércio Local',
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
  ['Portões Automáticos', '🚪'],
  ['Alarmes e Cercas Elétricas', '🔔'],
  ['Limpeza e Diarista', '🧹'],
  ['Diarista', '🧹'],
  ['Pintor', '🎨'],
  ['Jardinagem', '🌿'],
  ['Montagem e Reparos', '🔨'],
  ['Ar-condicionado', '❄️'],
  ['Assistência Técnica', '🔌'],
  ['Beleza e Bem-estar', '💇'],
  ['Aulas e Reforço', '📚'],
  ['Cuidados', '🤝'],
  ['Alimentação', '🍽️'],
  ['Transporte e Fretes', '🚚'],
  ['Comércio Local', '🏪'],
  ['Comércio', '🍕'],
  ['Costureira', '🧵'],
  ['Jardineiro', '🌿'],
  ['Pedreiro', '🏗️'],
  ['Marido de Aluguel', '🔨'],
  ['Anúncio', '🛒'],
  ['Outros Serviços', '🛠️'],
]);

const PLANOS_ANUNCIO = new Map([
  ['rua', { id: 'rua', play_product_id: 'anuncio_rua_10d', nome: 'Plano Rua', dias: 10, centavos: 990, raio_km: 1.5, alcance_tipo: 'raio', destaque: false }],
  ['bairro', { id: 'bairro', play_product_id: 'anuncio_bairro_20d', nome: 'Plano Bairro', dias: 20, centavos: 1990, raio_km: 3, alcance_tipo: 'raio', destaque: true }],
  ['regiao', { id: 'regiao', play_product_id: 'anuncio_regiao_30d', nome: 'Plano Região', dias: 30, centavos: 2790, raio_km: 5, alcance_tipo: 'raio', destaque: true }],
  ['cidade', { id: 'cidade', play_product_id: 'anuncio_cidade_30d', nome: 'Plano Cidade', dias: 30, centavos: 3990, raio_km: 0, alcance_tipo: 'cidade', destaque: true }],
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

function obterPlanoPorProdutoPlay(productId) {
  const procurado = String(productId || '').trim();
  return [...PLANOS_ANUNCIO.values()].find(plano => plano.play_product_id === procurado) || null;
}

module.exports = { ICONES_ANUNCIO, PLANOS_ANUNCIO, TIPOS_ANUNCIO, obterPlano, obterPlanoPorProdutoPlay };
