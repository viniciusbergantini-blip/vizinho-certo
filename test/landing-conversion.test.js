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
  assert.match(html, /id="inp-consentimento"/);
  assert.match(html, /href="\/termos"/);
  assert.match(html, /href="\/privacidade"/);
  assert.match(html, /legal_version:LEGAL_VERSION/);
  assert.match(html, /terms_accepted_at:acceptedAt/);
  assert.match(html, /privacy_accepted_at:acceptedAt/);
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

test('link principal de Sao Joao preserva a landing e cadastro direto continua separado', () => {
  const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  const localServer = fs.readFileSync(path.join(root, 'local-server.js'), 'utf8');
  assert.match(vercel, /"source": "\/saojoao", "destination": "\/saojoao\.html"/);
  assert.match(vercel, /"source": "\/saojoao\/\(\.\*\)", "destination": "\/saojoao\.html"/);
  assert.match(vercel, /"source": "\/cadastro-saojoao", "destination": "\/app\.html"/);
  assert.match(localServer, /filePath === '\/saojoao'.*filePath = '\/saojoao\.html'/);
  assert.match(localServer, /startsWith\('\/cadastro-saojoao'\)\) filePath = '\/app\.html'/);
});

test('paginas legais publicas cobrem privacidade, termos e exclusao', () => {
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-public.js'), 'utf8');
  const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  for (const [route, file] of [
    ['/privacidade', 'privacidade.html'],
    ['/termos', 'termos.html'],
    ['/excluir-conta', 'excluir-conta.html'],
  ]) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /Vizinho Certo/);
    assert.match(build, new RegExp(file.replace('.', '\\.')));
    assert.match(vercel, new RegExp(`"source": "${route}", "destination": "/${file.replace('.', '\\.')}"`));
  }
  assert.match(fs.readFileSync(path.join(root, 'privacidade.html'), 'utf8'), /localiza[cç][aã]o/i);
  const terms = fs.readFileSync(path.join(root, 'termos.html'), 'utf8');
  assert.match(terms, /conte[uú]do proibido/i);
  assert.match(terms, /explora[cç][aã]o e ao abuso sexual infantil/i);
  assert.match(terms, /material de abuso sexual infantil \(CSAM\)/i);
  assert.match(terms, /NCMEC/i);
  assert.match(terms, /ponto de contato designado para seguran[cç]a infantil/i);
  assert.match(fs.readFileSync(path.join(root, 'excluir-conta.html'), 'utf8'), /O que ser[aá] exclu[ií]do/i);
  for (const file of ['privacidade.html', 'termos.html', 'excluir-conta.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /vizinhocerto1@gmail\.com/);
    assert.doesNotMatch(html, /designvarotto@gmail\.com/);
  }
  const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(home, /href="\/privacidade"/);
  assert.match(home, /href="\/termos"/);
  assert.match(home, /href="\/excluir-conta"/);
});

test('deploy permanece dentro do limite de doze funcoes da Vercel Hobby', () => {
  const apiFiles = fs.readdirSync(path.join(root, 'api')).filter(file => file.endsWith('.js'));
  assert.equal(apiFiles.length, 12);
  const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  assert.match(html, /\/api\/anuncio\?action=update/);
  assert.match(html, /\/api\/anuncio\?action=delete/);
  assert.match(vercel, /\/api\/anuncio-update.*\/api\/anuncio\?action=update/);
  assert.match(vercel, /\/api\/anuncio-delete.*\/api\/anuncio\?action=delete/);
});
