const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWindow, localizacaoDoEvento, rotuloVisitante } = require('../lib/analytics-dashboard');

const end = new Date('2026-10-18T18:00:00.000Z');

test('agrupa acessos por link e atribui conversao pela sessao', () => {
  const events = [
    evento('landing_view', 'sessao-a', '/saojoao?utm_source=instagram', {
      link_url: '/saojoao?utm_source=instagram',
      utm_source: 'instagram',
      geo: { city: 'São João da Boa Vista', region: 'SP', country: 'BR' },
    }),
    evento('cta_click', 'sessao-a', '/saojoao'),
    evento('signup_completed', 'sessao-a', '/saojoao'),
    evento('landing_view', 'sessao-b', '/', { link_url: '/' }),
  ];

  const result = buildWindow(events, null, end);
  assert.equal(result.totals.visitors, 2);
  assert.equal(result.totals.conversions, 1);
  assert.equal(result.totals.conversion_rate, 50);
  const campaignLink = result.links.find(item => item.link.includes('/saojoao'));
  assert.equal(campaignLink.link, '/saojoao?utm_source=instagram');
  assert.equal(campaignLink.conversions, 1);
  assert.equal(campaignLink.locations[0].label, 'São João da Boa Vista / SP · BR');
  assert.equal(result.accesses.find(item => item.link === '/').converted, false);
  assert.equal(result.accesses.find(item => item.link.includes('/saojoao')).converted, true);
});

test('nao trata slug antigo da landing como geolocalizacao real', () => {
  assert.equal(localizacaoDoEvento({ city: 'saojoao', metadata: {} }), 'Localização indisponível');
});

test('gera identificador anonimo estavel para a sessao', () => {
  assert.equal(rotuloVisitante('abc'), rotuloVisitante('abc'));
  assert.notEqual(rotuloVisitante('abc'), rotuloVisitante('def'));
});

test('atribui a conversao ao ultimo link acessado antes do cadastro', () => {
  const events = [
    eventoEm('landing_view', 'sessao-c', '/primeiro', '2026-10-18T15:00:00.000Z'),
    eventoEm('landing_view', 'sessao-c', '/ultimo', '2026-10-18T16:00:00.000Z'),
    eventoEm('signup_completed', 'sessao-c', '/app', '2026-10-18T17:00:00.000Z'),
  ];

  const result = buildWindow(events, null, end);
  assert.equal(result.links.find(item => item.link === '/primeiro').conversions, 0);
  assert.equal(result.links.find(item => item.link === '/ultimo').conversions, 1);
  assert.equal(result.accesses.find(item => item.link === '/primeiro').converted, false);
  assert.equal(result.accesses.find(item => item.link === '/ultimo').converted, true);
});

test('nao considera cadastro anterior ao acesso como conversao', () => {
  const events = [
    eventoEm('signup_completed', 'sessao-d', '/app', '2026-10-18T15:00:00.000Z'),
    eventoEm('landing_view', 'sessao-d', '/depois', '2026-10-18T16:00:00.000Z'),
  ];

  const result = buildWindow(events, null, end);
  assert.equal(result.totals.conversions, 0);
  assert.equal(result.totals.direct_signups, 1);
});

test('resume adocao sem expor identidade dos usuarios', () => {
  const events = [
    evento('onboarding_opened', 'sessao-a', '/app'),
    evento('onboarding_completed', 'sessao-a', '/app'),
    evento('install_guide_opened', 'sessao-a', '/app'),
    evento('install_accepted', 'sessao-a', '/app'),
    evento('app_opened_standalone', 'sessao-a', '/app'),
    evento('notifications_enabled', 'sessao-a', '/app'),
    evento('first_post_created', 'sessao-a', '/app'),
    evento('onboarding_opened', 'sessao-b', '/app'),
  ];

  const result = buildWindow(events, null, end);
  assert.deepEqual(result.adoption, {
    onboarding_opened: 2,
    onboarding_completed: 1,
    onboarding_completion_rate: 50,
    install_guide_opened: 1,
    install_accepted: 1,
    installed_returns: 1,
    notifications_enabled: 1,
    first_posts: 1,
    registered_returns: 0,
    activity_center_opened: 0,
    service_searches: 0,
  });
  assert.equal(JSON.stringify(result.adoption).includes('sessao-a'), false);
});

