const EVENTOS = new Set([
  'landing_view',
  'cta_click',
  'signup_started',
  'signup_completed',
  'onboarding_opened',
  'onboarding_completed',
  'install_guide_opened',
  'install_accepted',
  'app_opened_standalone',
  'notifications_enabled',
  'first_post_created',
  'registered_return',
  'activity_center_opened',
  'service_search_used',
  'signup_form_viewed',
  'signup_form_engaged',
  'signup_account_completed',
  'signup_account_back',
  'signup_submit',
  'signup_location_success',
  'signup_location_failed',
  'signup_auth_success',
  'signup_auth_failed',
  'existing_account_recovered',
  'password_recovery_requested',
  'profile_completed',
  'profile_failed',
]);
const EVENTOS_ADOCAO = new Set([
  'onboarding_opened',
  'onboarding_completed',
  'install_guide_opened',
  'install_accepted',
  'app_opened_standalone',
  'notifications_enabled',
  'first_post_created',
  'registered_return',
  'activity_center_opened',
  'service_search_used',
  'signup_form_viewed',
  'signup_form_engaged',
  'signup_account_completed',
  'signup_account_back',
  'signup_submit',
  'signup_location_success',
  'signup_location_failed',
  'signup_auth_success',
  'signup_auth_failed',
  'existing_account_recovered',
  'password_recovery_requested',
  'profile_completed',
  'profile_failed',
]);

