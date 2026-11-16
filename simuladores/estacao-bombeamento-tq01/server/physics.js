'use strict';
// Motor físico do processo simplificado: reservatório -> bomba B-01 (CFW500) -> tanque TQ-01 -> consumo (HV-01).
// Uma entrada analógica (LT-01, nível) e uma saída analógica (referência de velocidade do inversor).
const cat = require('./catalog');
const ch = require('./xp325-channels');
const { createDrive } = require('./drive');

const { ED, SD, EA, SA } = cat;

// Dimensionado para o motor de 1,5 kW / 4,3 A do CFW500 do HUB: bomba de ~20 m³/h a 60 Hz enchendo um tanque de 2 m².
const PARAM_PADRAO = {
  A: 2.0, hMax: 3.0, hLadrao: 2.95, cotaTanque: 6.0,   // ladrão (extravasor) em 2,95 m: o nível não passa de ~2,97 m          // o fundo do tanque fica 6 m acima do reservatório
  H0: 32, Kb: 0.0444, Ks: 0.02, fNom: 60,       // curva da bomba H = H0·(f/60)² − Kb·Q²; perdas na tubulação Ks·Q²
  qConsMax: 12,                                 // HV-01 toda aberta com o tanque cheio: 12 m³/h
  Tamb: 25, kT: 1.6, tauT: 600,
  qVazamento: 4, hInicial: 1.5,
};

function gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

