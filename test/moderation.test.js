const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('migration creates private report and block tables with RLS', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261103105000_add_user_moderation.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.bloqueios_usuarios/i);
  assert.match(sql, /create table if not exists public\.denuncias_conteudo/i);
  assert.match(sql, /alter table public\.bloqueios_usuarios enable row level security/i);
  assert.match(sql, /alter table public\.denuncias_conteudo enable row level security/i);
  assert.match(sql, /revoke all on table public\.denuncias_conteudo from anon, authenticated/i);
});

test('moderation is exposed in the app for posts, comments and ads', () => {
  const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  assert.match(html, /denunciarConteudo\('post'/);
  assert.match(html, /denunciarConteudo\('comentario'/);
  assert.match(html, /denunciarConteudo\('anuncio'/);
  assert.match(html, /async function bloquearUsuario/);
  assert.match(html, /action:'block'/);
  assert.match(html, /action:'report'/);
});

test('posts API supports reports, blocks and bilateral content filtering', () => {
  const source = fs.readFileSync(path.join(root, 'api', 'posts.js'), 'utf8');
  assert.match(source, /action === 'block'/);
  assert.match(source, /action === 'report'/);
  assert.match(source, /bloqueador_id\.eq\.\$\{userId\},bloqueado_id\.eq\.\$\{userId\}/);
  assert.match(source, /blockedIds\.has\(String\(post\.usuario_id\)\)/);
  assert.match(source, /blockedIds\.has\(String\(comment\.usuario_id\)\)/);
});
