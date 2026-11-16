'use strict';
// CFW500 provisório. Mesma interface de bornes que o adaptador do modelo real
// (src/drive/cfw500.js do simulador do HUB) vai expor. Substituído no M1b.
//
// Interface:
//   setBornes({ DI1, DI2, AI1_V, power })      entradas físicas (DI em BOOL, AI em volts)
//   step(dt, { correnteA })                     avança o modelo; a corrente vem da hidráulica
//   saidas() -> { DO1, DO2, AO1_V, fHz, rpm, rodando, falha, codFalha, locRem, display, power }
//   setParam(n, v) / getParam(n) / params()
//   tecla('LOC/REM' | 'I' | 'O' | 'RESET' | 'UP' | 'DOWN')

const PADRAO = {
  100: 10.0,  // tempo de aceleração (s)
  101: 10.0,  // tempo de desaceleração (s)
  133: 90,    // velocidade mínima (rpm)
  134: 1800,  // velocidade máxima (rpm)
  220: 2,     // seleção LOC/REM: 0 sempre LOC · 1 sempre REM · 2 tecla HMI (inicia LOC) · 3 tecla HMI (inicia REM)
  221: 0,     // referência LOC: 0 teclas HMI · 1 AI1
  222: 1,     // referência REM: 1 AI1
  227: 1,     // gira/para REM: 1 DIx
  229: 0,     // gira/para LOC: 0 teclas HMI
  233: 0,     // tipo de sinal AI1: 0 = 0-10 V/0-20 mA · 1 = 4-20 mA · 2 = 10-0 V · 3 = 20-4 mA
  401: 4.3,   // corrente nominal do motor (A)
  402: 1710,  // rotação nominal do motor (rpm)
};
// Funções de bornes: no modelo real são P0263/P0264 (DI1/DI2), P0275/P0276 (DO1/DO2) e P0251 (AO1).
const FUNC_PADRAO = { DI1: 'giraPara', DI3: 'reset', DO1: 'semFalha', DO2: 'rodando', AO1: 'corrente' };