function createPhysics(opts = {}) {
  const P = Object.assign({}, PARAM_PADRAO, opts.params || {});
  const canais = JSON.parse(JSON.stringify(opts.canais || cat.canaisPadrao));
  const drive = opts.drive || createDrive(Object.assign({ sinalAI1: canais.sa[0].modo === '4-20' ? '4-20' : '0-10V' }, opts.driveOpts || {}));
  const ruidoAtivo = opts.ruido !== false;

  const s = {
    t: 0, h: P.hInicial, qIn: 0, qOut: 0, qVaz: 0, hb: 0, iMot: 0, tMot: P.Tamb, transbordo: false,
    cons: 0.6, consAuto: false, consProx: 60,
    S1: false, S2: false, S3: false, S4: 'manual', S0: false, q1: true,
    di: new Array(16).fill(false), do: new Array(16).fill(false),
    ao: { raw: new Array(cat.N_SA).fill(0), eng: new Array(cat.N_SA).fill(0) },
    cfg: { bSimulacao: true, bModoBruto: true },   // canal analógico como no hardware: o CLP troca contagens de 15 bits
    falhas: { fioRompidoLT01: false, travadoLT01: false, inversor: false, vazamento: false, comunicacao: false, disjuntor: false },
    sensores: {},
  };
  s.di[ED.DESLIGA] = true; s.di[ED.EMERG] = true; // contatos NF em repouso
  for (const tx of cat.transmissores) s.sensores[tx.id] = { y: s.h, sinal: 4, raw: 0, eng: 0, st: 'ok' };
  let lsHH = false, lsLL = false;

  function sinalSaida(idx) {
    const c = canais.sa[idx];
    const valor = s.cfg.bModoBruto ? ch.rawSaidaParaSinal(c.modo, s.ao.raw[idx], canais.fundoEscala) : ch.engSaidaParaSinal(c.modo, s.ao.eng[idx], c);
    return { tipo: c.modo === '0-10V' ? 'V' : 'mA', valor };
  }
  const comoVolts = (sig) => (sig.tipo === 'V' ? sig.valor : sig.valor * 0.25); // 250 Ω se o canal mandar mA para a AI1 em tensão

  function medir(dt) {
    for (const tx of cat.transmissores) {
      const m = s.sensores[tx.id];
      let falha = 'ok';
      if (s.falhas.fioRompidoLT01) falha = 'fioRompido'; else if (s.falhas.travadoLT01) falha = 'travado';
      m.y += (s.h - m.y) * (dt / Math.max(tx.tau, dt));
      const medido = m.y + (ruidoAtivo ? gauss() * tx.ruido : 0);
      m.sinal = ch.engParaSinal(tx, medido, falha, m.sinal);
      const c = canais.ea[tx.ea];
      m.raw = ch.sinalParaRaw(c.modo, m.sinal, canais.fundoEscala);
      m.eng = ch.sinalParaEngTx(tx, m.sinal);
      m.engCanal = ch.rawParaEng(c.modo, m.raw, canais.fundoEscala, tx);
      m.st = falha !== 'ok' ? falha : (m.sinal < 3.8 ? 'subfaixa' : m.sinal > 20.2 ? 'sobrefaixa' : 'ok');
    }
  }

  function tick(dt) {
    s.t += dt;
    if (s.consAuto) {
      s.consProx -= dt;
      if (s.consProx <= 0) { s.consProx = 40 + Math.random() * 40; s.consDegrau = (Math.random() - 0.5) * 0.3; }
      s.cons = clamp(0.5 + 0.35 * Math.sin(2 * Math.PI * s.t / 300) + (s.consDegrau || 0), 0.05, 1);
    }
    // quadro: Q1 (disjuntor manual) alimenta o inversor; a falha "disjuntor desarmado" abre Q1
    if (s.falhas.disjuntor) s.q1 = false;
    const energizado = s.q1;
    // S0 tem um segundo contato NF em série com a DI1 do inversor: corta o gira/para por hardware
    const di1 = s.do[SD.INV_RUN] && !s.S0;
    // inversor pelos bornes
    const sigRef = sinalSaida(SA.INV_REF);
    drive.setBornes({ DI1: di1, DI2: false, DI3: s.do[SD.INV_RESET], AI1_V: comoVolts(sigRef), power: energizado });
    if (drive.setCarga) drive.setCarga({ q: s.qIn, hb: s.hb, cavit: 0 });
    drive.step(dt, { correnteA: s.iMot });
    const drv = drive.saidas();
    if (s.falhas.inversor && typeof drive.forcarFalha === 'function') drive.forcarFalha(70);
    const f = (drv.rpm || 0) / 1800 * 60;
    // bomba contra a altura estática (reservatório -> topo do tanque) e as perdas
    const Hb0 = P.H0 * Math.pow(f / P.fNom, 2);
    const Hest = P.cotaTanque + s.h;
    let q = 0;
    if (f > 1 && Hb0 > Hest) q = Math.sqrt((Hb0 - Hest) / (P.Kb + P.Ks));
    s.qIn = q;
    s.hb = f > 1 ? (q > 0 ? Hest + P.Ks * q * q : Hb0) : 0;
    if (typeof drv.correnteA === 'number') s.iMot = drv.correnteA;
    s.tMot += ((P.Tamb + P.kT * s.iMot * s.iMot) - s.tMot) * dt / P.tauT;
    // consumo por gravidade pela HV-01 (abertura = cons) e vazamento
    s.qOut = P.qConsMax * s.cons * Math.sqrt(Math.max(0, s.h) / P.hMax);
    s.qVaz = s.falhas.vazamento ? P.qVazamento * Math.sqrt(Math.max(0, s.h) / P.hMax) : 0;
    const dh = (s.qIn - s.qOut - s.qVaz) / P.A * dt / 3600;
    // acima do ladrão o excesso escoa pelo extravasor: o nível só sobe 2 cm acima dele
    s.transbordo = s.h >= P.hLadrao && dh > 0;
    s.h = clamp(s.h + dh, 0, s.h >= P.hLadrao && dh > 0 ? Math.max(s.h, P.hLadrao + 0.02) : P.hMax);
    // chaves de nível com histerese
    const hh = cat.componentes.find(c => c.id === 'LSHH-01'), ll = cat.componentes.find(c => c.id === 'LSLL-01');
    if (!lsHH && s.h > hh.nivel + hh.hist) lsHH = true; else if (lsHH && s.h < hh.nivel - hh.hist) lsHH = false;
    if (!lsLL && s.h < ll.nivel - ll.hist) lsLL = true; else if (lsLL && s.h > ll.nivel + ll.hist) lsLL = false;
    medir(dt);
    const di = s.di;
    di[ED.LIGA] = s.S1; di[ED.DESLIGA] = !s.S2; di[ED.RESET] = s.S3; di[ED.AUTO] = s.S4 === 'auto'; di[ED.EMERG] = !s.S0;
    di[ED.INV_RODANDO] = drv.DO2;   // relé "F > Fx" (P0276 = 2)
    di[ED.INV_OK] = drv.DO1;        // relé "sem falha" (P0275 = 13): 1 = inversor OK
    di[ED.LSHH] = lsHH; di[ED.LSLL] = lsLL;
    s.drv = drv; s.sinais = { ref: sigRef };
  }

  function comando(c) {
    switch (c.tipo) {
      case 'btn': if (c.id === 'S1') s.S1 = !!c.down; if (c.id === 'S2') s.S2 = !!c.down; if (c.id === 'S3') s.S3 = !!c.down; break;
      case 'cogumelo': s.S0 = c.acionado !== undefined ? !!c.acionado : !s.S0; break;
      case 'disjuntor': if (c.on === undefined ? !s.q1 : !!c.on) { s.falhas.disjuntor = false; s.q1 = true; } else s.q1 = false; break;
      case 'seletor': s.S4 = c.pos === 'auto' ? 'auto' : 'manual'; break;
      case 'cons': s.cons = clamp(c.valor, 0, 1); break;
      case 'nivel': s.h = clamp(Number(c.h) || 0, 0, P.hMax); s.sensores['LT-01'].y = s.h; break;   // instrutor/depuração: põe o tanque num nível
      case 'consAuto': s.consAuto = !!c.on; break;
      case 'falha': if (c.nome in s.falhas) { s.falhas[c.nome] = !!c.on; if (c.nome === 'disjuntor' && !c.on) s.q1 = true; } break;
      case 'tecla': drive.tecla(c.tecla, c.pressionada); break;
      case 'param': drive.setParam(c.n, c.v); break;
      case 'comissionar': { if (typeof drive.comissionar !== 'function') return false; s.ultimoComissionamento = drive.comissionar(canais.sa[0].modo === '4-20' ? '4-20' : '0-10V'); break; }
      case 'canal': { if (c.fundoEscala) canais.fundoEscala = c.fundoEscala; if (c.grupo && canais[c.grupo][c.ch]) canais[c.grupo][c.ch].modo = c.modo; break; }
      case 'cfg': if (c.campo in s.cfg) s.cfg[c.campo] = !!c.valor; break;
      case 'reset': { s.h = P.hInicial; s.iMot = 0; s.tMot = P.Tamb; s.S0 = false; s.q1 = true; for (const k in s.falhas) s.falhas[k] = false; s.sensores['LT-01'].y = s.h; break; }
      default: return false;
    }
    return true;
  }

  function setDO(arr) { for (let i = 0; i < 16 && i < arr.length; i++) s.do[i] = !!arr[i]; }
  function setAO(raw, eng) { if (raw) s.ao.raw = raw.slice(0, cat.N_SA).map(Number); if (eng) s.ao.eng = eng.slice(0, cat.N_SA).map(Number); }

  function entradasCLP() {
    const AI_RAW = new Array(cat.N_EA).fill(0), AI_ENG = new Array(cat.N_EA).fill(0);
    for (const tx of cat.transmissores) { AI_RAW[tx.ea] = s.sensores[tx.id].raw; AI_ENG[tx.ea] = s.sensores[tx.id].eng; }
    return { AI_RAW, AI_ENG, DI: s.di.slice(), bSimulacao: s.cfg.bSimulacao, bModoBruto: s.cfg.bModoBruto };
  }

  function estado() {
    const drv = s.drv || drive.saidas();
    return {
      t: Math.round(s.t * 100) / 100, h: s.h, qIn: s.qIn, qOut: s.qOut, hb: s.hb, iMot: s.iMot, tMot: s.tMot, transbordo: s.transbordo, cons: s.cons, consAuto: s.consAuto,
      quadro: { S1: s.S1, S2: s.S2, S3: s.S3, S4: s.S4, S0: s.S0, q1: s.q1, di1: s.do[SD.INV_RUN] && !s.S0, H1: s.do[SD.H1_VERDE], H2: s.do[SD.H2_AMARELO], H3: s.do[SD.H3_VERMELHO], H4: s.do[SD.H4_SIRENE] },
      inv: { fHz: drv.fHz, rpm: drv.rpm, rodando: drv.rodando, falha: drv.falha, codFalha: drv.codFalha, descFalha: drv.descFalha || '', alarmes: drv.alarmes || [], locRem: drv.locRem, display: drv.display, power: drv.power, boot: !!drv.boot, DO1: drv.DO1, DO2: drv.DO2, AO1_V: drv.AO1_V, torquePct: drv.torquePct, ud: drv.ud, vOut: drv.vOut, hmi: drv.hmi || null, real: !!drive.real, params: drive.params ? drive.params() : {} },
      di: s.di.slice(), do: s.do.slice(), ao: { raw: s.ao.raw.slice(), eng: s.ao.eng.slice(), sinais: s.sinais },
      sensores: JSON.parse(JSON.stringify(s.sensores)),
      cfg: Object.assign({}, s.cfg), falhas: Object.assign({}, s.falhas), canais,
    };
  }

  return { tick, comando, setDO, setAO, entradasCLP, estado, drive, params: P, canais, _s: s, ultimoComissionamento: () => s.ultimoComissionamento };
}

module.exports = { createPhysics, PARAM_PADRAO };
