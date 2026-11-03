/* =============================================================================
 *  ADAPTER EtherNet/IP (escravo / "target") do acessório ECO5 do SCA06
 * =============================================================================
 *  Hierarquia de rede:   SCANNER (mestre, "originator", ex.: CLP)  ⇄  ADAPTER (este código)
 *
 *  Portas:
 *    TCP 44818  – encapsulação: RegisterSession, ListIdentity, SendRRData (mensagens
 *                 explícitas não conectadas), SendUnitData (explícitas conectadas classe 3)
 *    UDP 44818  – ListIdentity por broadcast (descoberta na rede)
 *    UDP 2222   – I/O implícito classe 1 (dados cíclicos O→T e T→O)
 *
 *  Objetos CIP implementados:
 *    0x01 Identity            0x02 Message Router (Multiple Service Packet)
 *    0x04 Assembly 100 (entrada, T→O) e 150 (saída, O→T)  [ETH 8.6.3]
 *    0x06 Connection Manager (Forward Open/Large Forward Open/Forward Close/Unconnected Send)
 *    0xA2 (162) Parâmetros do SCA06: instância = nº do parâmetro, atributo 5  [ETH Tabela 8.2]
 *    0xF5 TCP/IP Interface     0xF6 Ethernet Link
 * ===========================================================================*/
'use strict';
const net = require('net');
const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const EventEmitter = require('events');
const C = require('./cip');
const { CMD, ITEM, SVC, GS, CM } = C;

const ASM_IN = 100, ASM_OUT = 150, ASM_INPUT_ONLY = 198, ASM_LISTEN_ONLY = 199;

class EnipAdapter extends EventEmitter {
  constructor(drive, cfg) {
    super();
    this.drive = drive;
    this.cfg = Object.assign({ tcpPort: 44818, udpPort: 2222, bindAddress: '0.0.0.0', minRpiUs: 1000, maxRpiUs: 3200000, otRunIdleHeader: true, toRunIdleHeader: false, maxIo: 3, maxExplicit: 6, hostIp: null }, cfg);
    this.id = Object.assign({ vendor: 853, deviceType: 0x2B, productCode: 6, major: 2, minor: 10, serial: 0x00A1B2C3, name: 'SCA06 ECO5 (simulador)' }, cfg.identity || {});
    this.sessions = new Map();           // handle → {socket}
    this.conns = new Map();              // otId → conexão
    this.sockets = new Set();
    this.gen = drive.netGen;
    this.stats = { tcpRx: 0, tcpTx: 0, udpRx: 0, udpTx: 0 };
    this.lastIoLog = 0;
  }

  // ------------------------------------------------------------------ infraestrutura
  start() {
    this.tcp = net.createServer((s) => this.onTcp(s));
    this.tcp.on('error', (e) => this.emit('error', e));
    this.tcp.listen(this.cfg.tcpPort, this.cfg.bindAddress);

    this.udpIo = dgram.createSocket({ type: 'udp4', reuseAddr: false });
    this.udpIo.on('message', (m, r) => this.onUdpIo(m, r));
    this.udpIo.on('error', (e) => this.emit('error', e));
    this.udpIo.bind(this.cfg.udpPort, this.cfg.bindAddress);

    this.udpDisc = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.udpDisc.on('message', (m, r) => this.onUdpDiscovery(m, r));
    this.udpDisc.on('error', (e) => this.emit('warn', `UDP 44818 indisponível: ${e.message}`));
    this.udpDisc.bind(this.cfg.tcpPort, this.cfg.bindAddress, () => { try { this.udpDisc.setBroadcast(true); } catch (_) { } });

    this.timer = setInterval(() => this.tick(), 1);
    return this;
  }
  stop() { clearInterval(this.timer); this.tcp.close(); this.udpIo.close(); this.udpDisc.close(); for (const s of this.sockets) s.destroy(); }

  /** O cabo/acessório/interface está apto a trocar pacotes? */
  online() { return this.drive.linkUp() && this.drive.netReady(); }

  log(dir, proto, summary, buf, extra) {
    this.emit('log', { t: Date.now(), dir, proto, summary, hex: buf ? C.hex(buf) : '', len: buf ? buf.length : 0, ...extra });
  }

  /** IP que o dispositivo "possui": DHCP → IP da máquina; Parâmetros → P00811…P00814 */
  deviceIp() {
    const a = this.drive.comm.applied;
    if (a && !a.dhcp) return a.ip;
    if (this.cfg.hostIp) return this.cfg.hostIp;
    for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
    return '127.0.0.1';
  }
  deviceMask() {
    const a = this.drive.comm.applied; const cidr = a && !a.dhcp ? a.cidr : 24;
    const m = cidr === 0 ? 0 : (0xFFFFFFFF << (32 - cidr)) >>> 0;
    return [m >>> 24, (m >>> 16) & 255, (m >>> 8) & 255, m & 255].join('.');
  }

