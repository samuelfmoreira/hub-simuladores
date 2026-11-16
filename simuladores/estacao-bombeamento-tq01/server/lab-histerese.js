'use strict';
// Laboratório de histerese: roda o processo duas vezes, lado a lado e acelerado, com o mesmo "CLP" liga-desliga
// — uma vez SEM histerese (liga abaixo do SP, desliga acima) e outra COM banda (liga abaixo de SP − H, desliga acima
// de SP + H) — e devolve as curvas e as contas (partidas, partidas por hora, faixa do nível, tempo ligado).
// Usa o modelo simplificado do inversor (stub) para não mexer na EEPROM do inversor da estação.
const { createPhysics } = require('./physics');
const { createCFW500Stub } = require('./drive/cfw500-stub');
const { SD } = require('./catalog');

function rodar({ sp, histerese, consumo, velocidade, ruido, filtroS, tempoMin, confirmaS = 0, emCm = false, duracaoS, h0 }) {
  const drive = createCFW500Stub({}); drive.comissionar('0-10V');
  const ph = createPhysics({ drive, ruido, params: { hInicial: h0 } });
  ph.comando({ tipo: 'cons', valor: consumo });
  const dt = 0.05, n = Math.round(duracaoS / dt), passoAmostra = Math.round(1 / dt);
  const ref = Math.round(velocidade / 100 * 32767);
  let enche = false, gira = false, medidoF = null, partidas = 0, tLigado = 0, desdeTroca = 1e9, chegou = false, tConta = 0;
  const inicios = [];   // instantes de cada partida (depois que o nível chegou ao setpoint)
  let t = 0, tLiga = 0, tDesl = 0;   // tempo em que a condição de ligar/desligar está verdadeira (TON de confirmação)
  const pts = []; let hMin = 99, hMax = -99;
  const dO = new Array(16).fill(false);
  for (let i = 0; i < n; i++) {
    const e = ph.estado();
    const medido = e.sensores['LT-01'].eng;                 // o que o CLP enxerga (com ruído do transmissor)
    medidoF = medidoF === null ? medido : medidoF + (dt / Math.max(dt, filtroS)) * (medido - medidoF);
    let pv = filtroS > 0 ? medidoF : medido;
    if (emCm) pv = Math.round(pv * 100) / 100;               // nível passado pela IHM em cm inteiro (como IHM_Nivel)
    // comparações: sem histerese, ≤ SP liga e ≥ SP desliga; com histerese, ≤ SP − H liga e ≥ SP + H desliga
    const condLiga = histerese <= 0 ? pv < sp : pv <= sp - histerese;
    const condDesl = histerese <= 0 ? pv > sp : pv >= sp + histerese;
    tLiga = condLiga ? tLiga + dt : 0; tDesl = condDesl ? tDesl + dt : 0;   // TON de confirmação em cada comparação
    if (condLiga && tLiga >= confirmaS) enche = true;
    if (condDesl && tDesl >= confirmaS) enche = false;
    desdeTroca += dt;
    const quer = enche;
    if (!chegou && e.h >= sp - 0.005) chegou = true;           // as contas começam quando o nível chega ao setpoint
    if (quer !== gira && desdeTroca >= tempoMin) { if (quer && chegou) { partidas++; inicios.push(t); } gira = quer; desdeTroca = 0; }
    t += dt;
    dO[SD.INV_RUN] = gira; ph.setDO(dO); ph.setAO([gira ? ref : 0, 0], null);
    ph.tick(dt);
    if (chegou) { tConta += dt; if (gira) tLigado += dt; hMin = Math.min(hMin, e.h); hMax = Math.max(hMax, e.h); }
    if (i % passoAmostra === 0) pts.push([+(i * dt).toFixed(1), +e.h.toFixed(3), +pv.toFixed(3), gira ? 1 : 0, +e.inv.fHz.toFixed(1)]);
  }
  const horas = Math.max(1e-6, tConta / 3600);
  // ciclo: tempo entre uma partida e a próxima; ligada/desligada: média por ciclo
  const ciclos = []; for (let i = 1; i < inicios.length; i++) ciclos.push(inicios[i] - inicios[i - 1]);
  const ciclo = ciclos.length ? ciclos.reduce((a, b) => a + b, 0) / ciclos.length : 0;
  const ligada = partidas ? tLigado / partidas : 0;
  const desligada = partidas ? Math.max(0, (tConta - tLigado) / partidas) : 0;
  return { pontos: pts, partidas, partidasHora: Math.round(partidas / horas), hMin: +hMin.toFixed(3), hMax: +hMax.toFixed(3), tLigadoMedio: +ligada.toFixed(1), tDesligadoMedio: +desligada.toFixed(1), cicloMedio: +ciclo.toFixed(1), pctLigado: Math.round(100 * tLigado / Math.max(1e-6, tConta)) };
}

function comparar(q = {}) {
  const base = {
    sp: Number(q.sp) || 2.0, consumo: q.consumo !== undefined ? Math.min(1, Math.max(0, Number(q.consumo) / 100)) : 0.6,
    velocidade: Number(q.velocidade) || 100, ruido: q.ruido !== '0', filtroS: Number(q.filtro) || 0,
    tempoMin: Number(q.tempoMin) || 0, confirmaS: Number(q.confirma) || 0, emCm: q.emCm === '1', duracaoS: Math.min(3600, Math.max(120, (Number(q.minutos) || 15) * 60)),
  };
  base.h0 = base.sp - 0.3;
  const hist = Math.max(0.01, (Number(q.histerese) || 10) / 100);
  return {
    params: Object.assign({}, base, { histerese: hist }),
    sem: rodar(Object.assign({}, base, { histerese: 0 })),
    com: rodar(Object.assign({}, base, { histerese: hist })),
  };
}

module.exports = { comparar };
