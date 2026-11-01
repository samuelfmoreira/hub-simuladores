/**
 * Instala as dependências do HUB e de cada simulador (npm install).
 *   node hub/tools/instalar.js            só onde estiver faltando
 *   node hub/tools/instalar.js --todos    em todos, mesmo se já houver
 * Usado pelo HUB-DESENVOLVEDOR.bat.
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { RAIZ } = require('../lib/config');
const catalogo = require('../lib/catalogo');
const runtime = require('../lib/runtime');

const todos = process.argv.includes('--todos');

function npmInstall(pasta, nome) {
  console.log(`\n> ${nome}: npm install`);
  const cmd = runtime.npm(['install', '--omit=dev', '--no-audit', '--no-fund']);
  const r = spawnSync(cmd.comando, cmd.args, { cwd: pasta, stdio: 'inherit', shell: cmd.shell });
  if (r.status !== 0) { console.error(`  [ERRO] npm install falhou em ${nome}. Verifique a internet ou o proxy.`); return false; }
  console.log(`  [OK] ${nome}`);
  return true;
}

let ok = true;
const hub = path.join(RAIZ, 'hub');
if (todos || !fs.existsSync(path.join(hub, 'node_modules', 'adm-zip'))) ok = npmInstall(hub, 'HUB') && ok;
else console.log('[OK] HUB já instalado');

for (const f of catalogo.listar()) {
  if (!todos && f.instalado) { console.log(`[OK] ${f.nome} já instalado`); continue; }
  ok = npmInstall(f.pasta, f.nome) && ok;
}
console.log(ok ? '\nTudo instalado.' : '\nAlguma instalação falhou. Veja as mensagens acima.');
process.exit(ok ? 0 : 1);
