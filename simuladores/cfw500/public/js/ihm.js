// =====================================================================
//  Tela da IHM do painel QC-01 (IHM 10,1" · 1280 × 800 px)
//  A mesma tela é usada como textura da IHM 3D e na IHM ampliada.
//  A IHM é CLIENTE Modbus TCP: cada elemento lê/escreve uma tag do CLP.
// =====================================================================
export const LARG = 1280;
export const ALT = 800;

const C = {
  fundo: '#0d1620', fundo2: '#132131', cartao: '#172738', borda: '#27405a', texto: '#e8eef5', texto2: '#8fa3b8',
  azul: '#2f7de1', ciano: '#4fd1ff', amarelo: '#f2c230', verde: '#25b14b', verdeEsc: '#167a33',
  vermelho: '#e0393e', vermelhoEsc: '#9c1d22', cinza: '#3a4a5c',
};
const F = (peso, px) => `${peso} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const FT = (peso, px) => `${peso} ${px}px "Barlow", "Segoe UI", sans-serif`;

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

export class IHMTela {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(id:string, valor?:any) => Promise<{ok?:boolean, erro?:string}>} enviar
   */
  constructor(canvas, enviar) {
    this.cv = canvas; this.cv.width = LARG; this.cv.height = ALT;
    this.c = canvas.getContext('2d');
    this.enviar = enviar;
    this.est = null; this.cfg = null;
    this.zonas = [];
    this.apertada = null;
    this.teclado = null;          // { txt, msg }
    this.msg = { txt: 'IHM iniciada', cor: C.texto2, t: 0 };
    this.pendente = new Set();
    this.velMostrada = 0;
    this.angRotor = 0;
    this.tAnt = performance.now();
    this.onDesenho = null;
    this.fontesOk = false;
    document.fonts?.load(F(700, 40)).then(() => document.fonts.load(FT(500, 20))).then(() => { this.fontesOk = true; }).catch(() => {});
  }

  atualizar(estado, cfg) { this.est = estado; if (cfg) this.cfg = cfg; }

  tag(id) { return this.cfg?.tags?.[id]; }
  val(id) { const v = this.est?.valores?.[id]; return v && v.ok ? v.v : undefined; }
  comOk() { return !!(this.est && this.est.comOk); }
  fmt(id, v) {
    const t = this.tag(id);
    if (v === undefined || v === null || !t) return '– – –';
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: t.dec || 0, maximumFractionDigits: t.dec || 0, useGrouping: false });
  }

  mensagem(txt, cor = C.texto2) { this.msg = { txt, cor, t: performance.now() }; }

  // ------------------------------------------------------------------
  //  Toque (coordenadas da tela, 1280 × 800)
  // ------------------------------------------------------------------
  zonaEm(x, y) {
    for (let i = this.zonas.length - 1; i >= 0; i--) {
      const z = this.zonas[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z;
    }
    return null;
  }

  apontar(x, y) { const z = this.zonaEm(x, y); return !!(z && !z.inativa); }

  toque(x, y, tipo) {
    if (tipo === 'down') {
      const z = this.zonaEm(x, y);
      this.apertada = z && !z.inativa ? z : null;
      if (z && z.inativa && z.motivo) this.mensagem(z.motivo, C.amarelo);
      return !!z;
    }
    if (tipo === 'up') {
      const z = this.zonaEm(x, y);
      const a = this.apertada; this.apertada = null;
      if (a && z && z.id === a.id) this.acionar(a);
      return !!a;
    }
    this.apertada = null;
    return false;
  }

  tecla(k) {   // teclado físico quando a IHM está ampliada
    if (!this.teclado) return false;
    const mapa = { Enter: 'ENTER', Escape: 'ESC', Backspace: 'BS', Delete: 'CLR', ',': ',', '.': ',', '-': '±' };
    const t = /^[0-9]$/.test(k) ? k : mapa[k];
    if (!t) return false;
    this.teclaTeclado(t);
    return true;
  }

  async comandar(id, valor, txtOk) {
    this.pendente.add(id);
    try {
      const r = await this.enviar(id, valor);
      if (r && r.erro) this.mensagem(r.erro, C.vermelho); else if (txtOk) this.mensagem(txtOk, C.verde);
    } catch (e) { this.mensagem(String(e.message || e), C.vermelho); } finally { this.pendente.delete(id); }
  }

  acionar(z) {
    const id = z.id;
    if (id === 'sp') {
      const t = this.tag('setpoint'); const v = this.val('setpoint');
      this.teclado = { txt: v === undefined ? '' : this.fmt('setpoint', v), msg: '', novo: true };
      return;
    }
    if (id === 'liga') {
      const op = this.val('operando');
      const t = this.tag('liga');
      if (t.modo === 'pulso') { this.comandar('liga', undefined, `Pulso enviado em ${t.nome}`); return; }
      const atual = this.val('liga');
      const novo = !(atual ?? op ?? false);
      this.comandar('liga', novo, `${t.nome} ← ${novo ? '1 (liga)' : '0 (desliga)'}`);
      return;
    }
    if (id === 'reverso') {
      const t = this.tag('reverso');
      if (t.modo === 'pulso') { this.comandar('reverso', undefined, `Pulso enviado em ${t.nome}`); return; }
      const atual = this.val('reverso');
      const novo = !(atual ?? false);
      this.comandar('reverso', novo, `${t.nome} ← ${novo ? '1 (anti-horário)' : '0 (horário)'}`);
      return;
    }
    if (id === 'reset') { this.comandar('reset', undefined, `Reset enviado (${this.tag('reset').nome})`); return; }
    if (id.startsWith('k:')) this.teclaTeclado(id.slice(2));
  }

  teclaTeclado(k) {
    const tk = this.teclado; if (!tk) return;
    const t = this.tag('setpoint');
    if (k === 'ESC') { this.teclado = null; return; }
    if (k === 'CLR') { tk.txt = ''; tk.msg = ''; tk.novo = false; return; }
    if (k === 'BS') { tk.txt = tk.novo ? '' : tk.txt.slice(0, -1); tk.novo = false; tk.msg = ''; return; }
    if (k === '±') { if (t.min < 0) { tk.txt = tk.txt.startsWith('-') ? tk.txt.slice(1) : '-' + tk.txt; tk.novo = false; } return; }
    if (k === 'ENTER') {
      const v = parseFloat(tk.txt.replace(',', '.'));
      if (!Number.isFinite(v)) { tk.msg = 'Digite um valor'; return; }
      if (v < t.min || v > t.max) { tk.msg = `Fora da faixa: ${this.fmt('setpoint', t.min)} a ${this.fmt('setpoint', t.max)} ${t.un}`; return; }
      this.teclado = null;
      this.comandar('setpoint', v, `${t.nome} ← ${this.fmt('setpoint', v)} ${t.un}`);
      return;
    }
    if (tk.novo) { tk.txt = ''; tk.novo = false; }
    if (k === ',') { if (!t.dec || tk.txt.includes(',')) return; tk.txt = (tk.txt || '0') + ','; return; }
    if (tk.txt.replace(/[-,]/g, '').length >= 7) return;
    const dec = tk.txt.split(',')[1];
    if (dec !== undefined && dec.length >= t.dec) return;
    tk.txt = tk.txt === '0' ? k : tk.txt + k;
    tk.msg = '';
  }

  // ------------------------------------------------------------------
  //  Desenho
  // ------------------------------------------------------------------
  desenhar() {
    const c = this.c; const agora = performance.now();
    const dt = Math.min(0.1, (agora - this.tAnt) / 1000); this.tAnt = agora;
    this.zonas = [];
    const ok = this.comOk();
    const cfg = this.cfg;

    c.fillStyle = C.fundo; c.fillRect(0, 0, LARG, ALT);
    const g = c.createRadialGradient(330, 380, 40, 330, 380, 560);
    g.addColorStop(0, '#16283b'); g.addColorStop(1, C.fundo);
    c.fillStyle = g; c.fillRect(0, 72, 660, 660);

    this.cabecalho(ok, cfg);
    if (!cfg) { this.rodape(ok, cfg); return; }

    // ---------------- mostrador de velocidade ----------------
    const vel = this.val('velocidade');
    const tv = this.tag('velocidade');
    const alvo = vel === undefined ? 0 : vel;
    this.velMostrada += (alvo - this.velMostrada) * Math.min(1, dt * 10);
    const operando = this.val('operando');
    const rev = this.val('sentidoRev');
    const rpmFrac = tv ? Math.min(1, Math.abs(this.velMostrada) / Math.max(1e-6, Math.abs(tv.max || 1))) : 0;
    this.angRotor += (rev ? -1 : 1) * rpmFrac * dt * 14;
    this.mostrador(330, 405, 262, tv, vel, operando, rev, ok);

    // ---------------- coluna de comandos ----------------
    const X = 690; const W = 566;
    this.cartaoSetpoint(X, 96, W, 150, ok);
    this.lampadaEstado(X, 266, W, operando, ok);
    this.botaoLiga(X, 318, W, 160, ok, operando);
    this.botaoReverso(X, 496, W, 132, ok, rev);
    this.areaFalha(X, 646, W, 74, ok);

    this.rodape(ok, cfg);
    if (!ok) this.faixaSemCom();
    if (this.teclado) this.desenharTeclado();
    if (this.onDesenho) this.onDesenho();
  }

  cabecalho(ok, cfg) {
    const c = this.c;
    c.fillStyle = C.fundo2; c.fillRect(0, 0, LARG, 72);
    c.fillStyle = C.amarelo; c.fillRect(0, 70, LARG, 3);
    // logotipo simples da tela
    c.fillStyle = C.azul; rr(c, 22, 14, 44, 44, 8); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 4; c.beginPath(); c.arc(44, 36, 12, -0.9, 3.9); c.stroke();
    c.beginPath(); c.moveTo(44, 20); c.lineTo(44, 34); c.stroke();
    c.fillStyle = C.texto; c.font = F(700, 36); c.textBaseline = 'middle';
    c.fillText(cfg?.titulo || 'ESTEIRA TC-01', 80, 30);
    c.fillStyle = C.texto2; c.font = FT(500, 17);
    c.fillText('Painel QC-01 · Acionamento CFW500', 81, 56);
    // indicador de comunicação
    const txt = !cfg ? 'CARREGANDO…' : !this.est || this.est.status === 'parado' ? 'COMUNICAÇÃO DESATIVADA' : ok ? `MODBUS TCP · ${cfg.ip}` : 'SEM COMUNICAÇÃO';
    c.font = F(600, 24);
    const w = c.measureText(txt).width + 56;
    const x = LARG - 150 - w;
    c.fillStyle = ok ? 'rgba(37,177,75,.16)' : 'rgba(224,57,62,.16)'; rr(c, x, 16, w, 40, 20); c.fill();
    c.strokeStyle = ok ? C.verde : C.vermelho; c.lineWidth = 2; rr(c, x, 16, w, 40, 20); c.stroke();
    const pisca = ok ? (Math.floor(performance.now() / 120) % 8 === 0 ? 0.45 : 1) : (Math.floor(performance.now() / 500) % 2 ? 1 : 0.35);
    c.globalAlpha = pisca; c.fillStyle = ok ? '#4be27a' : '#ff5a5f'; c.beginPath(); c.arc(x + 24, 36, 7, 0, 7); c.fill(); c.globalAlpha = 1;
    c.fillStyle = C.texto; c.fillText(txt, x + 40, 37);
    // relógio
    const h = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    c.font = F(600, 30); c.fillStyle = C.texto; c.textAlign = 'right'; c.fillText(h, LARG - 24, 37); c.textAlign = 'left';
  }

  mostrador(cx, cy, R, t, vel, operando, rev, ok) {
    const c = this.c;
    const a0 = Math.PI * 0.75; const a1 = Math.PI * 2.25;
    const min = t ? Math.min(0, t.min) : 0; const max = t ? Math.max(Math.abs(t.max), Math.abs(t.min), 1) : 1;
    const frac = (v) => Math.min(1, Math.max(0, (Math.abs(v) - 0) / (max - 0)));
    // trilho
    c.lineCap = 'round';
    c.strokeStyle = '#1b2c3f'; c.lineWidth = 30; c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke();
    // marcações
    for (let i = 0; i <= 50; i++) {
      const a = a0 + (a1 - a0) * (i / 50); const maior = i % 5 === 0;
      const r1 = R - 30; const r2 = R - (maior ? 52 : 40);
      c.strokeStyle = maior ? '#9fb4c9' : '#4b6178'; c.lineWidth = maior ? 3 : 2; c.lineCap = 'butt';
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); c.stroke();
      if (maior && i % 10 === 0) {
        c.fillStyle = C.texto2; c.font = F(600, 22); c.textAlign = 'center'; c.textBaseline = 'middle';
        const rl = R - 74;
        c.fillText(String(Math.round((max * i) / 50)), cx + Math.cos(a) * rl, cy + Math.sin(a) * rl);
      }
    }
    c.textAlign = 'left';
    // arco do valor
    if (ok && vel !== undefined) {
      const f = frac(this.velMostrada);
      if (f > 0.002) {
        const gr = c.createLinearGradient(cx - R, cy, cx + R, cy);
        gr.addColorStop(0, operando ? '#1f9e47' : C.azul); gr.addColorStop(1, operando ? '#7cf29b' : C.ciano);
        c.strokeStyle = gr; c.lineWidth = 30; c.lineCap = 'round';
        c.beginPath(); c.arc(cx, cy, R, a0, a0 + (a1 - a0) * f); c.stroke();
      }
    }
    // marcador do set point
    const sp = this.val('setpoint');
    if (ok && sp !== undefined) {
      const a = a0 + (a1 - a0) * frac(sp);
      const r = R + 26;
      c.save(); c.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.rotate(a + Math.PI / 2);
      c.fillStyle = C.amarelo; c.beginPath(); c.moveTo(0, 12); c.lineTo(-11, -8); c.lineTo(11, -8); c.closePath(); c.fill();
      c.restore();
    }
    // valor central
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = C.texto2; c.font = F(600, 26); c.fillText('VELOCIDADE ATUAL', cx, cy - 92);
    c.fillStyle = ok && vel !== undefined ? C.texto : '#55687c';
    c.font = F(700, 132);
    c.fillText(ok ? this.fmt('velocidade', vel === undefined ? undefined : Math.round(this.velMostrada * 10 ** (t?.dec || 0)) / 10 ** (t?.dec || 0)) : '– – –', cx, cy + 34);
    c.fillStyle = C.texto2; c.font = F(600, 34); c.fillText(t?.un || '', cx, cy + 78);
    // rotor girando + sentido
    const ry = cy + 222;
    c.font = F(700, 30);
    const txtSent = !ok || rev === undefined ? 'SENTIDO – –' : rev ? '↺  ANTI-HORÁRIO' : '↻  HORÁRIO';
    const xs = cx - (c.measureText(txtSent).width + 62) / 2;
    c.save(); c.translate(xs + 20, ry); c.rotate(this.angRotor);
    c.strokeStyle = operando && ok ? '#7cf29b' : '#4b6178'; c.lineWidth = 5; c.lineCap = 'round';
    for (let k = 0; k < 3; k++) { c.rotate((Math.PI * 2) / 3); c.beginPath(); c.arc(0, 0, 18, 0, 1.2); c.stroke(); }
    c.fillStyle = c.strokeStyle; c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill();
    c.restore();
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = F(700, 30); c.fillStyle = ok && rev !== undefined ? C.texto : '#55687c';
    c.fillText(txtSent, xs + 62, ry + 2);
    c.textAlign = 'left';
    // chips de corrente e set point
    const cor = this.val('corrente'); const tc = this.tag('corrente');
    const chips = [];
    if (tc?.ativo) chips.push(['CORRENTE', `${ok ? this.fmt('corrente', cor) : '– –'} ${tc.un}`]);
    if (this.tag('setpoint')?.ativo) chips.push(['SET POINT', `${ok ? this.fmt('setpoint', sp) : '– –'} ${this.tag('setpoint').un}`]);
    const cw = 240; let x = cx - (chips.length * cw + (chips.length - 1) * 16) / 2;
    for (const [rot, v] of chips) {
      c.fillStyle = C.cartao; rr(c, x, 704, cw, 52, 10); c.fill();
      c.strokeStyle = C.borda; c.lineWidth = 2; rr(c, x, 704, cw, 52, 10); c.stroke();
      c.fillStyle = C.texto2; c.font = F(600, 20); c.textBaseline = 'middle'; c.fillText(rot, x + 16, 731);
      c.fillStyle = C.texto; c.font = F(700, 30); c.textAlign = 'right'; c.fillText(v, x + cw - 16, 732); c.textAlign = 'left';
      x += cw + 16;
    }
  }

  cartaoSetpoint(x, y, w, h, ok) {
    const c = this.c; const t = this.tag('setpoint');
    const ativo = t?.ativo;
    const inativa = !ok || !ativo;
    const ap = this.apertada?.id === 'sp';
    c.fillStyle = C.texto2; c.font = F(600, 24); c.textBaseline = 'alphabetic';
    c.fillText('SET POINT DE VELOCIDADE', x, y + 20);
    c.font = FT(500, 16); c.textAlign = 'right';
    c.fillText(ativo ? `${t.nome} · ${t.area.toUpperCase()} ${t.end}` : 'tag desabilitada', x + w, y + 20); c.textAlign = 'left';
    const by = y + 34; const bh = h - 34;
    c.fillStyle = ap ? '#0a121b' : '#0f1c2a'; rr(c, x, by, w, bh, 12); c.fill();
    c.strokeStyle = inativa ? C.cinza : C.amarelo; c.lineWidth = 3; rr(c, x, by, w, bh, 12); c.stroke();
    const v = this.val('setpoint');
    c.fillStyle = inativa ? '#55687c' : C.amarelo; c.font = F(700, 84); c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillText(ok && ativo ? this.fmt('setpoint', v) : '– – –', x + w - 110, by + bh / 2 + 4);
    c.fillStyle = C.texto2; c.font = F(600, 32); c.textAlign = 'left';
    c.fillText(t?.un || '', x + w - 96, by + bh / 2 + 8);
    // ícone de lápis
    c.save(); c.translate(x + 40, by + bh / 2); c.rotate(-Math.PI / 4);
    c.fillStyle = inativa ? '#55687c' : C.texto; c.fillRect(-20, -6, 32, 12);
    c.beginPath(); c.moveTo(12, -6); c.lineTo(22, 0); c.lineTo(12, 6); c.fill(); c.restore();
    c.fillStyle = C.texto2; c.font = FT(500, 16);
    c.fillText(ativo ? `toque para alterar · ${this.fmt('setpoint', t.min)} a ${this.fmt('setpoint', t.max)} ${t.un}` : '', x + 78, by + bh - 18);
    if (this.pendente.has('setpoint')) this.girando(x + w - 30, by + 22);
    this.zonas.push({ id: 'sp', x, y: by, w, h: bh, inativa, motivo: !ativo ? 'Tag do set point desabilitada' : 'Sem comunicação com o CLP' });
  }

  lampadaEstado(x, y, w, operando, ok) {
    const c = this.c;
    const on = ok && operando === true;
    c.fillStyle = on ? '#4be27a' : ok ? '#33475b' : '#2a3542';
    if (on) { c.shadowColor = '#4be27a'; c.shadowBlur = 18; }
    c.beginPath(); c.arc(x + 16, y + 18, 13, 0, 7); c.fill(); c.shadowBlur = 0;
    c.fillStyle = on ? '#bff5cf' : C.texto2; c.font = F(700, 30); c.textBaseline = 'middle';
    c.fillText(!ok || operando === undefined ? 'ESTADO DO MOTOR: – –' : on ? 'MOTOR EM OPERAÇÃO' : 'MOTOR PARADO', x + 42, y + 19);
  }

  botaoLiga(x, y, w, h, ok, operando) {
    const c = this.c; const t = this.tag('liga');
    const ativo = t?.ativo;
    const ligado = (this.val('liga') ?? operando) === true;
    const inativa = !ok || !ativo;
    const ap = this.apertada?.id === 'liga';
    const [c1, c2] = inativa ? ['#2c3846', '#222c37'] : ligado ? ['#ec4a4f', C.vermelhoEsc] : ['#35c75d', C.verdeEsc];
    const dy = ap ? 4 : 0;
    c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, x, y + 8, w, h, 18); c.fill();
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2);
    c.fillStyle = g; rr(c, x, y + dy, w, h, 18); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2; rr(c, x + 1, y + dy + 1, w - 2, h - 2, 17); c.stroke();
    // ícone liga/desliga
    const ix = x + 92; const iy = y + dy + h / 2;
    c.strokeStyle = inativa ? '#5c6d80' : '#fff'; c.lineWidth = 9; c.lineCap = 'round';
    c.beginPath(); c.arc(ix, iy, 36, -Math.PI / 2 + 0.75, Math.PI * 1.5 - 0.75); c.stroke();
    c.beginPath(); c.moveTo(ix, iy - 46); c.lineTo(ix, iy - 8); c.stroke();
    c.fillStyle = inativa ? '#7d8da0' : '#fff'; c.textBaseline = 'middle';
    c.font = F(700, 56); c.fillText(inativa ? 'LIGA / DESLIGA' : ligado ? 'DESLIGAR' : 'LIGAR', x + 168, iy - 12);
    c.font = F(600, 24); c.globalAlpha = 0.85;
    c.fillText(ativo ? `${t.nome}${t.modo === 'pulso' ? ' (pulso)' : ''} · ${ligado ? 'ligado' : 'desligado'}` : 'tag desabilitada', x + 170, iy + 34);
    c.globalAlpha = 1;
    if (this.pendente.has('liga')) this.girando(x + w - 34, y + dy + 30);
    this.zonas.push({ id: 'liga', x, y, w, h, inativa, motivo: !ativo ? 'Tag do botão Liga/Desliga desabilitada' : 'Sem comunicação com o CLP' });
  }

  botaoReverso(x, y, w, h, ok, rev) {
    const c = this.c; const t = this.tag('reverso');
    const ativo = t?.ativo;
    const inativa = !ok || !ativo;
    const ap = this.apertada?.id === 'reverso';
    const cmd = this.val('reverso');
    const dy = ap ? 4 : 0;
    c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, x, y + 8, w, h, 18); c.fill();
    const g = c.createLinearGradient(0, y, 0, y + h);
    if (inativa) { g.addColorStop(0, '#2c3846'); g.addColorStop(1, '#222c37'); } else { g.addColorStop(0, '#2f6fc4'); g.addColorStop(1, '#173f7a'); }
    c.fillStyle = g; rr(c, x, y + dy, w, h, 18); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 2; rr(c, x + 1, y + dy + 1, w - 2, h - 2, 17); c.stroke();
    // ícone de setas circulares
    const ix = x + 92; const iy = y + dy + h / 2;
    c.strokeStyle = inativa ? '#5c6d80' : '#fff'; c.lineWidth = 8; c.lineCap = 'round';
    const seta = (a0, a1) => {
      c.beginPath(); c.arc(ix, iy, 32, a0, a1); c.stroke();
      const ax = ix + Math.cos(a1) * 32; const ay = iy + Math.sin(a1) * 32; const tg = a1 + Math.PI / 2;
      c.fillStyle = c.strokeStyle; c.beginPath();
      c.moveTo(ax + Math.cos(tg) * 14, ay + Math.sin(tg) * 14);
      c.lineTo(ax + Math.cos(tg + 2.3) * 13, ay + Math.sin(tg + 2.3) * 13);
      c.lineTo(ax + Math.cos(tg - 2.3) * 13, ay + Math.sin(tg - 2.3) * 13); c.fill();
    };
    seta(Math.PI * 0.15, Math.PI * 0.85); seta(Math.PI * 1.15, Math.PI * 1.85);
    c.fillStyle = inativa ? '#7d8da0' : '#fff'; c.textBaseline = 'middle';
    c.font = F(700, 46); c.fillText('INVERTER SENTIDO', x + 168, iy - 14);
    c.font = F(600, 24); c.globalAlpha = 0.85;
    const sent = cmd === undefined ? '' : cmd ? 'comando: anti-horário' : 'comando: horário';
    c.fillText(ativo ? `${t.nome}${t.modo === 'pulso' ? ' (pulso)' : ''}${sent ? ' · ' + sent : ''}` : 'tag desabilitada', x + 170, iy + 28);
    c.globalAlpha = 1;
    if (this.pendente.has('reverso')) this.girando(x + w - 34, y + dy + 30);
    this.zonas.push({ id: 'reverso', x, y, w, h, inativa, motivo: !ativo ? 'Tag do botão Inverter desabilitada' : 'Sem comunicação com o CLP' });
  }

  areaFalha(x, y, w, h, ok) {
    const c = this.c;
    const falha = ok && this.val('falha') === true;
    const tr = this.tag('reset');
    if (falha) {
      const pisca = Math.floor(performance.now() / 450) % 2 === 0;
      c.fillStyle = pisca ? '#a3161b' : '#7a1014'; rr(c, x, y, w, h, 12); c.fill();
      c.fillStyle = '#fff'; c.font = F(700, 34); c.textBaseline = 'middle';
      c.fillText('⚠  FALHA NO INVERSOR', x + 22, y + h / 2 + 1);
      if (tr?.ativo) {
        const bw = 170; const bx = x + w - bw - 10; const ap = this.apertada?.id === 'reset';
        c.fillStyle = ap ? '#d9d9d9' : '#fff'; rr(c, bx, y + 10, bw, h - 20, 10); c.fill();
        c.fillStyle = '#a3161b'; c.font = F(700, 30); c.textAlign = 'center'; c.fillText('RESET', bx + bw / 2, y + h / 2 + 1); c.textAlign = 'left';
        this.zonas.push({ id: 'reset', x: bx, y: y + 10, w: bw, h: h - 20 });
      }
    } else {
      c.strokeStyle = C.borda; c.lineWidth = 2; rr(c, x, y, w, h, 12); c.stroke();
      c.fillStyle = C.texto2; c.font = F(600, 26); c.textBaseline = 'middle';
      const tf = this.tag('falha');
      c.fillText(!ok ? 'Falhas: sem leitura' : tf?.ativo ? '✓  Inversor sem falhas' : 'Sinal de falha não configurado', x + 22, y + h / 2 + 1);
    }
  }

  rodape(ok, cfg) {
    const c = this.c;
    c.fillStyle = C.fundo2; c.fillRect(0, 768, LARG, 32);
    c.fillStyle = C.texto2; c.font = FT(500, 17); c.textBaseline = 'middle';
    const s = this.est?.stats;
    const info = cfg ? `Cliente Modbus TCP → ${cfg.ip}:${cfg.porta} · Unit ID ${cfg.unitId} · varredura ${cfg.varredura} ms${s ? ` · resp. ${s.tResp.toFixed(1)} ms` : ''}` : '';
    c.fillText(info, 18, 785);
    const idade = performance.now() - this.msg.t;
    if (idade < 6000) {
      c.globalAlpha = idade > 5000 ? (6000 - idade) / 1000 : 1;
      c.fillStyle = this.msg.cor; c.textAlign = 'right'; c.font = FT(600, 17);
      c.fillText(this.msg.txt, LARG - 18, 785); c.textAlign = 'left'; c.globalAlpha = 1;
    }
  }

  faixaSemCom() {
    const c = this.c;
    const parado = !this.est || this.est.status === 'parado';
    c.fillStyle = 'rgba(13,22,32,.55)'; c.fillRect(682, 90, 590, 640);
    const y = 360;
    c.fillStyle = parado ? '#5a4a12' : '#7a1014'; rr(c, 700, y, 552, 104, 14); c.fill();
    c.strokeStyle = parado ? C.amarelo : C.vermelho; c.lineWidth = 3; rr(c, 700, y, 552, 104, 14); c.stroke();
    c.fillStyle = '#fff'; c.font = F(700, 34); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(parado ? 'COMUNICAÇÃO DESATIVADA' : 'SEM COMUNICAÇÃO COM O CLP', 976, y + 36);
    c.font = FT(500, 18); c.fillStyle = '#f1d9d9';
    c.fillText(parado ? 'Ative a comunicação na aba "IHM Modbus"' : (this.est?.erro || 'aguardando resposta do servidor Modbus').slice(0, 58), 976, y + 74);
    c.textAlign = 'left';
  }

  girando(x, y) {
    const c = this.c; const a = (performance.now() / 120) % (Math.PI * 2);
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.arc(x, y, 13, a, a + 4.2); c.stroke();
  }

  desenharTeclado() {
    const c = this.c; const tk = this.teclado; const t = this.tag('setpoint');
    // com o teclado aberto só as teclas respondem (o fundo absorve os toques)
    this.zonas = [{ id: 'fundo', x: 0, y: 0, w: LARG, h: ALT, inativa: true }];
    c.fillStyle = 'rgba(5,10,16,.72)'; c.fillRect(0, 0, LARG, ALT);
    const W = 560; const H = 690; const x = (LARG - W) / 2; const y = 56;
    c.fillStyle = '#1a2b3d'; rr(c, x, y, W, H, 18); c.fill();
    c.strokeStyle = C.amarelo; c.lineWidth = 3; rr(c, x, y, W, H, 18); c.stroke();
    c.fillStyle = C.texto; c.font = F(700, 30); c.textBaseline = 'middle';
    c.fillText('SET POINT DE VELOCIDADE', x + 26, y + 36);
    c.fillStyle = C.texto2; c.font = FT(500, 17);
    c.fillText(`${t.nome} · faixa ${this.fmt('setpoint', t.min)} a ${this.fmt('setpoint', t.max)} ${t.un}`, x + 26, y + 68);
    // visor
    c.fillStyle = '#0a141e'; rr(c, x + 24, y + 90, W - 48, 96, 12); c.fill();
    c.strokeStyle = tk.msg ? C.vermelho : C.borda; c.lineWidth = 2; rr(c, x + 24, y + 90, W - 48, 96, 12); c.stroke();
    const cursor = Math.floor(performance.now() / 500) % 2 ? '' : '_';
    c.fillStyle = tk.novo ? C.texto2 : C.amarelo; c.font = F(700, 72); c.textAlign = 'right';
    c.fillText((tk.txt || '') + (tk.novo ? '' : cursor), x + W - 120, y + 140);
    c.fillStyle = C.texto2; c.font = F(600, 30); c.textAlign = 'left'; c.fillText(t.un, x + W - 104, y + 144);
    c.fillStyle = tk.msg ? '#ff8a8e' : C.texto2; c.font = FT(500, 17);
    c.fillText(tk.msg || 'Digite o valor e confirme com ENTER', x + 26, y + 208);
    // teclas
    const teclas = [['7', '8', '9', 'BS'], ['4', '5', '6', 'CLR'], ['1', '2', '3', 'ESC'], ['±', '0', ',', 'ENTER']];
    const kw = 116; const kh = 100; const gx = 12; const x0 = x + 24; const y0 = y + 232;
    teclas.forEach((linha, i) => linha.forEach((k, j) => {
      const kx = x0 + j * (kw + gx); const ky = y0 + i * (kh + gx);
      const inativa = (k === '±' && t.min >= 0) || (k === ',' && !t.dec);
      const ap = this.apertada?.id === 'k:' + k;
      const cor = k === 'ENTER' ? (ap ? '#178a3a' : C.verde) : k === 'ESC' ? (ap ? '#7d1a1d' : '#a3262b') : k === 'CLR' || k === 'BS' ? (ap ? '#2b3a4b' : '#3b5068') : (ap ? '#22364b' : '#2a4058');
      c.globalAlpha = inativa ? 0.3 : 1;
      c.fillStyle = cor; rr(c, kx, ky + (ap ? 3 : 0), kw, kh, 12); c.fill();
      c.fillStyle = '#fff'; c.font = F(700, k.length > 2 ? 30 : 46); c.textAlign = 'center';
      c.fillText(k === 'BS' ? '⌫' : k, kx + kw / 2, ky + kh / 2 + 2 + (ap ? 3 : 0));
      c.textAlign = 'left'; c.globalAlpha = 1;
      if (!inativa) this.zonas.push({ id: 'k:' + k, x: kx, y: ky, w: kw, h: kh });
    }));
  }
}