  // ------------------------------------------------------------------ TCP
  onTcp(sock) {
    sock.setNoDelay(true);
    this.sockets.add(sock);
    const peer = `${sock.remoteAddress}:${sock.remotePort}`.replace('::ffff:', '');
    let acc = Buffer.alloc(0);
    sock.session = 0;
    this.emit('info', `TCP conectado: ${peer}`);
    sock.on('data', (chunk) => {
      if (!this.online()) return;                       // cabo desconectado / interface iniciando
      acc = Buffer.concat([acc, chunk]);
      for (; ;) {
        const f = C.parseEncap(acc); if (!f) break;
        acc = acc.subarray(f.total);
        this.stats.tcpRx++;
        try { this.onEncap(sock, f, peer); } catch (e) { this.emit('warn', `Erro tratando pacote: ${e.stack}`); }
      }
    });
    const bye = () => {
      this.sockets.delete(sock);
      if (sock.session) { this.sessions.delete(sock.session); this.dropExplicitFor(sock.session); }
    };
    sock.on('close', bye); sock.on('error', bye);
  }

  send(sock, buf, summary) {
    if (!this.online() || sock.destroyed) return;
    sock.write(buf); this.stats.tcpTx++; this.drive.netTx();
    this.log('tx', 'TCP', summary, buf);
  }

  onEncap(sock, f, peer) {
    const name = C.CMD_NAME[f.command] || `0x${f.command.toString(16)}`;
    const reply = (status, data, summary) => this.send(sock, C.buildEncap(f.command, sock.session || f.session, status, f.context, data || Buffer.alloc(0)), summary);

    switch (f.command) {
      case CMD.NOP: return;
      case CMD.ListIdentity:
        this.log('rx', 'TCP', `ListIdentity de ${peer}`, f.data);
        return reply(0, this.listIdentityData(), 'ListIdentity → identidade do SCA06');
      case CMD.ListServices:
        this.log('rx', 'TCP', 'ListServices', f.data);
        return reply(0, this.listServicesData(), 'ListServices → "Communications"');
      case CMD.ListInterfaces:
        return reply(0, Buffer.from([0, 0]), 'ListInterfaces → 0 interfaces');
      case CMD.RegisterSession: {
        this.log('rx', 'TCP', `RegisterSession de ${peer}`, f.data);
        if (f.data.length < 4 || f.data.readUInt16LE(0) !== 1) return reply(C.ENCAP_STATUS.UNSUPPORTED_PROTOCOL, Buffer.from([1, 0, 0, 0]), 'RegisterSession recusada (versão)');
        const h = crypto.randomBytes(4).readUInt32LE(0) || 1;
        sock.session = h; this.sessions.set(h, { sock, peer });
        return reply(0, Buffer.from([1, 0, 0, 0]), `RegisterSession OK → handle 0x${h.toString(16)}`);
      }
      case CMD.UnRegisterSession:
        this.log('rx', 'TCP', 'UnRegisterSession', f.data);
        this.sessions.delete(sock.session); this.dropExplicitFor(sock.session); sock.session = 0; sock.end();
        return;
      case CMD.SendRRData:
      case CMD.SendUnitData: {
        if (!f.session || f.session !== sock.session) return reply(C.ENCAP_STATUS.INVALID_SESSION, Buffer.alloc(0), 'Sessão inválida');
        const items = C.parseCPF(f.data, 6);
        if (f.command === CMD.SendRRData) return this.onSendRR(sock, f, items, peer, reply);
        return this.onSendUnit(sock, f, items, peer, reply);
      }
      default:
        this.log('rx', 'TCP', `Comando ${name} não suportado`, f.data);
        return reply(C.ENCAP_STATUS.INVALID_CMD, Buffer.alloc(0), 'Comando inválido');
    }
  }

  onSendRR(sock, f, items, peer, reply) {
    const req = items.find(i => i.type === ITEM.UNCONNECTED_DATA);
    if (!req) return reply(C.ENCAP_STATUS.INCORRECT_DATA, Buffer.alloc(0), 'SendRRData sem item 0xB2');
    const ctx = { peer, ip: peer.split(':')[0], session: sock.session, items, extraItems: [] };
    const r = C.parseRequest(req.data);
    this.log('rx', 'TCP', `SendRRData → ${this.describeReq(r)}`, req.data);
    const resp = this.dispatch(req.data, ctx);
    const out = Buffer.concat([Buffer.alloc(6), C.buildCPF([{ type: ITEM.NULL, data: Buffer.alloc(0) }, { type: ITEM.UNCONNECTED_DATA, data: resp }, ...ctx.extraItems])]);
    reply(0, out, `Resposta: ${this.describeResp(resp)}`);
  }

  onSendUnit(sock, f, items, peer, reply) {
    const addr = items.find(i => i.type === ITEM.CONNECTED_ADDR), dat = items.find(i => i.type === ITEM.CONNECTED_DATA);
    if (!addr || !dat) return;
    const id = addr.data.readUInt32LE(0), c = this.conns.get(id);
    if (!c || c.kind !== 'explicit') { this.log('rx', 'TCP', `SendUnitData p/ conexão desconhecida 0x${id.toString(16)}`, dat.data); return; }
    c.lastRx = Date.now();
    const seq = dat.data.readUInt16LE(0), msg = dat.data.subarray(2);
    const r = C.parseRequest(msg);
    this.log('rx', 'TCP', `SendUnitData (classe 3, seq ${seq}) → ${this.describeReq(r)}`, msg);
    const resp = this.dispatch(msg, { peer, ip: peer.split(':')[0], session: sock.session, items, extraItems: [] });
    const seqB = Buffer.alloc(2); seqB.writeUInt16LE(seq, 0);
    const idB = Buffer.alloc(4); idB.writeUInt32LE(c.toId, 0);
    const out = Buffer.concat([Buffer.alloc(6), C.buildCPF([{ type: ITEM.CONNECTED_ADDR, data: idB }, { type: ITEM.CONNECTED_DATA, data: Buffer.concat([seqB, resp]) }])]);
    reply(0, out, `Resposta conectada: ${this.describeResp(resp)}`);
  }

