/* Gera a bancada em ARQUIVO ÚNICO, em modo demonstração (sem backend):
 *   node tools/build-demo.js            → dist/bancada-sca06-demo.html (abre direto no navegador)
 *   node tools/build-demo.js --artifact → dist/artifact.html (fragmento para publicação) */
'use strict';
const fs = require('fs'), path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', 'public', p), 'utf8');
const artifact = process.argv.includes('--artifact');
let html = R('index.html');
html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>\n${R('styles.css')}\n</style>`);
html = html.replace(/<script src="vendor\/three\.min\.js"><\/script>\s*<script>window\.THREE[^\n]*<\/script>/, '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script>window.FORCE_DEMO = true;</script>');
for (const f of ['core/sca06-core.js', 'bench3d.js', 'drive2d.js', 'demo.js', 'app.js', 'assistente-clp.js', 'assistente-sca06.js', 'divisorias.js']) html = html.replace(`<script src="${f}"></script>`, () => `<script>\n${R(f).replace(/<\/script/gi, '<\\/script')}\n</script>`);
if (artifact) {
  html = html.replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '').replace(/<meta charset="utf-8">\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '')
    .replace('</head>', '').replace('<body>', '').replace('</body>', '').replace('</html>', '')
    .replace('<title>Bancada SCA06 EtherNet/IP</title>', '<title>Bancada SCA06 EtherNet/IP</title>\n<style>html, body { height: 100%; background: #d5d8d3; }</style>');
}
const out = path.join(__dirname, '..', 'dist', artifact ? 'artifact.html' : 'bancada-sca06-demo.html');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html);
console.log('Gerado:', out, (html.length / 1024).toFixed(0) + ' KB');