function buildWindow(events, start, end) {
  const rawScoped = events.filter(event => {
    const createdAt = new Date(event.created_at);
    return (!start || createdAt >= start) && createdAt <= end;
  });
  const suspectedBots = sessions(rawScoped.filter(event => event.metadata?.traffic_quality === 'suspected_bot'), 'landing_view');
  const scoped = rawScoped.filter(event => event.metadata?.traffic_quality !== 'suspected_bot');

  const porSessao = new Map();
  for (const event of [...scoped].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
    if (!event.session_id) continue;
    if (!porSessao.has(event.session_id)) porSessao.set(event.session_id, []);
    porSessao.get(event.session_id).push(event);
  }

  const visitantes = sessions(scoped, 'landing_view');
  const cliques = sessions(scoped, 'cta_click');
  const cadastros = sessions(scoped, 'signup_completed');
  const onboardingAberto = sessions(scoped, 'onboarding_opened');
  const onboardingConcluido = sessions(scoped, 'onboarding_completed');
  const guiaInstalacao = sessions(scoped, 'install_guide_opened');
  const instalacoesAceitas = sessions(scoped, 'install_accepted');
  const retornosInstalados = sessions(scoped, 'app_opened_standalone');
  const notificacoesAtivadas = sessions(scoped, 'notifications_enabled');
  const primeirasPublicacoes = sessions(scoped, 'first_post_created');
  const retornosCadastrados = sessions(scoped, 'registered_return');
  const centralAtividade = sessions(scoped, 'activity_center_opened');
  const buscasServicos = sessions(scoped, 'service_search_used');
  const signupFormViewed = sessions(scoped, 'signup_form_viewed');
  const signupFormEngaged = sessions(scoped, 'signup_form_engaged');
  const signupAccountCompleted = sessions(scoped, 'signup_account_completed');
  const signupSubmits = sessions(scoped, 'signup_submit');
  const signupLocationSuccess = sessions(scoped, 'signup_location_success');
  const signupLocationFailed = sessions(scoped, 'signup_location_failed');
  const signupAuthSuccess = sessions(scoped, 'signup_auth_success');
  const signupAuthFailed = sessions(scoped, 'signup_auth_failed');
  const existingAccountRecovered = sessions(scoped, 'existing_account_recovered');
  const passwordRecoveryRequested = sessions(scoped, 'password_recovery_requested');
  const profileCompleted = sessions(scoped, 'profile_completed');
  const profileFailed = sessions(scoped, 'profile_failed');
  const acessoDaConversao = new Map();
  const acessosConvertidos = new Set();
  const acessoDaContaExistente = new Map();
  const acessosContaExistente = new Set();

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

  for (const sessionId of existingAccountRecovered) {
    const eventosSessao = porSessao.get(sessionId) || [];
    const recuperacao = eventosSessao.find(event => eventoDoTipo(event, 'existing_account_recovered'));
    if (!recuperacao) continue;
    const acesso = eventosSessao
      .filter(event => event.event_type === 'landing_view' && new Date(event.created_at) <= new Date(recuperacao.created_at))
      .at(-1);
    if (!acesso) continue;
    acessoDaContaExistente.set(sessionId, acesso);
    acessosContaExistente.add(acesso);
  }

  const recuperacoesAtribuidas = new Set(acessoDaContaExistente.keys());
  const jornadasResolvidas = new Set([...conversoes, ...recuperacoesAtribuidas]);
  const naoCadastrados = difference(visitantes, jornadasResolvidas);
  const links = new Map();

  for (const acesso of scoped.filter(event => event.event_type === 'landing_view')) {
    const sessionId = acesso.session_id;
    const link = linkDoEvento(acesso);
    if (!links.has(link)) {
      links.set(link, {
        link,
        visitors: new Set(),
        cta_clicks: new Set(),
        signup_views: new Set(),
        conversions: new Set(),
        existing_accounts: new Set(),
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

  for (const event of scoped.filter(item => eventoDoTipo(item, 'cta_click'))) {
    links.get(linkDoEvento(event))?.cta_clicks.add(event.session_id);
  }

  for (const sessionId of signupFormViewed) {
    const eventosSessao = porSessao.get(sessionId) || [];
    const abertura = eventosSessao.find(event => eventoDoTipo(event, 'signup_form_viewed'));
    if (!abertura) continue;
    const acesso = eventosSessao
      .filter(event => event.event_type === 'landing_view' && new Date(event.created_at) <= new Date(abertura.created_at))
      .at(-1);
    if (acesso) links.get(linkDoEvento(acesso))?.signup_views.add(sessionId);
  }

  for (const [sessionId, acesso] of acessoDaConversao) {
    links.get(linkDoEvento(acesso))?.conversions.add(sessionId);
  }

  for (const [sessionId, acesso] of acessoDaContaExistente) {
    links.get(linkDoEvento(acesso))?.existing_accounts.add(sessionId);
  }

  const linkRows = [...links.values()]
    .map(item => ({
      link: item.link,
      campaign: item.campaign,
      visitors: item.visitors.size,
      cta_clicks: item.cta_clicks.size,
      signup_views: item.signup_views.size,
      conversions: item.conversions.size,
      existing_accounts: item.existing_accounts.size,
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
      existing_account: acessosContaExistente.has(event),
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
      existing_account_recovered: existingAccountRecovered.size,
      password_recovery_requested: passwordRecoveryRequested.size,
      suspected_bots: suspectedBots.size,
      conversion_rate: rate(conversoes.size, visitantes.size),
      abandonment_rate: rate(naoCadastrados.size, visitantes.size),
    },
    funnel: {
      landing_views: visitantes.size,
      cta_clicks: cliques.size,
      signup_form_viewed: signupFormViewed.size,
      signup_form_engaged: signupFormEngaged.size,
      signup_account_completed: signupAccountCompleted.size,
      signup_submits: signupSubmits.size,
      location_success: signupLocationSuccess.size,
      location_failed: signupLocationFailed.size,
      auth_success: signupAuthSuccess.size,
      auth_failed: signupAuthFailed.size,
      existing_account_recovered: existingAccountRecovered.size,
      password_recovery_requested: passwordRecoveryRequested.size,
      profile_completed: profileCompleted.size,
      profile_failed: profileFailed.size,
      landing_to_cta_rate: rate(cliques.size, visitantes.size),
      cta_to_signup_view_rate: rate(signupFormViewed.size, cliques.size),
      signup_view_to_profile_rate: rate(profileCompleted.size, signupFormViewed.size),
    },
    adoption: {
      onboarding_opened: onboardingAberto.size,
      onboarding_completed: onboardingConcluido.size,
      onboarding_completion_rate: rate(onboardingConcluido.size, onboardingAberto.size),
      install_guide_opened: guiaInstalacao.size,
      install_accepted: instalacoesAceitas.size,
      installed_returns: retornosInstalados.size,
      notifications_enabled: notificacoesAtivadas.size,
      first_posts: primeirasPublicacoes.size,
      registered_returns: retornosCadastrados.size,
      activity_center_opened: centralAtividade.size,
      service_searches: buscasServicos.size,
    },
    links: linkRows,
    accesses,
  };
}

function sessions(events, type) {
  return new Set(events
    .filter(event => eventoDoTipo(event, type))
    .map(event => event.session_id)
    .filter(Boolean));
}

function eventoDoTipo(event, type) {
  if (EVENTOS_ADOCAO.has(type)) {
    return event.event_type === type
      || (event.event_type === 'cta_click' && event.metadata?.action === type);
  }
  if (type === 'cta_click') return event.event_type === type && !event.metadata?.action;
  return event.event_type === type;
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
  EVENTOS_ADOCAO,
  buildWindow,
  campanhaDoEvento,
  linkDoEvento,
  localizacaoDoEvento,
  rotuloVisitante,
};
