/**
 * Configuração do HUB (hub-config.json na raiz).
 * Guarda as escolhas do usuário: IP de cada simulador, porta web, faixa da rede virtual.
 * O arquivo é preservado em todas as atualizações.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ARQ = path.join(RAIZ, 'hub-config.json');

const PADRAO = {
  hubPorta: 4000,
  abrirNavegador: true,
  navegador: 'auto',               // janelas do HUB: 'auto' = Chrome se estiver instalado, senão Edge; 'chrome' ou 'edge' para forçar
  abrirComo: 'janela',             // 'janela' = Edge em modo aplicativo (Windows); 'navegador' = aba comum
  primeiraConfigFeita: false,
  abrirTelaAoIniciar: true,
  pararAoFecharTela: true,          // fechou a janela da tela do simulador: o simulador para (6 s depois, para não parar num recarregar)        // abre a tela do simulador quando ele termina de iniciar
  atualizacaoAutomatica: false,    // false = pergunta ao usuário (mensagem com OK); true = instala sozinho ao abrir
  rede: {
    adaptador: 'SIM-HUB',          // nome da placa virtual (Windows) / interface dummy (Linux)
    prefixo: 24,                   // 255.255.255.0
    ipClp: '192.168.100.10',       // IP do CODESYS / scanner no mesmo PC
    ipsExtras: [],                 // IPs a mais (ex.: 2ª câmera Keyence)
  },
  ips: {},                         // id do simulador -> IP escolhido (sobrepõe o ipSugerido da ficha)
  portasWeb: {},                   // id do simulador -> porta web escolhida
  limparNavegador: {},             // id do simulador -> a tela apaga o que guardou no navegador (Restaurar original)
  modos: {},                       // id do simulador -> modo de execução escolhido (fichas com "modos")
  urlsRemotas: {},                 // id do simulador -> endereço da instância remota (ex.: VM Linux)
};

function mesclar(a, b) {
  const r = Array.isArray(a) ? [...a] : { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    r[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? mesclar(a[k], v) : v;
  }
  return r;
}

let cfg = null;
function ler() {
  if (cfg) return cfg;
  let salvo = {};
  try { salvo = JSON.parse(fs.readFileSync(ARQ, 'utf8').replace(/^\uFEFF/, '')); } catch (_) { /* primeira execução */ }
  cfg = mesclar(PADRAO, salvo);
  return cfg;
}

function salvar() {
  fs.writeFileSync(ARQ, JSON.stringify(cfg, null, 2));
}

function alterar(fn) {
  ler();
  fn(cfg);
  salvar();
  return cfg;
}

module.exports = { RAIZ, ler, salvar, alterar };
