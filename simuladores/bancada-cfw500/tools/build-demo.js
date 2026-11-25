'use strict';
/* Gera dist/bancada-cfw500.html: a bancada inteira num único arquivo, para abrir direto no navegador (sem servidor)
 * ou publicar como página. O three.js vem da internet (jsDelivr, versão 0.160.0 fixa); todo o resto vai embutido.
 * Uso: node tools/build-demo.js */
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..'), pub = path.join(raiz, 'public');
const ler = (p) => fs.readFileSync(path.join(pub, p), 'utf8');
let html = ler('index.html');
const css = ler('css/estilo.css').replace(/\/\*FONTES\*\/[\s\S]*?\/\*\/FONTES\*\/\n?/, '');
const js = ['core/params.js', 'core/hmi.js', 'core/cfw500.js', 'core/bancada.js', 'core/missoes.js', 'js/lcd.js', 'js/cena.js', 'js/app.js'].map((f) => `/* ---- ${f} ---- */\n${ler(f)}`).join('\n');
if (/<\/script/i.test(js)) throw new Error('há "</script" dentro do código: o arquivo único quebraria');
const troca = (marca, novo) => { const re = new RegExp(`<!--${marca}-->[\\s\\S]*?<!--/${marca}-->`); if (!re.test(html)) throw new Error('marca ' + marca + ' não encontrada'); html = html.replace(re, () => novo); };
troca('ICO', '');
troca('CSS', `<style>\n${css}</style>`);
troca('JS', `<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>\n<script>\n${js}\n</script>`);
fs.mkdirSync(path.join(raiz, 'dist'), { recursive: true });
const saida = path.join(raiz, 'dist', 'bancada-cfw500.html');
fs.writeFileSync(saida, html);
console.log(`${saida}: ${(fs.statSync(saida).size / 1024).toFixed(0)} kB`);
