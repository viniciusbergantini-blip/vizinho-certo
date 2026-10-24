const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCityKey, roundPublicCount } = require('../api/track')._private;

test('publica somente contagens arredondadas com pelo menos dez moradores', () => {
  assert.equal(roundPublicCount(263), 260);
  assert.equal(roundPublicCount(19), 10);
  assert.equal(roundPublicCount(9), 0);
  assert.equal(roundPublicCount(null), 0);
});

test('aceita apenas cidades previstas para a landing', () => {
  assert.equal(normalizeCityKey('saojoao'), 'saojoao');
  assert.equal(normalizeCityKey('MARINGA'), 'maringa');
  assert.equal(normalizeCityKey('cidade-inventada'), 'geral');
});
