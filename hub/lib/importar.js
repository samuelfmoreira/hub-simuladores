/**
 * Importar / atualizar simuladores a partir de um .zip.
 *
 *   - Se o zip trouxer um simulador que já existe (mesmo id na ficha ou mesmo nome no package.json),
 *     a versão atual vai para backups/ e a nova entra no lugar, mantendo os dados do usuário
 *     (itens de "preservarAoAtualizar" da ficha), a ficha (se o zip não trouxer uma) e o node_modules
 *     (se as dependências não mudaram).
 *   - Se for um simulador novo, ele entra em simuladores/<id>.
 * Ficam guardados os 3 backups mais recentes de cada simulador.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { RAIZ } = require('./config');
const catalogo = require('./catalogo');

const BACKUPS = path.join(RAIZ, 'backups');
const MANTER_BACKUPS = 3;
const carimbo = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

function lerJsonSeguro(arq) {
  try { return catalogo.lerJson(arq); } catch (_) { return null; }
}

function copiar(origem, destino) {
  fs.cpSync(origem, destino, { recursive: true, force: true });
}

function mesmasDependencias(a, b) {
  const chave = (p) => JSON.stringify(Object.entries(p?.dependencies || {}).sort());
  return chave(a) === chave(b);
}

function limparBackups(id) {
  if (!fs.existsSync(BACKUPS)) return;
  const deste = fs.readdirSync(BACKUPS).filter((n) => n.startsWith(`${id}__`)).sort().reverse();
  for (const velho of deste.slice(MANTER_BACKUPS)) fs.rmSync(path.join(BACKUPS, velho), { recursive: true, force: true });
}

function listarBackups(id) {
  if (!fs.existsSync(BACKUPS)) return [];
  return fs.readdirSync(BACKUPS).filter((n) => n.startsWith(`${id}__`)).sort().reverse().map((n) => {
    const pkg = lerJsonSeguro(path.join(BACKUPS, n, 'package.json'));
    const ficha = lerJsonSeguro(path.join(BACKUPS, n, 'simulador.json'));
    return { nome: n, quando: n.split('__')[1], versao: ficha?.versao || pkg?.version || '?' };
  });
}

/** Extrai o zip para uma pasta temporária e devolve onde está a raiz do simulador. */
function extrair(buffer) {
  let AdmZip;
  try { AdmZip = require('adm-zip'); } catch (_) { throw new Error('Falta a dependência adm-zip do HUB. Reinstale o HUB pelo HUB-Simuladores.exe.'); }
  const zip = new AdmZip(buffer);
  const entradas = zip.getEntries();
  for (const e of entradas) {
    const n = e.entryName.replace(/\\/g, '/');
    if (n.startsWith('/') || /^[a-zA-Z]:/.test(n) || n.split('/').includes('..')) throw new Error(`Caminho inseguro dentro do zip: ${n}`);
  }
  const nomes = entradas.map((e) => e.entryName.replace(/\\/g, '/'));
  if (nomes.some((n) => /(^|\/)hub\/server\.js$/.test(n)) && nomes.some((n) => /(^|\/)hub\/lib\/atualizador\.js$/.test(n))) {
    throw new Error('Este .zip é o projeto do próprio HUB, não um simulador. Versões novas do HUB chegam sozinhas pela atualização automática (publicadas com o PUBLICAR-VERSAO.bat).');
  }
  // raiz = pasta mais rasa que tem simulador.json ou package.json (fora de node_modules)
  const candidatos = nomes.filter((n) => /(^|\/)(simulador|package)\.json$/.test(n) && !n.includes('node_modules/'))
    .map((n) => n.split('/').slice(0, -1).join('/'));
  if (!candidatos.length) throw new Error('O zip não tem package.json nem simulador.json. Não parece ser um simulador.');
  const raiz = candidatos.sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length)[0];
  const prefixo = raiz ? `${raiz}/` : '';

  const tmp = path.join(catalogo.PASTA, `_importando-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  for (const e of entradas) {
    const n = e.entryName.replace(/\\/g, '/');
    if (!n.startsWith(prefixo) || e.isDirectory) continue;
    const rel = n.slice(prefixo.length);
    if (!rel || rel.split('/').includes('node_modules')) continue;
    const destino = path.join(tmp, rel);
    if (!destino.startsWith(tmp)) continue;
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, e.getData());
  }
  return { tmp, nomePasta: raiz.split('/').pop() || 'simulador' };
}

/**
 * Importa o zip. "gerenciador" é usado para parar o simulador antes de trocar a pasta.
 * Retorna { acao: 'novo' | 'atualizado', id, nome, versaoAntes, versaoDepois, precisaInstalar, avisos[] }.
 */
async function importar(buffer, gerenciador) {
  const { tmp, nomePasta } = extrair(buffer);
  return instalarDeTemp(tmp, nomePasta, gerenciador);
}

/** Importa uma pasta de simulador (usado na atualização completa do HUB). */
async function importarPasta(origem, gerenciador) {
  const tmp = path.join(catalogo.PASTA, `_importando-${Date.now()}`);
  const ignorar = new Set(['node_modules', 'data', '.git']);
  fs.cpSync(origem, tmp, { recursive: true, filter: (src) => !path.relative(origem, src).split(/[\\/]/).some((parte) => ignorar.has(parte)) });
  return instalarDeTemp(tmp, path.basename(origem), gerenciador);
}

async function instalarDeTemp(tmp, nomePasta, gerenciador) {
  try {
    const pkgNovo = lerJsonSeguro(path.join(tmp, 'package.json'));
    const fichaNova = lerJsonSeguro(path.join(tmp, catalogo.FICHA));
    const existentes = catalogo.listar();
    const alvo = (fichaNova?.id && existentes.find((f) => f.id === fichaNova.id))
      || (pkgNovo?.name && existentes.find((f) => f.pacote === pkgNovo.name))
      || null;
    const avisos = [];

    if (alvo) {
      // ---------------- atualização ----------------
      if (gerenciador) await gerenciador.parar(alvo.id);
      const pkgAntigo = lerJsonSeguro(path.join(alvo.pasta, 'package.json'));
      fs.mkdirSync(BACKUPS, { recursive: true });
      const backup = path.join(BACKUPS, `${alvo.id}__${carimbo()}`);
      try { fs.renameSync(alvo.pasta, backup); } catch (e) {
        throw new Error(`Não foi possível mover a versão atual para backups (${e.code}). Feche janelas do Explorer ou editores abertos na pasta do simulador e tente de novo.`);
      }
      fs.renameSync(tmp, alvo.pasta);

      for (const item of alvo.preservarAoAtualizar || []) {
        const rel = item.replace(/[\\/]+$/, '');
        const de = path.join(backup, rel);
        if (fs.existsSync(de)) copiar(de, path.join(alvo.pasta, rel));
      }
      // desenho próprio do simulador (ficha "icone": "icone.png"): mantém se a versão nova não trouxer
      const iconeAntigo = alvo.icone && /\.(svg|png)$/i.test(alvo.icone) ? alvo.icone : null;
      if (iconeAntigo && fs.existsSync(path.join(backup, iconeAntigo)) && !fs.existsSync(path.join(alvo.pasta, iconeAntigo))) {
        fs.copyFileSync(path.join(backup, iconeAntigo), path.join(alvo.pasta, iconeAntigo));
      }
      if (!fichaNova && fs.existsSync(path.join(backup, catalogo.FICHA))) {
        const ficha = catalogo.lerJson(path.join(backup, catalogo.FICHA));
        if (pkgNovo?.version) ficha.versao = pkgNovo.version;
        fs.writeFileSync(path.join(alvo.pasta, catalogo.FICHA), JSON.stringify(ficha, null, 2));
      }
      let precisaInstalar = Object.keys(pkgNovo?.dependencies || {}).length > 0;
      if (precisaInstalar && mesmasDependencias(pkgAntigo, pkgNovo) && fs.existsSync(path.join(backup, 'node_modules'))) {
        fs.renameSync(path.join(backup, 'node_modules'), path.join(alvo.pasta, 'node_modules'));
        precisaInstalar = false;
      }
      limparBackups(alvo.id);
      const novo = catalogo.obter(alvo.id);
      if (!novo.contrato.portaWeb) avisos.push('Esta versão não lê SIM_HTTP_PORT: a porta da tela fica fixa no código. Veja modelo-simulador/CONTRATO.md.');
      if (!novo.contrato.ip) avisos.push('Esta versão não lê SIM_IP: o IP escolhido no HUB não chega ao simulador.');
      return { acao: 'atualizado', id: alvo.id, nome: novo.nome, versaoAntes: alvo.versao, versaoDepois: novo.versao, precisaInstalar, avisos };
    }

    // ---------------- simulador novo ----------------
    const base = catalogo.slug(fichaNova?.id || pkgNovo?.name || nomePasta);
    let id = base; let n = 2;
    while (fs.existsSync(path.join(catalogo.PASTA, id))) id = `${base}-${n++}`;
    fs.renameSync(tmp, path.join(catalogo.PASTA, id));
    const novo = catalogo.obter(id) || catalogo.listar().find((f) => f.pastaNome === id);
    if (novo?.semFicha) avisos.push('O simulador não tem ficha (simulador.json). Preencha a ficha para o HUB saber a porta da tela, o IP e os protocolos.');
    return { acao: 'novo', id: novo?.id || id, nome: novo?.nome || id, versaoAntes: null, versaoDepois: novo?.versao, precisaInstalar: novo ? !novo.instalado : true, avisos };
  } finally {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Volta um backup: a versão atual vira backup e o escolhido volta para o lugar. */
async function restaurar(id, nomeBackup, gerenciador) {
  const atual = catalogo.obter(id);
  const de = path.join(BACKUPS, path.basename(nomeBackup));
  if (!atual) throw new Error('Simulador não encontrado.');
  if (!fs.existsSync(de) || !path.basename(nomeBackup).startsWith(`${id}__`)) throw new Error('Backup não encontrado.');
  if (gerenciador) await gerenciador.parar(id);
  const novoBackup = path.join(BACKUPS, `${id}__${carimbo()}`);
  fs.renameSync(atual.pasta, novoBackup);
  fs.renameSync(de, atual.pasta);
  if (!fs.existsSync(path.join(atual.pasta, 'node_modules')) && fs.existsSync(path.join(novoBackup, 'node_modules'))
    && mesmasDependencias(lerJsonSeguro(path.join(atual.pasta, 'package.json')), lerJsonSeguro(path.join(novoBackup, 'package.json')))) {
    fs.renameSync(path.join(novoBackup, 'node_modules'), path.join(atual.pasta, 'node_modules'));
  }
  limparBackups(id);
  return catalogo.obter(id);
}

module.exports = { importar, importarPasta, restaurar, listarBackups, BACKUPS };
