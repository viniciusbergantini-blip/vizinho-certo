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

  return Object.freeze({
    apiOrigin,
    apiUrl,
    native,
    platform: native ? 'native' : 'web'
  });
});
