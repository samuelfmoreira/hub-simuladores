'use strict';
/**
 * CLP de demonstração da IHM do servo: faz o papel do CODESYS para quem quer usar a IHM sem programar.
 *
 *   IHM ──Modbus TCP──► [servidor Modbus em 127.0.0.60:502] ── PRG_IHM_Servo ── [scanner EtherNet/IP] ──► SCA06
 *
 * - Mapa Modbus = o mapa padrão da IHM (coils 0-4, holding 0-5, discrete inputs 0-4, input registers 0-4).
 * - Conexão com o drive: Exclusive Owner, 8 palavras de entrada / 11 de saída (o drive precisa estar configurado
 *   para a IHM: assistente "Comunicação com o CLP" → IHM, todos os modos).
 * - O programa é o mesmo do guia (src/ihm/prg-ihm-servo.js), ciclo de 20 ms.
 */
const { EventEmitter } = require('events');
const { ServidorModbusMemoria } = require('./servidor-modbus-memoria');
const { PrgIhmServo } = require('./prg-ihm-servo');
const { VirtualScanner } = require('../enip/scanner');

const i16 = (v) => ((v | 0) << 16) >> 16;

class ClpDemoIHM extends EventEmitter {
  constructor({ hostAdapter, portaAdapter = 44818 }) {
    super();
    this.hostAdapter = hostAdapter; this.portaAdapter = portaAdapter;
    this.mb = null; this.sc = null; this.prg = null; this.tmr = null;
    this.ligado = false; this.porta = null; this.host = null; this.erro = '';
  }

  log(m) { this.emit('log', `CLP de demonstração: ${m}`); }

  async ligar() {
    await this.desligar();
    this.erro = '';
    try {
      // servidor Modbus da IHM: só neste PC, sempre na porta 502 do Modbus, num endereço de loopback próprio
      // (127.0.0.60): não disputa a 502 do CODESYS (192.168.100.10) nem a dos CLPs de teste dos outros simuladores.
      // Se o Windows recusar o endereço, volta para 127.0.0.1 numa porta alternativa (5502–5510) e avisa.
      this.mb = new ServidorModbusMemoria({ tamanho: 32 });
      this.mb.hr[0] = 1; this.mb.hr[4] = 450; this.mb.hr[5] = 100;     // valores iniciais: modo velocidade, passo 45,0°, 100 rpm
      try {
        this.host = '127.0.0.60'; this.porta = await this.mb.iniciar(this.host, [502]);
      } catch (e) {
        this.log(`127.0.0.60:502 indisponível (${e.code || e.message}); usando 127.0.0.1 numa porta alternativa`);
        try { if (this.mb.parar) await this.mb.parar(); } catch (_) { /* não abriu */ }
        this.mb = new ServidorModbusMemoria({ tamanho: 32 });
        this.mb.hr[0] = 1; this.mb.hr[4] = 450; this.mb.hr[5] = 100;
        this.host = '127.0.0.1'; this.porta = await this.mb.iniciar(this.host, [5502, 5503, 5504, 5505, 5506, 5507, 5508, 5509, 5510]);
      }
      // scanner EtherNet/IP até o drive
      // o drive pode estar reiniciando a interface (P0849 = 1 acabou de ser gravado): tenta por até ~10 s
      for (let tentativa = 1; ; tentativa++) {
        this.sc = new VirtualScanner();
        try {
          await this.sc.connect(this.hostAdapter(), this.portaAdapter);
          await this.sc.forwardOpen({ inWords: 8, outWords: 11, rpiMs: 20 });
          break;
        } catch (e) {
          try { this.sc.disconnect(); } catch (_) { /* */ }
          this.sc = null;
          if (!/timeout|ECONNREFUSED|ECONNRESET/i.test(e.message) || tentativa >= 5) throw e;
          this.log(`o drive não respondeu (tentativa ${tentativa}); tentando de novo em 2 s`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      this.sc.run = true;
      this.prg = new PrgIhmServo();
      this.tmr = setInterval(() => this.ciclo(), 20);
      this.ligado = true;
      this.log(`ligado. IHM → ${this.host}:${this.porta} (Modbus TCP); drive → ${this.hostAdapter()} (EtherNet/IP, 8/11 palavras)`);
      return { ok: true, porta: this.porta, host: this.host };
    } catch (e) {
      const msg = /0x0109|tamanho|size/i.test(e.message)
        ? 'o drive recusou a conexão de 8/11 palavras: configure o drive para a IHM (assistente → IHM, todos os modos) e aplique com P0849 = 1'
        : /exclusive|0x0106|ocupad|owner/i.test(e.message)
          ? 'já existe outra conexão de I/O com o drive (aba Mestre ou CODESYS): feche-a antes'
          : e.message;
      this.erro = msg; this.log(`não ligou: ${msg}`);
      await this.desligar(true);
      return { ok: false, erro: msg };
    }
  }

  async desligar(silencioso) {
    clearInterval(this.tmr); this.tmr = null;
    if (this.sc) { try { await this.sc.forwardClose(); } catch (_) { /* já fechada */ } try { this.sc.disconnect(); } catch (_) { /* */ } this.sc = null; }
    if (this.mb) { this.mb.parar(); this.mb = null; }
    if (this.ligado && !silencioso) this.log('desligado');
    this.ligado = false;
  }

  ciclo() {
    const m = this.mb, s = this.sc;
    if (!m || !s) return;
    const iw = (s.inputs || []).map(i16);
    const ihm = {
      CMD_HABILITA: !!m.coils[0], CMD_PARTIR: !!m.coils[1], CMD_DISPARO: !!m.coils[2], CMD_STOP: !!m.coils[3], CMD_RESET: !!m.coils[4],
      SP_MODO: i16(m.hr[0]), SP_VELOCIDADE: i16(m.hr[1]), SP_CORRENTE: i16(m.hr[2]), SP_DESTINO: i16(m.hr[3]), SP_PASSO: i16(m.hr[4]), SP_VEL_POS: i16(m.hr[5]),
    };
    const drv = { VEL: iw[1] || 0, IQ: iw[2] || 0, POS_FRACAO: iw[4] || 0, POS_VOLTAS: iw[5] || 0, POS_ESTADO: iw[6] || 0, POS_LAG: iw[7] || 0 };
    this.prg.ciclo(20, ihm, drv);
    const o = this.prg.drvOut, r = this.prg.ihmOut;
    s.out = [0, 0, 0, 0, o.POS_HAB, o.POS_DISPARO, o.POS_DESTINO, o.POS_RESET, o.POS_TIPO, o.POS_VEL, o.POS_VOLTAS_ALVO];
    m.di[0] = r.ST_HABILITADO ? 1 : 0; m.di[1] = r.ST_MOVENDO ? 1 : 0; m.di[2] = r.ST_EM_POSICAO ? 1 : 0; m.di[3] = r.ST_FALHA ? 1 : 0; m.di[4] = r.ST_PRONTO ? 1 : 0;
    m.ir[0] = r.VEL_ATUAL & 0xFFFF; m.ir[1] = r.CORRENTE & 0xFFFF; m.ir[2] = r.POSICAO & 0xFFFF; m.ir[3] = r.PASSOS & 0xFFFF; m.ir[4] = r.MODO_ATUAL & 0xFFFF;
  }

  estado() { return { ligado: this.ligado, porta: this.porta, host: this.host, erro: this.erro, modoAtivo: this.prg ? this.prg.modoAtivo : null }; }
}

module.exports = { ClpDemoIHM };
