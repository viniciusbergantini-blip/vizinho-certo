const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const landings = ['index.html', 'saojoao.html', 'maringa.html', 'londrina.html', 'indaiatuba.html'];

test('landings usam CTA direto e nao colocam dados pessoais na URL', () => {
  for (const file of landings) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /data-landing-cta/);
    assert.match(html, /href="\/app"/);
    assert.doesNotMatch(html, /method="get"/i);
    assert.doesNotMatch(html, /name="(?:nome|email|cep)"/i);
  }
});

test('landing compacta deixa instalacao para dentro do aplicativo', () => {
  const html = fs.readFileSync(path.join(root, 'saojoao.html'), 'utf8');
  assert.doesNotMatch(html, /Adicionar à Tela de Início/i);
  assert.match(html, /260|local-proof/);
});

test('cadastro do app tem duas etapas e nao exige apelido', () => {
  const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  assert.match(html, /signup-step-account/);
  assert.match(html, /signup-step-address/);
  assert.doesNotMatch(html, /id="inp-apelido"/);
  assert.match(html, /E\.raio = 500/);
});