  describeReq(r) {
    const p = C.parsePath(r.path);
    const s = C.SVC_NAME[r.service] || `svc 0x${r.service.toString(16)}`;
    const cls = p.class != null ? `classe 0x${p.class.toString(16).toUpperCase()}` : '';
    const extra = p.class === 0xA2 ? ` (P${String(p.instance).padStart(4, '0')})` : '';
    return `${s} ${cls}${p.instance != null ? ' inst ' + p.instance : ''}${p.attribute != null ? ' attr ' + p.attribute : ''}${extra}`;
  }
  describeResp(b) {
    const gs = b[2]; const ext = b[3] ? b.readUInt16LE(4) : null;
    let t = gs === 0 ? 'OK' : `ERRO 0x${gs.toString(16).padStart(2, '0')} – ${C.GS_TEXT[gs] || ''}`;
    if (ext != null) t += ` / ext 0x${ext.toString(16).padStart(4, '0')} – ${C.CM_TEXT[ext] || ''}`;
    return t;
  }

  // ------------------------------------------------------------------ descoberta
  listIdentityData() {
    const name = Buffer.from(this.id.name, 'latin1');
    const body = Buffer.alloc(2 + 16 + 2 + 2 + 2 + 2 + 2 + 4 + 1 + name.length + 1);
    let o = 0;
    body.writeUInt16LE(1, o); o += 2;                                       // versão do protocolo
    C.sockaddr(this.cfg.tcpPort, this.deviceIp()).copy(body, o); o += 16;
    body.writeUInt16LE(this.id.vendor, o); o += 2;
    body.writeUInt16LE(this.id.deviceType, o); o += 2;
    body.writeUInt16LE(this.id.productCode, o); o += 2;
    body[o++] = this.id.major; body[o++] = this.id.minor;
    body.writeUInt16LE(this.identityStatus(), o); o += 2;
    body.writeUInt32LE(this.id.serial >>> 0, o); o += 4;
    body[o++] = name.length; name.copy(body, o); o += name.length;
    body[o++] = 0x03;                                                       // state: operational
    return C.buildCPF([{ type: ITEM.LIST_IDENTITY, data: body }]);
  }
  listServicesData() {
    const d = Buffer.alloc(20);
    d.writeUInt16LE(1, 0); d.writeUInt16LE(0x0120, 2);                     // TCP CIP + UDP classe 0/1
    Buffer.from('Communications\0\0', 'latin1').copy(d, 4);
    return C.buildCPF([{ type: ITEM.LIST_SERVICES, data: d }]);
  }
  identityStatus() {
    const c = this.drive.comm;
    let s = 0x0004;                                                         // configurado
    if (this.ownerConn()) s |= 0x0001;
    let ext = 3;                                                            // nenhuma conexão de I/O
    if (this.ownerConn()) ext = c.ioRun ? 6 : 7; else if (c.ioTimedOut) ext = 2;
    s |= ext << 4;
    if (this.drive.currentAlarm()) s |= 1 << 8;                              // minor recoverable
    if (this.drive.fault) s |= 1 << 10;                                      // major recoverable
    return s;
  }
  onUdpDiscovery(msg, rinfo) {
    if (!this.online()) return;
    const f = C.parseEncap(msg); if (!f) return;
    if (f.command === CMD.ListIdentity) {
      this.log('rx', 'UDP', `ListIdentity (broadcast) de ${rinfo.address}`, msg);
      const out = C.buildEncap(CMD.ListIdentity, 0, 0, f.context, this.listIdentityData());
      this.udpDisc.send(out, rinfo.port, rinfo.address);
      this.log('tx', 'UDP', 'ListIdentity → resposta', out);
    }
  }

  // ------------------------------------------------------------------ roteador de mensagens
  dispatch(msg, ctx) {
    if (msg.length < 2) return C.cipReply(0, GS.NOT_ENOUGH_DATA);
    const r = C.parseRequest(msg);
    const p = C.parsePath(r.path);
    if (p.error) return C.cipReply(r.service, GS.PATH_SEGMENT_ERROR);
    try {
      switch (p.class) {
        case 0x01: return this.objIdentity(r, p);
        case 0x02: return this.objRouter(r, p, ctx);
        case 0x04: return this.objAssembly(r, p);
        case 0x06: return this.objConnMgr(r, p, ctx);
        case 0xA2: return this.objParam(r, p);
        case 0xF5: return this.objTcpIp(r, p);
        case 0xF6: return this.objEthLink(r, p);
        default: return C.cipReply(r.service, GS.PATH_DEST_UNKNOWN);
      }
    } catch (e) {
      this.emit('warn', `dispatch: ${e.stack}`);
      return C.cipReply(r.service, GS.NOT_ENOUGH_DATA);
    }
  }

