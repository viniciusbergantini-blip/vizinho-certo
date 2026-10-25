function numeroFinito(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function coordenadasValidas(registro) {
  if (!registro) return false;
  return numeroFinito(registro.lat) !== null && numeroFinito(registro.lon) !== null;
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizarCep(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function mesmaRua(a, b) {
  const ruaA = normalizarTexto(a?.rua);
  const ruaB = normalizarTexto(b?.rua);
  const cepA = normalizarCep(a?.cep);
  const cepB = normalizarCep(b?.cep);

  return Boolean(ruaA && ruaB && cepA && cepB && ruaA === ruaB && cepA === cepB);
}

function mesmaCidade(a, b) {
  const cidadeA = normalizarTexto(a?.cidade);
  const cidadeB = normalizarTexto(b?.cidade);
  const ufA = String(a?.uf || '').trim().toUpperCase();
  const ufB = String(b?.uf || '').trim().toUpperCase();
  return Boolean(cidadeA && cidadeB && ufA && ufB && cidadeA === cidadeB && ufA === ufB);
}

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const valores = [lat1, lon1, lat2, lon2].map(numeroFinito);
  if (valores.some(valor => valor === null)) return null;

  const [aLat, aLon, bLat, bLon] = valores;
  const rad = Math.PI / 180;
  const raioTerraMetros = 6371000;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;

  return 2 * raioTerraMetros * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function avaliarVisibilidadeAnuncio({ anuncio, anunciante, visitante }) {
  if (!anuncio || !visitante) return { visivel: false, motivo: 'dados_incompletos' };

  if (anuncio.usuario_id && anuncio.usuario_id === visitante.id) {
    return { visivel: true, proximidade: 'proprio', distancia_metros: 0 };
  }

  if (anuncio.alcance_tipo === 'cidade') {
    const cidadeAlvo = {
      cidade: anuncio.cidade_alvo || anunciante?.cidade,
      uf: anuncio.uf_alvo || anunciante?.uf,
    };
    return mesmaCidade(cidadeAlvo, visitante)
      ? { visivel: true, proximidade: 'cidade', distancia_metros: null }
      : { visivel: false, motivo: 'fora_da_cidade' };
  }

  const origem = coordenadasValidas(anuncio) ? anuncio : anunciante;
  if (coordenadasValidas(origem) && coordenadasValidas(visitante)) {
    const distancia = distanciaMetros(origem.lat, origem.lon, visitante.lat, visitante.lon);
    const raioMetros = (numeroFinito(anuncio.raio_km) || 0) * 1000;
    return {
      visivel: distancia !== null && distancia <= raioMetros,
      proximidade: 'distancia',
      distancia_metros: distancia,
    };
  }

  if (mesmaRua(anunciante, visitante)) {
    return { visivel: true, proximidade: 'mesma_rua', distancia_metros: null };
  }

  return { visivel: false, motivo: 'localizacao_indisponivel' };
}

module.exports = {
  avaliarVisibilidadeAnuncio,
  coordenadasValidas,
  distanciaMetros,
  mesmaCidade,
  mesmaRua,
  normalizarCep,
  normalizarTexto,
  numeroFinito,
};
