'use strict';
/**
 * Ponte com o driver PROFINET (pn-driver/bin/tben-pn-driver, baseado no p-net).
 * O driver fala PROFINET na interface de rede virtual; com o Node ele troca a
 * imagem de processo por UDP em 127.0.0.1 (protocolo descrito em app_data.c).
 */
const dgram = require('dgram');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { PORTS } = require('../core/portmap');

class DriverBridge extends EventEmitter {
  constructor(cfg) {
    super();
    this.cfg = cfg;
    this.out = PORTS.map(p => new Uint8Array(p.outLen));
    this.valid = PORTS.map(() => false);
    this.arConnected = false;
    this.lastCfg = PORTS.map(() => '');
    this.lastRx = 0;
    this.proc = null;
    this.sock = dgram.createSocket('udp4');
    this.sock.on('message', m => this.onMessage(m));
    this.sock.on('error', e => this.emit('log', { text: `Ponte UDP: ${e.message}`, kind: 'diag' }));
    this.sock.bind(cfg.ipc.nodePort, '127.0.0.1');
  }

  get ipcAlive() { return Date.now() - this.lastRx < 500; }

  start() {
    const d = this.cfg.driver;
    if (!d.autostart) { this.emit('log', { text: 'Driver PROFINET em modo externo: inicie pn-driver/bin/tben-pn-driver manualmente', kind: 'info' }); return; }
    const bin = path.resolve(__dirname, '../../pn-driver/bin/tben-pn-driver');
    if (!fs.existsSync(bin)) { this.emit('log', { text: 'Driver PROFINET não compilado. Rode: npm run build:driver', kind: 'diag' }); return; }
    fs.mkdirSync(d.storage, { recursive: true });
    const args = ['-i', d.interface, '-s', d.stationName, '-p', d.storage];
    if (d.verbose) args.push('-v');
    const env = { ...process.env, TBEN_IPC_DRIVER_PORT: String(this.cfg.ipc.driverPort), TBEN_IPC_NODE_PORT: String(this.cfg.ipc.nodePort) };
    this.proc = spawn(bin, args, { cwd: path.dirname(bin), env });
    this.emit('log', { text: `Driver PROFINET iniciado na interface ${d.interface} com o nome de estação "${d.stationName}"`, kind: 'info' });
    const relay = buf => buf.toString().split('\n').forEach(line => {
      const l = line.trim();
      if (!l) return;
      if (this.cfg.driver.echoToConsole) console.log('[driver]', l);
      if (/TBEN|Connect|connect|Abort|ABORT|IP address|Station name|station name|Error|ERROR/.test(l)) this.emit('log', { text: 'Driver: ' + l, kind: /Error|ERROR|Abort|ABORT/.test(l) ? 'diag' : 'info' });
    });
    this.proc.stdout.on('data', relay);
    this.proc.stderr.on('data', relay);
    this.proc.on('exit', (code, sig) => {
      this.proc = null; this.arConnected = false; this.valid.fill(false);
      this.emit('log', { text: `Driver PROFINET encerrado (código ${code ?? sig}). Ele precisa de root para usar Ethernet bruta: rode com sudo`, kind: 'diag' });
    });
  }

  stop() { if (this.proc) this.proc.kill('SIGTERM'); try { this.sock.close(); } catch (_) { /* já fechado */ } }

  onMessage(m) {
    this.lastRx = Date.now();
    if (m[0] === 0x4F) { // 'O'
      const was = this.arConnected;
      this.arConnected = m[1] === 1;
      let pos = 2;
      for (let n = 0; n < 8 && pos + 1 < m.length; n++) {
        const valid = m[pos++] === 1, len = m[pos++];
        if (len !== PORTS[n].outLen) return;
        this.valid[n] = valid;
        for (let i = 0; i < len; i++) this.out[n][i] = m[pos + i];
        pos += len;
      }
      for (let n = 0; n < 8 && pos + 11 <= m.length; n++) {
        const has = m[pos++] === 1, cfg = m.subarray(pos, pos + 10); pos += 10;
        const key = has ? cfg.toString('hex') : '';
        if (has && key !== this.lastCfg[n]) this.emit('portcfg', n, Buffer.from(cfg));
        this.lastCfg[n] = key;
      }
      if (was !== this.arConnected) this.emit('ar', this.arConnected);
    } else if (m[0] === 0x51 && m.length >= 2) { // 'Q' pedido IOL_CALL
      this.emit('iolcall', Buffer.from(m.subarray(2, 2 + m[1])));
    }
  }

  /** Envia entradas + PQI de todas as portas e o diagnóstico (erro de canal + evento IO-Link) */
  sendInputs(IN, PQI, diag) {
    const parts = [Buffer.from('I')];
    PORTS.forEach(p => { parts.push(Buffer.from([p.inLen + 1]), Buffer.from(IN[p.n]), Buffer.from([PQI[p.n]])); });
    const d = Buffer.alloc(48); diag.forEach((c, i) => { d.writeUInt16BE(c.err, i * 6); d.writeUInt32BE(c.add >>> 0, i * 6 + 2); }); parts.push(d);
    this.sock.send(Buffer.concat(parts), this.cfg.ipc.driverPort, '127.0.0.1');
  }

  /** Resposta do IOL_CALL, servida pelo driver na leitura do registro 0xB400 */
  iolReply(buf) {
    this.sock.send(Buffer.concat([Buffer.from([0x52, buf.length]), buf]), this.cfg.ipc.driverPort, '127.0.0.1'); // 'R'
  }

  outFor(n) { return this.valid[n] ? this.out[n] : null; }
}

module.exports = { DriverBridge };
