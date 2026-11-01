/**
 * =====================================================================
 *  CFW500-CETH-IP — ADAPTER (TARGET) EtherNet/IP
 * =====================================================================
 *  Hierarquia da rede EtherNet/IP:
 *
 *     SCANNER (Originator)  ── CLP: CompactLogix, CODESYS, etc.
 *        │  1) TCP 44818: RegisterSession
 *        │  2) TCP 44818: Forward Open (abre a conexão de I/O, define RPI)
 *        │  3) UDP 2222 : O→T (saídas do CLP: P0684, P0685, ...) a cada RPI
 *        ▼  4) UDP 2222 : T→O (entradas do CLP: P0680, P0681, ...) a cada RPI
 *     ADAPTER (Target)      ── ESTE SIMULADOR (CFW500)
 *
 *  O adapter NUNCA inicia a comunicação: ele só responde. Quem abre a
 *  conexão, define o RPI e o tamanho dos dados é o scanner. O adapter
 *  apenas aceita (ou recusa com um código de erro) o Forward Open.
 *
 *  Assemblies (do EDS da WEG):
 *     O→T (consumidas pelo inversor):  100 Fabricante | 120 CIP Basic | 121 CIP Ext.
 *     T→O (produzidas pelo inversor):  150 Fabricante | 170 CIP Basic | 171 CIP Ext.
 *     Configuração: instância 1 (tamanho 0). Listen Only: 199 (heartbeat). Input Only: 198.
 *  Palavras: 2 fixas + até 12 configuráveis (P0820..P0831 leitura, P0835..P0846 escrita).
 * =====================================================================
 */
'use strict';

const net = require('net');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const C = require('./cip');
const { criarObjetos } = require('./objects');

const { ENCAP, ENCAP_NOME, ENCAP_STATUS, CPF, SVC, SVC_NOME, ST, ST_NOME, EXT, EXT_NOME, Escritor } = C;
const ARQ_ETH = path.join(__dirname, '..', '..', 'data', 'eth.json');

const PONTOS_SAIDA = [100, 120, 121];
const PONTOS_ENTRADA = [150, 170, 171];
const PONTO_INPUT_ONLY = 198;
const PONTO_LISTEN_ONLY = 199;

class AdapterEIP extends EventEmitter {
  constructor(drive, opts = {}) {
    super();
    this.drive = drive;
    this.bindIni = opts.bindIp || '0.0.0.0';   // IP de inicialização (--ip); vale com P0810 = DHCP/DCP
    this.bindIp = this.bindIni;
    this.origemIp = 'inicialização';
    this.portaTcp = opts.portaTcp || 44818;
    this.portaIO = opts.portaIO || 2222;
    this.MAX_CONEXOES = 8;

    // Identidade — valores do arquivo EDS (eip_cfw500_ceth2_v11x.eds)
    const persist = this.carregarPersistencia();
    this.identidade = { vendor: 853, tipo: 43, produto: 6656, revMaior: 1, revMenor: 10, serie: persist.serie, nome: 'CFW500' };
    this.macBase = persist.mac;
    this.hostName = 'CFW500';
    this.timeoutInatividade = 120;

    this.sessoes = new Map();     // handle -> {sock, ip}
    this.conexoes = new Map();    // idOT -> conexão
    this.produtores = new Map();  // chave -> produtor T→O
    this.estatCM = { openReq: 0, openFormatRej: 0, openResRej: 0, openOtherRej: 0, closeReq: 0, closeFormatReq: 0, closeOtherReq: 0, timeouts: 0 };
    this.contadores = { inOct: 0, inUcast: 0, outOct: 0, outUcast: 0 };
    this.linkOk = true;           // "cabo conectado"
    this.estadoIf = 'setup';      // setup | init | online
    this.timeoutOcorrido = false;
    this.ultAtividade = 0;
    this.consumido = new Map();   // instância -> último buffer consumido
    this.ioCfg = this.lerConfigIO();
    this.objetos = criarObjetos(this);
    this.socketsTcp = new Set();
    this.logIOAmostra = 0;

    drive.on('ethReinit', () => this.reiniciarInterface('P0849 = 1'));
    drive.on('energizacao', () => this.reiniciarInterface('energização'));
    drive.on('desenergizacao', () => { this.fecharTudo('inversor desenergizado', false); this.estadoIf = 'setup'; });
  }

  // ------------------------------------------------------------------
  carregarPersistencia() {
    try { return JSON.parse(fs.readFileSync(ARQ_ETH, 'utf8')); } catch { /* gera novos */ }
    const d = { serie: crypto.randomBytes(4).readUInt32LE(0), mac: [0x02, 0x57, 0x45, 0x47, ...crypto.randomBytes(2)] };
    try { fs.mkdirSync(path.dirname(ARQ_ETH), { recursive: true }); fs.writeFileSync(ARQ_ETH, JSON.stringify(d)); } catch { /* ok */ }
    return d;
  }
  mac(inst = 1) { const m = [...this.macBase]; m[5] = (m[5] + inst - 1) & 0xFF; return m; }

  /** Lê o mapeamento de I/O (só é aplicado na inicialização da interface ou via P0849) */
  lerConfigIO() {
    const leitura = [680, 681];
    const escrita = [684, 685];
    for (let i = 0; i < 12; i++) { const p = this.drive.get(820 + i); if (!p) break; leitura.push(p); }
    for (let i = 0; i < 12; i++) { const p = this.drive.get(835 + i); if (!p) break; escrita.push(p); }
    return { leitura, escrita };
  }
  tamanhoSaida() { return this.ioCfg.escrita.length * 2; }
  tamanhoEntrada() { return this.ioCfg.leitura.length * 2; }

