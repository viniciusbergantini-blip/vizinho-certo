const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  AUDIENCE,
  ISSUER,
  REPOSITORY,
  WORKFLOW_REF,
  limparCacheJwksParaTeste,
  verificarTokenGitHubActions,
} = require('../lib/github-oidc');

function base64urlJson(valor) {
  return Buffer.from(JSON.stringify(valor)).toString('base64url');
}

function criarCenarioToken(sobrescrever = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'chave-teste';
  jwk.use = 'sig';
  jwk.alg = 'RS256';
  const agora = new Date('2026-10-21T15:00:00.000Z');
  const segundos = Math.floor(agora.getTime() / 1000);
  const cabecalho = base64urlJson({ alg: 'RS256', typ: 'JWT', kid: jwk.kid });
  const payload = base64urlJson({
    iss: ISSUER,
    aud: AUDIENCE,
    exp: segundos + 300,
    iat: segundos,
    nbf: segundos - 5,
    sub: `repo:${REPOSITORY}:ref:refs/heads/main`,
    repository: REPOSITORY,
    ref: 'refs/heads/main',
    workflow_ref: WORKFLOW_REF,
    event_name: 'schedule',
    ...sobrescrever,
  });
  const conteudo = `${cabecalho}.${payload}`;
  const assinatura = crypto.sign('RSA-SHA256', Buffer.from(conteudo), privateKey).toString('base64url');
  return { agora, jwk, token: `${conteudo}.${assinatura}` };
}

function fetchJwks(jwk) {
  return async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
}

test('aceita token OIDC assinado pelo workflow autorizado', async () => {
  limparCacheJwksParaTeste();
  const cenario = criarCenarioToken();
  const payload = await verificarTokenGitHubActions(cenario.token, {
    agora: cenario.agora,
    fetchImpl: fetchJwks(cenario.jwk),
  });

  assert.equal(payload.repository, REPOSITORY);
  assert.equal(payload.event_name, 'schedule');
});

test('recusa token de outro workflow mesmo com assinatura válida', async () => {
  limparCacheJwksParaTeste();
  const cenario = criarCenarioToken({
    workflow_ref: `${REPOSITORY}/.github/workflows/outro.yml@refs/heads/main`,
  });

  await assert.rejects(
    verificarTokenGitHubActions(cenario.token, { agora: cenario.agora, fetchImpl: fetchJwks(cenario.jwk) }),
    /Workflow OIDC não autorizado/,
  );
});

test('recusa assinatura adulterada', async () => {
  limparCacheJwksParaTeste();
  const cenario = criarCenarioToken();
  const partes = cenario.token.split('.');
  partes[2] = `${partes[2].slice(0, -2)}aa`;

  await assert.rejects(
    verificarTokenGitHubActions(partes.join('.'), { agora: cenario.agora, fetchImpl: fetchJwks(cenario.jwk) }),
    /Assinatura OIDC inválida/,
  );
});
