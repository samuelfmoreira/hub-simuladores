/**
 * =====================================================================
 *  HMI DO CFW500 (Capítulo 4 do Manual de Programação)
 * =====================================================================
 *  Modos:
 *   - MONITORAÇÃO : mostra P0205 (principal), P0206 (secundário) e P0207 (barra)
 *   - PARAMETRIZAÇÃO
 *       Nível 1 : escolha do grupo (PARAM, READ, MODIF, BASIC, MOTOR, I/O, NET, HMI, SPLC, STARTUP)
 *       Nível 2 : navegação nos parâmetros (nº no principal, conteúdo no secundário)
 *       Nível 3 : edição (conteúdo no principal, nº no secundário)
 *
 *  Teclas: back (BACK/ESC), enter (ENTER/MENU), up, down, start (I verde),
 *          stop (O vermelho), giro, locrem, jog.
 *
 *  Observação do manual (nível 1/2): ▲ = grupo anterior / PRÓXIMO parâmetro,
 *                                    ▼ = próximo grupo / parâmetro ANTERIOR.
 * =====================================================================
 */
'use strict';

const { LIST, MAP, UNIDADES } = require('./params');

const GRUPOS = ['PARAM', 'READ', 'MODIF', 'BASIC', 'MOTOR', 'I/O', 'NET', 'HMI', 'SPLC', 'STARTUP'];

class HMI {
  constructor(drive) {
    this.d = drive;
    this.modo = 'monitor';
    this.grupo = 0;
    this.lista = [];
    this.idx = 0;
    this.valorEdit = 0;
    this.falhaVista = false;
    this.alarmeVisto = 0;
    this.tRef = 0;          // tempo restante mostrando P0121 após ▲/▼
    this.repeticao = null;  // {tecla, t, total}
    this.msg = null;        // mensagem curta no display (ex.: erro de escrita)
    drive.on('energizacao', () => { this.modo = 'monitor'; this.falhaVista = false; });
    drive.on('falha', () => { this.falhaVista = false; });
  }

  parametrosDoGrupo(g) {
    const nome = GRUPOS[g];
    if (nome === 'PARAM') return LIST.map((p) => p.n);
    if (nome === 'MODIF') return LIST.filter((p) => !p.ro && !p.net && this.d.get(p.n) !== p.def && p.n !== 0).map((p) => p.n);
    return LIST.filter((p) => p.g.includes(nome)).map((p) => p.n);
  }

  /** ▲/▼ no modo monitoração ajustam P0121 quando a referência é pelas teclas */
  refPorTeclas() { return this.d.fonteRef() === 0; }

  tecla(nome, pressionada) {
    const d = this.d;
    if (!d.ligado || d.tBoot > 0) return;
    // teclas de acionamento vão direto para o inversor
    if (['start', 'stop', 'giro', 'locrem', 'jog'].includes(nome)) {
      d.teclaAcionamento(nome, pressionada);
      if (pressionada && d.get(48)) this.alarmeVisto = d.get(48);
      return;
    }
    if (!pressionada) { if (this.repeticao && this.repeticao.tecla === nome) this.repeticao = null; return; }
    if (d.get(48) && this.alarmeVisto !== d.get(48)) { this.alarmeVisto = d.get(48); return; } // 1º toque reconhece o alarme
    if (d.falha && !this.falhaVista) { if (nome === 'back') this.falhaVista = true; return; }  // ESC libera navegação

    if (nome === 'up' || nome === 'down') {
      this.repeticao = { tecla: nome, t: 0, total: 0 };
      this.incrementar(nome === 'up' ? 1 : -1, 1);
      return;
    }
    switch (this.modo) {
      case 'monitor':
        if (nome === 'enter') { this.modo = 'menu'; }
        break;
      case 'menu':
        if (nome === 'enter') { this.lista = this.parametrosDoGrupo(this.grupo); this.idx = 0; if (this.lista.length) this.modo = 'lista'; }
        else if (nome === 'back') this.modo = 'monitor';
        break;
      case 'lista':
        if (nome === 'enter') {
          const n = this.lista[this.idx];
          const p = MAP.get(n);
          if (p.ro || p.net) { this.msg = { txt: 'ro', t: 1 }; break; }
          if (p.cfg && d.pwm) { this.msg = { txt: 'CONF', t: 1 }; break; }
          this.valorEdit = n === 0 ? 0 : d.get(n);
          this.modo = 'edicao';
        } else if (nome === 'back') this.modo = 'menu';
        break;
      case 'edicao':
        if (nome === 'enter') {
          const n = this.lista[this.idx];
          const r = d.escrever(n, this.valorEdit, 'hmi');
          if (r) { this.msg = { txt: 'Err', t: 1.2, det: r.msg }; d.emit('log', `HMI: P${String(n).padStart(4, '0')} não alterado — ${r.msg}`); }
          this.modo = 'lista';
        } else if (nome === 'back') this.modo = 'lista';
        break;
      default:
    }
  }

