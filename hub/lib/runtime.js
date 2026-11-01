/**
 * Runtime: como executar Node e npm.
 *
 * O HUB roda de dois jeitos:
 *   - com o Node instalado no PC:        node hub/server.js
 *   - pelo executável "HUB Simuladores.exe" (Node embutido, ver construir/)
 * No executável não existe "node.exe": o próprio .exe roda os simuladores com
 * o argumento --rodar <script>, e o npm vem na pasta runtime/npm.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { RAIZ } = require('./config');

let sea = false;
try { sea = require('node:sea').isSea(); } catch (_) { /* Node antigo */ }

/** Comando para rodar um script .js com o Node do HUB. */
function node(args) {
  return { comando: process.execPath, args: sea ? ['--rodar', ...args] : args, shell: false };
}

/** Comando npm: o da pasta runtime/npm (pacote do executável) ou o do PC. */
function npm(args) {
  const local = path.join(RAIZ, 'runtime', 'npm', 'bin', 'npm-cli.js');
  // no executável não há "node" para os scripts de instalação dos pacotes; os pacotes usados trazem binários prontos
  const extra = sea ? ['--ignore-scripts'] : [];
  if (fs.existsSync(local)) return { ...node([local, ...args, ...extra]), shell: false };
  return { comando: 'npm', args: [...args, ...extra], shell: true };
}

module.exports = { sea, node, npm };