test('le eventos de adocao codificados na telemetria ja permitida', () => {
  const events = [
    evento('cta_click', 'sessao-a', '/app', { action: 'install_accepted' }),
    evento('cta_click', 'sessao-b', '/app', { action: 'notifications_enabled' }),
    evento('cta_click', 'sessao-c', '/app'),
  ];

  const result = buildWindow(events, null, end);
  assert.equal(result.adoption.install_accepted, 1);
  assert.equal(result.adoption.notifications_enabled, 1);
  assert.equal(result.totals.cta_clicks, 1);
});

test('mede retorno e uso das ferramentas de recorrencia por sessao', () => {
  const events = [
    evento('cta_click', 'sessao-a', '/app', { action: 'registered_return' }),
    evento('cta_click', 'sessao-a', '/app', { action: 'activity_center_opened' }),
    evento('cta_click', 'sessao-a', '/app', { action: 'service_search_used' }),
  ];

  const result = buildWindow(events, null, end);
  assert.equal(result.adoption.registered_returns, 1);
  assert.equal(result.adoption.activity_center_opened, 1);
  assert.equal(result.adoption.service_searches, 1);
  assert.equal(result.totals.cta_clicks, 0);
});

test('mostra as etapas do novo funil e atribui a abertura do cadastro ao link', () => {
  const events = [
    eventoEm('landing_view', 'sessao-funil', '/saojoao?utm_source=fb', '2026-10-18T15:00:00.000Z'),
    eventoEm('cta_click', 'sessao-funil', '/saojoao?utm_source=fb', '2026-10-18T15:01:00.000Z'),
    evento('cta_click', 'sessao-funil', '/app', { action: 'signup_form_viewed' }),
    evento('cta_click', 'sessao-funil', '/app', { action: 'signup_form_engaged' }),
    evento('cta_click', 'sessao-funil', '/app', { action: 'signup_account_completed' }),
    evento('cta_click', 'sessao-funil', '/app', { action: 'signup_submit' }),
    evento('cta_click', 'sessao-funil', '/app', { action: 'signup_location_success' }),
    evento('cta_click', 'sessao-funil', '/app', { action: 'signup_auth_success' }),
    evento('cta_click', 'sessao-funil', '/app', { action: 'profile_completed' }),
  ];

  const result = buildWindow(events, null, end);
  assert.equal(result.funnel.signup_form_viewed, 1);
  assert.equal(result.funnel.profile_completed, 1);
  assert.equal(result.funnel.signup_view_to_profile_rate, 100);
  assert.equal(result.links[0].signup_views, 1);
});

test('retira bots identificados das metricas de conversao', () => {
  const events = [
    evento('landing_view', 'humano', '/saojoao', { traffic_quality: 'human' }),
    evento('landing_view', 'bot', '/saojoao', { traffic_quality: 'suspected_bot' }),
  ];

  const result = buildWindow(events, null, end);
  assert.equal(result.totals.visitors, 1);
  assert.equal(result.totals.suspected_bots, 1);
});

test('conta existente recuperada nao vira abandono e preserva atribuicao do link', () => {
  const events = [
    eventoEm('landing_view', 'sessao-existente', '/saojoao?utm_source=instagram', '2026-10-18T15:00:00.000Z'),
    evento('cta_click', 'sessao-existente', '/app', { action: 'signup_submit' }),
    evento('cta_click', 'sessao-existente', '/app', { action: 'existing_account_recovered', status: 'user_already_exists' }),
    evento('cta_click', 'sessao-existente', '/app', { action: 'password_recovery_requested', status: 'request_accepted' }),
  ];

  const result = buildWindow(events, null, end);
  assert.equal(result.totals.visitors, 1);
  assert.equal(result.totals.conversions, 0);
  assert.equal(result.totals.existing_account_recovered, 1);
  assert.equal(result.totals.password_recovery_requested, 1);
  assert.equal(result.totals.not_registered, 0);
  assert.equal(result.totals.abandonment_rate, 0);
  assert.equal(result.links[0].existing_accounts, 1);
  assert.equal(result.accesses[0].existing_account, true);
});

function evento(event_type, session_id, path, metadata = {}) {
  return {
    event_type,
    session_id,
    path,
    metadata,
    created_at: '2026-10-18T17:00:00.000Z',
  };
}

function eventoEm(event_type, session_id, path, created_at) {
  return { event_type, session_id, path, metadata: { link_url: path }, created_at };
}
