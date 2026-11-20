'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), target = path.join(root, 'site');
// Only ever replace this project's generated site directory.
if (path.dirname(target) !== root) throw new Error('Invalid output path');
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(path.join(root, 'source/dist'), target, { recursive: true });
fs.cpSync(path.join(root, 'web'), target, { recursive: true });
fs.copyFileSync(path.join(root, 'fonts/OFL.txt'), path.join(target, 'fonts/OFL.txt'));
let html = fs.readFileSync(path.join(target, 'index.html'), 'utf8');
const inlineHashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => "'sha256-" + crypto.createHash('sha256').update(m[1]).digest('base64') + "'").join(' ');
html = html.replace('</head>', `<link rel="manifest" href="./manifest.webmanifest">
  <link rel="apple-touch-icon" href="./icons/icon-192.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="قاب‌چین">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' ${inlineHashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.github.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'">
  <link rel="stylesheet" href="./workspace.css">
</head>`).replace('</body>', '<script type="module" src="./workspace.mjs"></script>\n</body>');
fs.writeFileSync(path.join(target, 'index.html'), html);
fs.writeFileSync(path.join(target, '.nojekyll'), '');
const entries = fs.readdirSync(target, { recursive: true }).filter(f => fs.statSync(path.join(target, f)).isFile() && f !== 'sw.js').sort();
const version = crypto.createHash('sha256');
for (const f of entries) version.update(fs.readFileSync(path.join(target, f)));
let sw = fs.readFileSync(path.join(root, 'web/sw.js'), 'utf8');
sw = sw.replace('__BUILD__', version.digest('hex').slice(0, 16)).replace('__PRECACHE__', JSON.stringify(entries.map(f => './' + f.split(path.sep).join('/'))));
fs.writeFileSync(path.join(target, 'sw.js'), sw);
console.log('Web app built:', entries.length, 'files');
