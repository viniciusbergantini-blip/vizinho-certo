(function () {
  const CITIES = new Set(['indaiatuba', 'maringa', 'londrina']);

  function getCity() {
    const configured = document.documentElement.dataset.city || '';
    if (CITIES.has(configured)) return configured;

    const pathCity = window.location.pathname.replace(/^\/+/, '').split('/')[0];
    return CITIES.has(pathCity) ? pathCity : null;
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

  function track(eventType, city, metadata) {
    if (!city) return;

    const body = JSON.stringify({
      event_type: eventType,
      session_id: getSessionId(),
      city,
      path: window.location.pathname,
      metadata: metadata || {}
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

  document.addEventListener('DOMContentLoaded', () => {
    const city = getCity();
    if (!city) return;

    localStorage.setItem('vc_landing_source_city', city);
    track('landing_view', city, { title: document.title });

    document.querySelectorAll('a[href="/app"], a[href="/app.html"]').forEach(link => {
      link.addEventListener('click', () => {
        localStorage.setItem('vc_landing_source_city', city);
        track('cta_click', city, {
          text: (link.textContent || '').trim().slice(0, 120),
          href: link.getAttribute('href')
        });
      });
    });
  });
})();
