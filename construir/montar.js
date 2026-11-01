/**
 * Montagem da distribuição do HUB (usado por construir.js e publicar.js).
 *
 *   montarPasta(saida, opcoes)    copia HUB, simuladores (sem dados do usuário), rede, modelo...
 *   instalarDependencias(saida)   npm install no HUB e em cada simulador
 *   copiarNpm(saida)              npm embutido em runtime/npm (botão "Instalar dependências")
 *   nodeWindows(versao)           baixa o node.exe oficial (pacote npm node-win-x64)
 *   empacotar(pasta)              pasta inteira num pacote único (embutido no .exe do usuário final)
 *   gerarExe(exe, base, opcoes)   Node + sea-main.js (+ pacote) = executável (ícone e versão no Windows)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const path = require('path');
const { spawnSync } = require('child_process');

const AQUI = __dirname;
const RAIZ = path.resolve(AQUI, '..');
const FUSIVEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const versaoHub = () => JSON.parse(fs.readFileSync(path.join(RAIZ, 'hub', 'package.json'), 'utf8')).version;

function rodar(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`Falhou: ${cmd} ${args.join(' ')} (em ${cwd})`);
}

function copiar(de, para, ignorar = []) {
  fs.cpSync(de, para, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(de, src).split(path.sep).join('/');
      if (!rel) return true;
      const partes = rel.split('/');
      if (partes.includes('node_modules') || partes.includes('.git')) return false;
      return !ignorar.some((i) => rel === i.replace(/\/$/, '') || rel.startsWith(i.endsWith('/') ? i : `${i}/`));
    },
  });
}

/** Copia tudo o que vai para o usuário. Nunca leva dados de uso (hub-config.json, backups, data/...). */
function montarPasta(saida, { log = console.log } = {}) {
  fs.rmSync(saida, { recursive: true, force: true });
  fs.mkdirSync(saida, { recursive: true });
  copiar(path.join(RAIZ, 'hub'), path.join(saida, 'hub'));
  copiar(path.join(RAIZ, 'rede'), path.join(saida, 'rede'));
  copiar(path.join(RAIZ, 'modelo-simulador'), path.join(saida, 'modelo-simulador'));
  for (const a of ['README.md', 'NOVIDADES.md', 'canal.json']) {
    if (fs.existsSync(path.join(RAIZ, a))) fs.copyFileSync(path.join(RAIZ, a), path.join(saida, a));
  }
  const pastaSims = path.join(RAIZ, 'simuladores');
  for (const nome of fs.readdirSync(pastaSims)) {
    const de = path.join(pastaSims, nome);
    if (!fs.statSync(de).isDirectory() || nome.startsWith('_')) continue;
    let preservar = ['data/'];
    try { preservar = JSON.parse(fs.readFileSync(path.join(de, 'simulador.json'), 'utf8')).preservarAoAtualizar || preservar; } catch (_) { /* sem ficha */ }
    copiar(de, path.join(saida, 'simuladores', nome), preservar);
    log(`  [OK] ${nome}`);
  }
}

function instalarDependencias(saida, { log = console.log } = {}) {
  const pastas = [path.join(saida, 'hub'), ...fs.readdirSync(path.join(saida, 'simuladores')).map((n) => path.join(saida, 'simuladores', n))];
  for (const pasta of pastas) {
    const pkg = JSON.parse(fs.readFileSync(path.join(pasta, 'package.json'), 'utf8'));
    if (!Object.keys(pkg.dependencies || {}).length) continue;
    log(`  > npm install em ${path.relative(saida, pasta)}`);
    rodar(NPM, ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], pasta);
  }
}

function copiarNpm(saida, { log = console.log } = {}) {
  const base = path.dirname(process.execPath);
  const origem = [path.join(base, 'node_modules', 'npm'), path.join(base, '..', 'lib', 'node_modules', 'npm')]
    .find((p) => fs.existsSync(path.join(p, 'bin', 'npm-cli.js')));
  if (!origem) { log('  [!] npm não encontrado junto do Node: o botão "Instalar dependências" vai precisar de Node no PC.'); return false; }
  fs.cpSync(origem, path.join(saida, 'runtime', 'npm'), { recursive: true });
  log(`  [OK] npm ${JSON.parse(fs.readFileSync(path.join(origem, 'package.json'), 'utf8')).version} em runtime/npm`);
  return true;
}

/**
 * Pacote único com todos os arquivos da pasta (formato lido pelo sea-main.js):
 *   gzip( "HUBPKG1\n" + repetido [u32 tamanho do nome][nome][u32 tamanho alto][u32 tamanho baixo][bytes] )
 */
