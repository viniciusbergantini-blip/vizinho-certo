const test = require('node:test');
const assert = require('node:assert/strict');

const { createInstallAssistant } = require('../install-app');

function rootFor({ userAgent = '', platform = '', maxTouchPoints = 0, standalone = false, notificationPermission, pushSupported = false } = {}) {
  return {
    navigator: {
      userAgent,
      platform,
      maxTouchPoints,
      standalone,
      ...(pushSupported ? { serviceWorker: {} } : {})
    },
    ...(pushSupported ? {
      Notification: { permission: notificationPermission || 'default' },
      PushManager: function PushManager() {}
    } : {}),
    matchMedia: () => ({ matches: standalone })
  };
}

test('detecta Safari no iPhone', () => {
  const assistant = createInstallAssistant(rootFor({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone'
  }));

  assert.deepEqual(assistant.detectEnvironment(), {
    android: false,
    ios: true,
    safari: true,
    standalone: false
  });
});

test('detecta Chrome no iPhone e orienta uso do Safari', () => {
  const assistant = createInstallAssistant(rootFor({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone'
  }));

  const environment = assistant.detectEnvironment();
  assert.equal(environment.ios, true);
  assert.equal(environment.safari, false);
});

test('detecta Android e modo ja instalado', () => {
  const assistant = createInstallAssistant(rootFor({
    userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
    platform: 'Linux armv8l',
    standalone: true
  }));

  const environment = assistant.detectEnvironment();
  assert.equal(environment.android, true);
  assert.equal(environment.standalone, true);
});

test('mantem a opcao visivel no perfil do iPhone quando ainda nao foi instalado', () => {
  const assistant = createInstallAssistant(rootFor({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone'
  }));

  assert.deepEqual(assistant.getButtonPresentation('auto'), {
    disabled: false,
    hidden: false,
    label: '📲 Colocar na tela inicial do iPhone'
  });
});

test('mostra no perfil que o aplicativo ja esta instalado em vez de esconder a opcao', () => {
  const assistant = createInstallAssistant(rootFor({ standalone: true }));

  assert.deepEqual(assistant.getButtonPresentation('auto'), {
    disabled: true,
    hidden: false,
    label: '✓ Vizinho Certo já está na tela inicial'
  });
});

test('orienta instalar antes de ativar notificacoes no iPhone', () => {
  const assistant = createInstallAssistant(rootFor({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    pushSupported: true
  }));

  assert.deepEqual(assistant.getNotificationPresentation(), {
    status: 'install_required',
    label: 'Instale primeiro no iPhone',
    copy: 'No iPhone, as notificações ficam disponíveis depois que o Vizinho Certo é adicionado à Tela de Início.',
    action: 'Ver como instalar no iPhone'
  });
});

test('mostra notificacoes como ativadas quando a permissao ja foi concedida', () => {
  const assistant = createInstallAssistant(rootFor({
    notificationPermission: 'granted',
    pushSupported: true
  }));

  assert.equal(assistant.getNotificationPresentation().status, 'enabled');
  assert.equal(assistant.getNotificationPresentation().action, '');
});
