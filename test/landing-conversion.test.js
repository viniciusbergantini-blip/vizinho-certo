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

test('landing geral comunica valor, reduz inseguranca e mostra demonstracao honesta', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /Ver minha vizinhança grátis/);
  assert.match(html, /Não pedimos telefone/);
  assert.match(html, /Eventos locais/);
  assert.match(html, /Exemplo ilustrativo/);
  assert.match(html, /conteúdo disponível depende das publicações de cada região/);
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

test('cadastro explica valor e privacidade com controles acessiveis', () => {
  const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  assert.match(html, /Avisos, ajuda, serviços e eventos locais/);
  assert.match(html, /Criar conta e ver minha vizinhança/);
  assert.match(html, /Sua região, não seu endereço público/);
  assert.match(html, /aria-label="Mostrar senha"/);
  assert.match(html, /role="alert" aria-live="polite"/);
});

test('conta existente vai para o login com email mantido e recuperacao de senha', () => {
  const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  assert.match(html, /Este e-mail já possui uma conta\./);
  assert.match(html, /mostrarLogin\(email,\{contaExistente:true\}\)/);
  assert.match(html, /Esqueci minha senha/);
  assert.match(html, /trackCadastro\('existing_account_recovered',\{status:technicalCode\}\)/);
  assert.match(html, /document\.getElementById\('inp-senha'\)\.value=''/);
});

test('cadastro direto de anuncios explica valor e preserva a atribuicao', () => {
  const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  assert.match(html, /Avisos, serviços e ajuda de quem mora perto\./);
  assert.match(html, /Não pedimos telefone\./);
  assert.match(html, /Outros usuários não veem seu endereço\./);
  assert.match(html, /DIRECT_CAMPAIGN_KEYS/);
  assert.match(html, /vc_landing_source/);
  assert.match(html, /vc_direct_landing_viewed/);
  assert.match(vercel, /\/cadastro-saojoao/);
  assert.match(fs.readFileSync(path.join(root, 'local-server.js'), 'utf8'), /startsWith\('\/cadastro-saojoao'\)/);
});

test('link principal de Sao Joao abre o cadastro direto sem criar outra URL obrigatoria', () => {
  const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  const localServer = fs.readFileSync(path.join(root, 'local-server.js'), 'utf8');
  assert.match(html, /path!=='\/saojoao'&&path!=='\/cadastro-saojoao'/);
  assert.match(vercel, /"source": "\/saojoao", "destination": "\/app\.html"/);
  assert.match(vercel, /"source": "\/saojoao\(\.\*\)", "destination": "\/app\.html"/);
  assert.match(localServer, /startsWith\('\/saojoao'\)\) filePath = '\/app\.html'/);
});
