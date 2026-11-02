/**
 * Ponto de entrada do "HUB-Simuladores.exe" (Node.js Single Executable Application).
 *
 * O mesmo executável faz três papéis:
 *   1. INSTALADOR: baixado sozinho (sem a pasta hub/ ao lado), ele traz o HUB inteiro embutido.
 *      Na primeira vez instala em %LOCALAPPDATA%\HUB-Simuladores, cria os atalhos e abre o HUB.
 *      Nas vezes seguintes, só abre o HUB instalado.
 *   2. HUB: dentro da pasta instalada (com hub/ ao lado), abre o HUB.
 *   3. NODE: "--rodar script.js" roda um script, como "node script.js" (usado pelos simuladores).
 *
 * O código do HUB e dos simuladores fica em arquivos na pasta instalada; as atualizações trocam
 * esses arquivos sem precisar trocar o .exe.
 */
'use strict';
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');

const base = path.dirname(process.execPath);
const WIN = process.platform === 'win32';

function rodar(script, resto) {
  const abs = path.resolve(script);
  if (!fs.existsSync(abs)) { console.error(`Arquivo não encontrado: ${abs}`); process.exit(1); }
  process.argv = [process.execPath, abs, ...resto];
  createRequire(abs)(abs);
}

// ------------------------------------------------------------------ instalação a partir do pacote embutido
function pacoteEmbutido() {
  try {
    const sea = require('node:sea');
    if (!sea.isSea()) return null;
    const info = JSON.parse(sea.getAsset('versao.txt', 'utf8'));
    return { dados: Buffer.from(sea.getRawAsset('pacote.bin')), versao: info.versao, temCanal: !!info.canal };
  } catch (_) { return null; }
}

/** Formato do pacote (gzip): "HUBPKG1\n" + repetido [u32 tamanho do nome][nome][u32 tamanho alto][u32 tamanho baixo][bytes] */
function extrair(buf, destino) {
  const d = zlib.gunzipSync(buf);
  if (d.subarray(0, 8).toString() !== 'HUBPKG1\n') throw new Error('Pacote embutido inválido.');
  let p = 8; let n = 0;
  while (p < d.length) {
    const tn = d.readUInt32LE(p); p += 4;
    const nome = d.subarray(p, p + tn).toString('utf8'); p += tn;
    const tam = d.readUInt32LE(p) * 0x100000000 + d.readUInt32LE(p + 4); p += 8;
    if (nome.split('/').includes('..')) throw new Error(`Caminho inseguro no pacote: ${nome}`);
    const alvo = path.join(destino, ...nome.split('/'));
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, d.subarray(p, p + tam)); p += tam; n++;
  }
  return n;
}

function compararVersoes(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0); const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
}

/** O HUB instalado está aberto? (não dá para trocar os arquivos com ele rodando) */
function hubAberto(pasta) {
  let porta = 4000;
  try { porta = JSON.parse(fs.readFileSync(path.join(pasta, 'hub-config.json'), 'utf8')).hubPorta || 4000; } catch (_) { /* padrão */ }
  const net = require('node:net');
  return new Promise((ok) => {
    const c = net.connect({ port: porta, host: '127.0.0.1' });
    c.once('connect', () => { c.destroy(); ok(true); });
    c.once('error', () => ok(false));
  });
}

/**
 * Atualiza uma instalação existente com o pacote embutido (versão maior, ou instalação sem
 * origem de atualização). Troca hub/, rede/, runtime/... e os simuladores que mudaram de versão;
 * mantém hub-config.json, backups/ e os dados de cada simulador (preservarAoAtualizar).
 */
