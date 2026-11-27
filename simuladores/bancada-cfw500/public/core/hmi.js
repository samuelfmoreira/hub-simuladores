/* Bancada CFW500 - HMI de segmentos do inversor (capítulo 4 do manual de programação):
 * Monitoração -> [ENTER/MENU] -> Nível 1 (grupo) -> Nível 2 (número do parâmetro no display principal, conteúdo no secundário)
 * -> Nível 3 (conteúdo no principal, ▲▼ alteram, ENTER grava, BACK/ESC cancela). */
(function (g) {
  'use strict';
  const SIM = g.SIM = g.SIM || {};
  if (!SIM.params && typeof require !== 'undefined') require('./params.js');
  const { LISTA, MAPA, MENUS, OPC } = SIM.params;

  class HMI {
    constructor(inv) { this.inv = inv; this.modo = 'off'; this.menu = 0; this.lista = LISTA; this.idx = {}; this.i = 0; this.val = 0; this.t = 0; this.rep = null; this.msg = ''; this.tMsg = 0; }
    ligar() { this.modo = 'mon'; this.t = 0; this.rep = null; }
    desligar() { this.modo = 'off'; this.rep = null; }
    get par() { return this.lista[this.i]; }
    _avisa(m) { this.msg = m; this.tMsg = 4; }
    _montaLista() {
      const nome = MENUS[this.menu], P = this.inv.P;
      this.lista = nome === 'PARAM' ? LISTA : nome === 'MODIF' ? LISTA.filter((p) => !p.ro && p.n !== 0 && P[p.n] !== this.inv.padrao(p.n)) : LISTA.filter((p) => p.grupos.includes(nome));
      this.i = Math.min(this.idx[nome] || 0, Math.max(0, this.lista.length - 1));
    }
    /** nome: esc · enter · up · down · i · o · giro · locrem · jog */
    tecla(nome, apertada) {
      const inv = this.inv;
      if (nome === 'jog') return inv.teclaJog(apertada && inv.vivo && inv.boot <= 0);
      if (!apertada) { if (this.rep && this.rep.nome === nome) this.rep = null; return; }
      if (!inv.vivo || inv.boot > 0) return;
      if (nome === 'i') return inv.teclaI(); if (nome === 'o') return inv.teclaO();
      if (nome === 'giro') return inv.teclaGiro(); if (nome === 'locrem') return inv.teclaLocRem();
      if (nome === 'up' || nome === 'down') { this.rep = { nome, t: 0.45, n: 0 }; return this._seta(nome === 'up' ? 1 : -1, 0); }
      if (nome === 'enter') {
        if (this.modo === 'mon') { this.modo = 'menu'; }
        else if (this.modo === 'menu') { this._montaLista(); if (this.lista.length) this.modo = 'par'; else this._avisa('Nenhum parâmetro neste grupo.'); }
        else if (this.modo === 'par') { this.val = inv.P[this.par.n]; this.modo = 'edit'; }
        else if (this.modo === 'edit') {
          const p = this.par;
          if (!p.ro) { const r = inv.set(p.n, this.val); if (!r.ok) { this._avisa(`${SIM.params.nomeP(p.n)}: ${r.msg}.`); return; } }
          this.modo = 'par';
          if (p.n === 317 && inv.P[317] === 1) { this.menu = MENUS.indexOf('STARTUP'); this.idx.STARTUP = 0; this._montaLista(); }
          if (p.n === 204) { this._montaLista(); }
        }
      } else if (nome === 'esc') {
        if (this.modo === 'edit') this.modo = 'par';
        else if (this.modo === 'par') { this.idx[MENUS[this.menu]] = this.i; this.modo = 'menu'; if (inv.P[317] === 1) { inv.P[317] = 0; this._avisa('Start-up orientado encerrado.'); } }
        else if (this.modo === 'menu') this.modo = 'mon';
      }
    }
    _seta(d, n) {
      const inv = this.inv, P = inv.P;
      if (this.modo === 'mon') {                                 // na monitoração as setas ajustam a referência via HMI (P0121)
        if (inv._sel(221, 222) !== 0) return;
        const passo = n > 40 ? 1 : n > 15 ? 0.5 : 0.1;
        P[121] = +Math.max(P[133], Math.min(P[134], P[121] + d * passo)).toFixed(1); inv.aoGravar();
      } else if (this.modo === 'menu') this.menu = (this.menu + d + MENUS.length) % MENUS.length;
      else if (this.modo === 'par') { const L = this.lista.length, salto = n > 30 ? 5 : 1; this.i = ((this.i + d * salto) % L + L) % L; this.idx[MENUS[this.menu]] = this.i; }
      else if (this.modo === 'edit') {
        const p = this.par; if (p.ro) return;
        const base = Math.pow(10, -p.dec), passo = p.opc || p.hex ? 1 : base * (n > 60 ? 100 : n > 25 ? 10 : 1);
        this.val = +Math.max(p.min, Math.min(p.max, this.val + d * passo)).toFixed(p.dec);
      }
    }
    passo(dt) {
      this.t += dt; if (this.tMsg > 0) this.tMsg -= dt;
      if (this.rep) { this.rep.t -= dt; if (this.rep.t <= 0) { this.rep.n++; this.rep.t = this.rep.n > 12 ? 0.05 : 0.12; this._seta(this.rep.nome === 'up' ? 1 : -1, this.rep.n); } }
      if (this.modo !== 'mon' && this.modo !== 'off' && this.inv.P[317] !== 1 && this.modo === 'par' && MENUS[this.menu] === 'MODIF' && !this.lista.length) this.modo = 'menu';
    }
    /** Valor de um parâmetro no formato do display: { txt, un } */
    _fmt(n, v) {
      const p = MAPA[n], P = this.inv.P; if (!p) return { txt: '----', un: '' };
      if (n === 1 || n === 2) { const d = P[210]; return { txt: (v / Math.pow(10, d)).toFixed(d), un: (OPC[209][P[209]] || '').replace('Nenhuma', '') }; }
      if (p.hex) return { txt: (v & 0xffff).toString(16).toUpperCase().padStart(4, '0'), un: '' };
      return { txt: Number(v).toFixed(p.dec), un: p.un };
    }
    /** O que o display mostra agora (a tela desenha a partir daqui; o 3D usa o mesmo retrato). */
    display() {
      const inv = this.inv, P = inv.P;
      if (this.modo === 'off' || !inv.vivo) return { on: false };
      if (inv.boot > 0) return { on: true, boot: true, luz: P[216] === 1 };
      const pisca = Math.floor(this.t * 2.5) % 2 === 0, d = { on: true, luz: P[216] === 1, modo: this.modo, menu: null, unMain: '', unSec: '', pisca: false };
      d.loc = inv.loc; d.rem = !inv.loc; d.horario = inv.pwm || Math.abs(inv.fS) > 0.01 ? inv.fS >= 0 : (inv._sel(223, 226) === 1 ? false : inv._sel(223, 226) >= 2 && inv._sel(223, 226) <= 3 ? inv.giroHMI > 0 : true);
      d.giroPisca = inv.pwm && inv.refAlvo !== 0 && Math.sign(inv.refAlvo) !== Math.sign(inv.fS || inv.refAlvo);
      d.run = inv.pwm; d.conf = P[47] !== 0; d.sub = inv.estado === 2;
      const b = MAPA[P[207]] ? Math.abs(P[P[207]]) : 0;
      d.barra = Math.max(0, Math.min(1, P[207] === 3 ? b * 10 / P[213] : P[207] === 5 ? b / P[134] : b / (P[213] || 100)));   // P0213 = 43: barra cheia em 4,3 A
      if (this.modo === 'mon') {
        const a = this._fmt(P[205], P[P[205]]), s = this._fmt(P[206], P[P[206]]);
        d.main = a.txt; d.unMain = a.un; d.sec = s.txt; d.unSec = s.un;
        if (inv.falhaCod) { d.main = 'F' + String(inv.falhaCod).padStart(4, '0'); d.unMain = ''; d.pisca = true; }
        else if (inv.tAuto > 0) { d.main = 'Auto'; d.unMain = ''; }
        else if (inv.alarme && Math.floor(this.t / 1.2) % 2 === 0) { d.main = 'A' + String(inv.alarme).padStart(4, '0'); d.unMain = ''; }
      } else if (this.modo === 'menu') { d.menu = this.menu; d.menuPisca = true; d.main = ''; d.sec = ''; }
      else {
        const p = this.par; d.menu = this.menu;
        if (this.modo === 'par') { const v = this._fmt(p.n, P[p.n]); d.main = 'P' + String(p.n).padStart(4, '0'); d.sec = v.txt.length > 5 ? v.txt.slice(0, 5) : v.txt; d.unSec = v.un; }
        else { const v = this._fmt(p.n, this.val); d.main = v.txt; d.unMain = v.un; d.sec = String(p.n).padStart(4, '0'); d.pisca = !p.ro; d.editando = true; }
      }
      if (d.pisca && !pisca) d.mainOculto = true;
      d.msg = this.tMsg > 0 ? this.msg : '';
      return d;
    }
  }
  SIM.HMI = HMI;
  if (typeof module !== 'undefined') module.exports = SIM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
