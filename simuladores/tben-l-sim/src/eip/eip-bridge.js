'use strict';
/**
 * Ponte EtherNet/IP do TBEN-L-SIM. Mesma interface da ponte PROFINET (pn/driver-bridge.js):
 *   outFor(n), arConnected, sendInputs(IN, PQI, diag), eventos 'ar' e 'log', start(), stop()
 * O adapter EtherNet/IP (eip/adapter.js, o mesmo do simulador SCA06) enxerga o TBEN como um
 * equipamento de palavras: 17 de entrada (dados das portas + PQI) e 6 de saída. O mapa está em mapa-eip.js.
 *
 * O TBEN-L real é multiprotocolo (PROFINET, EtherNet/IP e Modbus TCP). Aqui o EtherNet/IP roda
 * direto no Windows, no IP que o HUB reservou na rede virtual SIM-HUB: não precisa de VM nem de root.
 */
const { EventEmitter } = require('events');
const { PORTS } = require('../core/portmap');
const { EnipAdapter } = require('./adapter');
const M = require('./mapa-eip');

const IN_WORDS = M.IN.bytes / 2, OUT_WORDS = M.OUT.bytes / 2;

class EipBridge extends EventEmitter {
  constructor(cfg) {
    super();
    this.cfg = cfg;
    this.proto = 'EtherNet/IP';
    this.cfgFromPlc = false;            // a configuração das portas vem da tela (aba Porta), não de um registro do CLP
    this.out = PORTS.map((p) => new Uint8Array(p.outLen));
    this.outBuf = Buffer.alloc(M.OUT.bytes);
    this.inBuf = Buffer.alloc(M.IN.bytes);
    this.valid = false;                 // há conexão de I/O em RUN?
    this.arConnected = false;
    this.lastRx = 0;
    this.proc = null;
    const self = this;
    // "equipamento" visto pelo adapter (mesmos nomes que o drive do SCA06 oferece)
    this.dev = {
      netGen: 0,
      comm: { applied: { dhcp: true, ip: null, cidr: 24, rate: 0 }, ioRun: false, ioTimedOut: false },
      linkUp: () => true,
      netReady: () => true,
      netTx: () => {},
      ioSizes: () => ({ inWords: IN_WORDS, outWords: OUT_WORDS }),
      inputWords: () => { const w = []; for (let i = 0; i < IN_WORDS; i++) w.push(self.inBuf.readInt16LE(i * 2)); return w; },
      get out() { const w = []; for (let i = 0; i < OUT_WORDS; i++) w.push(self.outBuf.readInt16LE(i * 2)); return w; },
      outExtra: [],
      netIoOpen: (desc) => {
        self.dev.comm.ioTimedOut = false;
        self.emit('log', { text: `EtherNet/IP: o CLP abriu a conexão de I/O (${desc})`, kind: 'info' });
      },
      netIoData: (words, run) => {
        self.lastRx = Date.now();
        self.dev.comm.ioRun = !!run;
        for (let i = 0; i < OUT_WORDS; i++) self.outBuf.writeInt16LE((words[i] || 0) << 16 >> 16, i * 2);
        M.desempacotarSaidas(self.outBuf, self.out);
        self.valid = !!run;
        if (!self.arConnected) { self.arConnected = true; self.emit('ar', true); }
      },
      netIoClose: (reason) => {
        self.valid = false; self.dev.comm.ioRun = false; self.dev.comm.ioTimedOut = reason === 'timeout';
        self.out.forEach((o) => o.fill(0)); self.outBuf.fill(0);
        if (self.arConnected) { self.arConnected = false; self.emit('ar', false); }
      },
      currentAlarm: () => 0,
      fault: false,
      controlReset: () => {},
      def: () => null,                  // sem objeto de parâmetros (classe 0xA2): o TBEN não é um drive
      get: () => 0,
      write: () => ({ ok: false, code: 'NOEXIST' }),
    };
    const e = cfg.eip || {};
    this.adapter = new EnipAdapter(this.dev, {
      bindAddress: e.bindAddress || '0.0.0.0',
      hostIp: e.hostIp || null,
      identity: Object.assign({ vendor: 0x0493, deviceType: 0x0C, productCode: 0x0101, major: 1, minor: 1, serial: 0x00B7E1A8, name: 'TBEN-L-SIM (simulador)' }, e.identity || {}),
    });
    this.adapter.on('info', (t) => this.emit('log', { text: 'EtherNet/IP: ' + t, kind: 'info' }));
  }

  get ipcAlive() { return true; }       // o adapter roda dentro do próprio servidor

  start() {
    try {
      this.adapter.start();
      const ip = this.cfg.eip && this.cfg.eip.bindAddress && this.cfg.eip.bindAddress !== '0.0.0.0' ? this.cfg.eip.bindAddress : 'todas as placas';
      this.emit('log', { text: `EtherNet/IP pronto em ${ip} (TCP 44818, UDP 2222). Conexão: ${IN_WORDS * 2} bytes de entrada, ${OUT_WORDS * 2} bytes de saída`, kind: 'ok' });
    } catch (err) { this.emit('log', { text: `EtherNet/IP não iniciou: ${err.message}`, kind: 'diag' }); }
  }
  stop() { try { this.adapter.stop(); } catch (_) { /* já parado */ } }

  /** Entradas + PQI de todas as portas → palavras de entrada (T→O). O diagnóstico segue pelo PQI. */
  sendInputs(IN, PQI) { M.empacotarEntradas(IN, PQI).copy(this.inBuf); }

  outFor(n) { return this.valid ? this.out[n] : null; }
}

module.exports = { EipBridge, IN_WORDS, OUT_WORDS };
