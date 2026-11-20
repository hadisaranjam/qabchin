'use strict';
// قاب‌چین کمیک — ساخت نسخهٔ چندفایلی (source/dist) و تک‌فایلی (single-file) بدون هیچ وابستگی.
// اجرا از ریشهٔ بسته:  node tools/build.cjs
// ورودی‌ها:  source/index.html ، source/styles/*.css ، source/src/*.js (به ترتیب نام) ، fonts/*.woff2
// بخش‌های JS همه در یک IIFE کنار هم قرار می‌گیرند و دامنهٔ مشترک دارند؛ هیچ import/export ای در کار نیست.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(process.env.PKG_ROOT || path.join(__dirname, '..'));
const src = path.join(root, 'source'), dist = path.join(src, 'dist'), out = path.join(root, 'single-file');
const APP_VERSION = 27;

const read = f => fs.readFileSync(f, 'utf8');
const sections = fs.readdirSync(path.join(src, 'src')).filter(f => /^\d\d-[\w-]+\.js$/.test(f)).sort();
const js = '(function () {\n' + sections.map(f => `// ── ${f} ──\n` + read(path.join(src, 'src', f))).join('\n') + '})();\n';
if (/<\/script/i.test(js)) throw new Error('JS contains </script');
const styles = ['shared-ui.css', 'app.css'];
const cssFiles = Object.fromEntries(styles.map(f => [f, read(path.join(src, 'styles', f))]));
const fonts = fs.readdirSync(path.join(root, 'fonts')).filter(f => f.endsWith('.woff2')).sort();
let html = read(path.join(src, 'index.html'));
for (const f of styles) if (!html.includes(`<link rel="stylesheet" href="./${f}">`)) throw new Error('missing link ' + f);
if (!html.includes('<script src="./app.js"></script>')) throw new Error('missing script tag');

// ── چندفایلی
if (!dist.startsWith(root + path.sep)) throw new Error('Build output outside project');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'fonts'), { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), html);
fs.writeFileSync(path.join(dist, 'app.js'), js);
for (const f of styles) fs.writeFileSync(path.join(dist, f), cssFiles[f]);
for (const f of fonts) fs.copyFileSync(path.join(root, 'fonts', f), path.join(dist, 'fonts', f));

// ── تک‌فایلی: فونت‌ها base64 داخل CSS
let single = html;
for (const f of styles) {
  let css = cssFiles[f];
  for (const font of fonts) {
    const ref = `url("../fonts/${font}")`, ref2 = `url("./fonts/${font}")`;
    const data = `url("data:font/woff2;base64,${fs.readFileSync(path.join(root, 'fonts', font)).toString('base64')}")`;
    css = css.split(ref).join(data).split(ref2).join(data);
  }
  if (/url\("\.{1,2}\/fonts\//.test(css)) throw new Error('font not embedded in ' + f);
  single = single.replace(`<link rel="stylesheet" href="./${f}">`, () => `<style id="bundled-${f.replace('.css', '')}">${css}</style>`);
}
single = single.replace('<script src="./app.js"></script>', () => `<script id="bundled-js">${js}</script>`);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'comic-page-studio.html'), single);

// ── شناسنامهٔ منبع
const files = ['index.html', 'app.js', ...styles, ...fonts.map(f => 'fonts/' + f)].map(rel => {
  const data = fs.readFileSync(path.join(dist, rel));
  return { path: rel, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
});
const prov = path.join(root, 'SOURCE_PROVENANCE.json');
fs.writeFileSync(prov, JSON.stringify({ title: 'قاب‌چین کمیک', site_version: APP_VERSION, base_version: 25, sections, source_files: files, secrets_included: false, user_runtime_images_included: false }, null, 2) + '\n');
console.log('dist:', files.map(f => `${f.path} ${f.bytes}`).join(' · '));
console.log('single-file:', fs.statSync(path.join(out, 'comic-page-studio.html')).size, 'bytes');