function createCFW500Stub(opts = {}) {
  const P = Object.assign({}, PADRAO, opts.params || {});
  const func = Object.assign({}, FUNC_PADRAO, opts.func || {});
  const b = { DI1: false, DI2: false, DI3: false, AI1_V: 0, power: true };
  const st = {
    rpm: 0, rpmRef: 0, falha: false, codFalha: '', locRem: (P[220] === 1 || P[220] === 3) ? 'REM' : 'LOC',
    hmiRun: false, hmiRef: 0, termico: 0, di2Ant: false, power: true, display: '', correnteA: 0,
  };

  function refREM() {
    let frac = 0;
    if (P[222] === 1) {
      const v = b.AI1_V;
      if (P[233] === 1 || P[233] === 3) frac = (v - 1) / 4;     // 4-20 mA em 250 Ω equivale a 1-5 V
      else if (P[233] === 2) frac = 1 - v / 10;
      else frac = v / 10;
      if (P[233] === 3) frac = 1 - frac;
    }
    return Math.max(0, Math.min(1, frac)) * P[134];
  }

  return {
    setBornes(n) { Object.assign(b, n); },
    setParam(n, v) { P[n] = v; if (n === 220) st.locRem = (v === 1 || v === 3) ? 'REM' : 'LOC'; },
    getParam(n) { return P[n]; },
    params() { return Object.assign({}, P); },
    setFunc(k, v) { func[k] = v; },
    forcarFalha(cod) { if (!st.falha) { st.falha = true; st.codFalha = cod || 'F070'; } },
    comissionar(sinalAI1 = '0-10V') { const aplicados = []; const alvo = { 220: 1, 222: 1, 227: 1, 233: sinalAI1 === '4-20' ? 1 : 0, 133: 90, 134: 1800, 100: 2.0, 101: 2.0, 401: 4.3 }; for (const [n, v] of Object.entries(alvo)) { if (P[n] !== v) { aplicados.push(`P${String(n).padStart(4, '0')} ${P[n]} → ${v}`); P[n] = v; } } st.locRem = 'REM'; return { aplicados, erros: [] }; },
    tecla(t, pressionada) {
      if (!st.power || pressionada === false) return;
      if (t === 'LOC/REM' && (P[220] === 2 || P[220] === 3)) st.locRem = st.locRem === 'LOC' ? 'REM' : 'LOC';
      if (t === 'I') st.hmiRun = true;
      if (t === 'O') st.hmiRun = false;
      if (t === 'RESET') { st.falha = false; st.codFalha = ''; st.termico = 0; }
      if (t === 'UP') st.hmiRef = Math.min(P[134], st.hmiRef + 50);
      if (t === 'DOWN') st.hmiRef = Math.max(0, st.hmiRef - 50);
    },
    step(dt, { correnteA = 0 } = {}) {
      st.power = !!b.power;
      st.correnteA = correnteA;
      // reset por DI2 (borda de subida)
      const di2Reset = func.DI3 === 'reset' && b.DI3 && !st.di2Ant;
      st.di2Ant = b.DI3;
      if (di2Reset && st.falha) { st.falha = false; st.codFalha = ''; st.termico = 0; }

      if (!st.power) {
        // sem alimentação: motor para por inércia, display apaga
        st.rpm = Math.max(0, st.rpm - st.rpm * dt / 3);
        if (st.rpm < 5) st.rpm = 0;
        st.display = '';
        return;
      }
      // sobrecarga térmica simplificada (I²t): acima de 110 % da nominal acumula
      const rel = correnteA / P[401];
      if (st.rpm > 0 && rel > 1.1) st.termico += (rel * rel - 1) * dt * 8; else st.termico = Math.max(0, st.termico - dt * 4);
      if (st.termico > 100 && !st.falha) { st.falha = true; st.codFalha = 'F072'; }

      let run = false; let ref = 0;
      if (st.locRem === 'REM') {
        run = P[227] === 1 ? (func.DI1 === 'giraPara' && b.DI1) : false;
        ref = refREM();
      } else {
        run = P[229] === 0 ? st.hmiRun : (func.DI1 === 'giraPara' && b.DI1);
        ref = P[221] === 0 ? st.hmiRef : refREM();
      }
      if (st.falha) run = false;
      if (run && ref < P[133]) ref = P[133];
      st.rpmRef = run ? ref : 0;

      if (st.falha) {
        st.rpm = Math.max(0, st.rpm - st.rpm * dt / 3); // falha: para por inércia
      } else {
        const acc = P[134] / Math.max(0.1, P[100]) * dt;
        const dec = P[134] / Math.max(0.1, P[101]) * dt;
        if (st.rpm < st.rpmRef) st.rpm = Math.min(st.rpmRef, st.rpm + acc);
        else if (st.rpm > st.rpmRef) st.rpm = Math.max(st.rpmRef, st.rpm - dec);
      }
      if (st.rpm < 1) st.rpm = 0;
      st.display = st.falha ? st.codFalha : `${Math.round(st.rpm)} rpm`;
    },
    saidas() {
      const rodando = st.rpm > 0 && st.power;
      return {
        DO1: func.DO1 === 'semFalha' ? (st.power && !st.falha) : false,
        DO2: func.DO2 === 'rodando' ? rodando : false,
        AO1_V: func.AO1 === 'corrente' && st.power ? Math.min(10, (st.correnteA || 0) / (1.5 * P[401]) * 10) : 0,
        fHz: st.rpm / 1800 * 60, rpm: st.rpm, rodando, falha: st.falha, codFalha: st.codFalha,
        locRem: st.locRem, display: st.display, power: st.power, termico: Math.round(st.termico),
      };
    },
  };
}

module.exports = { createCFW500Stub, PADRAO, FUNC_PADRAO };
