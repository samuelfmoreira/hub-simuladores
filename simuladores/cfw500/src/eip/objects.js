/**
 * =====================================================================
 *  MODELO DE OBJETOS CIP DO CFW500 (conforme o arquivo EDS da WEG)
 * =====================================================================
 *   Classe 0x01  Identity               (vendor 853 WEG, tipo 43, produto 6656)
 *   Classe 0x02  Message Router         (inclui Multiple Service Packet)
 *   Classe 0x04  Assembly               (100/120/121 saída, 150/170/171 entrada)
 *   Classe 0x06  Connection Manager     (Forward Open/Close, Unconnected Send)
 *   Classe 0x47  DLR                    (nó de anel, não supervisor)
 *   Classe 0x48  QoS
 *   Classe 0xA2  Parâmetros do inversor (instância = nº do parâmetro, atributo 5 = valor)
 *   Classe 0xF4  Port
 *   Classe 0xF5  TCP/IP Interface
 *   Classe 0xF6  Ethernet Link          (2 instâncias: Port1/Port2)
 *
 *  Cada objeto implementa: get(inst, attr) -> Buffer | {erro}
 *                          set(inst, attr, dados) -> null | {erro}
 *                          getAll(inst) / servico(svc, inst, req, ctx)
 * =====================================================================
 */
'use strict';

const { Escritor, ST, SVC, lerPath, ipParaUdint } = require('./cip');
const { MAP: PARAMS } = require('../drive/params');

const erro = (st, ext) => ({ erro: st, ext });

/** Atributos de classe padrão (revisão, max instância, nº instâncias, max attr) */
function atributoClasse(attr, rev, maxInst, nInst, maxAttrClasse, maxAttrInst) {
  switch (attr) {
    case 1: return new Escritor().u16(rev).fim();
    case 2: return new Escritor().u16(maxInst).fim();
    case 3: return new Escritor().u16(nInst).fim();
    case 6: return new Escritor().u16(maxAttrClasse).fim();
    case 7: return new Escritor().u16(maxAttrInst).fim();
    default: return erro(ST.ATRIBUTO_NAO_SUPORTADO);
  }
}