  objIdentity(r, p) {
    if (p.instance !== 1 && p.instance !== 0) return C.cipReply(r.service, GS.OBJECT_DOES_NOT_EXIST);
    const name = Buffer.from(this.id.name, 'latin1');
    const attr = {
      1: () => u16(this.id.vendor), 2: () => u16(this.id.deviceType), 3: () => u16(this.id.productCode),
      4: () => Buffer.from([this.id.major, this.id.minor]), 5: () => u16(this.identityStatus()), 6: () => u32(this.id.serial),
      7: () => Buffer.concat([Buffer.from([name.length]), name]),
    };
    if (p.instance === 0) {
      if (r.service === SVC.GetAttributeSingle && p.attribute === 1) return C.cipReply(r.service, 0, u16(1));
      if (r.service === SVC.GetAttributeSingle && p.attribute === 2) return C.cipReply(r.service, 0, u16(1));
      return C.cipReply(r.service, GS.ATTR_NOT_SUPPORTED);
    }
    if (r.service === SVC.GetAttributesAll) return C.cipReply(r.service, 0, Buffer.concat([1, 2, 3, 4, 5, 6, 7].map(a => attr[a]())));
    if (r.service === SVC.GetAttributeSingle) return attr[p.attribute] ? C.cipReply(r.service, 0, attr[p.attribute]()) : C.cipReply(r.service, GS.ATTR_NOT_SUPPORTED);
    if (r.service === SVC.Reset) { setTimeout(() => this.drive.controlReset(), 50); return C.cipReply(r.service, 0); }
    if (r.service === SVC.SetAttributeSingle) return C.cipReply(r.service, GS.ATTR_NOT_SETTABLE);
    return C.cipReply(r.service, GS.SERVICE_NOT_SUPPORTED);
  }

  objRouter(r, p, ctx) {
    if (r.service !== SVC.MultipleServicePacket) return C.cipReply(r.service, GS.SERVICE_NOT_SUPPORTED);
    const n = r.data.readUInt16LE(0);
    const offs = []; for (let i = 0; i < n; i++) offs.push(r.data.readUInt16LE(2 + i * 2));
    const replies = offs.map((o, i) => this.dispatch(r.data.subarray(o, i + 1 < n ? offs[i + 1] : r.data.length), ctx));
    const head = Buffer.alloc(2 + n * 2); head.writeUInt16LE(n, 0);
    let pos = head.length; replies.forEach((b, i) => { head.writeUInt16LE(pos, 2 + i * 2); pos += b.length; });
    const anyErr = replies.some(b => b[2] !== 0);
    return C.cipReply(r.service, anyErr ? 0x1E : 0, Buffer.concat([head, ...replies]));
  }

  objAssembly(r, p) {
    if (p.instance !== ASM_IN && p.instance !== ASM_OUT) return C.cipReply(r.service, GS.OBJECT_DOES_NOT_EXIST);
    if (p.attribute !== 3) return C.cipReply(r.service, GS.ATTR_NOT_SUPPORTED);
    const sizes = this.drive.ioSizes();
    if (r.service === SVC.GetAttributeSingle) {
      const words = p.instance === ASM_IN ? this.drive.inputWords() : this.drive.out.concat(this.drive.outExtra);
      const n = p.instance === ASM_IN ? sizes.inWords : sizes.outWords;
      return C.cipReply(r.service, 0, wordsToBuf(words, n));
    }
    if (r.service === SVC.SetAttributeSingle) {
      if (p.instance !== ASM_OUT) return C.cipReply(r.service, GS.ATTR_NOT_SETTABLE);
      if (this.ownerConn()) return C.cipReply(r.service, GS.OBJECT_STATE_CONFLICT);
      if (r.data.length !== sizes.outWords * 2) return C.cipReply(r.service, r.data.length < sizes.outWords * 2 ? GS.NOT_ENOUGH_DATA : GS.TOO_MUCH_DATA);
      this.drive.netIoData(bufToWords(r.data), true);
      return C.cipReply(r.service, 0);
    }
    return C.cipReply(r.service, GS.SERVICE_NOT_SUPPORTED);
  }

  /** Classe 0xA2: parâmetros. Instância = número do parâmetro, atributo 5 = valor (INT)  [ETH 8.3] */
  objParam(r, p) {
    const n = p.instance, d = this.drive.def(n);
    if (!d) return C.cipReply(r.service, GS.OBJECT_DOES_NOT_EXIST);
    if (p.attribute !== 5) return C.cipReply(r.service, GS.ATTR_NOT_SUPPORTED);
    if (r.service === SVC.GetAttributeSingle) { const b = Buffer.alloc(2); b.writeUInt16LE(this.drive.get(n) & 0xFFFF, 0); return C.cipReply(r.service, 0, b); }
    if (r.service === SVC.SetAttributeSingle) {
      if (r.data.length < 2) return C.cipReply(r.service, GS.NOT_ENOUGH_DATA);
      if (r.data.length > 2) return C.cipReply(r.service, GS.TOO_MUCH_DATA);
      let v = r.data.readInt16LE(0); if (d.min >= 0 && v < 0) v += 65536;
      const res = this.drive.write(n, v, 'net');
      if (res.ok) return C.cipReply(r.service, 0);
      const map = { NOEXIST: GS.OBJECT_DOES_NOT_EXIST, RO: GS.ATTR_NOT_SETTABLE, RANGE: GS.INVALID_ATTR_VALUE, ENABLED: GS.DEVICE_STATE_CONFLICT };
      return C.cipReply(r.service, map[res.code] || GS.INVALID_ATTR_VALUE);
    }
    return C.cipReply(r.service, GS.SERVICE_NOT_SUPPORTED);
  }

