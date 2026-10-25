const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const security = require('../lib/api-security');
const feed = require('../api/feed')._private;
const posts = require('../api/posts')._private;

function responseMock() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('recusa origens externas em rotas mutaveis', () => {
  const res = responseMock();
  assert.equal(security.enforceTrustedOrigin({ headers: { origin: 'https://evil.example' } }, res), false);
  assert.equal(res.statusCode, 403);
  assert.equal(security.originAllowed('https://www.vizinhocerto.com.br'), true);
  assert.equal(security.originAllowed('http://127.0.0.1:3030'), true);
});

test('limita corpo e valida identificadores de registros', () => {
  const res = responseMock();
  assert.equal(security.enforceBodyLimit({ headers: { 'content-length': '50000' }, body: {} }, res, 100), false);
  assert.equal(res.statusCode, 413);
  assert.equal(security.safeRecordId('11111111-1111-5111-8111-111111111111'), '11111111-1111-5111-8111-111111111111');
  assert.equal(security.safeRecordId("1' or '1'='1"), null);
});

test('aceita somente fotos do bucket oficial e da pasta do usuario', () => {
  const uid = '11111111-1111-5111-8111-111111111111';
  const own = `https://xurtdibicsxmouvzfxvb.supabase.co/storage/v1/object/public/fotos/posts/${uid}/foto.jpg`;
  assert.equal(posts.safeOwnedPhotoUrl(own, uid), own);
  assert.equal(posts.safeOwnedPhotoUrl('https://evil.example/foto.jpg', uid), null);
  assert.equal(posts.safeOwnedPhotoUrl('https://xurtdibicsxmouvzfxvb.supabase.co/storage/v1/object/public/fotos/posts/outro/foto.jpg', uid), null);
  assert.equal(feed.safePhotoUrl(own), own);
});

test('feed por API nao devolve rotas antigas de notificacao e escapa texto', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  assert.doesNotMatch(app, /fetch\(apiUrl\('\/api\/notify'/);
  assert.match(app, /htmlSeguro\(p\.txt\)/);
  assert.match(app, /apiUrl\('\/api\/feed'\)/);
  assert.match(app, /if\(!authData\.session\)/);
  assert.match(app, /sessionStorage\.setItem\('vc_cadastro'/);
});

test('configuracao publica cabecalhos defensivos e migracao fecha leitura anonima', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.equal(vercel.outputDirectory, 'public');
  const headers = vercel.headers.flatMap(item => item.headers || []);
  assert.ok(headers.some(item => item.key === 'Content-Security-Policy' && item.value.includes("frame-ancestors 'none'")));
  assert.ok(headers.some(item => item.key === 'Strict-Transport-Security'));

  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'security_hardening.sql'), 'utf8');
  assert.match(sql, /revoke all on table public\.usuarios from anon, authenticated/i);
  assert.match(sql, /drop column if exists senha_hash/i);
  assert.match(sql, /primary key \(post_id, usuario_id\)/i);
  assert.match(sql, /alter default privileges[\s\S]*revoke execute on functions from public, anon, authenticated/i);

  const build = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-public.js'), 'utf8');
  assert.doesNotMatch(build, /'lib\/|"lib\//);
  assert.doesNotMatch(build, /'supabase\/|"supabase\//);
});
