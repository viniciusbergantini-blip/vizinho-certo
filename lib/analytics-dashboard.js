const EVENTOS = new Set(['landing_view', 'cta_click', 'signup_started', 'signup_completed']);

function buildWindow(events, start, end) {
  const scoped = events.filter(event => {
    const createdAt = new Date(event.created_at);
    return (!start || createdAt >= start) && createdAt <= end;
  });

  const porSessao = new Map();
  for (const event of [...scoped].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
    if (!event.session_id) continue;
    if (!porSessao.has(event.session_id)) porSessao.set(event.session_id, []);
    porSessao.get(event.session_id).push(event);
  }

  const visitantes = sessions(scoped, 'landing_view');
  const cliques = sessions(scoped, 'cta_click');
  const cadastros = sessions(scoped, 'signup_completed');
  const acessoDaConversao = new Map();
  const acessosConvertidos = new Set();

  for (const sessionId of cadastros) {
    const eventosSessao = porSessao.get(sessionId) || [];
    let acesso = null;
    for (const cadastro of eventosSessao.filter(event => event.event_type === 'signup_completed')) {
      acesso = eventosSessao
        .filter(event => event.event_type === 'landing_view' && new Date(event.created_at) <= new Date(cadastro.created_at))
        .at(-1);
      if (acesso) break;
    }
    if (!acesso) continue;
    acessoDaConversao.set(sessionId, acesso);
    acessosConvertidos.add(acesso);
  }

  const conversoes = new Set(acessoDaConversao.keys());
  const naoCadastrados = difference(visitantes, conversoes);
  const links = new Map();

  for (const acesso of scoped.filter(event => event.event_type === 'landing_view')) {
    const sessionId = acesso.session_id;
    const link = linkDoEvento(acesso);
    if (!links.has(link)) {
      links.set(link, {
        link,
        visitors: new Set(),
        cta_clicks: new Set(),
        conversions: new Set(),
        locations: new Map(),
        campaign: campanhaDoEvento(acesso),
      });
    }

    const item = links.get(link);
    const novoVisitanteDoLink = !item.visitors.has(sessionId);
    item.visitors.add(sessionId);
    if (novoVisitanteDoLink) {
      const location = localizacaoDoEvento(acesso);
      item.locations.set(location, (item.locations.get(location) || 0) + 1);
    }
  }

  for (const event of scoped.filter(item => item.event_type === 'cta_click')) {
    links.get(linkDoEvento(event))?.cta_clicks.add(event.session_id);
  }

  for (const [sessionId, acesso] of acessoDaConversao) {
    links.get(linkDoEvento(acesso))?.conversions.add(sessionId);
  }

  const linkRows = [...links.values()]
    .map(item => ({
      link: item.link,
      campaign: item.campaign,
      visitors: item.visitors.size,
      cta_clicks: item.cta_clicks.size,
      conversions: item.conversions.size,
      conversion_rate: rate(item.conversions.size, item.visitors.size),
      locations: [...item.locations.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, total]) => ({ label, total })),
    }))
    .sort((a, b) => b.visitors - a.visitors || a.link.localeCompare(b.link))
    .slice(0, 100);

  const accesses = scoped
    .filter(event => event.event_type === 'landing_view')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 200)
    .map(event => ({
      occurred_at: event.created_at,
      visitor: rotuloVisitante(event.session_id),
      link: linkDoEvento(event),
      location: localizacaoDoEvento(event),
      campaign: campanhaDoEvento(event),
      converted: acessosConvertidos.has(event),
    }));

  return {
    start: start ? start.toISOString() : null,
    end: end.toISOString(),
    totals: {
      visitors: visitantes.size,
      cta_clicks: cliques.size,
      signups: cadastros.size,
      conversions: conversoes.size,
      not_registered: naoCadastrados.size,
      direct_signups: difference(cadastros, conversoes).size,
      conversion_rate: rate(conversoes.size, visitantes.size),
      abandonment_rate: rate(naoCadastrados.size, visitantes.size),
    },
    links: linkRows,
    accesses,
  };
}

function sessions(events, type) {
  return new Set(events
    .filter(event => event.event_type === type)
    .map(event => event.session_id)
    .filter(Boolean));
}

function difference(a, b) {
  return new Set([...a].filter(item => !b.has(item)));
}

function rate(value, total) {
  return total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;
}

function linkDoEvento(event) {
  const metadata = event.metadata || {};
  return limitarTexto(metadata.link_url || event.path || '/', 300) || '/';
}

function campanhaDoEvento(event) {
  const metadata = event.metadata || {};
  const partes = [metadata.utm_source, metadata.utm_medium, metadata.utm_campaign]
    .map(item => limitarTexto(item, 80))
    .filter(Boolean);
  return partes.join(' / ') || 'Direto';
}

function localizacaoDoEvento(event) {
  const geo = event.metadata?.geo || {};
  const city = limitarTexto(geo.city, 100);
  const region = limitarTexto(geo.region, 100);
  const country = limitarTexto(geo.country, 100);
  const cityRegion = [city, region].filter(Boolean).join(' / ');
  return [cityRegion, country].filter(Boolean).join(' · ') || 'Localização indisponível';
}

function rotuloVisitante(sessionId) {
  let hash = 2166136261;
  for (const char of String(sessionId || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `#${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 8)}`;
}

function limitarTexto(value, max) {
  return String(value || '').trim().slice(0, max);
}

module.exports = {
  EVENTOS,
  buildWindow,
  campanhaDoEvento,
  linkDoEvento,
  localizacaoDoEvento,
  rotuloVisitante,
};
