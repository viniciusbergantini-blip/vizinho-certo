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
