'use strict';
// Inversor WEG CFW500 real (modelo do simulador CFW500 do HUB) atrás da interface de bornes da estação.
const { CFW500 } = require('./cfw500/cfw500');
const { HMI } = require('./cfw500/hmi');
const { MAP } = require('./cfw500/params');
const { FALHAS } = require('./cfw500/faults');
const { PlantaBomba } = require('./planta-bomba');

// Teclas da tela da estação -> teclas do modelo
const TECLAS = { 'I': 'start', 'O': 'stop', 'RESET': 'stop', 'LOC/REM': 'locrem', 'UP': 'up', 'DOWN': 'down', 'BACK': 'back', 'ENTER': 'enter', 'GIRO': 'giro', 'JOG': 'jog' };
// Comissionamento para a bancada de canal analógico (aplicado na primeira energização e pelo botão
// "Parametrizar inversor" da tela). A aula é sobre o canal analógico, não sobre comissionar inversor.
//   P0220 = 1  sempre REM (o CLP comanda)          P0222 = 1  referência em REM pela AI1
//   P0227 = 1  gira/para em REM pela DI             P0263 = 1  DI1 = gira/para      P0265 = 20 DI3 = reset
//   P0233      sinal da AI1 igual ao modo do canal SA0 do CLP (0 = 0–10 V, 1 = 4–20 mA)
//   P0133 = 3 Hz e P0134 = 60 Hz (velocidade mínima e máxima; 10 V = 60 Hz)   P0100 = P0101 = 2 s (rampas)
//   P0251 = 5  AO1 = corrente
//   P0275 = 13 DO1 = sem falha                       P0276 = 2  DO2 = F > Fx (rodando)
function comissionamento(sinalAI1) {
  return { 220: 1, 222: 1, 227: 1, 263: 1, 265: 20, 233: sinalAI1 === '4-20' ? 1 : 0, 133: 3.0, 134: 60.0, 100: 2.0, 101: 2.0, 251: 5, 275: 13, 276: 2 };
}

function createCFW500(opts = {}) {
  const planta = new PlantaBomba(opts.planta || {});
  const drive = new CFW500(planta);
  const hmi = new HMI(drive);
  const log = opts.log || (() => {});
  drive.on('log', (m) => log(`CFW500: ${m}`));
  drive.on('falha', (f) => log(`CFW500: falha F${String(f.cod).padStart(4, '0')} ${f.nome || ''}`));
  const primeiraVez = !require('fs').existsSync(require('path').join(__dirname, '..', 'data', 'eeprom.json'));
  let power = true, tSalvo = 0;
  const b = { DI1: false, DI2: false, DI3: false, AI1_V: 0 };

  // valor em engenharia <-> bruto do parâmetro (dec = casas decimais)
  const paraBruto = (n, v) => { const p = MAP.get(n); return Math.round(Number(v) * Math.pow(10, p ? p.dec : 0)); };
  const paraEng = (n, raw) => { const p = MAP.get(n); return p && p.dec ? raw / Math.pow(10, p.dec) : raw; };
  // aplica o comissionamento da bancada; devolve o que mudou e o que não pôde mudar
  function comissionar(sinalAI1 = '0-10V') {
    const alvo = comissionamento(sinalAI1), aplicados = [], erros = [];
    if (!drive.ligado) return { aplicados, erros: ['inversor sem alimentação (ligue o disjuntor Q1 no quadro)'] };
    if (drive.pwm) return { aplicados, erros: ['pare o motor antes de parametrizar (parâmetros de configuração não mudam com o motor girando)'] };
    for (const [n, v] of Object.entries(alvo)) {
      const atual = paraEng(+n, drive.get(+n));
      if (atual === v) continue;
      const r = drive.escrever(+n, paraBruto(+n, v), 'bancada');
      if (r) erros.push(`P${String(n).padStart(4, '0')}: ${r.msg}`); else aplicados.push(`P${String(n).padStart(4, '0')} ${atual} → ${v}`);
    }
    if (aplicados.length) { drive.salvarEEPROM(); tSalvo = Date.now(); }
    return { aplicados, erros };
  }
  if (primeiraVez && !opts.semComissionamento) comissionar(opts.sinalAI1 || '0-10V');

  return {
    real: true,
    drive, hmi, planta,
    setBornes(n) {
      if (n.DI1 !== undefined) b.DI1 = !!n.DI1;
      if (n.DI2 !== undefined) b.DI2 = !!n.DI2;
      if (n.DI3 !== undefined) b.DI3 = !!n.DI3;
      if (n.AI1_V !== undefined) b.AI1_V = Math.max(0, Math.min(10, Number(n.AI1_V) || 0));
      if (n.power !== undefined && !!n.power !== power) {
        power = !!n.power;
        if (power) drive.ligar(); else drive.desligar();
      }
      drive.di[0] = b.DI1; drive.di[1] = b.DI2; drive.di[2] = b.DI3;
      drive.ai1Volts = b.AI1_V;
    },
    setCarga(h) { planta.setHidraulica(h); },
    step(dt) {
      drive.passo(dt); hmi.passo(dt);
      if (drive.sujo && Date.now() - tSalvo > 2000) { drive.salvarEEPROM(); tSalvo = Date.now(); }
    },
    saidas() {
      const e = drive.estado();
      const fHz = Math.abs(e.f || 0);
      const falha = e.falha || 0;
      const h = hmi.display();
      const on = !!e.ligado;   // sem alimentação: relés caem, AO1 vai a zero, sem PWM
      return {
        DO1: on && !!(e.dos & 1), DO2: on && !!(e.dos & 2), DO3: on && !!(e.dos & 4),
        AO1_V: on ? (e.ao1 / 1000) * 10 : 0,
        fHz: on ? fHz : 0, rpm: e.rpm, rodando: on && e.pwm && fHz > 0.1, falha: on && !!falha, codFalha: falha ? `F${String(falha).padStart(4, '0')}` : '',
        descFalha: falha && FALHAS[falha] ? FALHAS[falha].nome : '', alarmes: e.alarmes,
        locRem: e.locRem, power: e.ligado, boot: e.boot, correnteA: e.i, torquePct: e.torque, ud: e.ud, vOut: e.v,
        display: !e.ligado ? '' : e.boot ? '' : `${h.principal}${h.unidade ? ' ' + h.unidade : ''}`,
        hmi: h,
      };
    },
    setParam(n, v) { const r = drive.escrever(n, paraBruto(n, v), 'bancada'); if (r) log(`CFW500: P${String(n).padStart(4, '0')} não alterado — ${r.msg}`); return r; },
    getParam(n) { return paraEng(n, drive.get(n)); },
    params() { const o = {}; for (const n of [100, 101, 133, 134, 220, 221, 222, 227, 229, 233, 251, 263, 264, 265, 275, 276, 401, 402, 403, 404]) o[n] = paraEng(n, drive.get(n)); return o; },
    tecla(t, pressionada) {
      const k = TECLAS[t] || t;
      if (pressionada === undefined) { hmi.tecla(k, true); hmi.tecla(k, false); }
      else hmi.tecla(k, !!pressionada);
    },
    forcarFalha(cod) { drive.gerarFalha(typeof cod === 'number' ? cod : 70); },
    comissionar,
  };
}

module.exports = { createCFW500 };
