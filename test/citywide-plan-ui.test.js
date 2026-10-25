const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');

test('exibe planos região e cidade sem remover os planos atuais', () => {
  assert.match(html, /Plano Região · 30 dias/);
  assert.match(html, /Plano Cidade · 30 dias/);
  assert.match(html, /R\$ 39,90/);
  assert.match(html, /plano_id:anunState\.plano_id/);
});

test('instrumenta visualização e contatos dos anúncios', () => {
  assert.match(html, /data-ad-surface="feed"/);
  assert.match(html, /data-ad-surface="services"/);
  assert.match(html, /trackAppEvent\('ad_impression'/);
  assert.match(html, /trackAppEvent\('ad_whatsapp_click'/);
  assert.match(html, /trackAppEvent\('ad_phone_click'/);
});
