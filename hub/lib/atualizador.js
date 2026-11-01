/**
 * Atualização automática do HUB.
 *
 *   canal.json (raiz)           onde procurar (gerado pelo GitHub Actions):
 *       { "github": "dono/repositorio" }                     repositório público: lê o release mais recente
 *       { "github": "dono/repositorio", "token": "..." }     repositório privado: API do GitHub com token só de leitura
 *       { "manifesto": "https://.../versao.json" }           qualquer outro servidor (ou pasta de rede)
 *   hub/chave-publica.pem       chave Ed25519 do publicador: só pacotes assinados por ela são aceitos
 *
 *   versao.json (publicado pelo pipeline):
 *     { "versao": "1.4.0", "pacote": "url ou nome do .zip", "sha256": "...", "assinatura": "base64", "notas": "markdown", "publicadoEm": "..." }
 *   A assinatura cobre o texto  hub-simuladores|<versao>|<sha256>  (versão e conteúdo ficam presos um ao outro).
 *
 * Aplicar: troca a pasta hub/ e os arquivos da raiz, atualiza os simuladores que mudaram de versão
 * (com backup e preservando os dados) e mantém hub-config.json, backups/, runtime/ e o .exe.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { RAIZ } = require('./config');

const CANAL = path.join(RAIZ, 'canal.json');
const CHAVE = path.join(RAIZ, 'hub', 'chave-publica.pem');
const NUNCA_TROCAR = new Set(['simuladores', 'hub-config.json', 'backups', 'runtime', 'canal.local.json']);

const lerJson = (arq) => JSON.parse(fs.readFileSync(arq, 'utf8').replace(/^\uFEFF/, ''));
const versaoAtual = () => lerJson(path.join(RAIZ, 'hub', 'package.json')).version;
const mensagem = (versao, sha256) => `hub-simuladores|${versao}|${sha256}`;

function compararVersoes(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0); const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
}

/** canal.local.json (opcional, nunca substituído) tem prioridade sobre o canal.json do pacote. */
function lerCanal() {
  for (const arq of [path.join(RAIZ, 'canal.local.json'), CANAL]) {
    if (!fs.existsSync(arq)) continue;
    try {
      const c = lerJson(arq);
      if (c.github && !c.token) return { ...c, manifesto: `https://github.com/${c.github}/releases/latest/download/versao.json` };
      if (c.manifesto || c.github) return c;
    } catch (_) { /* inválido */ }
  }
  return null;
}

// ---- GitHub privado: assets pela API (o link público de download não aceita token)
const cabecalhosGithub = (canal, extra = {}) => ({
  Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'hub-simuladores',
  ...(canal.token ? { Authorization: `Bearer ${canal.token}` } : {}), ...extra,
});
async function releaseGithub(canal, tag) {
  const url = `https://api.github.com/repos/${canal.github}/releases/${tag ? `tags/${tag}` : 'latest'}`;
  const r = await fetch(url, { headers: cabecalhosGithub(canal), signal: AbortSignal.timeout(30000) });
  if (r.status === 404) throw new Error(tag ? `Release ${tag} não encontrado.` : 'Nenhum release publicado ainda (ou o token não tem acesso ao repositório).');
  if (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0') throw new Error('Limite de consultas do GitHub atingido. Confira o token de leitura no canal.json; sem token o limite é de 60 consultas por hora.');
  if (r.status === 401) throw new Error('O GitHub recusou o token de leitura (expirado ou revogado).');
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status} ${r.statusText}.`);
  return r.json();
}
async function assetGithub(canal, release, nome) {
  const a = (release.assets || []).find((x) => x.name === nome);
  if (!a) throw new Error(`O release ${release.tag_name} não tem o arquivo ${nome}.`);
  const r = await fetch(a.url, { headers: cabecalhosGithub(canal, { Accept: 'application/octet-stream' }), redirect: 'follow', signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`Download de ${nome} falhou: ${r.status} ${r.statusText}.`);
  return Buffer.from(await r.arrayBuffer());
}

/** Baixa um endereço http(s) ou lê um caminho de arquivo / pasta de rede. */
async function obter(alvo, canal) {
  if (/^https?:\/\//i.test(alvo)) {
    const cabecalhos = {};
    if (canal?.token) cabecalhos[canal.cabecalhoToken || 'DEPLOY-TOKEN'] = canal.token;
    const r = await fetch(alvo, { headers: cabecalhos, redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} em ${alvo}`);
    return Buffer.from(await r.arrayBuffer());
  }
  return fs.readFileSync(alvo.replace(/^file:\/\//i, ''));
}

const resolver = (base, rel) => (/^(https?:|file:|\\\\|[a-zA-Z]:|\/)/.test(rel) ? rel
  : /^https?:/i.test(base) ? new URL(rel, base).toString() : path.join(path.dirname(base), rel));

/** Consulta o canal. Não baixa o pacote. */
async function verificar() {
  const atual = versaoAtual();
  const canal = lerCanal();
  if (!canal) return { configurado: false, atual, motivo: 'canal.json ausente: este HUB não tem origem de atualização configurada.' };
  if (!fs.existsSync(CHAVE)) return { configurado: false, atual, motivo: 'hub/chave-publica.pem ausente: sem ela nenhuma atualização é aceita.' };
  const bruto = canal.github && canal.token
    ? await assetGithub(canal, await releaseGithub(canal), 'versao.json')
    : await obter(canal.manifesto, canal);
  const manifesto = JSON.parse(bruto.toString('utf8'));
  if (!manifesto.versao || !manifesto.pacote || !manifesto.sha256 || !manifesto.assinatura) throw new Error('versao.json incompleto.');
  return {
    configurado: true, atual, nova: manifesto.versao, disponivel: compararVersoes(manifesto.versao, atual) > 0,
    notas: manifesto.notas || '', publicadoEm: manifesto.publicadoEm || null, manifesto,
  };
}

/** Confere SHA-256 e assinatura. Lança erro se algo não bater. */
function conferir(buf, manifesto) {
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha !== manifesto.sha256) throw new Error('O pacote baixado não confere com o SHA-256 publicado (download corrompido ou arquivo trocado).');
  const chave = crypto.createPublicKey(fs.readFileSync(CHAVE, 'utf8'));
  const ok = crypto.verify(null, Buffer.from(mensagem(manifesto.versao, sha)), chave, Buffer.from(manifesto.assinatura, 'base64'));
  if (!ok) throw new Error('Assinatura inválida: o pacote não foi publicado pela chave deste HUB. Atualização recusada.');
  return sha;
}