  objTcpIp(r, p) {
    if (p.instance !== 1) return C.cipReply(r.service, GS.OBJECT_DOES_NOT_EXIST);
    const a = this.drive.comm.applied || { dhcp: true };
    const ipBuf = (s) => { const b = Buffer.alloc(4); b.writeUInt32LE(ipToIntBE(s), 0); return b; };   // UDINT 0xC0A8000A = 192.168.0.10
    const host = Buffer.from('SCA06', 'latin1');
    const attrs = {
      1: () => u32(1),                                      // status: configuração válida
      2: () => u32(0x14),                                   // capacidade: DHCP + configurável
      3: () => u32(a.dhcp ? 2 : 0),                         // controle: 0 estático, 2 DHCP
      4: () => Buffer.from([2, 0, 0x20, 0xF6, 0x24, 0x01]), // path p/ Ethernet Link
      5: () => Buffer.concat([ipBuf(this.deviceIp()), ipBuf(this.deviceMask()), ipBuf(a.dhcp ? '0.0.0.0' : a.gw), ipBuf('0.0.0.0'), ipBuf('0.0.0.0'), u16(0)]),
      6: () => Buffer.concat([u16(host.length), host, host.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]),
    };
    if (r.service === SVC.GetAttributeSingle) return attrs[p.attribute] ? C.cipReply(r.service, 0, attrs[p.attribute]()) : C.cipReply(r.service, GS.ATTR_NOT_SUPPORTED);
    if (r.service === SVC.GetAttributesAll) return C.cipReply(r.service, 0, Buffer.concat([1, 2, 3, 4, 5, 6].map(k => attrs[k]())));
    if (r.service === SVC.SetAttributeSingle && p.attribute === 3) {             // equivale a escrever P00810
      const v = r.data.readUInt32LE(0) & 0x0F; this.drive.write(810, v === 2 ? 1 : 0, 'net');
      return C.cipReply(r.service, 0);
    }
    if (r.service === SVC.SetAttributeSingle && p.attribute === 5) {             // equivale a P00811…P00819
      const ip = intToIpBE(r.data.readUInt32LE(0)).split('.').map(Number), mask = r.data.readUInt32LE(4), gw = intToIpBE(r.data.readUInt32LE(8)).split('.').map(Number);
      const cidr = popcount(mask >>> 0);
      if (cidr < 1 || cidr > 31) return C.cipReply(r.service, GS.INVALID_ATTR_VALUE);
      ip.forEach((o, i) => this.drive.write(811 + i, o, 'net')); this.drive.write(815, cidr, 'net'); gw.forEach((o, i) => this.drive.write(816 + i, o, 'net'));
      return C.cipReply(r.service, 0);
    }
    return C.cipReply(r.service, r.service === SVC.SetAttributeSingle ? GS.ATTR_NOT_SETTABLE : GS.SERVICE_NOT_SUPPORTED);
  }

  objEthLink(r, p) {
    if (p.instance !== 1 && p.instance !== 2) return C.cipReply(r.service, GS.OBJECT_DOES_NOT_EXIST);
    const rate = (this.drive.comm.applied || {}).rate || 0;
    const speed = rate === 1 || rate === 2 ? 10 : 100, full = rate === 0 || rate === 2 || rate === 4;
    const linked = p.instance === 1 ? this.drive.linkUp() : false;
    const mac = Buffer.from([0x00, 0x00, 0x23, 0x06, 0x05, p.instance]);
    const attrs = { 1: () => u32(linked ? speed : 0), 2: () => u32((linked ? 1 : 0) | (full ? 2 : 0) | (rate === 0 ? 0x10 : 0)), 3: () => mac };
    if (r.service === SVC.GetAttributeSingle) return attrs[p.attribute] ? C.cipReply(r.service, 0, attrs[p.attribute]()) : C.cipReply(r.service, GS.ATTR_NOT_SUPPORTED);
    return C.cipReply(r.service, GS.SERVICE_NOT_SUPPORTED);
  }

  // ------------------------------------------------------------------ Connection Manager
  objConnMgr(r, p, ctx) {
    if (r.service === SVC.ForwardOpen || r.service === SVC.LargeForwardOpen) return this.forwardOpen(r, ctx, r.service === SVC.LargeForwardOpen);
    if (r.service === SVC.ForwardClose) return this.forwardClose(r, ctx);
    if (r.service === SVC.UnconnectedSend) {
      const len = r.data.readUInt16LE(2), inner = r.data.subarray(4, 4 + len);
      this.log('rx', 'TCP', 'Unconnected Send (mensagem embutida, rota ignorada — dispositivo sem backplane)', inner);
      return this.dispatch(inner, ctx);
    }
    return C.cipReply(r.service, GS.SERVICE_NOT_SUPPORTED);
  }

