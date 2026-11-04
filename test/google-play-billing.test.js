const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { criarJwt, hashToken, lerContaServico, normalizarCompraV2 } = require('../lib/google-play-billing');

test('aceita credencial JSON ou base64 e assina JWT RS256', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const conta = {
    client_email: 'billing@vizinho-certo.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  assert.deepEqual(lerContaServico(JSON.stringify(conta)), conta);
  assert.deepEqual(lerContaServico(Buffer.from(JSON.stringify(conta)).toString('base64')), conta);
  assert.equal(criarJwt(conta, 1_700_000_000).split('.').length, 3);
});

test('gera hash estavel sem armazenar o token secreto', () => {
  const token = 'token-secreto-da-compra';
  assert.equal(hashToken(token), crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(hashToken(token).length, 64);
});

test('normaliza compra V2 confirmada e confere o produto comprado', () => {
  const compra = normalizarCompraV2({
    purchaseStateContext: { purchaseState: 'PURCHASED' },
    productLineItem: [{
      productId: 'anuncio_rua_10d',
      productOfferDetails: { consumptionState: 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED' },
    }],
    orderId: 'GPA.1234',
    testPurchaseContext: { fopType: 'TEST' },
    purchaseCompletionTime: '2026-11-04T12:00:00Z',
  }, 'anuncio_rua_10d');

  assert.equal(compra.purchaseState, 'PURCHASED');
  assert.equal(compra.consumptionState, 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED');
  assert.equal(compra.orderId, 'GPA.1234');
  assert.equal(compra.testPurchase, true);
  assert.throws(() => normalizarCompraV2({ productLineItem: [] }, 'anuncio_rua_10d'), /divergente/);
});