function npmInstall(pasta, log) {
  const runtime = require('./runtime');
  const cmd = runtime.npm(['install', '--omit=dev', '--no-audit', '--no-fund']);
  return new Promise((ok) => {
    const p = spawn(cmd.comando, cmd.args, { cwd: pasta, shell: cmd.shell, windowsHide: true });
    p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
    p.on('error', () => ok(false));
    p.on('exit', (c) => { if (c !== 0) log(`  [!] npm install falhou em ${path.basename(pasta)}: use "Instalar dependências" na Bancada.`); ok(c === 0); });
  });
}

/** Copia "de" sobre "para" e apaga de "para" o que não existe em "de" (exceto os itens preservados). */
function sincronizar(de, para, preservar = []) {
  fs.mkdirSync(para, { recursive: true });
  for (const item of fs.readdirSync(para)) {
    if (preservar.includes(item)) continue;
    if (!fs.existsSync(path.join(de, item))) fs.rmSync(path.join(para, item), { recursive: true, force: true });
  }
  for (const item of fs.readdirSync(de)) {
    const a = path.join(de, item); const b = path.join(para, item);
    if (fs.statSync(a).isDirectory()) sincronizar(a, b, []);
    else fs.copyFileSync(a, b);
  }
}

/**
 * Aplica um pacote do HUB (zip). Usado pela atualização automática e por hub/tools/atualizar.js.
 * gerenciador: para os simuladores; log(texto): progresso.
 */
