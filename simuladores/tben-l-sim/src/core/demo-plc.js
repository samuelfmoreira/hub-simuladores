'use strict';
/**
 * CLP demo interno. Lê apenas IN/PQI e escreve apenas OUT, exatamente como o
 * programa do CODESYS faz (ver codesys/PRG_Paletizador.st). Serve para testar
 * a planta sem controlador e como referência da sequência.
 */
const { u16, setU16 } = require('./portmap');

const STEP_TXT = {
  INICIO: 'Preparando sequência', DESCER_VAZIO: 'Descendo para receber pallet', AGUARDA_PALLET: 'Aguardando pallet vazio',
  SUBIR: 'Subindo pallet vazio ao topo', ALIMENTAR: 'Alimentando caixa', EMPURRAR: 'Empurrando caixa para o pallet',
  RECUAR: 'Recuando empurrador', DESCER_CAMADA: 'Descendo uma camada', DESCER_SAIDA: 'Descendo pallet completo', DESCARGA: 'Descarregando pallet'
};

class DemoPlc {
  constructor(log) { this.log = log; this.reset(); }
  reset() { Object.assign(this, { state: 'PARADO', step: 'INICIO', count: 0, layerH: 0, target: 0, t: 0, msg: '', seqFault: '', invT: 0, prev: {}, blink: 0, boot: 0 }); }
  edge(k, v, falling) { const p = this.prev[k]; this.prev[k] = v; return falling ? (p && !v) : (v && !p); }
  go(s) { this.step = s; this.t = 0; }
  stepText() { return STEP_TXT[this.step]; }

