'use strict';
// Cliente Modbus TCP (mestre) do simulador. O CLP é o servidor (CODESYS "Modbus TCP Slave Device" ou
// XP325 com MODBUS Symbol Server). Cada sinal é uma variável com endereço próprio (server/tags.js).
// Interface comum dos clientes: conectar, escrever(items), ler(nomes), desconectar, status, eventos 'leitura' e 'conexao'.
const net = require('net');
const EventEmitter = require('events');
const TG = require('./tags');

function createModbusClient(opts = {}) {
  const ev = new EventEmitter();
  const cfg = Object.assign({ host: '127.0.0.1', port: 502, unitId: 1, periodoMs: 100, timeoutMs: 1500, log: () => {} }, opts);
  const st = { conectado: false, endpoint: `modbus://${cfg.host}:${cfg.port}#${cfg.unitId}`, polling: true, reconexoes: 0, erros: 0, ultimoErro: '', assinaturas: {}, transacoes: 0 };
  let sock = null, tid = 0, pendente = null, filaTx = [], buf = Buffer.alloc(0), pollTimer = null;
  const snapshot = {}, ultimo = {};
  const discretos = TG.doClp.filter((t) => t.mb.t === 'discrete');
  const inputs = TG.doClp.filter((t) => t.mb.t === 'input');
  const nDisc = Math.max(...discretos.map((t) => t.mb.a)) + 1, nInp = Math.max(...inputs.map((t) => t.mb.a)) + 1;

  // --------------------------------------------------------------- transporte
  function transacao(pdu) { return new Promise((resolve, reject) => { filaTx.push({ pdu, resolve, reject }); bombear(); }); }
  function bombear() {
    if (pendente || !filaTx.length || !sock || !st.conectado) return;
    const t = filaTx.shift(); tid = (tid + 1) & 0xffff;
    const mbap = Buffer.alloc(7); mbap.writeUInt16BE(tid, 0); mbap.writeUInt16BE(0, 2); mbap.writeUInt16BE(t.pdu.length + 1, 4); mbap[6] = cfg.unitId;
    pendente = Object.assign(t, { tid, timer: setTimeout(() => { if (pendente === t) { pendente = null; st.erros++; st.ultimoErro = 'timeout Modbus'; t.reject(new Error('timeout Modbus')); bombear(); } }, cfg.timeoutMs) });
    sock.write(Buffer.concat([mbap, t.pdu]));
  }
  function receber(chunk) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 7) {
      const len = buf.readUInt16BE(4); if (buf.length < 6 + len) break;
      const frame = buf.subarray(0, 6 + len); buf = buf.subarray(6 + len);
      const t = frame.readUInt16BE(0), pdu = frame.subarray(7);
      if (!pendente || pendente.tid !== t) continue;
      const p = pendente; pendente = null; clearTimeout(p.timer); st.transacoes++;
      if (pdu[0] & 0x80) { st.erros++; st.ultimoErro = `exceção Modbus ${pdu[1]} na FC${pdu[0] & 0x7f}`; p.reject(new Error(st.ultimoErro)); } else p.resolve(pdu);
      bombear();
    }
  }
  async function lerBits(fc, addr, n) { const r = await transacao(Buffer.from([fc, addr >> 8, addr & 0xff, n >> 8, n & 0xff])); const out = []; for (let i = 0; i < n; i++) out.push(!!(r[2 + (i >> 3)] & (1 << (i & 7)))); return out; }
  async function lerRegs(fc, addr, n) { const r = await transacao(Buffer.from([fc, addr >> 8, addr & 0xff, n >> 8, n & 0xff])); const out = []; for (let i = 0; i < n; i++) out.push(r.readInt16BE(2 + i * 2)); return out; }
  async function escreverBits(addr, bits) { const nb = Math.ceil(bits.length / 8), data = Buffer.alloc(nb); bits.forEach((b, i) => { if (b) data[i >> 3] |= 1 << (i & 7); }); await transacao(Buffer.concat([Buffer.from([15, addr >> 8, addr & 0xff, bits.length >> 8, bits.length & 0xff, nb]), data])); }
  async function escreverRegs(addr, regs) { const data = Buffer.alloc(regs.length * 2); regs.forEach((v, i) => { const x = Math.max(-32768, Math.min(65535, Math.round(v))); data.writeUInt16BE(x < 0 ? x + 65536 : x, i * 2); }); await transacao(Buffer.concat([Buffer.from([16, addr >> 8, addr & 0xff, regs.length >> 8, regs.length & 0xff, regs.length * 2]), data])); }

  // valor de engenharia <-> registrador
  const paraReg = (t, v) => (t.tipo === 'BOOL' ? !!v : Math.round(Number(v) * (t.mb.escala || 1)));
  const deReg = (t, r) => (t.tipo === 'UINT' ? (r + 65536) % 65536 : t.mb.escala ? r / t.mb.escala : r);

  // --------------------------------------------------------------- conexão e varredura
  function conectar() {
    return new Promise((resolve, reject) => {
      let resolvido = false;
      sock = net.createConnection({ host: cfg.host, port: cfg.port }); sock.setNoDelay(true);
      const falha = (e) => { st.ultimoErro = e.message; if (!resolvido) { resolvido = true; reject(new Error(`Modbus ${cfg.host}:${cfg.port}: ${e.message}`)); } };
      sock.once('error', falha);
      sock.setTimeout(5000, () => { if (!resolvido) falha(new Error('timeout de conexão')); });
      sock.on('connect', async () => {
        sock.setTimeout(0); st.conectado = true;
        sock.on('data', receber);
        sock.on('close', () => { st.conectado = false; if (pendente) { clearTimeout(pendente.timer); pendente.reject(new Error('conexão fechada')); pendente = null; } for (const t of filaTx) t.reject(new Error('conexão fechada')); filaTx = []; pararPolling(); ev.emit('conexao', false); });
        sock.on('error', (e) => { st.ultimoErro = e.message; st.erros++; });
        try { await lerRegs(4, 0, nInp); } catch (e) { resolvido = true; try { sock.destroy(); } catch (_) { /* ok */ } return reject(new Error(`servidor Modbus não respondeu: ${e.message}`)); }
        st.assinaturas = { rapida: { publish: cfg.periodoMs, sampling: cfg.periodoMs, itens: TG.doClp.length, pedidoPublish: cfg.periodoMs, pedidoSampling: cfg.periodoMs } };
        iniciarPolling(); resolvido = true; ev.emit('conexao', true); resolve();
      });
    });
  }
  function iniciarPolling() {
    if (pollTimer) return;
    const varre = async () => {
      if (!st.conectado) return;
      try {
        const bits = await lerBits(2, 0, nDisc);   // FC2: discrete inputs 0.. (as SD do CLP)
        const regs = await lerRegs(4, 0, nInp);    // FC4: input registers 0.. (referência, heartbeat, IHM)
        for (const t of discretos) emitir(t.nome, bits[t.mb.a]);
        for (const t of inputs) emitir(t.nome, deReg(t, regs[t.mb.a]));
      } catch (e) { /* já contabilizado */ }
      finally { if (pollTimer) pollTimer = setTimeout(varre, cfg.periodoMs); }
    };
    pollTimer = setTimeout(varre, cfg.periodoMs);
  }
  function emitir(nome, valor) { ultimo[nome] = valor; if (snapshot[nome] !== valor) { snapshot[nome] = valor; ev.emit('leitura', { tag: nome, valor }); } }
  function pararPolling() { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }

  // writer da fila: items = [{ tag, valor }]. Agrupa endereços vizinhos da mesma tabela em uma só FC15/FC16.
  async function escrever(items) {
    if (!st.conectado) throw new Error('sem conexão Modbus');
    const porTabela = { coil: [], holding: [] };
    for (const it of items) { const t = TG.porNome[it.tag]; if (!t || t.dir !== 'sim') continue; porTabela[t.mb.t].push({ a: t.mb.a, v: paraReg(t, it.valor) }); }
    for (const [tab, lista] of Object.entries(porTabela)) {
      lista.sort((x, y) => x.a - y.a);
      let i = 0;
      while (i < lista.length) {
        let j = i; while (j + 1 < lista.length && lista[j + 1].a === lista[j].a + 1) j++;
        const bloco = lista.slice(i, j + 1);
        if (tab === 'coil') await escreverBits(bloco[0].a, bloco.map((x) => x.v)); else await escreverRegs(bloco[0].a, bloco.map((x) => x.v));
        i = j + 1;
      }
    }
  }
  async function ler(nomes) { const out = {}; for (const n of nomes) out[n] = ultimo[n]; return out; }
  async function desconectar() { pararPolling(); st.conectado = false; if (sock) { try { sock.destroy(); } catch (e) { /* ok */ } sock = null; } }
  function status() { return { conectado: st.conectado, endpoint: st.endpoint, polling: true, reconexoes: st.reconexoes, erros: st.erros, ultimoErro: st.ultimoErro, assinaturas: st.assinaturas, protocolo: 'modbus', transacoes: st.transacoes }; }
  return Object.assign(ev, { conectar, escrever, ler, desconectar, status });
}

module.exports = { createModbusClient };
