(function initVizinhoCertoRuntime(root, factory) {
  const runtime = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = { createRuntime: factory };
  } else {
    root.VizinhoCertoRuntime = runtime;
  }
})(typeof window !== 'undefined' ? window : globalThis, function createRuntime(root) {
  const config = root.__VIZINHO_CERTO_CONFIG__ || {};
  const location = root.location || {};
  const capacitor = root.Capacitor || {};
  const nativeProtocol = location.protocol === 'capacitor:' || location.protocol === 'ionic:';
  const nativePlatform = typeof capacitor.isNativePlatform === 'function'
    ? capacitor.isNativePlatform()
    : false;
  const native = Boolean(nativeProtocol || nativePlatform);
  const configuredOrigin = typeof config.apiOrigin === 'string' ? config.apiOrigin.trim() : '';
  const apiOrigin = (configuredOrigin || (native ? 'https://www.vizinhocerto.com.br' : ''))
    .replace(/\/+$/, '');

  function apiUrl(path) {
    const value = String(path || '');
    const normalizedPath = value.startsWith('/') ? value : `/${value}`;
    return apiOrigin ? `${apiOrigin}${normalizedPath}` : normalizedPath;
  }

  function createAuthenticatedFetch(client, { onInvalidSession = async () => {} } = {}) {
    let refreshing = null;
    async function invalidSession(userId) {
      await onInvalidSession(userId);
      throw new Error('Sua sessão expirou. Entre novamente. O envio não foi realizado.');
    }
    return async function authenticatedFetch(path, options = {}) {
      const initial = await client.auth.getSession();
      const session = initial.data?.session;
      if (!session?.access_token || initial.error) return invalidSession(session?.user?.id);
      const send = current => root.fetch(apiUrl(path), {
        ...options, headers: { ...options.headers, Authorization: `Bearer ${current.access_token}` }
      });
      let response = await send(session);
      if (response.status !== 401) return response;
      // The API rejects auth before changing data. Retry only this explicit 401;
      // never retry an uncertain network failure, which could duplicate a SOS.
      const current = (await client.auth.getSession()).data?.session;
      if (!current?.access_token) return invalidSession(session.user?.id);
      if (current?.user?.id !== session.user?.id) {
        throw new Error('A conta mudou. Reabra a tela antes de continuar.');
      }
      let renewed = current;
      if (current.access_token === session.access_token) {
        if (!refreshing) refreshing = client.auth.refreshSession().finally(() => { refreshing = null; });
        const result = await refreshing;
        if (result.error?.name === 'AuthRetryableFetchError' || result.error?.status >= 500) {
          throw new Error('Não foi possível renovar a sessão. Confira a conexão e tente novamente.');
        }
        if (result.error || !result.data?.session?.access_token) return invalidSession(session.user?.id);
        renewed = result.data.session;
      }
      if (renewed.user?.id !== session.user?.id) throw new Error('A conta mudou. Reabra a tela antes de continuar.');
      response = await send(renewed);
      if (response.status === 401) return invalidSession(session.user?.id);
      return response;
    };
  }

  return Object.freeze({
    apiOrigin,
    apiUrl,
    createAuthenticatedFetch,
    native,
    platform: native ? 'native' : 'web'
  });
});