  // ------------------------------------------------------------------
  //  Rede local (IP efetivo da interface usada)
  // ------------------------------------------------------------------
  interfaces() {
    const r = [];
    for (const [nome, lista] of Object.entries(os.networkInterfaces())) {
      for (const a of lista || []) if (a.family === 'IPv4' || a.family === 4) r.push({ nome, ip: a.address, mascara: a.netmask, interno: a.internal });
    }
    return r;
  }
  rede(ctx) {
    const ifs = this.interfaces();
    let ip = (ctx && ctx.ipLocal) || (this.bindIp !== '0.0.0.0' ? this.bindIp : null);
    if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7);
    let it = ip && ifs.find((i) => i.ip === ip);
    if (!it && ctx && ctx.ipRemoto) {
      const rem = C.ipParaUdint(ctx.ipRemoto.replace('::ffff:', ''));
      it = ifs.find((i) => ((C.ipParaUdint(i.ip) & C.ipParaUdint(i.mascara)) >>> 0) === ((rem & C.ipParaUdint(i.mascara)) >>> 0));
    }
    if (it && ip && it.ip !== ip) it = { ip, mascara: it.mascara };        // IP secundário / alias
    if (!it && ip) it = { ip, mascara: ip.startsWith('127.') ? '255.0.0.0' : '255.255.255.0' };
    if (!it) it = ifs.find((i) => !i.interno) || ifs[0] || { ip: '127.0.0.1', mascara: '255.0.0.0' };
    const d = this.drive;
    return { ip: it.ip, mascara: it.mascara, gateway: [816, 817, 818, 819].map((n) => d.get(n)).join('.') };
  }
  /** Endereço multicast conforme CIP Vol.2 §3-5.3: 239.192.1.0 + ((hostId-1) & 0x3FF) * 32 */
  multicastBase(ctx) {
    const r = this.rede(ctx);
    const ip = C.ipParaUdint(r.ip); const m = C.ipParaUdint(r.mascara);
    const host = ((ip & ~m) >>> 0);
    const base = C.ipParaUdint('239.192.1.0') + (((host - 1) & 0x3FF) * 32);
    return C.udintParaIp(base >>> 0);
  }

  // ------------------------------------------------------------------
  //  LOG (alimenta o "analisador de protocolo" da interface web)
  // ------------------------------------------------------------------
  log(dir, proto, txt, buf) {
    this.emit('log', { t: Date.now(), dir, proto, txt, hex: buf ? C.hex(buf, 128) : '' });
    if (process.env.EIP_DEBUG) console.log(`[${dir}] ${proto} ${txt}${buf ? '\n      ' + C.hex(buf, 128) : ''}`);
  }

  // ==================================================================
  //  INICIALIZAÇÃO DOS SOCKETS
  // ==================================================================
  /**
   * IP em que o inversor responde. Como no CFW500 real: com P0810 = 0 (Parâmetros) vale o IP de
   * P0811..P0814 — no simulador ele precisa existir neste computador. Com P0810 = DHCP/DCP vale o
   * IP de inicialização (--ip, ou todas as placas).
   */
  ipDesejado() {
    const d = this.drive;
    if (d.get(810) !== 0) return { ip: this.bindIni, origem: 'inicialização' };
    const ip = [811, 812, 813, 814].map((n) => d.get(n)).join('.');
    if (ip === '0.0.0.0') return { ip: '0.0.0.0', origem: 'parâmetros (todas as placas)' };
    if (ip.startsWith('127.') || this.interfaces().some((i) => i.ip === ip)) return { ip, origem: 'parâmetros' };
    const msg = `P0811..P0814 = ${ip}, mas este IP não existe neste computador. Continuando em ${this.bindIni === '0.0.0.0' ? 'todas as placas' : this.bindIni}. Crie o IP (2-criar-rede-virtual.bat) ou escolha um IP da lista.`;
    this.emit('erro', msg); this.log('erro', 'IF', msg);
    return { ip: this.bindIni, origem: 'inicialização (IP dos parâmetros não existe)' };
  }

  iniciar() {
    const alvo = this.ipDesejado();
    this.bindIp = alvo.ip; this.origemIp = alvo.origem;
    this.abrirSockets();
    // supervisão das conexões (watchdog) e do estado da interface
    this.tmrSuperv = setInterval(() => this.supervisionar(), 5);
    this.reiniciarInterface('energização', true);
  }

  async fecharSockets() {
    const fechar = (o) => new Promise((r) => { try { o.close(() => r()); } catch { r(); } });
    await Promise.all([this.srvTcp, this.udpEncap, this.udpIO].filter(Boolean).map(fechar));
  }

  abrirSockets() {
    // ----- TCP 44818: mensagens explícitas (encapsulamento) -----
    this.srvTcp = net.createServer((sock) => this.novaConexaoTcp(sock));
    this.srvTcp.on('error', (e) => this.emit('erro', `TCP ${this.portaTcp}: ${e.message}`));
    this.srvTcp.listen(this.portaTcp, this.bindIp);

    // ----- UDP 44818: ListIdentity / ListServices (inclusive broadcast) -----
    this.udpEncap = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.udpEncap.on('message', (msg, rinfo) => this.udpEncapMsg(msg, rinfo));
    this.udpEncap.on('error', (e) => this.emit('erro', `UDP ${this.portaTcp}: ${e.message}`));
    this.udpEncap.bind(this.portaTcp, this.bindIp === '0.0.0.0' ? undefined : this.bindIp, () => { try { this.udpEncap.setBroadcast(true); } catch { /* */ } });

    // ----- UDP 2222: dados de I/O (implícitos) -----
    this.udpIO = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.udpIO.on('message', (msg, rinfo) => this.ioRecebido(msg, rinfo));
    this.udpIO.on('error', (e) => this.emit('erro', `UDP ${this.portaIO}: ${e.message}`));
    this.udpIO.bind(this.portaIO, this.bindIp === '0.0.0.0' ? undefined : this.bindIp, () => {
      try { this.udpIO.setMulticastTTL(1); if (this.bindIp !== '0.0.0.0') this.udpIO.setMulticastInterface(this.bindIp); } catch { /* */ }
    });
  }

  parar() {
    clearInterval(this.tmrSuperv);
    this.fecharTudo('parada do servidor', false);
    try { this.srvTcp.close(); this.udpEncap.close(); this.udpIO.close(); } catch { /* */ }
  }

  /** Reinicialização da interface (energização ou P0849): Setup -> Init -> Wait Comm */
  reiniciarInterface(motivo, inicial) {
    this.fecharTudo(`reinicialização da interface (${motivo})`, true);
    if (!inicial) {
      const alvo = this.ipDesejado();
      this.origemIp = alvo.origem;
      if (alvo.ip !== this.bindIp) {
        const antes = this.bindIp;
        this.bindIp = alvo.ip;
        this.fecharSockets().then(() => {
          this.abrirSockets();
          const txt = (ip) => (ip === '0.0.0.0' ? 'todas as placas' : ip);
          this.log('info', 'IF', `Endereço IP alterado: ${txt(antes)} → ${txt(alvo.ip)} (${alvo.origem})`);
          this.emit('ipAlterado', alvo.ip);
        });
      }
    }
    this.estadoIf = 'setup';
    this.ioCfg = this.lerConfigIO();
    this.consumido.clear();
    this.timeoutOcorrido = false;
    clearTimeout(this.tmrInit1); clearTimeout(this.tmrInit2);
    this.tmrInit1 = setTimeout(() => { this.estadoIf = 'init'; }, 300);
    this.tmrInit2 = setTimeout(() => {
      this.estadoIf = 'online';
      this.log('info', 'IF', `Interface Ethernet inicializada (${motivo}). Mapeamento I/O: leitura [${this.ioCfg.leitura.map((p) => 'P' + p).join(', ')}], escrita [${this.ioCfg.escrita.map((p) => 'P' + p).join(', ')}]`);
    }, 1500);
  }

  online() { return this.estadoIf === 'online' && this.linkOk && this.drive.ligado && !this.drive.inj.moduloEth; }

  /** Fecha todas as conexões CIP e sessões TCP */
  fecharTudo(motivo, erroRede) {
    for (const c of [...this.conexoes.values()]) this.encerrarConexao(c, motivo, erroRede && c.dono);
    for (const s of this.socketsTcp) s.destroy();
    this.socketsTcp.clear();
    this.sessoes.clear();
  }

  /** Simula desconectar/conectar o cabo de rede */
  setLink(ok) {
    this.linkOk = ok;
    if (!ok) {
      for (const s of this.socketsTcp) s.destroy();
      this.socketsTcp.clear(); this.sessoes.clear();
      this.log('info', 'IF', 'Cabo Ethernet DESCONECTADO (LED Link apagado)');
    } else this.log('info', 'IF', 'Cabo Ethernet conectado');
  }

  // ==================================================================
  //  ENCAPSULAMENTO — TCP
  // ==================================================================
  novaConexaoTcp(sock) {
    if (!this.online()) { sock.destroy(); return; }
    this.socketsTcp.add(sock);
    let acum = Buffer.alloc(0);
    const ipRemoto = (sock.remoteAddress || '').replace('::ffff:', '');
    const ipLocal = (sock.localAddress || '').replace('::ffff:', '');
    this.log('info', 'TCP', `Conexão TCP aberta por ${ipRemoto}:${sock.remotePort}`);
    sock.setNoDelay(true);
    sock.setTimeout(this.timeoutInatividade * 1000, () => { this.log('info', 'TCP', `Timeout de inatividade do encapsulamento (${this.timeoutInatividade} s) — ${ipRemoto}`); sock.destroy(); });
    sock.on('data', (d) => {
      if (!this.online()) { sock.destroy(); return; }
      this.contadores.inOct += d.length; this.contadores.inUcast++; this.ultAtividade = Date.now();
      acum = Buffer.concat([acum, d]);
      while (acum.length >= 24) {
        const len = acum.readUInt16LE(2);
        if (acum.length < 24 + len) break;
        const quadro = acum.subarray(0, 24 + len);
        acum = acum.subarray(24 + len);
        try { this.quadroTcp(quadro, sock, ipRemoto, ipLocal); } catch (e) { this.log('erro', 'ENCAP', 'Exceção: ' + e.message); }
      }
    });
    const fim = () => {
      this.socketsTcp.delete(sock);
      for (const [h, s] of this.sessoes) if (s.sock === sock) {
        this.sessoes.delete(h);
        // conexões Classe 3 dependem da sessão TCP; as de Classe 1 (UDP) continuam
        for (const c of [...this.conexoes.values()]) if (c.classe === 3 && c.sessao === h) this.encerrarConexao(c, 'sessão TCP encerrada', false);
      }
      this.log('info', 'TCP', `Conexão TCP encerrada (${ipRemoto})`);
    };
    sock.on('close', fim);
    sock.on('error', () => { /* tratado no close */ });
  }

  enviarTcp(sock, buf) {
    this.contadores.outOct += buf.length; this.contadores.outUcast++;
    sock.write(buf);
  }

  respostaEncap(req, dados, status = 0, sessao) {
    const h = new Escritor()
      .u16(req.readUInt16LE(0)).u16(dados.length).u32(sessao !== undefined ? sessao : req.readUInt32LE(4))
      .u32(status).buf(req.subarray(12, 20)).u32(0).fim();
    return Buffer.concat([h, dados]);
  }

  quadroTcp(q, sock, ipRemoto, ipLocal) {
    const cmd = q.readUInt16LE(0);
    const sessao = q.readUInt32LE(4);
    const dados = q.subarray(24);
    const nomeCmd = ENCAP_NOME[cmd] || `0x${cmd.toString(16)}`;
    if (cmd !== ENCAP.SEND_UNIT_DATA) this.log('rx', 'ENCAP', `${nomeCmd} (sessão 0x${sessao.toString(16)}) de ${ipRemoto}`, q);

    const responder = (d, st = 0, s) => {
      const r = this.respostaEncap(q, d, st, s);
      if (cmd !== ENCAP.SEND_UNIT_DATA) this.log('tx', 'ENCAP', `${nomeCmd} resposta${st ? ` (status encapsulamento 0x${st.toString(16)})` : ''}`, r);
      this.enviarTcp(sock, r);
    };

    switch (cmd) {
      case ENCAP.NOP: return;
      case ENCAP.LIST_IDENTITY: return responder(this.itemListIdentity({ ipLocal, ipRemoto }));
      case ENCAP.LIST_SERVICES: return responder(this.itemListServices());
      case ENCAP.LIST_INTERFACES: return responder(new Escritor().u16(0).fim());
      case ENCAP.REGISTER_SESSION: {
        if (dados.length !== 4) return responder(Buffer.alloc(0), ENCAP_STATUS.TAMANHO_INVALIDO);
        if (dados.readUInt16LE(0) !== 1) return responder(new Escritor().u16(1).u16(0).fim(), ENCAP_STATUS.VERSAO);
        let h; do { h = crypto.randomBytes(4).readUInt32LE(0); } while (!h || this.sessoes.has(h));
        this.sessoes.set(h, { sock, ip: ipRemoto });
        this.log('info', 'ENCAP', `Sessão registrada: 0x${h.toString(16)} (${ipRemoto})`);
        return responder(new Escritor().u16(1).u16(0).fim(), 0, h);
      }
      case ENCAP.UNREGISTER_SESSION:
        this.sessoes.delete(sessao);
        sock.end();
        return;
      case ENCAP.SEND_RR_DATA:
      case ENCAP.SEND_UNIT_DATA: {
        const s = this.sessoes.get(sessao);
        if (!s || s.sock !== sock) return responder(Buffer.alloc(0), ENCAP_STATUS.SESSAO_INVALIDA);
        const itens = C.lerCPF(dados, 6);
        if (!itens) return responder(Buffer.alloc(0), ENCAP_STATUS.DADOS_INCORRETOS);
        const ctx = { sessao, ipRemoto, ipLocal, itensReq: itens, itensResp: [] };
        if (cmd === ENCAP.SEND_RR_DATA) {
          const ud = itens.find((i) => i.tipo === CPF.UNCONNECTED_DATA);
          if (!ud) return responder(Buffer.alloc(0), ENCAP_STATUS.DADOS_INCORRETOS);
          const resp = this.processarMR(ud.dados, ctx);
          const cpf = C.montarCPF([{ tipo: CPF.NULL, dados: Buffer.alloc(0) }, { tipo: CPF.UNCONNECTED_DATA, dados: resp }, ...ctx.itensResp]);
          return responder(Buffer.concat([new Escritor().u32(0).u16(0).fim(), cpf]));
        }
        // SendUnitData — mensagem explícita CONECTADA (Classe 3)
        const ca = itens.find((i) => i.tipo === CPF.CONNECTED_ADDR);
        const cd = itens.find((i) => i.tipo === CPF.CONNECTED_DATA);
        if (!ca || !cd || ca.dados.length < 4 || cd.dados.length < 2) return;
        const con = this.conexoes.get(ca.dados.readUInt32LE(0));
        if (!con || con.classe !== 3) { this.log('erro', 'CIP', `SendUnitData para conexão inexistente 0x${ca.dados.readUInt32LE(0).toString(16)} (descartado)`); return; }
        con.ultimoRx = Date.now(); con.rx++;
        const seq = cd.dados.readUInt16LE(0);
        const resp = this.processarMR(cd.dados.subarray(2), ctx);
        const cpf = C.montarCPF([
          { tipo: CPF.CONNECTED_ADDR, dados: new Escritor().u32(con.idTO).fim() },
          { tipo: CPF.CONNECTED_DATA, dados: Buffer.concat([new Escritor().u16(seq).fim(), resp]) },
        ]);
        con.tx++;
        return responder(Buffer.concat([new Escritor().u32(0).u16(0).fim(), cpf]));
      }
      default:
        return responder(Buffer.alloc(0), ENCAP_STATUS.CMD_INVALIDO);
    }
  }

  // ------------------------------------------------------------------
  //  ENCAPSULAMENTO — UDP 44818 (ListIdentity por broadcast: "browse" da rede)
  // ------------------------------------------------------------------
  udpEncapMsg(msg, rinfo) {
    if (!this.online() || msg.length < 24) return;
    const cmd = msg.readUInt16LE(0);
    let dados;
    if (cmd === ENCAP.LIST_IDENTITY) dados = this.itemListIdentity({ ipRemoto: rinfo.address });
    else if (cmd === ENCAP.LIST_SERVICES) dados = this.itemListServices();
    else if (cmd === ENCAP.LIST_INTERFACES) dados = new Escritor().u16(0).fim();
    else return;
    this.log('rx', 'UDP', `${ENCAP_NOME[cmd]} (UDP) de ${rinfo.address}:${rinfo.port}`, msg);
    const r = this.respostaEncap(msg, dados, 0);
    // atraso aleatório (CIP: evita colisão de respostas a broadcast)
    setTimeout(() => {
      this.udpEncap.send(r, rinfo.port, rinfo.address);
      this.log('tx', 'UDP', `${ENCAP_NOME[cmd]} resposta → ${rinfo.address}:${rinfo.port}`, r);
    }, Math.random() * 50);
  }

  itemListIdentity(ctx) {
    const r = this.rede(ctx);
    const id = this.identidade;
    const item = new Escritor()
      .u16(1)                                         // versão do protocolo de encapsulamento
      .buf(C.sockaddr(r.ip, this.portaTcp))
      .u16(id.vendor).u16(id.tipo).u16(id.produto).u8(id.revMaior).u8(id.revMenor)
      .u16(this.objetos[1].statusWord()).u32(id.serie).sstr(id.nome).u8(0x03) // estado: operacional
      .fim();
    return C.montarCPF([{ tipo: CPF.LIST_IDENTITY, dados: item }]);
  }

  itemListServices() {
    const nome = Buffer.alloc(16); nome.write('Communications');
    const item = new Escritor().u16(1).u16(0x0120).buf(nome).fim(); // bit5: CIP via TCP, bit8: Classe 0/1 via UDP
    return C.montarCPF([{ tipo: CPF.LIST_SERVICES, dados: item }]);
  }

  // ==================================================================
  //  MESSAGE ROUTER — despacha requisições CIP para os objetos
  // ==================================================================
  respostaMR(svc, st, ext = [], dados = Buffer.alloc(0)) {
    const w = new Escritor().u8(svc | 0x80).u8(0).u8(st).u8(ext.length);
    ext.forEach((e) => w.u16(e));
    return Buffer.concat([w.fim(), dados]);
  }

  processarMR(buf, ctx) {
    if (buf.length < 2) return this.respostaMR(0, ST.DADOS_INSUFICIENTES);
    const svc = buf[0] & 0x7F;
    const tamPath = buf[1] * 2;
    const rawPath = buf.subarray(2, 2 + tamPath);
    const dados = buf.subarray(2 + tamPath);
    let segs;
    try { segs = C.lerPath(rawPath); } catch (e) {
      this.log('erro', 'CIP', `Path inválido: ${e.message}`, buf);
      return this.respostaMR(svc, ST.ERRO_SEGMENTO, [], Buffer.from([0]));
    }
    const classe = segs.find((s) => s.tipo === 'classe');
    const inst = segs.find((s) => s.tipo === 'instancia' || s.tipo === 'ponto');
    const attr = segs.find((s) => s.tipo === 'atributo');
    const cl = classe ? classe.valor : -1;
    const ins = inst ? inst.valor : 0;
    const at = attr ? attr.valor : undefined;
    const desc = `${SVC_NOME[svc] || 'Serviço 0x' + svc.toString(16)} classe 0x${cl.toString(16)} inst ${ins}${at !== undefined ? ' attr ' + at : ''}`;
    const req = { svc, path: rawPath, segs, dados };

    let r;
    if (svc === SVC.MULTIPLE && cl === 0x02) r = this.multiplosServicos(dados, ctx);
    else {
      const obj = this.objetos[cl];
      if (!obj) r = { erro: ST.DESTINO_DESCONHECIDO };
      else {
        if (obj.servico) r = obj.servico(svc, ins, req, ctx);
        if (r === null || r === undefined) {
          if (svc === SVC.GET_SINGLE) r = at === undefined ? { erro: ST.ERRO_SEGMENTO } : obj.get(ins, at, ctx);
          else if (svc === SVC.SET_SINGLE) {
            if (at === undefined) r = { erro: ST.ERRO_SEGMENTO };
            else if (!obj.set) r = (obj.get(ins, at, ctx).erro === ST.DESTINO_DESCONHECIDO) ? { erro: ST.DESTINO_DESCONHECIDO } : { erro: ST.NAO_GRAVAVEL };
            else r = obj.set(ins, at, dados, ctx) || Buffer.alloc(0);
          } else if (svc === SVC.GET_ALL) {
            if (ins === 0) r = Buffer.concat([1, 2, 3, 6, 7].map((a) => obj.get(0, a)).filter(Buffer.isBuffer));
            else r = obj.getAll ? obj.getAll(ins, ctx) : { erro: ST.SERVICO_NAO_SUPORTADO };
          } else r = { erro: ST.SERVICO_NAO_SUPORTADO };
        }
      }
    }
    if (r && r.bruto) { this.log('info', 'CIP', `${desc} → resposta do serviço embutido`); return r.bruto; }
    let resp;
    if (Buffer.isBuffer(r)) resp = this.respostaMR(svc, ST.OK, [], r);
    else {
      const ext = r.ext === undefined ? [] : Array.isArray(r.ext) ? r.ext : [r.ext];
      resp = this.respostaMR(svc, r.erro, ext, r.dados || Buffer.alloc(0));
    }
    const st = resp[2];
    const extTxt = st === ST.FALHA_CONEXAO && resp[3] ? ` / ext 0x${resp.readUInt16LE(4).toString(16).padStart(4, '0')} ${EXT_NOME[resp.readUInt16LE(4)] || ''}` : '';
    if (svc !== SVC.FORWARD_OPEN && svc !== SVC.LARGE_FORWARD_OPEN && svc !== SVC.FORWARD_CLOSE)
      this.log(st ? 'erro' : 'cip', 'CIP', `${desc} → ${st ? `ERRO 0x${st.toString(16).padStart(2, '0')} ${ST_NOME[st] || ''}${extTxt}` : 'OK'}${st === 0 && svc === SVC.GET_SINGLE && r.length <= 4 ? ` = ${r.length === 2 ? r.readUInt16LE(0) : r.length === 1 ? r[0] : r.readUInt32LE(0)}` : ''}`, buf);
    return resp;
  }

  multiplosServicos(dados, ctx) {
    if (dados.length < 2) return { erro: ST.DADOS_INSUFICIENTES };
    const n = dados.readUInt16LE(0);
    const offs = []; for (let i = 0; i < n; i++) offs.push(dados.readUInt16LE(2 + i * 2));
    const resps = offs.map((o, i) => this.processarMR(dados.subarray(o, i + 1 < n ? offs[i + 1] : dados.length), ctx));
    const w = new Escritor().u16(n);
    let pos = 2 + 2 * n;
    resps.forEach((r) => { w.u16(pos); pos += r.length; });
    const corpo = Buffer.concat([w.fim(), ...resps]);
    if (resps.some((r) => r[2] !== 0)) return { erro: ST.ERRO_EMBUTIDO, dados: corpo };
    return corpo;
  }

  /** Unconnected Send (0x52): desembrulha a mensagem roteada e processa localmente */
  unconnectedSend(d, ctx) {
    if (d.length < 4) return { erro: ST.DADOS_INSUFICIENTES };
    const tam = d.readUInt16LE(2);
    const msg = d.subarray(4, 4 + tam);
    let off = 4 + tam + (tam % 2);
    const rotaWords = d[off]; off += 2;
    const rota = d.subarray(off, off + rotaWords * 2);
    try {
      const segs = C.lerPath(rota);
      const p = segs.find((s) => s.tipo === 'porta');
      this.log('info', 'CIP', `Unconnected Send: rota ${p ? `porta ${p.porta}, link ${p.link}` : '(vazia)'} → processando localmente`);
    } catch { /* rota ignorada */ }
    return { bruto: this.processarMR(msg, ctx) };
  }

  // ==================================================================
  //  CONNECTION MANAGER — FORWARD OPEN / FORWARD CLOSE
  // ==================================================================
  forwardOpen(d, large, ctx) {
    this.estatCM.openReq++;
    const nomeSvc = large ? 'Large_Forward_Open' : 'Forward_Open';
    let o = 0;
    const tick = d[o]; const ticks = d[o + 1]; o += 2; void tick; void ticks;
    const idOTprop = d.readUInt32LE(o); o += 4;
    const idTOprop = d.readUInt32LE(o); o += 4;
    const serial = d.readUInt16LE(o); o += 2;
    const vendor = d.readUInt16LE(o); o += 2;
    const origSerial = d.readUInt32LE(o); o += 4;
    const mult = d[o]; o += 4;
    const rpiOT = d.readUInt32LE(o); o += 4;
    const npOT = large ? d.readUInt32LE(o) : d.readUInt16LE(o); o += large ? 4 : 2;
    const rpiTO = d.readUInt32LE(o); o += 4;
    const npTO = large ? d.readUInt32LE(o) : d.readUInt16LE(o); o += large ? 4 : 2;
    const trig = d[o]; o += 1;
    const pathWords = d[o]; o += 1;
    const rawPath = d.subarray(o, o + pathWords * 2);

    const decNP = (p) => large
      ? { tam: p & 0xFFFF, variavel: (p >> 25) & 1, prio: (p >> 26) & 3, tipo: (p >>> 29) & 3 }
      : { tam: p & 0x1FF, variavel: (p >> 9) & 1, prio: (p >> 10) & 3, tipo: (p >> 13) & 3 };
    const ot = decNP(npOT); const to = decNP(npTO);
    const classe = trig & 0x0F;
    const tipoNome = ['Null', 'Multicast', 'Ponto-a-ponto', 'Reservado'];

    const falha = (ext, extra = []) => {
      this.estatCM.openOtherRej++;
      const dadosErro = new Escritor().u16(serial).u16(vendor).u32(origSerial).u8(0).u8(0).fim();
      this.log('erro', 'CIP', `${nomeSvc} RECUSADO de ${ctx.ipRemoto}: status 0x01 / ext 0x${ext.toString(16).padStart(4, '0')} — ${EXT_NOME[ext] || ''}${extra.length ? ` (valor aceito: ${extra.join(', ')})` : ''}`);
      return { erro: ST.FALHA_CONEXAO, ext: [ext, ...extra], dados: dadosErro };
    };

    this.log('rx', 'CIP', `${nomeSvc} de ${ctx.ipRemoto}: classe ${classe}, trigger ${['cíclico', 'COS', 'aplicação'][(trig >> 4) & 7] || '?'}, ` +
      `RPI O→T ${rpiOT / 1000} ms / T→O ${rpiTO / 1000} ms, tamanho O→T ${ot.tam} B (${tipoNome[ot.tipo]}), T→O ${to.tam} B (${tipoNome[to.tipo]}), ` +
      `path [${C.hex(rawPath)}], multiplicador x${4 << mult}`, d);

    if (!this.online()) return falha(EXT.SEM_CONEXOES);
    // triade duplicada?
    for (const c of this.conexoes.values()) {
      if (c.serial === serial && c.vendor === vendor && c.origSerial === origSerial) return falha(EXT.DUPLICADA);
    }
    let segs;
    try { segs = C.lerPath(rawPath); } catch { this.estatCM.openFormatRej++; return falha(EXT.SEGMENTO_INVALIDO); }

    // ---------------- chave eletrônica ----------------
    const chave = segs.find((s) => s.tipo === 'chave');
    if (chave) {
      const id = this.identidade;
      if ((chave.vendor && chave.vendor !== id.vendor) || (chave.produto && chave.produto !== id.produto)) return falha(EXT.VENDOR_PRODUTO);
      if (chave.tipoDisp && chave.tipoDisp !== id.tipo) return falha(EXT.TIPO_DISPOSITIVO);
      if (chave.maior) {
        if (chave.compat ? (chave.maior !== id.revMaior || chave.menor > id.revMenor) : (chave.maior !== id.revMaior || (chave.menor && chave.menor !== id.revMenor)))
          return falha(EXT.REVISAO);
      }
    }

    const classeSeg = segs.find((s) => s.tipo === 'classe');
    const numeros = segs.filter((s) => s.tipo === 'instancia' || s.tipo === 'ponto').map((s) => s.valor);
    const dadosCfg = segs.find((s) => s.tipo === 'dados');

    // ---------------- RPI (EDS: 4 ms a 3200 ms) ----------------
    const rpiOk = (r) => r >= 4000 && r <= 3200000;

    // ============ Conexão explícita Classe 3 (para o Message Router) ============
    if (classe === 3) {
      if (!classeSeg || classeSeg.valor !== 0x02) return falha(EXT.PONTO_CONEXAO);
      if (this.todasConexoes().filter((c) => c.classe === 3).length >= 4) { this.estatCM.openResRej++; return falha(EXT.SEM_CONEXOES); }
      const idOT = this.novoId();
      const con = {
        idOT, idTO: idTOprop, serial, vendor, origSerial, classe: 3, tipo: 'Explícita Classe 3', dono: false,
        rpiOT, rpiTO, timeoutMs: Math.max(1000, (rpiOT / 1000) * (4 << mult)), ipOrig: ctx.ipRemoto, sessao: ctx.sessao,
        ultimoRx: Date.now() + 10000, rx: 0, tx: 0, criado: Date.now(), run: true,
      };
      this.conexoes.set(idOT, con);
      this.log('tx', 'CIP', `${nomeSvc} ACEITO — conexão explícita Classe 3 (O→T 0x${idOT.toString(16)}, T→O 0x${idTOprop.toString(16)})`);
      return this.respostaFO(con, rpiOT, rpiTO);
    }

    // ============ Conexão de I/O (Classe 0/1) ============
    if (classe !== 0 && classe !== 1) return falha(EXT.TRANSPORTE);
    if (((trig >> 4) & 7) > 1) return falha(EXT.TRANSPORTE);
    if (!classeSeg || classeSeg.valor !== 0x04) return falha(EXT.PONTO_CONEXAO);
    let cfgInst; let pOT; let pTO;
    if (numeros.length === 3) [cfgInst, pOT, pTO] = numeros;
    else if (numeros.length === 2) [pOT, pTO] = numeros;
    else return falha(EXT.SEGMENTO_INVALIDO);
    void cfgInst;
    if (dadosCfg && dadosCfg.dados.length) return falha(EXT.CONFIG_TAMANHO, [0]);

    let tipo;
    if (PONTOS_SAIDA.includes(pOT)) tipo = 'owner';
    else if (pOT === PONTO_LISTEN_ONLY) tipo = 'listen';
    else if (pOT === PONTO_INPUT_ONLY) tipo = 'input';
    else return falha(EXT.PONTO_CONEXAO);
    if (!PONTOS_ENTRADA.includes(pTO)) return falha(EXT.PONTO_CONEXAO);

    if (!rpiOk(rpiOT) || !rpiOk(rpiTO)) return falha(EXT.RPI_NAO_SUPORTADO, [Math.max(4000, Math.min(3200000, rpiOT)) & 0xFFFF]);
    if (ot.variavel || to.variavel) return falha(EXT.PARAM_REDE_INVALIDO);
    if (to.tipo !== 1 && to.tipo !== 2) return falha(EXT.PARAM_REDE_INVALIDO);
    if (tipo === 'owner' && ot.tipo !== 2) return falha(EXT.PARAM_REDE_INVALIDO);

    // ---------------- tamanhos (devem bater com P0820..P0846 configurados) ----------------
    const seq = classe === 1 ? 2 : 0;
    const espOT = tipo === 'owner' ? seq + 4 + this.tamanhoSaida() : seq;
    const espTO = seq + this.tamanhoEntrada();
    if (tipo === 'owner' && ot.tam !== espOT) return falha(EXT.TAMANHO_OT, [espOT]);
    if (tipo !== 'owner' && ot.tam > seq + 4) return falha(EXT.TAMANHO_OT, [espOT]);
    if (to.tam !== espTO) return falha(EXT.TAMANHO_TO, [espTO]);

    // ---------------- propriedade (Exclusive Owner) ----------------
    const donoAtual = this.conexoesIO().find((c) => c.dono);
    if (tipo === 'owner' && donoAtual) { this.estatCM.openResRej++; return falha(EXT.CONFLITO_PROPRIEDADE); }
    if (tipo === 'listen' && !donoAtual) return falha(EXT.SEM_DONO);
    if (this.conexoesIO().length >= 3) { this.estatCM.openResRej++; return falha(EXT.SEM_CONEXOES); }

    // ---------------- produtor T→O (multicast compartilhado ou ponto-a-ponto) ----------------
    const apiTO = Math.max(1000, Math.round(rpiTO / 1000) * 1000);
    let prod;
    if (to.tipo === 1) {
      const chaveProd = `${pTO}-${apiTO}-mc`;
      prod = this.produtores.get(chaveProd);
      if (!prod) {
        const grupo = this.multicastBase(ctx);
        prod = this.criarProdutor(chaveProd, this.novoId(), grupo, this.portaIO, apiTO, pTO, classe, true);
      }
      ctx.itensResp.push({ tipo: CPF.SOCKADDR_TO, dados: C.sockaddr(prod.destino.ip, this.portaIO) });
    } else {
      // destino: IP do originador; porta 2222 ou a informada no item Sockaddr T→O da requisição
      const sa = ctx.itensReq.find((i) => i.tipo === CPF.SOCKADDR_TO);
      let porta = this.portaIO; let ip = ctx.ipRemoto;
      if (sa) { const s = C.lerSockaddr(sa.dados); porta = s.porta; if (s.ip !== '0.0.0.0') ip = s.ip; }
      prod = this.criarProdutor(`${pTO}-${idTOprop}-p2p`, idTOprop, ip, porta, apiTO, pTO, classe, false);
    }

    const idOT = this.novoId();
    const timeoutMs = (rpiOT / 1000) * (4 << mult);
    const con = {
      idOT, idTO: prod.id, serial, vendor, origSerial, classe, dono: tipo === 'owner',
      tipo: { owner: 'Exclusive Owner', listen: 'Listen Only', input: 'Input Only' }[tipo],
      pontoOT: pOT, pontoTO: pTO, tamOT: ot.tam, tamTO: to.tam, rpiOT, rpiTO, apiOT: Math.round(rpiOT / 1000) * 1000, apiTO,
      timeoutMs, mult: 4 << mult, ipOrig: ctx.ipRemoto, multicast: to.tipo === 1, destino: prod.destino,
      // watchdog inicial: o maior entre 10 s e o timeout da conexão (CIP Vol.1 §3-4.4.9)
      ultimoRx: Date.now() + Math.max(0, 10000 - timeoutMs), run: null, rxSeq: -1, rx: 0, tx: 0, criado: Date.now(), produtor: prod,
      seqOT: 0, erros: 0,
    };
    prod.consumidores.add(con);
    this.conexoes.set(idOT, con);
    this.log('tx', 'CIP', `${nomeSvc} ACEITO — ${con.tipo}: O→T ${pOT} (0x${idOT.toString(16)}), T→O ${pTO} (0x${prod.id.toString(16)}) ` +
      `${con.multicast ? 'multicast ' + prod.destino.ip : 'unicast ' + prod.destino.ip + ':' + prod.destino.porta}, API ${apiTO / 1000} ms, timeout ${timeoutMs} ms`);
    this.emit('conexoes');
    return this.respostaFO(con, con.apiOT, apiTO);
  }

  respostaFO(con, apiOT, apiTO) {
    return new Escritor().u32(con.idOT).u32(con.idTO).u16(con.serial).u16(con.vendor).u32(con.origSerial)
      .u32(apiOT).u32(apiTO).u8(0).u8(0).fim();
  }

  novoId() {
    let id; do { id = crypto.randomBytes(4).readUInt32LE(0); } while (!id || this.conexoes.has(id)); return id;
  }

  forwardClose(d, ctx) {
    this.estatCM.closeReq++;
    const serial = d.readUInt16LE(2); const vendor = d.readUInt16LE(4); const origSerial = d.readUInt32LE(6);
    const con = [...this.conexoes.values()].find((c) => c.serial === serial && c.vendor === vendor && c.origSerial === origSerial);
    this.log('rx', 'CIP', `Forward_Close de ${ctx.ipRemoto} (serial 0x${serial.toString(16)})`, d);
    if (!con) {
      this.estatCM.closeOtherReq++;
      this.log('erro', 'CIP', 'Forward_Close: conexão não encontrada (ext 0x0107)');
      return { erro: ST.FALHA_CONEXAO, ext: [EXT.CONEXAO_NAO_ENCONTRADA], dados: new Escritor().u16(serial).u16(vendor).u32(origSerial).u8(0).u8(0).fim() };
    }
    this.encerrarConexao(con, 'Forward Close recebido do scanner', con.dono);
    return new Escritor().u16(serial).u16(vendor).u32(origSerial).u8(0).u8(0).fim();
  }

  // ==================================================================
  //  PRODUTORES T→O (dados de entrada do CLP)
  // ==================================================================
  criarProdutor(chave, id, ip, porta, api, ponto, classe, multicast) {
    const prod = { chave, id, destino: { ip, porta }, api, ponto, classe, multicast, seq: 0, encSeq: 0, consumidores: new Set(), timer: null, tx: 0 };
    prod.timer = setInterval(() => this.produzir(prod), api / 1000);
    this.produtores.set(chave, prod);
    return prod;
  }

  produzir(prod) {
    if (!this.online()) return;
    const dados = this.dadosProduzidos(prod.ponto);
    prod.encSeq = (prod.encSeq + 1) >>> 0;
    prod.seq = (prod.seq + 1) & 0xFFFF;
    const corpo = prod.classe === 1 ? Buffer.concat([new Escritor().u16(prod.seq).fim(), dados]) : dados;
    const pkt = C.montarCPF([
      { tipo: CPF.SEQUENCED_ADDR, dados: new Escritor().u32(prod.id).u32(prod.encSeq).fim() },
      { tipo: CPF.CONNECTED_DATA, dados: corpo },
    ]);
    this.udpIO.send(pkt, prod.destino.porta, prod.destino.ip);
    this.contadores.outOct += pkt.length; this.contadores.outUcast++;
    prod.tx++;
    prod.ultimoPkt = pkt;
    for (const c of prod.consumidores) c.tx++;
  }

  /** Monta os dados de entrada (T→O) para a assembly pedida */
  dadosProduzidos(inst) {
    const d = this.drive;
    const w = new Escritor();
    if (inst === 150 || !d.ligado) {
      this.ioCfg.leitura.forEach((p) => w.u16(d.lerPalavra(p) ?? 0));
      return w.fim();
    }
    // 170 / 171 — perfil CIP "AC Drive" (Basic/Extended Speed Control Input)
    const st = d.get(680);
    const falha = (st >> 15) & 1;
    const fwd = d.pwm && d.fSaida >= 0 ? 1 : 0;
    const rev = d.pwm && d.fSaida < 0 ? 1 : 0;
    const rpm = Math.round((d.fSaida * d.get(402)) / Math.max(1, d.get(403)));
    let b0 = falha | (fwd << 2);
    if (inst === 171) {
      const pronto = !d.falha && !d.config47 ? 1 : 0;
      const ctrlRede = d.fonteGP() === 4 ? 1 : 0;
      const refRede = d.fonteRef() === 11 ? 1 : 0;
      const naRef = (d.get(690) >> 9) & 1;
      b0 = falha | ((d.alarmes.size ? 1 : 0) << 1) | (fwd << 2) | (rev << 3) | (pronto << 4) | (ctrlRede << 5) | (refRede << 6) | (naRef << 7);
    }
    const estadoDrive = d.falha ? 7 : d.pwm ? (d.estadoPar !== 'normal' ? 5 : 4) : (d.habGeral ? 3 : 2);
    w.u8(b0).u8(inst === 171 ? estadoDrive : 0).i16(Math.max(-32768, Math.min(32767, rpm)));
    this.ioCfg.leitura.slice(2).forEach((p) => w.u16(d.lerPalavra(p) ?? 0));
    return w.fim();
  }

  ultimoConsumido(inst) {
    return this.consumido.get(inst) || Buffer.alloc(this.tamanhoSaida());
  }

  /** Aplica os dados de saída do scanner (O→T) nos parâmetros do inversor */
  consumir(inst, dados, explicito = false) {
    const d = this.drive;
    this.consumido.set(inst, Buffer.from(dados));
    const palavras = [];
    for (let i = 0; i + 1 < dados.length; i += 2) palavras.push(dados.readUInt16LE(i));
    if (inst === 100) {
      d.escrever(684, palavras[0], 'net');
      d.escrever(685, palavras[1], 'net');
    } else {
      // 120/121 — perfil CIP: byte0 = comandos, palavra 1 = referência em rpm
      const b0 = palavras[0] & 0xFF;
      const fwd = b0 & 1; const rev = inst === 121 ? (b0 >> 1) & 1 : 0;
      const reset = (b0 >> 2) & 1;
      const netCtl = inst === 121 ? (b0 >> 5) & 1 : 1;
      const gira = fwd ^ rev;
      let cw = (gira ? 0x03 : 0x02) | (rev && !fwd ? 0 : 0x04) | (netCtl ? 0x10 : 0) | (reset ? 0x80 : 0);
      if (!gira) cw = (cw & ~0x01);
      d.escrever(684, cw, 'net');
      const rpm = palavras[1] > 32767 ? palavras[1] - 65536 : palavras[1];
      d.escrever(685, Math.max(-32768, Math.min(32767, Math.round((rpm * 8192) / Math.max(1, d.get(402))))) & 0xFFFF, 'net');
    }
    this.ioCfg.escrita.slice(2).forEach((p, i) => {
      if (palavras[i + 2] !== undefined) d.escrever(p, palavras[i + 2], 'net');
    });
    if (explicito) this.log('info', 'CIP', `Assembly ${inst} escrita por mensagem explícita`);
  }

  // ==================================================================
  //  RECEPÇÃO O→T (UDP 2222)
  // ==================================================================
  ioRecebido(msg, rinfo) {
    if (!this.online()) return;
    this.contadores.inOct += msg.length; this.contadores.inUcast++; this.ultAtividade = Date.now();
    const itens = C.lerCPF(msg, 0);
    if (!itens) return;
    const sa = itens.find((i) => i.tipo === CPF.SEQUENCED_ADDR);
    const cd = itens.find((i) => i.tipo === CPF.CONNECTED_DATA);
    if (!sa || !cd || sa.dados.length < 8) return;
    const con = this.conexoes.get(sa.dados.readUInt32LE(0));
    if (!con || con.classe === 3) return;
    if (con.ipOrig !== rinfo.address) return;                 // só aceita do originador
    let dados = cd.dados;
    if (con.classe === 1) {
      if (dados.length < 2) return;
      const s = dados.readUInt16LE(0);
      dados = dados.subarray(2);
      con.novo = s !== con.rxSeq; con.rxSeq = s;
    }
    if (dados.length + (con.classe === 1 ? 2 : 0) !== con.tamOT && con.dono) { con.erros++; return; }
    con.ultimoRx = Date.now();
    con.rx++;
    if (!con.dono) return;                                    // heartbeat de listen/input only

    // cabeçalho Run/Idle de 32 bits (bit 0 = 1: scanner em RUN)
    const run = (dados.readUInt32LE(0) & 1) === 1;
    const util = dados.subarray(4);
    if (run !== con.run) {
      con.run = run;
      this.log('info', 'IO', run ? `Scanner em RUN (O→T 0x${con.idOT.toString(16)}) — dados de saída aplicados` : 'Scanner em IDLE (bit Run/Idle = 0) — dados de saída ignorados; A0149/ação P0313');
      this.drive.erroComunicacao(!run, 'mestre em IDLE', 'eip');
      if (run) this.timeoutOcorrido = false;
      this.emit('conexoes');
    }
    if (run) this.consumir(con.pontoOT, util);
    con.ultimosDados = util;
    if (Date.now() - this.logIOAmostra > 1000) {
      this.logIOAmostra = Date.now();
      this.log('rx', 'IO', `O→T ${con.pontoOT} (amostra 1/s): ${run ? 'RUN' : 'IDLE'} ${[...Array(util.length >> 1)].map((_, i) => util.readUInt16LE(i * 2).toString(16).padStart(4, '0')).join(' ')}`, msg);
      if (con.produtor && con.produtor.ultimoPkt) this.log('tx', 'IO', `T→O ${con.pontoTO} (amostra 1/s)`, con.produtor.ultimoPkt);
    }
  }

  // ==================================================================
  //  SUPERVISÃO: watchdog das conexões, P0801 e LEDs
  // ==================================================================
  supervisionar() {
    const agora = Date.now();
    for (const c of [...this.conexoes.values()]) {
      if (agora - c.ultimoRx > c.timeoutMs) {
        this.estatCM.timeouts++;
        if (c.classe !== 3) this.timeoutOcorrido = true;
        this.encerrarConexao(c, `TIMEOUT (nenhum pacote em ${c.timeoutMs} ms = RPI x ${c.mult || '-'})`, c.dono);
      }
    }
    // P0801 — estado da comunicação
    const d = this.drive;
    let st;
    if (d.inj.moduloEth) st = 8;
    else if (this.estadoIf === 'setup') st = 0;
    else if (this.estadoIf === 'init') st = 1;
    else {
      const dono = this.conexoesIO().find((c) => c.dono);
      if (dono) st = dono.run ? 4 : 3;
      else if (this.timeoutOcorrido) st = 5;
      else st = 2;
    }
    if (d.ligado) d.v.set(801, st);
  }

  encerrarConexao(con, motivo, erroRede) {
    if (!this.conexoes.has(con.idOT)) return;
    this.conexoes.delete(con.idOT);
    if (con.produtor) {
      con.produtor.consumidores.delete(con);
      if (!con.produtor.consumidores.size) { clearInterval(con.produtor.timer); this.produtores.delete(con.produtor.chave); }
    }
    this.log(motivo.startsWith('TIMEOUT') ? 'erro' : 'info', 'CIP', `Conexão ${con.tipo} 0x${con.idOT.toString(16)} encerrada: ${motivo}`);
    if (con.dono) {
      // listen only dependem do owner
      for (const c of [...this.conexoes.values()]) if (c.tipo === 'Listen Only') this.encerrarConexao(c, 'owner encerrado', false);
      if (erroRede) this.drive.erroComunicacao(true, motivo, 'eip');
    }
    this.emit('conexoes');
  }

  conexoesIO() { return [...this.conexoes.values()].filter((c) => c.classe !== 3); }
  todasConexoes() { return [...this.conexoes.values()]; }

  leds() {
    const d = this.drive;
    if (!d.ligado) return { link: 'off', ms: 'off', ns: 'off' };
    const agora = Date.now();
    const link = !this.linkOk ? 'off' : (agora - this.ultAtividade < 120 ? 'verde-pisca' : 'verde');
    if (this.estadoIf !== 'online') return { link, ms: this.estadoIf === 'init' ? 'teste' : 'off', ns: 'off' };
    if (d.inj.moduloEth) return { link, ms: 'vermelho', ns: 'vermelho' };
    const dono = this.conexoesIO().find((c) => c.dono);
    const ms = dono && dono.run ? 'verde' : 'verde-pisca';
    let ns;
    if (!this.linkOk) ns = 'off';
    else if (this.conexoes.size) ns = 'verde';
    else if (this.timeoutOcorrido) ns = 'vermelho-pisca';
    else ns = 'verde-pisca';
    return { link, ms, ns };
  }

  /** Instantâneo para a interface web */
  estado() {
    const d = this.drive;
    const r = this.rede();
    return {
      estadoIf: this.estadoIf, linkOk: this.linkOk, leds: this.leds(), p0801: d.get(801),
      ipEfetivo: r.ip, mascara: r.mascara, bindIp: this.bindIp, bindIni: this.bindIni, origemIp: this.origemIp, ipParametros: [811, 812, 813, 814].map((n) => d.get(n)).join('.'), modoIp: d.get(810),
      multicast: this.multicastBase(), identidade: { ...this.identidade, status: this.objetos[1].statusWord() }, mac: this.mac(1).map((b) => b.toString(16).padStart(2, '0')).join(':'),
      ioCfg: this.ioCfg, ioPendente: JSON.stringify(this.lerConfigIO()) !== JSON.stringify(this.ioCfg),
      tamSaida: this.tamanhoSaida(), tamEntrada: this.tamanhoEntrada(),
      sessoes: [...this.sessoes.entries()].map(([h, s]) => ({ handle: h.toString(16), ip: s.ip })),
      conexoes: this.todasConexoes().map((c) => ({
        tipo: c.tipo, classe: c.classe, idOT: c.idOT.toString(16), idTO: c.idTO.toString(16), ip: c.ipOrig,
        pontoOT: c.pontoOT, pontoTO: c.pontoTO, rpiOT: c.rpiOT / 1000, rpiTO: c.rpiTO / 1000, tamOT: c.tamOT, tamTO: c.tamTO,
        multicast: c.multicast, destino: c.destino, run: c.run, rx: c.rx, tx: c.tx, timeoutMs: c.timeoutMs,
        idade: Date.now() - c.ultimoRx, erros: c.erros || 0,
      })),
      saidas: (() => { const b = this.consumido.get(100) || this.consumido.get(120) || this.consumido.get(121); return b ? [...Array(b.length >> 1)].map((_, i) => b.readUInt16LE(i * 2)) : null; })(),
      entradas: (() => { const b = this.dadosProduzidos(150); return [...Array(b.length >> 1)].map((_, i) => b.readUInt16LE(i * 2)); })(),
      estat: this.estatCM, contadores: this.contadores,
    };
  }
}

module.exports = { AdapterEIP };
