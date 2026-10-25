const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

test('script principal do dashboard continua com sintaxe válida', () => {
  const scripts = [...dashboard.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0);
  assert.doesNotThrow(() => new Function(scripts.at(-1)[1]));
});

test('dashboard renderiza um funil proporcional com resumo das perdas', () => {
  assert.match(dashboard, /function renderFunnel\(funnel\)/);
  assert.match(dashboard, /--funnel-width:\$\{width\.toFixed\(2\)\}%/);
  assert.match(dashboard, /Conversão fim a fim/);
  assert.match(dashboard, /Maior queda/);
  assert.match(dashboard, /Etapas do funil de cadastro/);
});

test('funil trata períodos sem dados e evita divisão por zero', () => {
  assert.match(dashboard, /if\(base===0\)/);
  assert.match(dashboard, /if\(!total\) return 0/);
  assert.match(dashboard, /Nenhuma jornada registrada neste período/);
});
