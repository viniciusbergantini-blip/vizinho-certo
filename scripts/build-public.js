const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'public');
const publicFiles = [
  'index.html',
  'app.html',
  'dashboard.html',
  'saojoao.html',
  'maringa.html',
  'londrina.html',
  'indaiatuba.html',
  'privacidade.html',
  'termos.html',
  'excluir-conta.html',
  'offline.html',
  'app-runtime.js',
  'install-app.js',
  'engagement.js',
  'emergency-contacts.js',
  'landing-analytics.js',
  'landing-page.js',
  'landing-session.js',
  'sw.js',
  'landing.css',
  'legal.css',
  'manifest.json',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
];
const assetLinksSource = path.resolve(root, '.well-known', 'assetlinks.json');

if (path.dirname(output) !== root || path.basename(output) !== 'public') {
  throw new Error('Diretorio de saida invalido');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const relativePath of publicFiles) {
  const source = path.resolve(root, relativePath);
  if (path.dirname(source) !== root || !fs.existsSync(source)) {
    throw new Error(`Arquivo publico ausente ou invalido: ${relativePath}`);
  }
  fs.copyFileSync(source, path.join(output, relativePath));
}

if (!fs.existsSync(assetLinksSource)) {
  throw new Error('Arquivo publico ausente ou invalido: .well-known/assetlinks.json');
}
const assetLinksDestination = path.join(output, '.well-known', 'assetlinks.json');
fs.mkdirSync(path.dirname(assetLinksDestination), { recursive: true });
fs.copyFileSync(assetLinksSource, assetLinksDestination);

console.log(`Build publico concluido: ${publicFiles.length} arquivos permitidos e assetlinks.json.`);
