/**
 * Gera neste computador o executável do usuário final, sem passar pelo GitHub:
 *   construir/dist/HUB-Simuladores.exe   (HUB inteiro embutido: baixar, abrir, ele se instala)
 *
 *   node construir/construir.js
 *
 * Funciona em Windows ou Linux (o .exe do Windows é montado com o node.exe oficial).
 * Para publicar versões com atualização automática, use o PUBLICAR-VERSAO.bat (GitHub).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const M = require('./montar');

const passo = (t) => console.log(`\n== ${t} ==`);

(async () => {
  const versao = M.versaoHub();
  const [maior] = process.versions.node.split('.').map(Number);
  if (maior < 20) throw new Error(`Node ${process.versions.node}: o executável precisa do Node 20 ou mais novo.`);
  console.log(`HUB ${versao} com Node ${process.versions.node}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-construir-'));
  const pasta = path.join(tmp, 'HUB-Simuladores');
  passo('Arquivos'); M.montarPasta(pasta);
  passo('Dependências (npm install)'); M.instalarDependencias(pasta);
  passo('npm embutido'); M.copiarNpm(pasta);
  passo('Executável');
  const pacote = M.empacotar(pasta);
  const dist = path.join(M.AQUI, 'dist'); fs.mkdirSync(dist, { recursive: true });
  const exe = path.join(dist, 'HUB-Simuladores.exe');
  await M.gerarExe(exe, process.platform === 'win32' ? process.execPath : M.nodeWindows(), { windows: true, versao, pacote });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nPronto: ${exe}`);
  console.log('Sem canal.json, este .exe não procura atualizações (use o GitHub para isso).');
})().catch((e) => { console.error(`\n[ERRO] ${e.message}`); process.exit(1); });