  incrementar(sentido, passo) {
    const d = this.d;
    switch (this.modo) {
      case 'monitor':
        if (this.refPorTeclas()) {
          const novo = Math.max(0, Math.min(d.get(134), d.get(121) + sentido * passo));
          d.escrever(121, novo, 'hmi');
          this.tRef = 2.0;
        }
        break;
      case 'menu':
        this.grupo = (this.grupo + (sentido > 0 ? -1 : 1) + GRUPOS.length) % GRUPOS.length;
        break;
      case 'lista':
        if (!this.lista.length) break;
        this.idx = (this.idx + (sentido > 0 ? 1 : -1) * Math.min(passo, 10) + this.lista.length) % this.lista.length;
        break;
      case 'edicao': {
        const p = MAP.get(this.lista[this.idx]);
        this.valorEdit = Math.max(p.min, Math.min(p.max, this.valorEdit + sentido * passo));
        break;
      }
      default:
    }
  }

  /** Autorrepetição das setas mantidas pressionadas (acelera com o tempo) */
  /** O assistente de comunicação gravou um parâmetro: o display mostra o número e o valor por um instante. */
  mostrarEscrita(n) { if (MAP.has(n)) this.escrita = { n, t: 1.6 }; }

  passo(dt) {
    if (this.escrita) { this.escrita.t -= dt; if (this.escrita.t <= 0) this.escrita = null; }
    if (this.tRef > 0) this.tRef -= dt;
    if (this.msg) { this.msg.t -= dt; if (this.msg.t <= 0) this.msg = null; }
    const r = this.repeticao;
    if (!r) return;
    r.t += dt; r.total += dt;
    if (r.total > 0.5 && r.t >= 0.08) {
      r.t = 0;
      const passo = this.modo === 'lista' ? 1 : r.total > 4 ? 100 : r.total > 2 ? 10 : 1;
      this.incrementar(r.tecla === 'up' ? 1 : -1, passo);
    }
  }

  // ------------------------------------------------------------------
  //  Formatação para o display de 7 segmentos
  // ------------------------------------------------------------------
  formatarParam(n) {
    const d = this.d;
    const p = MAP.get(n);
    if (!p) return { txt: '-----', un: '' };
    let val = d.get(n);
    if (n === 0) val = d.senhaLiberada ? 1 : 0;
    // P0001/P0002 usam escala P0208, unidade P0209 e casas P0210
    if (n === 1 || n === 2) {
      const dec = d.get(210);
      return { txt: dec ? (val / 10 ** dec).toFixed(dec) : String(val), un: UNIDADES[d.get(209)] || '' };
    }
    if (p.hex) return { txt: (val & 0xFFFF).toString(16).toUpperCase().padStart(4, '0'), un: '' };
    return { txt: p.dec ? (val / 10 ** p.dec).toFixed(p.dec) : String(val), un: p.un };
  }