function atualizarInstalacao(pacote, destino) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-exe-'));
  try {
    extrair(pacote.dados, tmp);
    const lerJson = (arq) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (_) { return null; } };
    for (const item of fs.readdirSync(tmp)) {
      if (item === 'simuladores') continue;
      fs.rmSync(path.join(destino, item), { recursive: true, force: true });
      fs.cpSync(path.join(tmp, item), path.join(destino, item), { recursive: true });
    }
    const simsNovos = path.join(tmp, 'simuladores');
    for (const nome of fs.existsSync(simsNovos) ? fs.readdirSync(simsNovos) : []) {
      const novo = path.join(simsNovos, nome); const atual = path.join(destino, 'simuladores', nome);
      const vNova = lerJson(path.join(novo, 'package.json'))?.version; const vAtual = lerJson(path.join(atual, 'package.json'))?.version;
      if (vAtual && vAtual === vNova) continue;
      const preservar = (lerJson(path.join(novo, 'simulador.json'))?.preservarAoAtualizar || ['data/']).map((x) => x.replace(/[\\/]+$/, ''));
      const guardado = path.join(tmp, `_dados-${nome}`);
      for (const item of preservar) if (fs.existsSync(path.join(atual, item))) fs.cpSync(path.join(atual, item), path.join(guardado, item), { recursive: true });
      fs.rmSync(atual, { recursive: true, force: true });
      fs.cpSync(novo, atual, { recursive: true });
      if (fs.existsSync(guardado)) fs.cpSync(guardado, atual, { recursive: true, force: true });
      console.log(`  [OK] ${nome} ${vAtual || '(novo)'} -> ${vNova}`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

const versaoDe = (pasta) => { try { return JSON.parse(fs.readFileSync(path.join(pasta, 'hub', 'package.json'), 'utf8')).version; } catch (_) { return null; } };

function criarAtalhos(exe, pasta) {
  if (!WIN) return;
  const ps = `$w = New-Object -ComObject WScript.Shell
foreach ($d in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'))) {
  $s = $w.CreateShortcut((Join-Path $d 'HUB de Simuladores.lnk'))
  $s.TargetPath = '${exe.replace(/'/g, "''")}'
  $s.WorkingDirectory = '${pasta.replace(/'/g, "''")}'
  $s.IconLocation = '${exe.replace(/'/g, "''")},0'
  $s.Description = 'HUB de Simuladores Industriais'
  $s.Save()
}`;
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { windowsHide: true });
}

async function instalarEAbrir(pacote, argsExtras) {
  const destino = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'HUB-Simuladores');
  const exeInstalado = path.join(destino, WIN ? 'HUB Simuladores.exe' : 'HUB Simuladores');
  const instalada = versaoDe(destino);
  let primeira = false;
  if (!instalada) {
    console.log('');
    console.log('  HUB de Simuladores');
    console.log(`  Instalando a versão ${pacote.versao} em ${destino} ...`);
    fs.mkdirSync(destino, { recursive: true });
    const n = extrair(pacote.dados, destino);
    fs.copyFileSync(process.execPath, exeInstalado);
    if (!WIN) fs.chmodSync(exeInstalado, 0o755);
    criarAtalhos(exeInstalado, destino);
    console.log(`  [OK] ${n} arquivos instalados. Atalho "HUB de Simuladores" criado na Área de Trabalho e no Menu Iniciar.`);
    console.log('  Abrindo o HUB...');
    primeira = true;
  } else {
    const semCanal = !fs.existsSync(path.join(destino, 'canal.json')) && !fs.existsSync(path.join(destino, 'canal.local.json'));
    const trazCanal = pacote.temCanal;
    if (compararVersoes(pacote.versao, instalada) > 0 || (semCanal && trazCanal)) {
      if (await hubAberto(destino)) {
        console.log('');
        console.log(`  Este arquivo traz o HUB ${pacote.versao}, mas o HUB ${instalada} está aberto.`);
        console.log('  Feche o HUB e abra este arquivo de novo para atualizar.');
        setTimeout(() => process.exit(0), 12000);
        return;
      }
      console.log('');
      console.log(compararVersoes(pacote.versao, instalada) > 0
        ? `  Atualizando o HUB ${instalada} -> ${pacote.versao} (seus dados ficam preservados)...`
        : '  Ativando as atualizações automáticas do HUB (seus dados ficam preservados)...');
      atualizarInstalacao(pacote, destino);
      fs.copyFileSync(process.execPath, exeInstalado);
      if (!WIN) fs.chmodSync(exeInstalado, 0o755);
      criarAtalhos(exeInstalado, destino);
      console.log('  [OK] Atualizado. Abrindo o HUB...');
    } else if (!fs.existsSync(exeInstalado)) {
      fs.copyFileSync(process.execPath, exeInstalado);   // pasta existe mas o .exe sumiu
    }
  }
  // abre o HUB instalado numa janela própria e encerra este instalador
  const filho = spawn(exeInstalado, [...(primeira ? ['--primeira-instalacao'] : []), ...argsExtras], { cwd: destino, detached: true, stdio: 'ignore', windowsHide: false });
  filho.unref();
  setTimeout(() => process.exit(0), primeira ? 2500 : 300);
}

// ------------------------------------------------------------------ escolha do papel
// No executável, process.argv[1] pode repetir o caminho do .exe: os argumentos reais vêm depois
const inicio = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(process.execPath) ? 2 : 1;
const a = process.argv.slice(inicio);

if (a[0] === '--rodar' && a[1]) rodar(a[1], a.slice(2));
else if (a[0] && /\.(c?js)$/i.test(a[0]) && fs.existsSync(a[0])) rodar(a[0], a.slice(1));
else if (fs.existsSync(path.join(base, 'hub', 'server.js'))) {
  if (WIN && !a.includes('--oculto') && !a.includes('--com-janela')) {
    // abre o motor do HUB sem a janela preta e encerra este processo (a tela do HUB abre sozinha)
    spawn(process.execPath, ['--oculto', ...a], { cwd: base, detached: true, stdio: 'ignore', windowsHide: true }).unref();
    process.exit(0);
  } else rodar(path.join(base, 'hub', 'server.js'), a);
}
else {
  const pacote = pacoteEmbutido();
  if (!pacote) { console.error('Este executável não tem o HUB embutido nem a pasta hub ao lado.'); process.exit(1); }
  instalarEAbrir(pacote, a).catch((e) => {
    console.error(`\n  [ERRO] Não foi possível instalar o HUB: ${e.message}`);
    console.error('  Feche esta janela e tente de novo. Se continuar, avise quem distribuiu o HUB.');
    setTimeout(() => process.exit(1), 15000);
  });
}