function empacotar(pasta) {
  const partes = [Buffer.from('HUBPKG1\n')];
  const andar = (dir) => {
    for (const nome of fs.readdirSync(dir).sort()) {
      const cheio = path.join(dir, nome);
      const st = fs.lstatSync(cheio);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { andar(cheio); continue; }
      const rel = Buffer.from(path.relative(pasta, cheio).split(path.sep).join('/'));
      const dados = fs.readFileSync(cheio);
      const cab = Buffer.alloc(4 + rel.length + 8);
      cab.writeUInt32LE(rel.length, 0); rel.copy(cab, 4);
      cab.writeUInt32LE(Math.floor(dados.length / 0x100000000), 4 + rel.length);
      cab.writeUInt32LE(dados.length % 0x100000000, 8 + rel.length);
      partes.push(cab, dados);
    }
  };
  andar(pasta);
  return zlib.gzipSync(Buffer.concat(partes), { level: 9 });
}

/**
 * node.exe oficial do Windows, da MESMA versão do Node que está rodando (o blob do executável
 * depende da versão). Vem do pacote npm node-win-x64; fica em cache em construir/.cache.
 */
function nodeWindows(versao = process.versions.node, { log = console.log } = {}) {
  const cache = path.join(AQUI, '.cache', `node-win-x64-${versao}`);
  const exe = path.join(cache, 'package', 'bin', 'node.exe');
  if (fs.existsSync(exe)) return exe;
  fs.mkdirSync(cache, { recursive: true });
  log(`  baixando node.exe ${versao} (pacote npm node-win-x64)...`);
  const r = spawnSync(NPM, ['pack', `node-win-x64@${versao}`, '--silent'], { cwd: cache, encoding: 'utf8', shell: process.platform === 'win32' });
  const tgz = (r.stdout || '').trim().split('\n').pop();
  if (r.status !== 0 || !tgz || !fs.existsSync(path.join(cache, tgz))) {
    throw new Error(`Não achei o node.exe ${versao} no npm. Use no pipeline uma imagem node com versão que exista em "npm view node-win-x64 versions".`);
  }
  const t = spawnSync('tar', ['xzf', tgz], { cwd: cache });
  if (t.status !== 0) throw new Error('Falha ao extrair o node.exe.');
  fs.rmSync(path.join(cache, tgz));
  return exe;
}

/**
 * Gera o executável: copia o Node base, injeta o sea-main.js e, se for Windows, troca ícone e versão.
 * Ordem importante: injetar ANTES de editar os recursos (na ordem inversa o .exe pode corromper).
 */
async function gerarExe(exe, nodeBase, { windows, versao = versaoHub(), pacote = null, log = console.log } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-sea-'));
  const blob = path.join(tmp, 'sea.blob');
  const cfg = path.join(tmp, 'sea-config.json');
  const seaCfg = { main: path.join(AQUI, 'sea-main.js'), output: blob, disableExperimentalSEAWarning: true };
  if (pacote) {
    // HUB embutido: o executável vira instalador (ver sea-main.js)
    fs.writeFileSync(path.join(tmp, 'pacote.bin'), pacote);
    fs.writeFileSync(path.join(tmp, 'versao.txt'), JSON.stringify({ versao, canal: fs.existsSync(path.join(RAIZ, 'canal.json')) }));
    seaCfg.assets = { 'pacote.bin': path.join(tmp, 'pacote.bin'), 'versao.txt': path.join(tmp, 'versao.txt') };
  }
  fs.writeFileSync(cfg, JSON.stringify(seaCfg));
  rodar(process.execPath, ['--experimental-sea-config', cfg], AQUI);
  fs.copyFileSync(nodeBase, exe);
  const { inject } = require('postject');
  await inject(exe, 'NODE_SEA_BLOB', fs.readFileSync(blob), { sentinelFuse: FUSIVEL, overwrite: true });
  if (windows) {
    const ResEdit = await import('resedit');
    const PE = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
    const res = ResEdit.NtExecutableResource.from(PE);
    const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(AQUI, 'hub.ico')));
    const grupo = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)[0];
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, grupo ? grupo.id : 1, grupo ? grupo.lang : 1033, ico.icons.map((i) => i.data));
    const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
    const [a, b, c] = versao.split('.').map(Number);
    vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      FileDescription: 'HUB de Simuladores Industriais', ProductName: 'HUB de Simuladores', CompanyName: 'Samuel Felipe Moreira',
      OriginalFilename: 'HUB Simuladores.exe', InternalName: 'HUB Simuladores', LegalCopyright: 'MIT', ProductVersion: versao, FileVersion: versao,
    });
    vi.outputToResourceEntries(res.entries);
    res.outputResource(PE);
    fs.writeFileSync(exe, Buffer.from(PE.generate()));
    const conf = ResEdit.NtExecutableResource.from(ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true }));
    if (!conf.entries.some((e) => String(e.id) === 'NODE_SEA_BLOB')) throw new Error('O código do HUB sumiu do executável depois da troca de ícone.');
    log('  [OK] ícone e versão aplicados');
  } else {
    fs.chmodSync(exe, 0o755);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`  [OK] ${path.basename(exe)} (${(fs.statSync(exe).size / 1048576).toFixed(0)} MB)`);
}

module.exports = { AQUI, RAIZ, versaoHub, copiar, montarPasta, instalarDependencias, copiarNpm, empacotar, nodeWindows, gerarExe };
