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
const js = ['core/params.js', 'core/hmi.js', 'core/cfw500.js', 'core/bancada.js', 'core/missoes.js', 'js/lcd.js', 'js/cena.js', 'js/campo.js', 'js/app.js'].map((f) => `/* ---- ${f} ---- */\n${ler(f)}`).join('\n');
if (/<\/script/i.test(js)) throw new Error('há "</script" dentro do código: o arquivo único quebraria');
const troca = (marca, novo) => { const re = new RegExp(`<!--${marca}-->[\\s\\S]*?<!--/${marca}-->`); if (!re.test(html)) throw new Error('marca ' + marca + ' não encontrada'); html = html.replace(re, () => novo); };
troca('ICO', '');
troca('CSS', `<style>\n${css}</style>`);
troca('JS', `<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>\n<script>\n${js}\n</script>`);
fs.mkdirSync(path.join(raiz, 'dist'), { recursive: true });
const saida = path.join(raiz, 'dist', 'bancada-cfw500.html');
fs.writeFileSync(saida, html);
console.log(`${saida}: ${(fs.statSync(saida).size / 1024).toFixed(0)} kB`);

// ---- versão OFFLINE: three.js e as fontes embutidos (abre sem internet, com dois cliques). Uso: node tools/build-demo.js
// O three.min.js (UMD, 0.160.0) vem de tools/vendor/ se existir, senão do npm (npm pack three@0.160.0).
const umd = [path.join(__dirname, 'vendor', 'three.min.js'), '/tmp/three160/package/build/three.min.js'].find((f) => fs.existsSync(f));
if (!umd) { console.log('three.min.js não encontrado: versão offline não gerada (rode: npm pack three@0.160.0 e extraia build/three.min.js em tools/vendor/)'); process.exit(0); }
const three = fs.readFileSync(umd, 'utf8').replace(/^console\.warn\('[^']*'\)/, 'void 0');   // tira só o aviso de "script obsoleto"; a vírgula fica (o resto é uma expressão)
if (/<\/script/i.test(three)) throw new Error('three.min.js contém "</script"');
const fonte = (n) => fs.readFileSync(path.join(pub, 'fonts', n)).toString('base64');
const fontes = `@font-face { font-family: 'Barlow'; src: url(data:font/woff2;base64,${fonte('barlow-latin-400-normal.woff2')}) format('woff2'); font-weight: 400; }\n@font-face { font-family: 'Barlow'; src: url(data:font/woff2;base64,${fonte('barlow-latin-600-normal.woff2')}) format('woff2'); font-weight: 600; }\n`;
const off = html.replace('<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>', () => `<script>/* three.js r160 (MIT) */\n${three}\n</script>`).replace('<style>\n', () => '<style>\n' + fontes);
if (off.includes('cdn.jsdelivr.net')) throw new Error('a versão offline ainda aponta para a internet');
const saida2 = path.join(raiz, 'dist', 'bancada-cfw500-offline.html');
fs.writeFileSync(saida2, off);
console.log(`${saida2}: ${(fs.statSync(saida2).size / 1024).toFixed(0)} kB (sem internet)`);
