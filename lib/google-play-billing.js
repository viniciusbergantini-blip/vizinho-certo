const crypto = require('node:crypto');

const PACKAGE_NAME = 'br.com.vizinhocerto.app';
const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function lerContaServico(raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
  if (!raw) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON nao configurada');
  let decoded = String(raw).trim();
  if (!decoded.startsWith('{')) {
    try { decoded = Buffer.from(decoded, 'base64').toString('utf8'); } catch (_) {}
  }
  let conta;
  try { conta = JSON.parse(decoded); } catch (_) { throw new Error('Credencial Google Play invalida'); }
  if (!conta.client_email || !conta.private_key) throw new Error('Credencial Google Play incompleta');
  return conta;
}

function criarJwt(conta, agoraSegundos = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: conta.client_email,
    scope: PLAY_SCOPE,
    aud: TOKEN_URL,
    iat: agoraSegundos,
    exp: agoraSegundos + 3600,
  }));
  const conteudo = `${header}.${claims}`;
  const assinatura = crypto.sign('RSA-SHA256', Buffer.from(conteudo), conta.private_key).toString('base64url');
  return `${conteudo}.${assinatura}`;
}

async function obterAccessToken({ fetchImpl = fetch, forceRefresh = false } = {}) {
  if (!forceRefresh && cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }
  const conta = lerContaServico();
  const resposta = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: criarJwt(conta),
    }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !corpo.access_token) throw new Error('Nao foi possivel autenticar na Google Play');
  cachedAccessToken = corpo.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Number(corpo.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

async function chamarGooglePlay(path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const executar = async forceRefresh => {
    const token = await obterAccessToken({ fetchImpl, forceRefresh });
    return fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  };
  let resposta = await executar(false);
  if (resposta.status === 401) resposta = await executar(true);
  const corpo = resposta.status === 204 ? {} : await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error(corpo?.error?.message || 'Falha ao consultar a Google Play');
    erro.status = resposta.status;
    throw erro;
  }
  return corpo;
}

function caminhoCompraLegado(productId, purchaseToken, sufixo = '') {
  return `/applications/${encodeURIComponent(PACKAGE_NAME)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}${sufixo}`;
}

function caminhoCompraV2(purchaseToken) {
  return `/applications/${encodeURIComponent(PACKAGE_NAME)}/purchases/productsv2/tokens/${encodeURIComponent(purchaseToken)}`;
}

function normalizarCompraV2(compra, productId) {
  const itens = Array.isArray(compra?.productLineItem) ? compra.productLineItem : [];
  const item = itens.find(linha => linha?.productId === productId);
  if (!item) throw new Error('Produto da compra divergente');
  return {
    productId,
    purchaseState: compra?.purchaseStateContext?.purchaseState || 'PURCHASE_STATE_UNSPECIFIED',
    consumptionState: item?.productOfferDetails?.consumptionState || 'CONSUMPTION_STATE_UNSPECIFIED',
    orderId: compra?.orderId || null,
    testPurchase: compra?.testPurchaseContext?.fopType === 'TEST',
    purchaseCompletionTime: compra?.purchaseCompletionTime || null,
  };
}

async function verificarCompra({ productId, purchaseToken, fetchImpl = fetch }) {
  if (!/^[a-z0-9_]{3,80}$/.test(String(productId || ''))) throw new Error('Produto Google Play invalido');
  if (!purchaseToken || String(purchaseToken).length > 4096) throw new Error('Token de compra invalido');
  const compra = await chamarGooglePlay(caminhoCompraV2(purchaseToken), { fetchImpl });
  return normalizarCompraV2(compra, productId);
}

async function verificarProdutoGooglePlay(productId) {
  await chamarGooglePlay(`/applications/${encodeURIComponent(PACKAGE_NAME)}/oneTimeProducts/${encodeURIComponent(productId)}`);
}

async function verificarAcessoComprasGooglePlay() {
  await chamarGooglePlay(`/applications/${encodeURIComponent(PACKAGE_NAME)}/purchases/voidedpurchases?maxResults=1`);
}

async function consumirCompra({ productId, purchaseToken, fetchImpl = fetch }) {
  await chamarGooglePlay(caminhoCompraLegado(productId, purchaseToken, ':consume'), { method: 'POST', body: {}, fetchImpl });
}

function hashToken(purchaseToken) {
  return crypto.createHash('sha256').update(String(purchaseToken)).digest('hex');
}

module.exports = {
  PACKAGE_NAME,
  criarJwt,
  hashToken,
  lerContaServico,
  normalizarCompraV2,
  consumirCompra,
  verificarCompra,
  verificarProdutoGooglePlay,
  verificarAcessoComprasGooglePlay,
};
