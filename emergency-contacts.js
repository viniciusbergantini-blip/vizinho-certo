(function initEmergencyContacts(globalScope, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalScope) globalScope.VizinhoCertoEmergencyContacts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEmergencyContacts() {
  const MUNICIPAL_CONTACTS = Object.freeze({
    'SP|INDAIATUBA': Object.freeze({
      kind: 'guard',
      icon: '🛡️',
      name: 'Guarda Civil de Indaiatuba',
      phone: '153',
      description: 'Emergência municipal — Indaiatuba/SP',
      source: 'https://gc.indaiatuba.sp.gov.br/estrutura.html',
      verifiedAt: '2026-11-03',
    }),
    'PR|MARINGA': Object.freeze({
      kind: 'guard',
      icon: '🛡️',
      name: 'Guarda Municipal de Maringá',
      phone: '153',
      description: 'Emergência municipal — Maringá/PR',
      source: 'https://previdencia.maringa.pr.gov.br/noticias/733',
      verifiedAt: '2026-11-03',
    }),
    'PR|LONDRINA': Object.freeze({
      kind: 'guard',
      icon: '🛡️',
      name: 'Guarda Municipal de Londrina',
      phone: '153',
      description: 'Atendimento de ocorrências 24h — Londrina/PR',
      source: 'https://portal.londrina.pr.gov.br/localizacao-contatos-defesa-social',
      verifiedAt: '2026-11-03',
    }),
    'SP|SAO JOAO DA BOA VISTA': Object.freeze({
      kind: 'municipal',
      icon: '🏛️',
      name: 'Ouvidoria de São João da Boa Vista',
      phone: '08007730156',
      displayPhone: '0800 773 0156',
      description: 'Serviços municipais, das 8h às 17h — não substitui emergência',
      source: 'https://www.saojoao.sp.gov.br/cidadao/ouvidoria',
      verifiedAt: '2026-11-03',
    }),
  });

  function normalizeCity(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }

  function normalizeUf(value) {
    return String(value || '').trim().toUpperCase().slice(0, 2);
  }

  function getMunicipalContact(city, uf) {
    const key = `${normalizeUf(uf)}|${normalizeCity(city)}`;
    return MUNICIPAL_CONTACTS[key] || null;
  }

  return Object.freeze({
    getMunicipalContact,
    normalizeCity,
  });
});