function criarObjetos(adapter) {
  const drive = adapter.drive;
  const id = adapter.identidade;

  // =================================================================
  //  0x01 IDENTITY
  // =================================================================
  const identity = {
    nome: 'Identity', classe: 0x01,
    instancias: [1],
    statusWord() {
      // bit0 Owned, bit2 Configured, bits 4-7 estado estendido, bit10 falha maior recuperável
      let s = 0x0004;
      const conns = adapter.conexoesIO();
      if (conns.some((c) => c.dono)) s |= 0x0001;
      let ext = 0x3;                                    // nenhuma conexão de I/O estabelecida
      if (adapter.timeoutOcorrido && !conns.length) ext = 0x2; // pelo menos uma conexão de I/O em falha
      if (conns.length) ext = conns.some((c) => c.run) ? 0x6 : 0x7;
      s |= ext << 4;
      if (drive.falha) s |= 0x0100;                     // bit 8: falha menor recuperável (inversor em falha)
      return s;
    },
    get(inst, attr) {
      if (inst === 0) return atributoClasse(attr, 2, 1, 1, 7, 7);
      if (inst !== 1) return erro(ST.DESTINO_DESCONHECIDO);
      switch (attr) {
        case 1: return new Escritor().u16(id.vendor).fim();
        case 2: return new Escritor().u16(id.tipo).fim();
        case 3: return new Escritor().u16(id.produto).fim();
        case 4: return new Escritor().u8(id.revMaior).u8(id.revMenor).fim();
        case 5: return new Escritor().u16(this.statusWord()).fim();
        case 6: return new Escritor().u32(id.serie).fim();
        case 7: return new Escritor().sstr(id.nome).fim();
        default: return erro(ST.ATRIBUTO_NAO_SUPORTADO);
      }
    },
    getAll(inst) {
      if (inst !== 1) return erro(ST.DESTINO_DESCONHECIDO);
      return Buffer.concat([1, 2, 3, 4, 5, 6, 7].map((a) => this.get(1, a)));
    },
    servico(svc, inst, req) {
      if (svc === SVC.RESET && inst === 1) {
        const tipo = req.dados.length ? req.dados[0] : 0;
        if (tipo !== 0) return erro(ST.PARAMETRO_INVALIDO);
        setTimeout(() => adapter.emit('resetIdentity'), 100);   // emula ciclo de energia
        return Buffer.alloc(0);
      }
      return null;
    },
  };

  // =================================================================
  //  0x02 MESSAGE ROUTER
  // =================================================================
  const messageRouter = {
    nome: 'Message Router', classe: 0x02, instancias: [1],
    get(inst, attr) {
      if (inst === 0) return atributoClasse(attr, 1, 1, 1, 7, 3);
      if (inst !== 1) return erro(ST.DESTINO_DESCONHECIDO);
      if (attr === 1) {
        const lista = Object.keys(objetos).map(Number);
        const w = new Escritor().u16(lista.length); lista.forEach((c) => w.u16(c)); return w.fim();
      }
      if (attr === 2) return new Escritor().u16(adapter.MAX_CONEXOES).fim();
      if (attr === 3) { const c = adapter.todasConexoes(); const w = new Escritor().u16(c.length); c.forEach((x) => w.u16(x.idOT & 0xFFFF)); return w.fim(); }
      return erro(ST.ATRIBUTO_NAO_SUPORTADO);
    },
  };

  // =================================================================
  //  0x04 ASSEMBLY — dados cíclicos
  // =================================================================
  const assembly = {
    nome: 'Assembly', classe: 0x04, instancias: [100, 120, 121, 150, 170, 171],
    get(inst, attr) {
      if (inst === 0) return atributoClasse(attr, 2, 171, 6, 7, 4);
      if (!this.instancias.includes(inst)) return erro(ST.DESTINO_DESCONHECIDO);
      const dados = inst >= 150 ? adapter.dadosProduzidos(inst) : adapter.ultimoConsumido(inst);
      if (attr === 3) return dados;
      if (attr === 4) return new Escritor().u16(dados.length).fim();
      return erro(ST.ATRIBUTO_NAO_SUPORTADO);
    },
    set(inst, attr, dados) {
      if (!this.instancias.includes(inst)) return erro(ST.DESTINO_DESCONHECIDO);
      if (attr !== 3) return erro(ST.NAO_GRAVAVEL);
      if (inst >= 150) return erro(ST.NAO_GRAVAVEL);
      if (adapter.conexoesIO().some((c) => c.dono)) return erro(ST.CONFLITO_ESTADO_DISP); // já há dono (I/O)
      const esp = adapter.tamanhoSaida();
      if (dados.length < esp) return erro(ST.DADOS_INSUFICIENTES);
      if (dados.length > esp) return erro(ST.DADOS_DEMAIS);
      adapter.consumir(inst, dados, true);
      return null;
    },
  };

  // =================================================================
  //  0x06 CONNECTION MANAGER
  // =================================================================
  const connectionManager = {
    nome: 'Connection Manager', classe: 0x06, instancias: [1],
    get(inst, attr) {
      if (inst === 0) return atributoClasse(attr, 1, 1, 1, 7, 8);
      if (inst !== 1) return erro(ST.DESTINO_DESCONHECIDO);
      const e = adapter.estatCM;
      const v = [null, e.openReq, e.openFormatRej, e.openResRej, e.openOtherRej, e.closeReq, e.closeFormatReq, e.closeOtherReq, e.timeouts][attr];
      if (v === undefined || v === null) return erro(ST.ATRIBUTO_NAO_SUPORTADO);
      return new Escritor().u16(v).fim();
    },
    servico(svc, inst, req, ctx) {
      if (inst !== 1) return erro(ST.DESTINO_DESCONHECIDO);
      if (svc === SVC.FORWARD_OPEN || svc === SVC.LARGE_FORWARD_OPEN) return adapter.forwardOpen(req.dados, svc === SVC.LARGE_FORWARD_OPEN, ctx);
      if (svc === SVC.FORWARD_CLOSE) return adapter.forwardClose(req.dados, ctx);
      if (svc === SVC.UNCONNECTED_SEND) return adapter.unconnectedSend(req.dados, ctx);
      if (svc === SVC.GET_CONN_OWNER) return erro(ST.SERVICO_NAO_SUPORTADO);
      return null;
    },
  };

  // =================================================================
  //  0xA2 PARÂMETROS DO CFW500 (Tabela 7.3 do manual Ethernet)
  //    Classe 162 (A2h), Instância = número do parâmetro, Atributo 5 = valor
  //    "O dado é transmitido como um valor inteiro, sem a indicação das casas decimais."
  // =================================================================
  const parametros = {
    nome: 'Parâmetros CFW500', classe: 0xA2, instancias: null,
    get(inst, attr) {
      if (inst === 0) return atributoClasse(attr, 1, 1059, PARAMS.size, 7, 5);
      if (!PARAMS.has(inst)) return erro(ST.DESTINO_DESCONHECIDO);
      if (attr !== 5) return erro(ST.ATRIBUTO_NAO_SUPORTADO);
      return new Escritor().u16(drive.lerPalavra(inst)).fim();
    },
    set(inst, attr, dados) {
      if (!PARAMS.has(inst)) return erro(ST.DESTINO_DESCONHECIDO);
      if (attr !== 5) return erro(ST.ATRIBUTO_NAO_SUPORTADO);
      const p = PARAMS.get(inst);
      if (p.ro && !p.net) return erro(ST.NAO_GRAVAVEL);        // ordem CIP: gravável? depois tamanho
      if (dados.length < 2) return erro(ST.DADOS_INSUFICIENTES);
      if (dados.length > 2) return erro(ST.DADOS_DEMAIS);
      const r = drive.escrever(inst, dados.readUInt16LE(0), 'net');
      if (!r) return null;
      if (r.erro === 'ro') return erro(ST.NAO_GRAVAVEL);
      if (r.erro === 'faixa') return erro(ST.VALOR_INVALIDO);
      if (r.erro === 'cfg') return erro(ST.CONFLITO_ESTADO_DISP);
      return erro(ST.CONFLITO_ESTADO_OBJ);
    },
  };

  // =================================================================
  //  0xF5 TCP/IP INTERFACE
  // =================================================================
  const tcpip = {
    nome: 'TCP/IP Interface', classe: 0xF5, instancias: [1],
    get(inst, attr, ctx) {
      if (inst === 0) return atributoClasse(attr, 3, 1, 1, 7, 13);
      if (inst !== 1) return erro(ST.DESTINO_DESCONHECIDO);
      const rede = adapter.rede(ctx);
      switch (attr) {
        case 1: return new Escritor().u32(0x00000001).fim();                       // configuração obtida
        case 2: return new Escritor().u32(0x00000014).fim();                       // DHCP + configurável
        case 3: return new Escritor().u32(drive.get(810) === 1 ? 0x2 : 0x0).fim(); // 0 = parâmetros, 2 = DHCP
        case 4: return new Escritor().u16(2).u8(0x20).u8(0xF6).u8(0x24).u8(0x01).fim();
        case 5: return new Escritor().u32(ipParaUdint(rede.ip)).u32(ipParaUdint(rede.mascara)).u32(ipParaUdint(rede.gateway))
          .u32(0).u32(0).str('').fim();
        case 6: return new Escritor().str(adapter.hostName).fim();
        case 8: return new Escritor().u8(1).fim();                                 // TTL multicast
        case 9: return new Escritor().u8(0).u8(0).u16(32).u32(ipParaUdint(adapter.multicastBase(ctx))).fim();
        case 13: return new Escritor().u16(adapter.timeoutInatividade).fim();
        default: return erro(ST.ATRIBUTO_NAO_SUPORTADO);
      }
    },
    getAll(inst, ctx) {
      if (inst !== 1) return erro(ST.DESTINO_DESCONHECIDO);
      return Buffer.concat([1, 2, 3, 4, 5, 6].map((a) => this.get(1, a, ctx)));
    },
    set(inst, attr, dados) {
      if (inst !== 1) return erro(ST.DESTINO_DESCONHECIDO);
      if (attr === 13) {
        if (dados.length !== 2) return erro(ST.DADOS_INSUFICIENTES);
        const v = dados.readUInt16LE(0); if (v > 3600) return erro(ST.VALOR_INVALIDO);
        adapter.timeoutInatividade = v; return null;
      }
      if ([1, 2, 4, 8].includes(attr)) return erro(ST.NAO_GRAVAVEL);
      if ([3, 5, 6, 9].includes(attr)) return erro(ST.CONFLITO_ESTADO_OBJ);   // configure pelos parâmetros P0810..P0819
      return erro(ST.ATRIBUTO_NAO_SUPORTADO);
    },
  };

  // =================================================================
  //  0xF6 ETHERNET LINK (Port1 = com link; Port2 = sem cabo)
  // =================================================================
  const ethLink = {
    nome: 'Ethernet Link', classe: 0xF6, instancias: [1, 2],
    velocidadeDuplex() {
      const t = drive.get(803);
      return [{ v: 100, full: true, auto: true }, { v: 10, full: false }, { v: 10, full: true }, { v: 100, full: false }, { v: 100, full: true }][t];
    },
    get(inst, attr) {
      if (inst === 0) return atributoClasse(attr, 3, 2, 2, 7, 11);
      if (inst !== 1 && inst !== 2) return erro(ST.DESTINO_DESCONHECIDO);
      const link = inst === 1 && adapter.linkOk;
      const vd = this.velocidadeDuplex();
      const c = adapter.contadores;
      switch (attr) {
        case 1: return new Escritor().u32(link ? vd.v : 0).fim();
        case 2: return new Escritor().u32(link ? (1 | (vd.full ? 2 : 0) | ((vd.auto ? 3 : 4) << 2)) : 0).fim();
        case 3: return Buffer.from(adapter.mac(inst));
        case 4: { const w = new Escritor(); (inst === 1 ? [c.inOct, c.inUcast, 0, 0, 0, 0, c.outOct, c.outUcast, 0, 0, 0] : Array(11).fill(0)).forEach((x) => w.u32(x)); return w.fim(); }
        case 5: return Buffer.alloc(48);
        case 6: return new Escritor().u16(vd.auto ? 1 : (vd.full ? 2 : 0)).u16(vd.auto ? 0 : vd.v).fim();
        case 7: return new Escritor().u8(2).fim();             // par trançado
        case 8: return new Escritor().u8(link ? 1 : 2).fim();  // 1 habilitada, 2 desabilitada/sem link
        case 9: return new Escritor().u8(1).fim();             // admin: habilitada
        case 10: return new Escritor().sstr(`Port${inst}`).fim();
        case 11: { const w = new Escritor().u32(0x0E).u8(4); [[10, 0], [10, 1], [100, 0], [100, 1]].forEach(([s, d]) => w.u16(s).u8(d)); return w.fim(); }
        default: return erro(ST.ATRIBUTO_NAO_SUPORTADO);
      }
    },
    getAll(inst) {
      if (inst !== 1 && inst !== 2) return erro(ST.DESTINO_DESCONHECIDO);
      return Buffer.concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((a) => this.get(inst, a)));
    },
    set(inst, attr) {
      if (attr === 6) return erro(ST.CONFLITO_ESTADO_OBJ); // use P0803
      return erro(ST.NAO_GRAVAVEL);
    },
    servico(svc, inst, req) {
      if (svc === SVC.GET_AND_CLEAR) {
        const seg = lerPath(req.path).find((s) => s.tipo === 'atributo');
        const r = this.get(inst, seg ? seg.valor : 0);
        if (Buffer.isBuffer(r) && seg && seg.valor === 4 && inst === 1) Object.keys(adapter.contadores).forEach((k) => { adapter.contadores[k] = 0; });
        return r;
      }
      return null;
    },
  };

  // =================================================================
  //  0xF4 PORT
  // =================================================================
  const port = {
    nome: 'Port', classe: 0xF4, instancias: [1],
    get(inst, attr) {
      if (inst === 0) {
        if (attr === 8) return new Escritor().u16(1).fim();          // entry port
        if (attr === 9) return new Escritor().u16(0).u16(0).u16(4).u16(2).fim(); // [inst0 vazio], [inst1: tipo 4, nº 2]
        return atributoClasse(attr, 2, 1, 1, 9, 10);
      }
      if (inst !== 1) return erro(ST.DESTINO_DESCONHECIDO);
      switch (attr) {
        case 1: return new Escritor().u16(4).fim();                  // EtherNet/IP
        case 2: return new Escritor().u16(2).fim();                  // porta nº 2 (convencionada para TCP/IP)
        case 3: return new Escritor().u16(2).u8(0x20).u8(0xF5).u8(0x24).u8(0x01).fim();
        case 4: return new Escritor().sstr('TCP/IP').fim();
        case 7: return new Escritor().u16(0).fim();
        case 10: return new Escritor().u32(0).fim();
        default: return erro(ST.ATRIBUTO_NAO_SUPORTADO);
      }
    },
  };

  // =================================================================
  //  0x47 DLR (Device Level Ring) — nó em anel baseado em beacon
  // =================================================================
  const dlr = {
    nome: 'DLR', classe: 0x47, instancias: [1],
    get(inst, attr) {
      if (inst === 0) return atributoClasse(attr, 3, 1, 1, 7, 12);
      if (inst !== 1) return erro(ST.DESTINO_DESCONHECIDO);
      switch (attr) {
        case 1: return new Escritor().u8(0).fim();          // topologia: linear
        case 2: return new Escritor().u8(0).fim();          // status: normal
        case 10: return new Escritor().u32(0).zeros(6).fim();
        case 12: return new Escritor().u32(0x00000002).fim(); // beacon-based ring node
        default: return erro(ST.ATRIBUTO_NAO_SUPORTADO);
      }
    },
  };

  // =================================================================
  //  0x48 QoS — valores DSCP
  // =================================================================
  const dscp = { 4: 55, 5: 47, 6: 43, 7: 31, 8: 27 };
  const qos = {
    nome: 'QoS', classe: 0x48, instancias: [1],
    get(inst, attr) {
      if (inst === 0) return atributoClasse(attr, 1, 1, 1, 7, 8);
      if (inst !== 1) return erro(ST.DESTINO_DESCONHECIDO);
      if (dscp[attr] === undefined) return erro(ST.ATRIBUTO_NAO_SUPORTADO);
      return new Escritor().u8(dscp[attr]).fim();
    },
    set(inst, attr, dados) {
      if (dscp[attr] === undefined) return erro(ST.ATRIBUTO_NAO_SUPORTADO);
      if (dados.length !== 1) return erro(ST.DADOS_INSUFICIENTES);
      if (dados[0] > 63) return erro(ST.VALOR_INVALIDO);
      dscp[attr] = dados[0]; return null;
    },
  };

  const objetos = {
    0x01: identity, 0x02: messageRouter, 0x04: assembly, 0x06: connectionManager, 0x47: dlr, 0x48: qos,
    0xA2: parametros, 0xF4: port, 0xF5: tcpip, 0xF6: ethLink,
  };
  return objetos;
}

module.exports = { criarObjetos };