  scan(dt, IN, PQI, OUT) {
    // Atraso de partida: espera a planta publicar entradas e PQI antes de avaliar falhas
    if (this.boot < 0.3) { this.boot += dt; OUT.forEach(o => o.fill(0)); return; }
    const ok = n => (PQI[n] & 0xC0) === 0xC0;
    const di = i => ok(3) && ((IN[3][i >> 3] >> (i & 7)) & 1) === 1;
    const estopOk = di(9), stopOk = di(7);
    const startE = this.edge('start', di(6)), resetHeld = di(8), resetFall = this.edge('reset', resetHeld, true);
    const retracted = di(0), advanced = di(1), atBottom = di(2), atTop = di(3), palletOn = di(4), palletOut = di(5);
    const b1ok = ok(1) && (IN[1][2] & 1), b1sp1 = b1ok && (IN[1][2] & 2), b1dist = u16(IN[1], 0);
    const b5ok = ok(5) && (IN[5][2] & 1), height = 2900 - u16(IN[5], 0);
    this.invT = (!b1ok || !b5ok) ? this.invT + dt : 0;
    if (resetHeld) this.seqFault = '';

    let fault = '';
    if (!ok(3)) fault = 'X3 K1: hub de entradas sem dados válidos (PQ = 0)';
    else if (!estopOk) fault = 'EMG';
    else if (!ok(0)) fault = 'X0 C1: controlador da esteira sem dados válidos (PQ = 0)';
    else if (IN[0][0] & 2) fault = 'X0 C1: falha no motor da esteira de entrada';
    else if (!ok(2)) fault = 'X2 Y1: terminal de válvulas sem dados válidos (PQ = 0)';
    else if (!(IN[2][0] & 1)) fault = 'X2 Y1: sem pressão de ar no terminal de válvulas';
    else if (!ok(4)) fault = 'X4 M1: inversor sem dados válidos (PQ = 0)';
    else if (IN[4][0] & 4) fault = `X4 M1: falha no inversor (código ${IN[4][1]})`;
    else if (!ok(6)) fault = 'X6 C2: controlador da esteira sem dados válidos (PQ = 0)';
    else if (IN[6][0] & 2) fault = 'X6 C2: falha no motor da esteira de saída';
    else if (!ok(1) || !ok(5)) fault = `X${!ok(1) ? 1 : 5}: sensor laser sem dados válidos (PQ = 0)`;
    else if (this.invT > 1) fault = `X${!b1ok ? 1 : 5}: sensor laser sem medição válida há mais de 1 s`;
    else if (!ok(7)) fault = 'X7 H1: torre sinaleira sem dados válidos (PQ = 0)';
    else if (this.seqFault) fault = this.seqFault;

    const before = this.state;
    if (fault === 'EMG') { this.state = 'EMERGÊNCIA'; this.msg = 'Botão de emergência acionado'; }
    else if (fault) { this.state = 'FALHA'; this.msg = fault; }
    else if ((this.state === 'FALHA' || this.state === 'EMERGÊNCIA') && resetFall) { this.state = 'PARADO'; this.msg = ''; }
    if (this.state === 'PARADO' && startE && !fault) this.state = 'AUTO';
    if (this.state === 'AUTO' && !stopOk) this.state = 'PARADO';
    if (before !== this.state) {
      if (this.state === 'FALHA') this.log('CLP demo em falha: ' + this.msg, 'diag');
      else if (this.state === 'EMERGÊNCIA') this.log('Emergência acionada: atuadores sem energia', 'diag');
      else this.log(`CLP demo: ${before.toLowerCase()} para ${this.state.toLowerCase()}`, this.state === 'AUTO' ? 'ok' : 'info');
    }

    let c1 = 0, c2 = 0, adv = 0, ret = 0, up = 0, down = 0, vsp = 0;
    if (this.state === 'AUTO') {
      this.t += dt;
      switch (this.step) {
        case 'INICIO': ret = 1; if (retracted) this.go(!palletOn ? 'DESCER_VAZIO' : this.count === 0 ? 'SUBIR' : 'ALIMENTAR'); break;
        case 'DESCER_VAZIO': if (atBottom) this.go('AGUARDA_PALLET'); else { down = 1; vsp = 250; } break;
        case 'AGUARDA_PALLET': if (palletOn) { this.count = 0; this.go('SUBIR'); } break;
        case 'SUBIR': if (atTop) this.go('ALIMENTAR'); else { up = 1; vsp = height > 1180 ? 60 : 250; } break;
        case 'ALIMENTAR':
          if (b1sp1) { const h = 800 - b1dist; if (this.count % 4 === 0) this.layerH = h; this.go('EMPURRAR'); }
          else c1 = 1;
          break;
        case 'EMPURRAR': adv = 1; if (advanced) this.go('RECUAR'); else if (this.t > 3) this.seqFault = 'X2/X3: empurrador não chegou ao avançado em 3 s'; break;
        case 'RECUAR': ret = 1;
          if (retracted) {
            this.count++;
            if (this.count >= 12) this.go('DESCER_SAIDA');
            else if (this.count % 4 === 0) { this.target = height - this.layerH; this.go('DESCER_CAMADA'); }
            else this.go('ALIMENTAR');
          } else if (this.t > 3) this.seqFault = 'X2/X3: empurrador não chegou ao recuado em 3 s';
          break;
        case 'DESCER_CAMADA': { const rem = height - this.target; if (rem <= 0.5) this.go('ALIMENTAR'); else { down = 1; vsp = rem > 40 ? 200 : 30; } } break;
        case 'DESCER_SAIDA': if (atBottom) this.go('DESCARGA'); else { down = 1; vsp = 250; } break;
        case 'DESCARGA': if (palletOut) { this.count = 0; this.go('AGUARDA_PALLET'); } else c2 = 1; break;
      }
    }
    const rst = resetHeld ? 1 : 0;
    const en = (this.state === 'AUTO' || this.state === 'PARADO') ? 1 : 0;
    OUT[0][0] = (c1 ? 1 : 0) | (rst << 2); OUT[0][1] = 70;
    OUT[2][0] = (adv ? 1 : 0) | (ret ? 2 : 0);
    OUT[4][0] = en | (up << 1) | (down << 2) | (rst << 3); OUT[4][1] = 0; setU16(OUT[4], 2, vsp);
    OUT[6][0] = (c2 ? 1 : 0) | (rst << 2); OUT[6][1] = 80;
    this.blink = (this.blink + dt) % 1;
    const on = this.blink < 0.5;
    OUT[7][0] = this.state === 'AUTO' ? 1 : this.state === 'PARADO' ? 2 : this.state === 'FALHA' ? (on ? 4 : 0) : (4 | (on ? 8 : 0));
  }
}

module.exports = { DemoPlc };
