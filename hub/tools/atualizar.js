/**
 * Atualização por .zip, pela linha de comando (uso do desenvolvedor):  node hub/tools/atualizar.js <arquivo.zip>
 *   - zip de um simulador        → importa / atualiza o simulador (com backup)
 *   - zip do HUB completo        → troca o HUB e atualiza os simuladores que vierem nele
 * Preserva sempre: hub-config.json, backups/ e os dados de cada simulador.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const { RAIZ } = require('../lib/config');

const zip = process.argv[2];
if (!zip || !fs.existsSync(zip)) {
  console.log('Uso: node hub/tools/atualizar.js <arquivo.zip>');
  console.log('     (zip de um simulador ou zip do HUB completo)');
  process.exit(1);
}

function hubAberto() {
  let porta = 4000;
  try { porta = JSON.parse(fs.readFileSync(path.join(RAIZ, 'hub-config.json'), 'utf8')).hubPorta || 4000; } catch (_) { /* padrão */ }
  return new Promise((ok) => {
    const c = net.connect({ port: porta, host: '127.0.0.1' });
    c.once('connect', () => { c.destroy(); ok(true); });
    c.once('error', () => ok(false));
  });
}


async function atualizarHub(AdmZip, buf) {
  // mesmo aplicador da atualização automática (sem exigir assinatura: o arquivo veio de você)
  await require('../lib/atualizador').aplicarPacote(buf, { log: (t) => console.log(t) });
}

(async () => {
  if (await hubAberto()) { console.log('Feche a janela do HUB antes de atualizar.'); process.exit(1); }
  let AdmZip;
  try { AdmZip = require('adm-zip'); } catch (_) { console.log('Falta a dependência adm-zip. Rode o HUB-DESENVOLVEDOR.bat uma vez (ele instala).'); process.exit(1); }
  const buf = fs.readFileSync(zip);
  const nomes = new AdmZip(buf).getEntries().map((e) => e.entryName.replace(/\\/g, '/'));
  const ehHub = nomes.some((n) => /(^|\/)hub\/server\.js$/.test(n)) && nomes.some((n) => /(^|\/)hub\/lib\/atualizador\.js$/.test(n));
  try {
    if (ehHub) await atualizarHub(AdmZip, buf);
    else {
      const r = await require('../lib/importar').importar(buf, null);
      console.log(r.acao === 'novo' ? `Simulador novo: ${r.nome} ${r.versaoDepois}` : `${r.nome}: ${r.versaoAntes} → ${r.versaoDepois} (a versão anterior ficou em backups/)`);
      for (const a of r.avisos) console.log(`  [!] ${a}`);
      if (r.precisaInstalar) require('child_process').spawnSync(process.execPath, [...(require('../lib/runtime').sea ? ['--rodar'] : []), path.join(RAIZ, 'hub', 'tools', 'instalar.js')], { stdio: 'inherit' });
    }
    console.log('\nAtualização concluída.');
  } catch (e) { console.error(`\n[ERRO] ${e.message}`); process.exit(1); }
})();
