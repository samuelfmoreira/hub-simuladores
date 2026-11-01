/**
 * Catálogo: descobre os simuladores na pasta simuladores/ e lê a ficha (simulador.json) de cada um.
 * Uma pasta sem ficha, mas com package.json, entra como "sem ficha" e pode ser cadastrada pela tela.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { RAIZ } = require('./config');

const PASTA = path.join(RAIZ, 'simuladores');
const FICHA = 'simulador.json';

const lerJson = (arq) => JSON.parse(fs.readFileSync(arq, 'utf8').replace(/^\uFEFF/, ''));
const slug = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'simulador';

/** Ilustração padrão a partir do tipo do equipamento (a ficha pode escolher outra com "icone"). */
function iconePorTipo(texto) {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const regras = [[/remoto|io-link|bloco de i\/o/, 'remoto-io'], [/servo/, 'servo'], [/inversor|drive|vfd/, 'inversor'], [/visao|camera|cv-x|leitor de codigo/, 'visao'],
    [/robo/, 'robo'], [/ihm|hmi|supervis/, 'ihm'], [/clp|plc/, 'clp'], [/sensor/, 'sensor'], [/maquina|processo|esteira/, 'processo'], [/modbus/, 'modbus']];
  return (regras.find(([r]) => r.test(t)) || [null, 'generico'])[1];
}

/** Completa a ficha com os valores padrão, para o resto do HUB não precisar checar campo por campo. */
function normalizar(f, pasta, pkg) {
  const ficha = { ...f };
  ficha.id = ficha.id || slug(path.basename(pasta));
  ficha.nome = ficha.nome || pkg?.description || pkg?.name || ficha.id;
  ficha.versao = ficha.versao || pkg?.version || '0.0.0';
  ficha.pacote = ficha.pacote || pkg?.name || null;
  ficha.fabricante = ficha.fabricante || '';
  ficha.tipo = ficha.tipo || 'Dispositivo';
  ficha.descricao = ficha.descricao || pkg?.description || '';
  ficha.protocolos = ficha.protocolos || [];
  ficha.papel = ficha.papel || '';
  ficha.iniciar = ficha.iniciar || { comando: 'node', args: [pkg?.main || 'server.js'] };
  ficha.web = { porta: 3000, caminho: '/', ...(ficha.web || {}) };
  ficha.rede = { precisaIp: false, ipSugerido: null, portas: [], seSemIp: {}, ...(ficha.rede || {}) };
  ficha.variaveis = ficha.variaveis || {};
  ficha.arquivos = { guia: null, eds: [], ...(ficha.arquivos || {}) };
  ficha.preservarAoAtualizar = ficha.preservarAoAtualizar || ['data/'];
  ficha.aprender = ficha.aprender || [];
  ficha.cor = ficha.cor || null;
  ficha.icone = ficha.icone || iconePorTipo(`${ficha.tipo} ${ficha.nome}`);
  // modos de execução alternativos: [{ id, nome, args, plataformas: ['win32','linux'], requerRoot, observacao }]
  ficha.modos = Array.isArray(ficha.modos) && ficha.modos.length ? ficha.modos : null;
  // instância rodando em outra máquina (ex.: VM Linux): { titulo, texto, urlPadrao }
  ficha.remoto = ficha.remoto || null;
  return ficha;
}

/** O simulador segue o "contrato do HUB"? (aceita porta web e IP vindos do HUB) */
function verificarContrato(ficha, pasta) {
  const todosArgs = [ficha.iniciar.args || [], ...(ficha.modos || []).map((m) => m.args || [])].flat();
  const args = todosArgs.join(' ');
  let fonte = '';
  try {
    // .js da raiz e os scripts citados nos argumentos (ex.: src/server.js)
    const arquivos = new Set(fs.readdirSync(pasta).filter((a) => a.endsWith('.js')));
    for (const a of todosArgs) if (/\.c?js$/.test(a)) arquivos.add(a);
    for (const a of arquivos) {
      const arq = path.join(pasta, a);
      if (fs.existsSync(arq)) fonte += fs.readFileSync(arq, 'utf8');
    }
  } catch (_) { /* pasta ilegível */ }
  return {
    portaWeb: args.includes('{http}') || fonte.includes('SIM_HTTP_PORT'),
    ip: !ficha.rede.precisaIp || args.includes('{ip}') || fonte.includes('SIM_IP'),
  };
}

function dependenciasInstaladas(pasta, pkg) {
  const deps = Object.keys(pkg?.dependencies || {});
  if (!deps.length) return true;
  return deps.every((d) => fs.existsSync(path.join(pasta, 'node_modules', d, 'package.json')));
}

function listar() {
  if (!fs.existsSync(PASTA)) fs.mkdirSync(PASTA, { recursive: true });
  const lista = [];
  for (const nome of fs.readdirSync(PASTA).sort()) {
    const pasta = path.join(PASTA, nome);
    if (!fs.statSync(pasta).isDirectory() || nome.startsWith('.') || nome.startsWith('_')) continue;
    let pkg = null;
    try { pkg = lerJson(path.join(pasta, 'package.json')); } catch (_) { /* sem package.json */ }
    let ficha = null; let erroFicha = null;
    if (fs.existsSync(path.join(pasta, FICHA))) {
      try { ficha = lerJson(path.join(pasta, FICHA)); } catch (e) { erroFicha = `simulador.json inválido: ${e.message}`; }
    }
    if (!ficha && !pkg) continue;   // pasta que não é simulador
    const f = normalizar(ficha || {}, pasta, pkg);
    f.pasta = pasta;
    f.pastaNome = nome;
    f.semFicha = !ficha;
    f.erroFicha = erroFicha;
    f.instalado = dependenciasInstaladas(pasta, pkg);
    f.contrato = verificarContrato(f, pasta);
    lista.push(f);
  }
  // ids repetidos: o segundo ganha o nome da pasta
  const vistos = new Set();
  for (const f of lista) {
    if (vistos.has(f.id)) f.id = slug(f.pastaNome);
    vistos.add(f.id);
  }
  return lista;
}

function obter(id) {
  return listar().find((f) => f.id === id) || null;
}

/** Grava a ficha (vinda do formulário da tela). */
function salvarFicha(id, dados) {
  const atual = obter(id);
  if (!atual) throw new Error(`Simulador ${id} não encontrado`);
  const campos = ['id', 'nome', 'fabricante', 'tipo', 'versao', 'descricao', 'protocolos', 'papel', 'iniciar', 'web',
    'rede', 'variaveis', 'arquivos', 'preservarAoAtualizar', 'aprender', 'cor', 'icone', 'modos', 'remoto', 'pacote'];
  const ficha = {};
  for (const c of campos) if (dados[c] !== undefined) ficha[c] = dados[c];
  ficha.id = id;   // o id não muda pela tela
  fs.writeFileSync(path.join(atual.pasta, FICHA), JSON.stringify(ficha, null, 2));
  return obter(id);
}

/** Resumo enviado para a tela (sem caminhos absolutos). */
function publico(f) {
  const { pasta, ...resto } = f;
  return resto;
}

module.exports = { PASTA, FICHA, listar, obter, salvarFicha, publico, slug, lerJson };
