(function () {
  const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'src'];

  function getLandingCity() {
    return String(document.documentElement.dataset.city || '').trim().toLowerCase().slice(0, 80) || null;
  }

  function getSessionId() {
    const key = 'vc_session_id';
    let sessionId = localStorage.getItem(key);
    if (!sessionId) {
      sessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, sessionId);
    }
    return sessionId;
  }

  function track(eventType, source, metadata) {
    const body = JSON.stringify({
      event_type: eventType,
      session_id: getSessionId(),
      city: source.landing_city,
      path: source.link_url,
      metadata: { ...source, ...(metadata || {}) }
    });

    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      if (sent) return;
    }

    fetch('/api/track', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body
    }).catch(() => {});
  }

  function getSource() {
    const params = new URLSearchParams(window.location.search);
    const safeParams = new URLSearchParams();
    const source = {
      link_url: window.location.pathname || '/',
      landing_city: getLandingCity(),
      title: document.title.slice(0, 160)
    };

    for (const key of CAMPAIGN_KEYS) {
      const value = String(params.get(key) || '').trim().slice(0, 120);
      if (!value) continue;
      source[key] = value;
      safeParams.set(key, value);
    }

    const query = safeParams.toString();
    if (query) source.link_url += `?${query}`;

    if (document.referrer) {
      try { source.referrer_host = new URL(document.referrer).hostname.slice(0, 160); } catch (_) {}
    }
    return source;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const source = getSource();
    localStorage.setItem('vc_landing_source', JSON.stringify(source));
    if (source.landing_city) localStorage.setItem('vc_landing_source_city', source.landing_city);
    track('landing_view', source);

    document.querySelectorAll('[data-landing-cta], a[href="/app"], a[href="/app.html"]').forEach(link => {
      link.addEventListener('click', () => {
        localStorage.setItem('vc_landing_source', JSON.stringify(source));
        track('cta_click', source, {
          cta_text: (link.textContent || '').trim().slice(0, 120),
          cta_href: link.getAttribute('href'),
          cta_position: String(link.dataset.position || 'navigation').slice(0, 40)
        });
      });
    });

    window.addEventListener('vizinhocerto:install', event => {
      const action = event.detail && event.detail.action;
      const eventType = action === 'accepted'
        ? 'install_accepted'
        : action === 'guide_opened'
          ? 'install_guide_opened'
          : null;
      if (!eventType) return;
      track(eventType, source, {
        platform: String(event.detail.platform || '').slice(0, 40),
        source: 'landing'
      });
    });
  });
})();