  formatarValor(n, val) {
    const p = MAP.get(n);
    if (p.hex) return (val & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    return p.dec ? (val / 10 ** p.dec).toFixed(p.dec) : String(val);
  }

  display() {
    const d = this.d;
    const pn = (n) => 'P' + String(n).padStart(4, '0');
    const est = {
      ligado: d.ligado, backlight: d.get(216) === 1, boot: d.tBoot > 0,
      loc: d.locRem === 'LOC', rem: d.locRem === 'REM', conf: !!d.config47, sub: d.ud < d.limitesUd().sub,
      run: d.pwm, giro: d.horarioCmd ? 'H' : 'AH',
      giroAtivo: [2, 3].includes(d.fonteGiro()),
      menu: null, principal: '', secundario: '', unidade: '', barra: 0, piscar: false, nivel: this.modo,
    };
    if (!d.ligado) return est;
    if (d.tBoot > 0) { est.principal = '88888'; est.secundario = '88888'; est.barra = 1; est.menu = 'TODOS'; return est; }

    const barra = () => {
      const n = d.get(207);
      if (!MAP.has(n)) return 0;
      return Math.max(0, Math.min(1, Math.abs(d.get(n)) / Math.max(1, d.get(213))));
    };

    if (this.modo === 'monitor') {
      const ppal = this.tRef > 0 && this.refPorTeclas() ? this.formatarParam(121) : this.formatarParam(d.get(205));
      est.principal = ppal.txt; est.unidade = ppal.un;
      est.secundario = this.formatarParam(d.get(206)).txt;
      est.barra = barra();
    } else if (this.modo === 'menu') {
      est.menu = GRUPOS[this.grupo];
    } else if (this.modo === 'lista') {
      const n = this.lista[this.idx];
      est.menu = GRUPOS[this.grupo];
      est.principal = pn(n);
      const f = this.formatarParam(n);
      est.secundario = f.txt;
    } else if (this.modo === 'edicao') {
      const n = this.lista[this.idx];
      est.menu = GRUPOS[this.grupo];
      est.principal = this.formatarValor(n, this.valorEdit);
      est.unidade = MAP.get(n).un;
      est.secundario = pn(n);
      est.piscar = true;
      const p = MAP.get(n);
      if (p.op && p.op[this.valorEdit] !== undefined) est.opcao = p.op[this.valorEdit];
    }
    // falha / alarme ocupam o mostrador principal (ou o secundário depois de reconhecidos)
    if (d.falha) {
      const t = 'F' + String(d.falha).padStart(4, '0');
      if (!this.falhaVista) { est.principal = t; est.unidade = ''; est.piscar = false; } else est.secundario = t;
    } else if (d.get(48)) {
      const t = 'A' + String(d.get(48)).padStart(4, '0');
      if (this.alarmeVisto !== d.get(48)) { est.principal = t; est.unidade = ''; est.piscar = true; } else est.secundario = t;
    }
    if (this.escrita && d.ligado && !(d.tBoot > 0)) {
      const n = this.escrita.n, p = MAP.get(n), v = d.get(n);
      est.menu = (p.g && p.g[0]) || 'PARAM'; est.principal = this.formatarValor(n, v); est.unidade = p.un || '';
      est.secundario = pn(n); est.piscar = false; est.barra = 0;
      if (p.op && p.op[v] !== undefined) est.opcao = p.op[v];
    }
    if (this.msg) { est.secundario = this.msg.txt; est.msgDet = this.msg.det; }
    // texto auxiliar (fora do LCD) para ajudar o aluno
    if (this.modo === 'lista' || this.modo === 'edicao') {
      const p = MAP.get(this.lista[this.idx]);
      est.ajuda = `${pn(p.n)} – ${p.nome}${p.ro ? ' (ro)' : ''}${p.cfg ? ' (cfg)' : ''}`;
      if (this.modo === 'lista' && p.op && p.op[d.get(p.n)] !== undefined) est.opcao = p.op[d.get(p.n)];
    }
    return est;
  }
}

module.exports = { HMI, GRUPOS };
