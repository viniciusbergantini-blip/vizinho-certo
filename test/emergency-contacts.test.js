const test = require('node:test');
const assert = require('node:assert/strict');

const contacts = require('../emergency-contacts');

test('resolve contatos apenas pela combinação exata de cidade e UF', () => {
  assert.equal(contacts.getMunicipalContact('Indaiatuba', 'SP').phone, '153');
  assert.equal(contacts.getMunicipalContact('Maringá', 'PR').phone, '153');
  assert.equal(contacts.getMunicipalContact('Londrina', 'PR').phone, '153');
  assert.equal(contacts.getMunicipalContact('São João da Boa Vista', 'SP').phone, '08007730156');
});

test('normaliza acentos sem confundir cidades ou estados', () => {
  assert.equal(contacts.getMunicipalContact('maringa', 'pr').name, 'Guarda Municipal de Maringá');
  assert.equal(contacts.getMunicipalContact('Maringá', 'SP'), null);
  assert.equal(contacts.getMunicipalContact('Cidade não cadastrada', 'SP'), null);
  assert.equal(contacts.getMunicipalContact('', ''), null);
});
