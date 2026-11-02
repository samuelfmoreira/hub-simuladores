/* =============================================================================
 *  MODO DEMONSTRAÇÃO (sem backend Node)
 *  Roda o MESMO modelo do drive (core/sca06-core.js) dentro do navegador e simula
 *  o scanner chamando a API do drive diretamente — não há pacotes de rede reais.
 *  Serve para estudar em casa ou no celular. Para a rede de verdade, rode `npm start`.
 * ===========================================================================*/
(function (global) {
  'use strict';
  class DemoBackend {
    constructor(onMessage) {
      const Core = global.SCA06Core;
      this.onMessage = onMessage; this.Core = Core; global.__demo = this;   // útil no console (F12)
      this.logs = []; this.logIdx = 0;
      let saved = {}; try { saved = JSON.parse(localStorage.getItem('sca06-eeprom') || '{}'); } catch (_) { }
      this.drive = new Core.SCA06Drive({
        saved,
        onLog: (e) => this.pushLog({ dir: 'drv', proto: 'SCA06', summary: e.msg, level: e.level }),
        onPersist: (o) => { try { localStorage.setItem('sca06-eeprom', JSON.stringify(o)); } catch (_) { } }
      });
      this.sc = { state: 'offline', run: true, out: [0, 0, 0, 1], inputs: [], io: null };
      this.gen = this.drive.netGen;
      this.identity = { vendor: 853, deviceType: 43, productCode: 6, major: 2, minor: 10, serial: 0x00A1AEC3, name: 'SCA06 ECO5 (simulador)' };
      let last = performance.now();
      setInterval(() => { const now = performance.now(); this.drive.step(Math.min(0.25, (now - last) / 1000)); last = now; this.ioTick(now); }, 5);
      setInterval(() => this.broadcast(), 33);
      setTimeout(() => onMessage({ t: 'init', defs: Core.DEFS, params: this.drive.allParams(), diFuncs: Core.DI_FUNCS, codes: Core.CODES, info: { backend: false, deviceIp: '192.168.0.10', identity: this.identity, enip: { tcp: 44818, udp: 2222 }, modbusPort: null } }), 0);
    }
    pushLog(e) { this.logs.push(Object.assign({ t: Date.now() }, e)); if (this.logs.length > 400) { this.logs.shift(); this.logIdx = Math.max(0, this.logIdx - 1); } }
    online() { return this.drive.linkUp() && this.drive.netReady(); }
    ioTick(now) {
      const io = this.sc.io, d = this.drive;
      if (d.netGen !== this.gen) { this.gen = d.netGen; if (io) { this.sc.io = null; this.sc.state = 'offline'; this.pushLog({ dir: 'info', proto: 'ENIP', summary: 'Interface Ethernet reinicializada: conexões e sessões encerradas.' }); } }
      if (!io) return;
      if (this.online()) {
        if (now >= io.next) {
          io.next = now + io.rpi; io.tx++; io.rx++; io.last = now;
          d.netIoData(this.sc.out.slice(0, io.outWords), this.sc.run);
          this.sc.inputs = d.inputWords().slice(0, io.inWords);
          if (now - (io.logT || 0) > 1000) { io.logT = now; this.pushLog({ dir: 'tx', proto: 'UDP', summary: `[demo] O→T ${this.sc.run ? 'RUN' : 'IDLE'} | ${this.sc.out.slice(0, io.outWords).map(h4).join(' ')}` }); this.pushLog({ dir: 'rx', proto: 'UDP', summary: `[demo] T→O | ${this.sc.inputs.map(h4).join(' ')}` }); }
        }
      } else if (now - io.last > io.rpi * 16) {
        d.netIoClose('timeout'); this.sc.io = null; this.sc.state = this.online() ? 'session' : 'offline';
        this.pushLog({ dir: 'info', proto: 'ENIP', summary: 'Conexão I/O encerrada (timeout).' });
      }
    }
    broadcast() {
      const d = this.drive, io = this.sc.io;
      const conns = io ? [{ kind: 'io', role: 'owner', ip: 'CLP virtual (demo)', otRpi: io.rpi, toRpi: io.rpi, timeoutMs: io.rpi * 16, run: this.sc.run, rxPk: io.rx, txPk: io.tx, otHeader: true, toHeader: false, dest: '—', cfgInst: 1, inWords: io.inWords, outWords: io.outWords, otId: '0x0', toId: '0x0' }] : [];
      const logs = this.logs.slice(this.logIdx); this.logIdx = this.logs.length;
      this.onMessage({ t: 'view', v: d.view(), params: d.takeDirty(), conns, scanner: { state: this.sc.state, run: this.sc.run, out: this.sc.out, inputs: this.sc.inputs, io: io ? { rpiMs: io.rpi, inWords: io.inWords, outWords: io.outWords, rx: io.rx, tx: io.tx, stale: false } : null }, logs, deviceIp: '192.168.0.10' });
    }
    async request(m) {
      const d = this.drive, sc = this.sc;
      const needLink = () => { if (!this.online()) throw new Error('Timeout (sem resposta do adapter) — cabo desconectado ou interface reiniciando'); };
      if (m.t === 'param') { const r = d.write(m.n, m.v, 'ui'); if (r.ok && m.hmi) d.hmiFlash(m.n); return { result: r }; }
      if (m.t === 'bench') { d.benchSet(m.key, !!m.value); return {}; }
      if (m.t === 'hmi') { d.hmiKey(m.key); return {}; }
      if (m.t !== 'scanner') return {};
      const log = (s) => this.pushLog({ dir: 'tx', proto: 'TCP', summary: '[demo] ' + s });
      switch (m.op) {
        case 'connect': needLink(); log('RegisterSession + ListIdentity'); sc.state = 'session'; return { result: { ok: true, identity: Object.assign({ ip: '192.168.0.10', revision: '2.10', status: '0x0034' }, this.identity) } };
        case 'disconnect': if (sc.io) d.netIoClose('Forward Close'); sc.io = null; sc.state = 'offline'; return { result: { ok: true } };
        case 'open': {
          needLink(); if (sc.state === 'offline') throw new Error('Abra a sessão primeiro (Conectar).');
          const s = d.ioSizes();
          log(`Forward_Open (O→T 150: ${m.outWords * 2 + 6} B, T→O 100: ${m.inWords * 2 + 2} B, RPI ${m.rpiMs} ms)`);
          if (m.inWords !== s.inWords) throw new Error(`Forward Open recusado: 0x0109 – Tamanho de conexão inválido (tamanho esperado pelo adapter: ${s.inWords * 2 + 2} bytes)`);
          if (m.outWords !== s.outWords) throw new Error(`Forward Open recusado: 0x0109 – Tamanho de conexão inválido (tamanho esperado pelo adapter: ${s.outWords * 2 + 6} bytes)`);
          sc.io = { inWords: m.inWords, outWords: m.outWords, rpi: m.rpiMs, next: 0, last: performance.now(), rx: 0, tx: 0 };
          sc.out = Array.from({ length: m.outWords }, (_, i) => sc.out[i] || 0); sc.state = 'io';
          d.netIoOpen(`CLP virtual (demo) RPI ${m.rpiMs} ms`); return { result: { ok: true } };
        }
        case 'close': if (sc.io) { d.netIoClose('Forward Close'); log('Forward_Close'); } sc.io = null; sc.state = 'session'; return { result: { ok: true } };
        case 'out': sc.out = m.words.map(w => w | 0); return { result: { ok: true } };
        case 'run': sc.run = !!m.value; return { result: { ok: true } };
        case 'get': { needLink(); log(`Get_Attribute_Single 0xA2/${m.n}/5`); const v = d.get(m.n); return { result: v === undefined ? { ok: false, gs: 0x16 } : { ok: true, value: v } }; }
        case 'set': {
          needLink(); log(`Set_Attribute_Single 0xA2/${m.n}/5 = ${m.v}`);
          const r = d.write(m.n, m.v, 'net'); const map = { NOEXIST: 0x16, RO: 0x0E, RANGE: 0x09, ENABLED: 0x10 };
          return { result: r.ok ? { ok: true } : { ok: false, gs: map[r.code] } };
        }
      }
      return {};
    }
  }
  const h4 = (w) => (w & 0xFFFF).toString(16).padStart(4, '0');
  global.DemoBackend = DemoBackend;
})(typeof window !== 'undefined' ? window : this);
