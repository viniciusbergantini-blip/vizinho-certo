const crypto = require('node:crypto');

const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const AUDIENCE = 'vizinho-certo-eventos';
const REPOSITORY = 'viniciusbergantini-blip/vizinho-certo';
const REF = 'refs/heads/main';
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/coletar-eventos-sao-joao.yml@${REF}`;
const EVENTOS_PERMITIDOS = new Set(['schedule', 'workflow_dispatch']);
let cacheJwks = { expiraEm: 0, chaves: [] };

function decodificarJsonBase64url(segmento) {
  try {
    return JSON.parse(Buffer.from(segmento, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function audienciaValida(audiencia) {
  return audiencia === AUDIENCE || (Array.isArray(audiencia) && audiencia.includes(AUDIENCE));
}

async function buscarChaves(fetchImpl, agoraMs) {
  if (cacheJwks.expiraEm > agoraMs && cacheJwks.chaves.length) return cacheJwks.chaves;

  const resposta = await fetchImpl(JWKS_URL, {
    headers: { accept: 'application/json', 'user-agent': 'VizinhoCertoEventos/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resposta.ok) throw new Error(`JWKS do GitHub respondeu HTTP ${resposta.status}`);
  const corpo = await resposta.json();
  if (!Array.isArray(corpo?.keys) || !corpo.keys.length) throw new Error('JWKS do GitHub sem chaves');

  cacheJwks = { expiraEm: agoraMs + (60 * 60 * 1000), chaves: corpo.keys };
  return cacheJwks.chaves;
}

async function verificarTokenGitHubActions(token, { fetchImpl = fetch, agora = new Date() } = {}) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) throw new Error('Token OIDC malformado');

  const [cabecalhoCodificado, payloadCodificado, assinaturaCodificada] = partes;
  const cabecalho = decodificarJsonBase64url(cabecalhoCodificado);
  const payload = decodificarJsonBase64url(payloadCodificado);
  if (!cabecalho || !payload || cabecalho.alg !== 'RS256' || !cabecalho.kid) throw new Error('Cabeçalho OIDC inválido');

  const agoraSegundos = Math.floor(agora.getTime() / 1000);
  if (payload.iss !== ISSUER) throw new Error('Emissor OIDC inválido');
  if (!audienciaValida(payload.aud)) throw new Error('Audiência OIDC inválida');
  if (!Number.isFinite(payload.exp) || payload.exp < agoraSegundos - 30) throw new Error('Token OIDC expirado');
  if (Number.isFinite(payload.nbf) && payload.nbf > agoraSegundos + 30) throw new Error('Token OIDC ainda não é válido');
  if (Number.isFinite(payload.iat) && payload.iat > agoraSegundos + 60) throw new Error('Emissão OIDC inválida');
  if (payload.repository !== REPOSITORY || payload.ref !== REF) throw new Error('Repositório OIDC não autorizado');
  if (payload.workflow_ref !== WORKFLOW_REF) throw new Error('Workflow OIDC não autorizado');
  if (!EVENTOS_PERMITIDOS.has(payload.event_name)) throw new Error('Evento do workflow não autorizado');
  if (!String(payload.sub || '').startsWith(`repo:${REPOSITORY}:`)) throw new Error('Sujeito OIDC inválido');

  const chaves = await buscarChaves(fetchImpl, agora.getTime());
  const jwk = chaves.find(chave => chave.kid === cabecalho.kid && chave.kty === 'RSA');
  if (!jwk) throw new Error('Chave OIDC não encontrada');

  const chavePublica = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const assinaturaValida = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${cabecalhoCodificado}.${payloadCodificado}`),
    chavePublica,
    Buffer.from(assinaturaCodificada, 'base64url'),
  );
  if (!assinaturaValida) throw new Error('Assinatura OIDC inválida');
  return payload;
}

function limparCacheJwksParaTeste() {
  cacheJwks = { expiraEm: 0, chaves: [] };
}

module.exports = {
  AUDIENCE,
  ISSUER,
  JWKS_URL,
  REPOSITORY,
  WORKFLOW_REF,
  limparCacheJwksParaTeste,
  verificarTokenGitHubActions,
};