  forwardOpen(r, ctx, large) {
    const d = r.data; let o = 0;
    const tick = d[o++], tout = d[o++];
    const otIdReq = d.readUInt32LE(o); o += 4; const toIdReq = d.readUInt32LE(o); o += 4;
    const serial = d.readUInt16LE(o); o += 2; const ovendor = d.readUInt16LE(o); o += 2; const oserial = d.readUInt32LE(o); o += 4;
    const mult = d[o]; o += 4;
    const otRpi = d.readUInt32LE(o); o += 4; const otNcp = large ? d.readUInt32LE(o) : d.readUInt16LE(o); o += large ? 4 : 2;
    const toRpi = d.readUInt32LE(o); o += 4; const toNcp = large ? d.readUInt32LE(o) : d.readUInt16LE(o); o += large ? 4 : 2;
    const xport = d[o++]; const pw = d[o++]; const path = d.subarray(o, o + pw * 2);
    const ncp = (v) => large ? { size: v & 0xFFFF, type: (v >>> 29) & 3, prio: (v >>> 26) & 3, variable: !!(v & (1 << 25)) } : { size: v & 0x1FF, type: (v >> 13) & 3, prio: (v >> 10) & 3, variable: !!(v & 0x200) };
    const OT = ncp(otNcp), TO = ncp(toNcp);
    const cls = xport & 0x0F;
    const triple = { serial, ovendor, oserial };
    const fail = (ext, add = []) => {
      const b = Buffer.alloc(10); b.writeUInt16LE(serial, 0); b.writeUInt16LE(ovendor, 2); b.writeUInt32LE(oserial, 4); b[8] = 0; b[9] = 0;
      this.emit('info', `Forward Open RECUSADO: 0x${ext.toString(16).padStart(4, '0')} ${C.CM_TEXT[ext] || ''}`);
      return C.cipReply(r.service, GS.CONNECTION_FAILURE, b, [ext, ...add]);
    };
    const p = C.parsePath(path);
    if (p.error) return fail(CM.INVALID_SEGMENT);
    // ---- chave eletrônica (keying)
    if (p.key && !(p.key.vendor === 0 && p.key.product === 0 && p.key.devType === 0)) {
      if (p.key.vendor && p.key.vendor !== this.id.vendor) return fail(CM.VENDOR_MISMATCH);
      if (p.key.product && p.key.product !== this.id.productCode) return fail(CM.VENDOR_MISMATCH);
      if (p.key.devType && p.key.devType !== this.id.deviceType) return fail(CM.DEVTYPE_MISMATCH);
      if (p.key.major && (p.key.compat ? p.key.major > this.id.major : p.key.major !== this.id.major || (p.key.minor && p.key.minor !== this.id.minor))) return fail(CM.REVISION_MISMATCH);
    }
    // ---- duplicado?
    for (const c of this.conns.values()) if (c.serial === serial && c.ovendor === ovendor && c.oserial === oserial) return fail(CM.CONNECTION_IN_USE);
    if (otRpi < this.cfg.minRpiUs || toRpi < this.cfg.minRpiUs || otRpi > this.cfg.maxRpiUs || toRpi > this.cfg.maxRpiUs) {
      if (!(p.class === 0x02 && cls === 3)) return fail(CM.RPI_NOT_SUPPORTED);
    }
    const now = Date.now();
    const base = { serial, ovendor, oserial, session: ctx.session, peer: ctx.peer, ip: ctx.ip, mult, otRpi, toRpi, created: now, lastRx: now };
    const timeoutMs = (rpi) => Math.max(10, rpi * (4 << Math.min(mult, 7)) / 1000);

    // ================= Conexão EXPLÍCITA classe 3 (Message Router)
    if (p.class === 0x02) {
      if (cls !== 3) return fail(CM.TRANSPORT_NOT_SUPPORTED);
      if ([...this.conns.values()].filter(c => c.kind === 'explicit').length >= this.cfg.maxExplicit) return fail(CM.OUT_OF_CONNECTIONS);
      const c = Object.assign(base, { kind: 'explicit', otId: this.newId(), toId: toIdReq, timeoutMs: timeoutMs(otRpi) });
      this.conns.set(c.otId, c);
      this.emit('info', `Conexão explícita classe 3 aberta por ${ctx.peer}`);
      this.emit('connections');
      return C.cipReply(r.service, 0, this.foReplyData(c, triple));
    }
    // ================= Conexão de I/O classe 0/1 (Assembly)
    if (p.class !== 0x04) return fail(CM.INVALID_APP_PATH);
    if (cls !== 1 && cls !== 0) return fail(CM.TRANSPORT_NOT_SUPPORTED);
    let otPoint = null, toPoint = null;
    if (p.points.length >= 2) { otPoint = p.points[0]; toPoint = p.points[1]; }
    else if (p.points.length === 1) { toPoint = p.points[0]; }
    if (toPoint !== ASM_IN) return fail(CM.INVALID_APP_PATH);
    const seqB = cls === 1 ? 2 : 0;
    const { inWords, outWords } = this.drive.ioSizes();
    // ---- tamanho T→O (entradas do mestre)
    const appIn = inWords * 2;
    // Formato real-time [config]: T→O "modeless" (sem header) e O→T com header run/idle de 32 bits,
    // igual ao "Generic Ethernet Module" (Data-INT). Tamanho = dados + 2 (seq. classe 1) [+ 4 header].
    const toHeader = !!this.cfg.toRunIdleHeader;
    if (TO.size !== appIn + seqB + (toHeader ? 4 : 0)) return fail(CM.INVALID_SIZE, [appIn + seqB + (toHeader ? 4 : 0)]);
    // ---- tipo de conexão
    let role = 'owner';
    if (OT.type === 0 || otPoint === null) role = 'inputOnly';
    else if (otPoint === ASM_LISTEN_ONLY) role = 'listenOnly';
    else if (otPoint === ASM_INPUT_ONLY) role = 'inputOnly';
    else if (otPoint !== ASM_OUT) return fail(CM.INVALID_APP_PATH);
    let otHeader = false;
    if (role === 'owner') {
      const appOut = outWords * 2;
      otHeader = this.cfg.otRunIdleHeader !== false;
      if (OT.size !== appOut + seqB + (otHeader ? 4 : 0)) return fail(CM.INVALID_SIZE, [appOut + seqB + (otHeader ? 4 : 0)]);
      if (this.ownerConn()) return fail(CM.OWNERSHIP_CONFLICT);
    }
    if (role === 'listenOnly' && !this.ownerConn()) return fail(CM.NON_LISTEN_ONLY_NOT_OPEN);
    if ([...this.conns.values()].filter(c => c.kind === 'io').length >= this.cfg.maxIo) return fail(CM.OUT_OF_CONNECTIONS);
    // ---- destino dos pacotes T→O
    const multicast = TO.type === 1;
    let dest = { ip: ctx.ip, port: 2222 };
    const sa = ctx.items.find(i => i.type === ITEM.SOCKADDR_TO) || ctx.items.find(i => i.type === ITEM.SOCKADDR_OT);
    const s = C.parseSockaddr(sa && sa.data);
    if (s && s.port) dest.port = s.port;
    if (multicast) dest = { ip: this.multicastAddr(), port: 2222 };
    const c = Object.assign(base, {
      kind: 'io', role, otId: this.newId(), toId: multicast ? this.newId() : toIdReq, cls, otHeader, toHeader, seqB,
      otPoint, toPoint, cfgInst: p.instance, multicast, dest, timeoutMs: OT.type !== 0 ? timeoutMs(otRpi) : Infinity,   // O→T nulo: sem heartbeat, encerra com Forward Close/sessão
      inWords, outWords, nextTx: now, toSeq: 0, encSeq: 0, lastSeq: -1, rxPk: 0, txPk: 0, run: false
    });
    this.conns.set(c.otId, c);
    if (multicast) {
      ctx.extraItems.push({ type: ITEM.SOCKADDR_TO, data: C.sockaddr(2222, dest.ip) });
      try { this.udpIo.setMulticastTTL(1); } catch (_) { }
    }
    if (role === 'owner') this.drive.netIoOpen(`${ctx.ip} RPI ${otRpi / 1000}/${toRpi / 1000} ms`);
    this.emit('info', `Forward Open OK: ${role} de ${ctx.peer} | cfg ${p.instance} O→T ${otPoint ?? '-'} (${OT.size} B${otHeader ? ', header 32 bits' : ''}) T→O ${toPoint} (${TO.size} B) | RPI ${otRpi / 1000}/${toRpi / 1000} ms ${multicast ? '| T→O multicast ' + dest.ip : ''}`);
    this.emit('connections');
    return C.cipReply(r.service, 0, this.foReplyData(c, triple));
  }
  foReplyData(c, t) {
    const b = Buffer.alloc(26);
    b.writeUInt32LE(c.otId, 0); b.writeUInt32LE(c.toId, 4);
    b.writeUInt16LE(t.serial, 8); b.writeUInt16LE(t.ovendor, 10); b.writeUInt32LE(t.oserial, 12);
    b.writeUInt32LE(c.otRpi, 16); b.writeUInt32LE(c.toRpi, 20); b[24] = 0; b[25] = 0;
    return b;
  }
  forwardClose(r, ctx) {
    const d = r.data; const serial = d.readUInt16LE(2), ovendor = d.readUInt16LE(4), oserial = d.readUInt32LE(6);
    const b = Buffer.alloc(10); b.writeUInt16LE(serial, 0); b.writeUInt16LE(ovendor, 2); b.writeUInt32LE(oserial, 4);
    for (const [id, c] of this.conns) if (c.serial === serial && c.ovendor === ovendor && c.oserial === oserial) {
      this.closeConn(id, 'Forward Close');
      return C.cipReply(r.service, 0, b);
    }
    return C.cipReply(r.service, GS.CONNECTION_FAILURE, b, [CM.CONNECTION_NOT_FOUND]);
  }
  closeConn(id, reason) {
    const c = this.conns.get(id); if (!c) return;
    this.conns.delete(id);
    if (c.kind === 'io' && c.role === 'owner') this.drive.netIoClose(reason === 'timeout' ? 'timeout' : reason);
    this.emit('info', `Conexão ${c.kind === 'io' ? 'I/O ' + c.role : 'explícita'} de ${c.ip} encerrada (${reason}).`);
    this.emit('connections');
  }
  dropExplicitFor(session) { for (const [id, c] of this.conns) if ((c.kind === 'explicit' || c.timeoutMs === Infinity) && c.session === session) this.closeConn(id, 'sessão TCP fechada'); }
  ownerConn() { for (const c of this.conns.values()) if (c.kind === 'io' && c.role === 'owner') return c; return null; }
  newId() { let id; do { id = crypto.randomBytes(4).readUInt32LE(0); } while (!id || this.conns.has(id)); return id; }
  multicastAddr() {
    const ip = ipToIntBE(this.deviceIp()), mask = ipToIntBE(this.deviceMask());
    const host = (ip & ~mask) >>> 0;
    const off = ((host - 1) & 0x3FF) * 32;
    return intToIpBE((ipToIntBE('239.192.1.0') + off) >>> 0);
  }