async function aplicarPacote(buf, { gerenciador = null, log = console.log } = {}) {
  const AdmZip = require('adm-zip');
  const importar = require('./importar');
  const catalogo = require('./catalogo');
  const z = new AdmZip(buf);
  const nomes = z.getEntries().map((e) => e.entryName.replace(/\\/g, '/'));
  const servidor = nomes.find((n) => /(^|\/)hub\/server\.js$/.test(n));
  if (!servidor) throw new Error('O pacote não contém o HUB (hub/server.js).');
  const base = servidor.replace(/hub\/server\.js$/, '');
  const tmp = path.join(RAIZ, `_atualizando-${Date.now()}`);
  for (const e of z.getEntries()) {
    const n = e.entryName.replace(/\\/g, '/');
    if (e.isDirectory || !n.startsWith(base) || n.split('/').includes('..')) continue;
    const rel = n.slice(base.length);
    if (!rel || rel.split('/').includes('node_modules')) continue;
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), e.getData());
  }
  const antes = versaoAtual();
  const depois = lerJson(path.join(tmp, 'hub', 'package.json')).version;
  log(`HUB ${antes} → ${depois}`);
  if (gerenciador) { log('Parando os simuladores...'); await gerenciador.pararTodos(); }

  // ---- pasta hub/: troca inteira (por renomeação), levando o node_modules junto
  const depsAntes = JSON.stringify(lerJson(path.join(RAIZ, 'hub', 'package.json')).dependencies || {});
  const depsDepois = JSON.stringify(lerJson(path.join(tmp, 'hub', 'package.json')).dependencies || {});
  const hub = path.join(RAIZ, 'hub');
  const antigo = path.join(RAIZ, `_hub-antigo-${Date.now()}`);
  // a chave pública é de quem publica: um pacote sem ela (ex.: zip aplicado à mão) não pode apagá-la
  const chaveNova = path.join(tmp, 'hub', 'chave-publica.pem');
  if (!fs.existsSync(chaveNova) && fs.existsSync(CHAVE)) fs.copyFileSync(CHAVE, chaveNova);
  try {
    fs.renameSync(hub, antigo);
    fs.cpSync(path.join(tmp, 'hub'), hub, { recursive: true });
    if (fs.existsSync(path.join(antigo, 'node_modules'))) fs.renameSync(path.join(antigo, 'node_modules'), path.join(hub, 'node_modules'));
  } catch (_) {
    // Windows segurando algum arquivo: copia por cima e apaga o que sobrou
    if (!fs.existsSync(hub) && fs.existsSync(antigo)) fs.renameSync(antigo, hub);
    sincronizar(path.join(tmp, 'hub'), hub, ['node_modules']);
  }
  log('  [OK] hub');
  if (depsAntes !== depsDepois) { log('  dependências do HUB mudaram: npm install...'); await npmInstall(hub, log); }

  // ---- arquivos e pastas da raiz (rede/, modelo-simulador/, README, canal.json...)
  for (const item of fs.readdirSync(tmp)) {
    if (item === 'hub' || NUNCA_TROCAR.has(item) || item.endsWith('.exe')) continue;
    const de = path.join(tmp, item); const para = path.join(RAIZ, item);
    if (fs.statSync(de).isDirectory()) sincronizar(de, para); else fs.copyFileSync(de, para);
    log(`  [OK] ${item}`);
  }

  // ---- simuladores que mudaram de versão (ou são novos)
  const pastaSims = path.join(tmp, 'simuladores');
  if (fs.existsSync(pastaSims)) {
    for (const nome of fs.readdirSync(pastaSims)) {
      const origem = path.join(pastaSims, nome);
      if (!fs.statSync(origem).isDirectory()) continue;
      let nova = '?'; try { nova = lerJson(path.join(origem, 'package.json')).version; } catch (_) { /* sem package */ }
      const atual = catalogo.listar().find((f) => f.pastaNome === nome);
      if (atual && atual.versao === nova) continue;
      const r = await importar.importarPasta(origem, gerenciador);
      log(`  [OK] ${r.nome}: ${r.acao === 'novo' ? `novo (${r.versaoDepois})` : `${r.versaoAntes} → ${r.versaoDepois}`}`);
      if (r.precisaInstalar) { log(`  baixando dependências de ${r.nome}...`); await npmInstall(path.join(catalogo.PASTA, r.id), log); }
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return { antes, depois };
}

/** Baixa, confere e aplica a versão do manifesto. */
async function baixarEAplicar(manifesto, opcoes = {}) {
  const log = opcoes.log || console.log;
  const canal = lerCanal();
  log(`Baixando ${manifesto.versao}...`);
  const buf = canal.github && canal.token
    ? await assetGithub(canal, await releaseGithub(canal, `v${manifesto.versao}`), path.basename(manifesto.pacote))
    : await obter(resolver(canal.manifesto, manifesto.pacote), canal);
  conferir(buf, manifesto);
  log('Pacote conferido: SHA-256 e assinatura válidos.');
  return aplicarPacote(buf, opcoes);
}

/** Remove sobras de atualizações anteriores (mantém só a cópia mais recente do hub antigo). */
function limparSobras() {
  const itens = fs.readdirSync(RAIZ);
  for (const n of itens.filter((x) => x.startsWith('_atualizando-'))) fs.rmSync(path.join(RAIZ, n), { recursive: true, force: true });
  const antigos = itens.filter((x) => x.startsWith('_hub-antigo-')).sort().reverse();
  for (const n of antigos.slice(1)) fs.rmSync(path.join(RAIZ, n), { recursive: true, force: true });
}

module.exports = { releaseGithub, assetGithub, obter, verificar, baixarEAplicar, aplicarPacote, conferir, lerCanal, versaoAtual, compararVersoes, limparSobras, mensagem };
