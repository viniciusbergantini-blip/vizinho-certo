(function initInstallModule(root, factory) {
  const assistant = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = { createInstallAssistant: factory };
  } else {
    root.VizinhoCertoInstall = assistant;
    assistant.init();
  }
})(typeof window !== 'undefined' ? window : globalThis, function createInstallAssistant(root) {
  let deferredPrompt = null;
  let initialized = false;
  const document = root.document;

  function detectEnvironment() {
    const navigator = root.navigator || {};
    const userAgent = String(navigator.userAgent || '');
    const platform = String(navigator.platform || '');
    const isIpadDesktopMode = platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1;
    const ios = /iPhone|iPad|iPod/i.test(userAgent) || isIpadDesktopMode;
    const android = /Android/i.test(userAgent);
    const safari = ios && /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
    const standalone = Boolean(
      (typeof root.matchMedia === 'function' && root.matchMedia('(display-mode: standalone)').matches)
      || navigator.standalone === true
    );

    return { android, ios, safari, standalone };
  }

  function emitInstallEvent(action, platform) {
    if (typeof root.dispatchEvent !== 'function' || typeof root.CustomEvent !== 'function') return;
    root.dispatchEvent(new root.CustomEvent('vizinhocerto:install', {
      detail: { action, platform }
    }));
  }

  function getNotificationPresentation(environment = detectEnvironment()) {
    const navigator = root.navigator || {};
    const supported = Boolean(
      root.Notification
      && 'serviceWorker' in navigator
      && root.PushManager
    );

    if (!supported) {
      return {
        status: 'unsupported',
        label: 'Notificações indisponíveis neste navegador',
        copy: 'Você ainda pode usar normalmente o feed e os serviços locais.',
        action: ''
      };
    }

    if (environment.ios && !environment.standalone) {
      return {
        status: 'install_required',
        label: 'Instale primeiro no iPhone',
        copy: 'No iPhone, as notificações ficam disponíveis depois que o Vizinho Certo é adicionado à Tela de Início.',
        action: 'Ver como instalar no iPhone'
      };
    }

    const permission = root.Notification.permission || 'default';
    if (permission === 'granted') {
      return {
        status: 'enabled',
        label: 'Notificações ativadas',
        copy: 'Você pode receber avisos importantes da sua vizinhança.',
        action: ''
      };
    }
    if (permission === 'denied') {
      return {
        status: 'blocked',
        label: 'Notificações bloqueadas',
        copy: 'Abra as configurações do navegador ou do celular e permita notificações para o Vizinho Certo.',
        action: 'Ver instruções'
      };
    }
    return {
      status: 'available',
      label: 'Notificações desativadas',
      copy: 'Ative quando quiser receber avisos importantes. A permissão só será solicitada ao tocar no botão.',
      action: 'Ativar notificações'
    };
  }

  function addStyles() {
    if (!document || document.getElementById('vc-install-styles')) return;
    const style = document.createElement('style');
    style.id = 'vc-install-styles';
    style.textContent = `
      .vc-install-button{width:100%;margin-top:12px;padding:11px 14px;border:0;border-radius:10px;background:#52B788;color:#123D2C;font:700 13px "DM Sans",sans-serif;cursor:pointer}
      .vc-install-button:hover{filter:brightness(1.04)}
      .vc-install-button[hidden]{display:none!important}
      .vc-install-button:disabled{cursor:default;filter:none;background:#D8F3DC;color:#1B4D37;border-color:#85C1A3}
      .vc-install-profile{background:#fff;color:#2D6A4F;border:1.5px solid #2D6A4F;font-size:14px;font-weight:500}
      .vc-install-profile-card{margin-bottom:16px;padding:16px;border:1px solid #B7DEC8;border-radius:14px;background:#EDF8F2}
      .vc-install-profile-title{color:#1B4D37;font:700 16px "Fraunces",serif}
      .vc-install-profile-copy{margin-top:4px;color:#5C5C5C;font:400 12px/1.5 "DM Sans",sans-serif}
      .vc-install-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-end;justify-content:center;padding:18px;background:rgba(10,28,20,.64)}
      .vc-install-overlay[hidden]{display:none}
      .vc-install-dialog{box-sizing:border-box;width:100%;max-width:430px;max-height:calc(100vh - 36px);overflow:auto;border-radius:20px;background:#FEFAE0;color:#1B1B1B;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.28)}
      .vc-install-dialog *{box-sizing:border-box}
      .vc-install-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
      .vc-install-dialog h2{margin:0;color:#1B4D37;font:700 24px "Fraunces",serif;line-height:1.15}
      .vc-install-close{border:0;background:transparent;color:#5C5C5C;font-size:26px;line-height:1;cursor:pointer}
      .vc-install-dialog p{margin:0 0 14px;color:#5C5C5C;font:400 14px/1.55 "DM Sans",sans-serif}
      .vc-install-steps{display:grid;gap:10px;margin:0;padding:0;list-style:none;counter-reset:vc-install-step}
      .vc-install-steps li{position:relative;padding:12px 12px 12px 46px;border:1px solid rgba(27,77,55,.14);border-radius:12px;background:#fff;font:500 14px/1.45 "DM Sans",sans-serif;counter-increment:vc-install-step}
      .vc-install-steps li:before{content:counter(vc-install-step);position:absolute;left:12px;top:10px;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:#D8F3DC;color:#1B4D37;font-weight:700}
      .vc-install-secondary{width:100%;margin-top:14px;padding:11px;border:1.5px solid #2D6A4F;border-radius:10px;background:#fff;color:#2D6A4F;font:700 13px "DM Sans",sans-serif;cursor:pointer}
      .vc-install-hint{margin-top:14px!important;padding:12px;border-radius:10px;background:#EDF8F2;color:#2D6A4F!important;font-size:12px!important}
      @media(min-width:600px){.vc-install-overlay{align-items:center}}
    `;
    document.head.appendChild(style);
  }

  function ensureDialog() {
    if (!document) return null;
    let overlay = document.getElementById('vc-install-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'vc-install-overlay';
    overlay.className = 'vc-install-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="vc-install-dialog" role="dialog" aria-modal="true" aria-labelledby="vc-install-title">
        <div class="vc-install-dialog-head">
          <h2 id="vc-install-title">Instalar Vizinho Certo</h2>
          <button type="button" class="vc-install-close" aria-label="Fechar">×</button>
        </div>
        <div id="vc-install-content"></div>
      </section>
    `;
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('.vc-install-close')) closeDialog();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function iosContent(safari) {
    const browserWarning = safari
      ? ''
      : '<p class="vc-install-hint"><strong>Você não está no Safari.</strong> Abra este endereço no Safari para que a opção de instalar apareça.</p>';
    const copyButton = safari
      ? ''
      : '<button type="button" class="vc-install-secondary" data-vc-copy-link>Copiar endereço do aplicativo</button>';

    return `
      <p>O iPhone exige uma confirmação manual. Você faz isso uma vez e depois abre pelo ícone, como qualquer aplicativo.</p>
      ${browserWarning}
      <ol class="vc-install-steps">
        <li>Abra <strong>www.vizinhocerto.com.br/app</strong> no Safari.</li>
        <li>Toque em <strong>Compartilhar</strong> — o ícone de um quadrado com seta para cima.</li>
        <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
        <li>Ative <strong>Abrir como App Web</strong> e toque em <strong>Adicionar</strong>.</li>
      </ol>
      ${copyButton}
    `;
  }

  function androidContent() {
    return `
      <p>Se a confirmação automática não aparecer, instale pelo menu do navegador:</p>
      <ol class="vc-install-steps">
        <li>Abra o menu de <strong>três pontinhos</strong> do Chrome.</li>
        <li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
        <li>Confirme em <strong>Instalar</strong>.</li>
      </ol>
    `;
  }

  function desktopContent() {
    return `
      <p>No Chrome ou Edge, procure o ícone de instalação no lado direito da barra de endereço.</p>
      <ol class="vc-install-steps">
        <li>Abra o menu do navegador.</li>
        <li>Escolha <strong>Instalar Vizinho Certo</strong>.</li>
        <li>Confirme a instalação.</li>
      </ol>
    `;
  }

  function showInstructions(platform) {
    const environment = detectEnvironment();
    const selectedPlatform = platform || (environment.ios ? 'ios' : environment.android ? 'android' : 'desktop');
    emitInstallEvent('guide_opened', selectedPlatform);
    const overlay = ensureDialog();
    if (!overlay) return;
    const title = overlay.querySelector('#vc-install-title');
    const content = overlay.querySelector('#vc-install-content');

    title.textContent = selectedPlatform === 'ios'
      ? 'Instalar no iPhone'
      : selectedPlatform === 'android'
        ? 'Instalar no Android'
        : 'Instalar Vizinho Certo';
    content.innerHTML = selectedPlatform === 'ios'
      ? iosContent(environment.safari)
      : selectedPlatform === 'android'
        ? androidContent()
        : desktopContent();

    const copyButton = content.querySelector('[data-vc-copy-link]');
    if (copyButton) {
      copyButton.addEventListener('click', async () => {
        try {
          await root.navigator.clipboard.writeText('https://www.vizinhocerto.com.br/app');
          copyButton.textContent = 'Endereço copiado!';
        } catch (_) {
          copyButton.textContent = 'www.vizinhocerto.com.br/app';
        }
      });
    }

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.vc-install-close').focus();
  }

  function closeDialog() {
    if (!document) return;
    const overlay = document.getElementById('vc-install-overlay');
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = '';
  }

  async function start(platform) {
    const environment = detectEnvironment();
    if (environment.standalone) return { outcome: 'already-installed' };

    const selectedPlatform = platform === 'auto' || !platform
      ? (environment.ios ? 'ios' : environment.android ? 'android' : 'desktop')
      : platform;

    if (deferredPrompt && selectedPlatform !== 'ios') {
      emitInstallEvent('guide_opened', selectedPlatform);
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result && result.outcome === 'accepted') emitInstallEvent('accepted', selectedPlatform);
      deferredPrompt = null;
      refresh();
      return result;
    }

    showInstructions(selectedPlatform);
    return { outcome: 'instructions' };
  }

  function wireButton(button) {
    if (button.dataset.vcInstallReady === 'true') return;
    button.dataset.vcInstallReady = 'true';
    button.addEventListener('click', () => start(button.dataset.vcInstall || 'auto'));
  }

  function getButtonPresentation(target = 'auto', environment = detectEnvironment(), promptAvailable = Boolean(deferredPrompt)) {
    if (environment.standalone) {
      return target === 'auto'
        ? { disabled: true, hidden: false, label: '✓ Vizinho Certo já está na tela inicial' }
        : { disabled: false, hidden: true, label: '' };
    }

    if (target === 'auto') {
      return {
        disabled: false,
        hidden: false,
        label: environment.ios
          ? '📲 Colocar na tela inicial do iPhone'
          : promptAvailable
            ? '📲 Instalar Vizinho Certo agora'
            : '📲 Colocar o Vizinho Certo na tela inicial'
      };
    }

    if (target === 'android' && promptAvailable && environment.android) {
      return { disabled: false, hidden: false, label: 'Instalar agora no Android' };
    }

    return { disabled: false, hidden: false, label: '' };
  }

  function refresh() {
    if (!document) return;
    const environment = detectEnvironment();
    document.querySelectorAll('[data-vc-install]').forEach(button => {
      wireButton(button);
      const presentation = getButtonPresentation(button.dataset.vcInstall || 'auto', environment);
      button.hidden = presentation.hidden;
      button.disabled = presentation.disabled;
      if (presentation.disabled) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
      if (presentation.label) button.textContent = presentation.label;
    });
  }

  function init() {
    if (initialized || !document) return;
    initialized = true;
    addStyles();

    if ('serviceWorker' in (root.navigator || {})) {
      root.navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    root.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredPrompt = event;
      refresh();
    });
    root.addEventListener('appinstalled', () => {
      const environment = detectEnvironment();
      emitInstallEvent('accepted', environment.ios ? 'ios' : environment.android ? 'android' : 'desktop');
      deferredPrompt = null;
      closeDialog();
      refresh();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeDialog();
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', refresh, { once: true });
    } else {
      refresh();
    }
  }

  return {
    closeDialog,
    detectEnvironment,
    getButtonPresentation,
    getNotificationPresentation,
    init,
    refresh,
    showInstructions,
    start
  };
});