  // ------------------------------------------------------------------ I/O implícito (UDP 2222)
  onUdpIo(msg, rinfo) {
    if (!this.online()) return;
    this.stats.udpRx++;
    let items; try { items = C.parseCPF(msg, 0); } catch (_) { return; }
    const sa = items.find(i => i.type === ITEM.SEQUENCED_ADDR), da = items.find(i => i.type === ITEM.CONNECTED_DATA);
    if (!sa || !da) return;
    const id = sa.data.readUInt32LE(0), encSeq = sa.data.readUInt32LE(4);
    const c = this.conns.get(id); if (!c || c.kind !== 'io') return;
    c.lastRx = Date.now(); c.rxPk++;
    if (c.role !== 'owner') return;                                      // heartbeat
    let off = 0, seq = null;
    if (c.seqB) { seq = da.data.readUInt16LE(0); off = 2; }
    let run = true;
    if (c.otHeader) { run = (da.data.readUInt32LE(off) & 1) === 1; off += 4; }
    const words = bufToWords(da.data.subarray(off, off + c.outWords * 2));
    c.run = run;
    this.drive.netIoData(words, run);
    if (Date.now() - this.lastIoLog > 500) {
      this.lastIoLog = Date.now();
      this.log('rx', 'UDP', `I/O O→T conn 0x${id.toString(16)} seq ${seq ?? '-'} ${run ? 'RUN' : 'IDLE'} | ${words.map(w => w & 0xFFFF).map(w => w.toString(16).padStart(4, '0')).join(' ')}`, msg, { io: true });
    }
  }
  produce(c, now) {
    const words = this.drive.inputWords();
    const data = wordsToBuf(words, c.inWords);
    const parts = [];
    if (c.seqB) { c.toSeq = (c.toSeq + 1) & 0xFFFF; const s = Buffer.alloc(2); s.writeUInt16LE(c.toSeq, 0); parts.push(s); }
    if (c.toHeader) parts.push(u32(1));
    parts.push(data);
    c.encSeq = (c.encSeq + 1) >>> 0;
    const addr = Buffer.alloc(8); addr.writeUInt32LE(c.toId, 0); addr.writeUInt32LE(c.encSeq, 4);
    const pkt = C.buildCPF([{ type: ITEM.SEQUENCED_ADDR, data: addr }, { type: ITEM.CONNECTED_DATA, data: Buffer.concat(parts) }]);
    this.udpIo.send(pkt, c.dest.port, c.dest.ip);
    this.stats.udpTx++; c.txPk++; this.drive.netTx();
    if (now - (c.lastTxLog || 0) > 500) { c.lastTxLog = now; this.log('tx', 'UDP', `I/O T→O conn 0x${c.toId.toString(16)} → ${c.dest.ip}:${c.dest.port} | ${words.slice(0, c.inWords).map(w => (w & 0xFFFF).toString(16).padStart(4, '0')).join(' ')}`, pkt, { io: true }); }
  }

