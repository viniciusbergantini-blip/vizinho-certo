const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');

test('cabeçalho e navegação respeitam as áreas seguras do celular', () => {
  assert.match(html, /\.fh\{[^}]*safe-area-inset-top/);
  assert.match(html, /\.bnav\{[^}]*safe-area-inset-bottom/);
  assert.match(html, /\.panico-fab\{[^}]*safe-area-inset-bottom/);
  assert.match(html, /\.fab\{[^}]*safe-area-inset-bottom/);
});

test('cabeçalho principal mantém a marca legível sem miniatura recortada', () => {
  assert.match(html, /<div><h1>Vizinho Certo<\/h1><p id="fsub">/);
  assert.doesNotMatch(html, /class="fh-logo"/);
  assert.match(html, /meta name="theme-color" content="#064430"/);
});

test('atalho do iPhone usa o ícone novo com nome versionado', () => {
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon-v2\.png"/);
});
