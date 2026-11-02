/**
 * Modo desenvolvedor: só existe quando o HUB roda da pasta do projeto (que tem construir/publicar.js).
 * O HUB instalado pelo HUB-Simuladores.exe não tem essas funções.
 *
 *   situacao()          versão, notas, Git (repositório, alterações, envio pendente, versão já publicada)
 *   salvarVersao(v, n)  grava a versão em hub/package.json e as notas no NOVIDADES.md
 *   aplicarZip(buf)     troca os arquivos do projeto pelos do zip entregue pelo Claude (mesma regra do PUBLICAR-VERSAO.bat)
 *   publicar(msg, log)  git add, commit e push: o GitHub Actions publica e os HUBs instalados oferecem a atualização
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { RAIZ } = require('./config');

const ATIVO = fs.existsSync(path.join(RAIZ, 'construir', 'publicar.js'));
const PACOTE = path.join(RAIZ, 'hub', 'package.json');
const NOVIDADES = path.join(RAIZ, 'NOVIDADES.md');

/** Roda o git e devolve { codigo, saida }. Nunca pede senha no terminal (o login é pela janela do Git). */
function git(args, { log } = {}) {
  return new Promise((ok) => {
    let saida = '';
    let p;
    try {
      p = spawn('git', args, { cwd: RAIZ, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    } catch (e) { return ok({ codigo: -1, saida: e.message }); }
    const juntar = (d) => { const t = d.toString(); saida += t; if (log) t.split(/\r?\n/).filter(Boolean).forEach((l) => log(l)); };
    p.stdout.on('data', juntar); p.stderr.on('data', juntar);
    p.on('error', (e) => ok({ codigo: -1, saida: e.code === 'ENOENT' ? 'O Git não está instalado.' : e.message }));
    p.on('exit', (c) => ok({ codigo: c, saida: saida.trim() }));
  });
}

const versao = () => JSON.parse(fs.readFileSync(PACOTE, 'utf8')).version;

function notasDe(v) {
  if (!fs.existsSync(NOVIDADES)) return '';
  const linhas = fs.readFileSync(NOVIDADES, 'utf8').split(/\r?\n/);
  const i = linhas.findIndex((l) => l.startsWith(`## ${v}`));
  if (i < 0) return '';
  const fim = linhas.findIndex((l, k) => k > i && l.startsWith('## '));
  return linhas.slice(i + 1, fim < 0 ? undefined : fim).join('\n').trim();
}

async function situacao() {
  const v = versao();
  const r = { ativo: ATIVO, versao: v, notas: notasDe(v), git: false, repositorio: false };
  const ver = await git(['--version']);
  if (ver.codigo !== 0) return { ...r, aviso: 'O Git não está instalado. Rode o CONFIGURAR-GITHUB.bat.' };
  r.git = true;
  if (!fs.existsSync(path.join(RAIZ, '.git'))) return { ...r, aviso: 'Esta pasta ainda não está ligada ao GitHub. Rode o CONFIGURAR-GITHUB.bat.' };
  r.repositorio = true;
  const remoto = await git(['remote', 'get-url', 'origin']);
  r.urlGithub = remoto.codigo === 0 ? remoto.saida.replace(/\.git$/, '') : null;
  const st = await git(['status', '--porcelain', '--untracked-files=all']);
  r.alteracoes = st.saida ? st.saida.split(/\r?\n/).map((l) => ({ estado: l.slice(0, 2).trim(), arquivo: l.slice(3) })) : [];
  const ult = await git(['log', '-1', '--date=format:%d/%m/%Y %H:%M', '--format=%h|%s|%cd']);
  if (ult.codigo === 0 && ult.saida) { const [hash, mensagem, quando] = ult.saida.split('|'); r.ultimoCommit = { hash, mensagem, quando }; }
  const pend = await git(['rev-list', '--count', '@{u}..HEAD']);
  r.naoEnviados = pend.codigo === 0 ? Number(pend.saida) || 0 : null;
  const tag = await git(['ls-remote', '--tags', 'origin', `v${v}`]);
  r.versaoPublicada = tag.codigo === 0 ? !!tag.saida : null;
  r.chaveProtegida = (await git(['check-ignore', '-q', 'construir/chave-privada.pem'])).codigo === 0;
  r.chavePublica = fs.existsSync(path.join(RAIZ, 'hub', 'chave-publica.pem'));
  return r;
}

function salvarVersao(nova, notas) {
  if (!/^\d+\.\d+\.\d+$/.test(nova || '')) throw new Error('Use o formato 1.2.3 para a versão.');
  const pkg = JSON.parse(fs.readFileSync(PACOTE, 'utf8'));
  pkg.version = nova;
  fs.writeFileSync(PACOTE, `${JSON.stringify(pkg, null, 2)}\n`);
  let texto = fs.existsSync(NOVIDADES) ? fs.readFileSync(NOVIDADES, 'utf8') : '# Novidades do HUB de Simuladores\n';
  const linhas = texto.split(/\r?\n/);
  const corpo = (notas || '').trim();
  const i = linhas.findIndex((l) => l.startsWith(`## ${nova}`));
  if (i >= 0) {
    const fim = linhas.findIndex((l, k) => k > i && l.startsWith('## '));
    linhas.splice(i + 1, (fim < 0 ? linhas.length : fim) - i - 1, ...(corpo ? [corpo, ''] : ['']));
    texto = linhas.join('\n');
  } else {
    const primeira = linhas.findIndex((l) => l.startsWith('## '));
    const bloco = [`## ${nova}`, ...(corpo ? [corpo] : []), ''];
    if (primeira < 0) linhas.push('', ...bloco); else linhas.splice(primeira, 0, ...bloco);
    texto = linhas.join('\n');
  }
  fs.writeFileSync(NOVIDADES, texto);
  return { versao: nova, notas: notasDe(nova) };
}

// ------------------------------------------------------------------ aplicar o zip do projeto
const PASTAS_PROTEGIDAS = new Set(['.git', 'node_modules', 'backups']);
const CAMINHOS_PROTEGIDOS = ['construir/chave-privada.pem', 'hub/chave-publica.pem', 'hub-config.json', 'canal.json', 'canal.local.json', 'construir/.cache', 'construir/dist'];
function protegido(rel) {
  const partes = rel.split('/');
  if (partes.some((p) => PASTAS_PROTEGIDAS.has(p))) return true;
  if (CAMINHOS_PROTEGIDOS.some((c) => rel === c || rel.startsWith(`${c}/`))) return true;
  if (/^simuladores\/[^/]+\/data(\/|$)/.test(rel)) return true;
  return /^_(atualizando|hub-antigo|importando)-/.test(partes[0]);
}
function listar(base, dir = base, lista = []) {
  for (const n of fs.readdirSync(dir)) {
    const cheio = path.join(dir, n);
    const rel = path.relative(base, cheio).split(path.sep).join('/');
    if (fs.statSync(cheio).isDirectory()) { if (!PASTAS_PROTEGIDAS.has(n)) listar(base, cheio, lista); } else lista.push(rel);
  }
  return lista;
}

function aplicarZip(buf) {
  const AdmZip = require('adm-zip');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-dev-'));
  try {
    const z = new AdmZip(buf);
    for (const e of z.getEntries()) {
      const n = e.entryName.replace(/\\/g, '/');
      if (e.isDirectory || n.split('/').includes('..')) continue;
      fs.mkdirSync(path.dirname(path.join(tmp, n)), { recursive: true });
      fs.writeFileSync(path.join(tmp, n), e.getData());
    }
    const servidor = listar(tmp).find((n) => /(^|\/)hub\/server\.js$/.test(n));
    if (!servidor) throw new Error('Este zip não é o projeto do HUB (não achei hub/server.js). Zip de simulador vai em "Adicionar simulador".');
    const origem = path.join(tmp, servidor.replace(/hub\/server\.js$/, ''));
    if (!fs.existsSync(path.join(origem, '.github', 'workflows', 'publicar.yml'))) throw new Error('Este zip não tem o arquivo de publicação (.github). Peça ao Claude o zip completo do projeto.');
    const antes = versao();
    const novos = new Set(listar(origem));
    let apagados = 0;
    for (const rel of listar(RAIZ)) {
      if (!protegido(rel) && !novos.has(rel)) { fs.rmSync(path.join(RAIZ, rel), { force: true }); apagados++; }
    }
    let copiados = 0;
    for (const rel of novos) {
      if (protegido(rel)) continue;
      fs.mkdirSync(path.dirname(path.join(RAIZ, rel)), { recursive: true });
      fs.copyFileSync(path.join(origem, rel), path.join(RAIZ, rel)); copiados++;
    }
    return { antes, depois: versao(), copiados, apagados };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/** git add + commit + push. Confere antes que a chave privada não vai junto. */
async function publicar(mensagem, log) {
  const s = await situacao();
  if (!s.repositorio) throw new Error(s.aviso);
  if (!s.chaveProtegida) throw new Error('Segurança: o .gitignore não está protegendo a chave privada. Publicação cancelada.');
  if (!s.chavePublica) throw new Error('Falta hub/chave-publica.pem. Rode o CONFIGURAR-GITHUB.bat.');
  // a descrição padrão ("HUB 1.2.3") sempre leva a versão que está sendo publicada
  if (!mensagem || /^HUB \d+\.\d+\.\d+$/.test(mensagem.trim())) mensagem = `HUB ${s.versao}`;
  log(`Publicando a versão ${s.versao}...`);
  let r = await git(['add', '-A'], { log });
  if (r.codigo !== 0) throw new Error('git add falhou.');
  const pendente = (await git(['diff', '--cached', '--quiet'])).codigo !== 0;
  if (pendente) {
    r = await git(['commit', '-m', mensagem || `HUB ${s.versao}`], { log });
    if (r.codigo !== 0) throw new Error('git commit falhou.');
  } else log('Nenhuma mudança nos arquivos desde o último registro.');
  log('Enviando para o GitHub (se pedir, entre na sua conta na janela que abrir)...');
  r = await git(['push', 'origin', 'HEAD'], { log });
  if (r.codigo !== 0) throw new Error('O envio para o GitHub falhou. Veja as mensagens acima.');
  log(s.versaoPublicada
    ? `Enviado. A versão ${s.versao} JÁ tinha sido publicada: os HUBs só oferecem atualização quando o número da versão aumenta.`
    : `Enviado. O GitHub está montando a versão ${s.versao} (5 a 10 minutos).`);
  return { versao: s.versao, jaPublicada: !!s.versaoPublicada, urlGithub: s.urlGithub };
}

module.exports = { ATIVO, situacao, salvarVersao, aplicarZip, publicar };
