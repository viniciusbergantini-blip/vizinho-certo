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
  'offline.html',
  'app-runtime.js',
  'install-app.js',
  'engagement.js',
  'landing-analytics.js',
  'landing-page.js',
  'landing-session.js',
  'sw.js',
  'landing.css',
  'manifest.json',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
];

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

console.log(`Build publico concluido: ${publicFiles.length} arquivos permitidos.`);