  tick() {
    const now = Date.now();
    // reinicialização da interface (P00849, reset, acessório) derruba tudo
    if (this.drive.netGen !== this.gen) {
      this.gen = this.drive.netGen;
      for (const id of [...this.conns.keys()]) { const c = this.conns.get(id); this.conns.delete(id); }
      for (const s of this.sockets) s.destroy();
      this.sessions.clear(); this.emit('info', 'Interface Ethernet reinicializada: conexões e sessões encerradas.'); this.emit('connections');
    }
    const online = this.online();
    for (const [id, c] of this.conns) {
      if (now - c.lastRx > c.timeoutMs) { this.closeConn(id, 'timeout'); continue; }
      if (c.kind === 'io' && online && now >= c.nextTx) {
        this.produce(c, now);
        c.nextTx += c.toRpi / 1000; if (c.nextTx < now) c.nextTx = now + c.toRpi / 1000;
      }
    }
  }

  connectionsView() {
    return [...this.conns.values()].map(c => ({
      kind: c.kind, role: c.role, ip: c.ip, peer: c.peer, otId: '0x' + c.otId.toString(16), toId: '0x' + (c.toId >>> 0).toString(16),
      otRpi: c.otRpi / 1000, toRpi: c.toRpi / 1000, timeoutMs: isFinite(c.timeoutMs) ? Math.round(c.timeoutMs) : '∞', run: c.run, rxPk: c.rxPk || 0, txPk: c.txPk || 0,
      otHeader: c.otHeader, toHeader: c.toHeader, multicast: c.multicast, dest: c.dest ? `${c.dest.ip}:${c.dest.port}` : '', cfgInst: c.cfgInst, inWords: c.inWords, outWords: c.outWords
    }));
  }
}

// ------------------------------------------------------------------ helpers
function u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xFFFF, 0); return b; }
function u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b; }
function wordsToBuf(words, n) { const b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) b.writeUInt16LE((words[i] || 0) & 0xFFFF, i * 2); return b; }
function bufToWords(b) { const w = []; for (let i = 0; i + 1 < b.length; i += 2) w.push(b.readInt16LE(i)); return w; }
function ipToIntBE(s) { const o = s.split('.').map(Number); return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0; }
function intToIpBE(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.'); }
function popcount(v) { let c = 0; while (v) { c += v & 1; v >>>= 1; } return c; }

module.exports = { EnipAdapter, ASM_IN, ASM_OUT };
