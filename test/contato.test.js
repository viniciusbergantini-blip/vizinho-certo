const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarTelefoneBrasil } = require('../lib/contato');

test('normaliza telefone brasileiro com ou sem codigo do pais', () => {
  assert.equal(normalizarTelefoneBrasil('(19) 99999-1234'), '19999991234');
  assert.equal(normalizarTelefoneBrasil('+55 19 99999-1234'), '19999991234');
  assert.equal(normalizarTelefoneBrasil('551133334444'), '1133334444');
});

test('recusa telefone incompleto ou longo demais', () => {
  assert.equal(normalizarTelefoneBrasil('1234'), '');
  assert.equal(normalizarTelefoneBrasil('55199999912345'), '');
});
