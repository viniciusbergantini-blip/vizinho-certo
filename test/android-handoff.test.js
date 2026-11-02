const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('mantem o contrato fixo da TWA e a associacao do dominio', () => {
  const twa = JSON.parse(fs.readFileSync(path.join(root, 'android', 'twa-manifest.json'), 'utf8'));
  const assetLinks = JSON.parse(fs.readFileSync(path.join(root, '.well-known', 'assetlinks.json'), 'utf8'));
  const androidTarget = assetLinks.find(item => item?.target?.namespace === 'android_app')?.target;

  assert.equal(twa.packageId, 'br.com.vizinhocerto.app');
  assert.equal(twa.host, 'www.vizinhocerto.com.br');
  assert.equal(twa.startUrl, '/app');
  assert.equal(twa.signingKey.alias, 'vizinhocerto-upload');
  assert.equal(twa.signingKey.path, './vizinhocerto-upload.keystore');
  assert.equal(twa.features?.locationDelegation?.enabled, true);
  assert.equal(twa.features?.playBilling?.enabled, true);
  assert.equal(androidTarget?.package_name, twa.packageId);
  assert.deepEqual(
    androidTarget?.sha256_cert_fingerprints,
    twa.fingerprints.map(item => item.value),
  );
});

test('mantem o projeto Android sincronizado com o manifesto Bubblewrap', () => {
  const manifestPath = path.join(root, 'android', 'twa-manifest.json');
  const checksum = fs.readFileSync(path.join(root, 'android', 'manifest-checksum.txt'), 'utf8');
  const expected = crypto.createHash('sha1').update(fs.readFileSync(manifestPath)).digest('hex');
  const gradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8');
  const gradleWrapper = fs.readFileSync(
    path.join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'),
    'utf8',
  );
  const androidManifest = fs.readFileSync(
    path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    'utf8',
  );

  assert.equal(checksum, expected);
  assert.match(gradle, /com\.google\.androidbrowserhelper:locationdelegation:1\.1\.2/);
  assert.match(gradleWrapper, /distributionUrl=.*gradle-8\.11\.1-bin\.zip/);
  assert.match(gradleWrapper, /distributionSha256Sum=[a-f0-9]{64}/);
  assert.match(androidManifest, /android:name="\.DelegationService"/);
});

test('mantem materiais de assinatura e saidas Android fora do Git', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\*\.keystore$/m);
  assert.match(gitignore, /^\*\.jks$/m);
  assert.match(gitignore, /^android\/\*\*\/\*\.apk$/m);
  assert.match(gitignore, /^android\/\*\*\/\*\.aab$/m);
  assert.match(gitignore, /^android\/\*\*\/build\/$/m);
});

test('publica assetlinks e preserva as rotas publicas existentes', () => {
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-public.js'), 'utf8');
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const rewrites = new Map(vercel.rewrites.map(item => [item.source, item.destination]));

  assert.match(build, /\.well-known[\s\S]*assetlinks\.json/);
  assert.equal(rewrites.get('/app'), '/app.html');
  assert.equal(rewrites.get('/maringa'), '/maringa.html');
  assert.equal(rewrites.get('/londrina'), '/londrina.html');
  assert.equal(rewrites.get('/indaiatuba'), '/indaiatuba.html');
  assert.equal(rewrites.get('/saojoao'), '/app.html');
});
