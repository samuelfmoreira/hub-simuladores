'use strict';
// Testes sem tela: planta + CLP demo em tempo acelerado e cenários de IO-Link.
// Uso: npm run test:sim
const { Sim } = require('../src/core/sim');
const { DemoPlc } = require('../src/core/demo-plc');
const { PORTS } = require('../src/core/portmap');
const iol = require('../src/pn/iol-call');

let falhas = 0;
const check = (nome, cond, extra = '') => { console.log(`${cond ? 'OK   ' : 'FALHA'} ${nome}${extra ? '  ' + extra : ''}`); if (!cond) falhas++; };

function rig() {
  const sim = new Sim(); const logs = [];
  sim.on('log', e => logs.push(e.text));
  const plc = new DemoPlc(t => logs.push(t));
  const OUT = PORTS.map(p => new Uint8Array(p.outLen));
  const r = { sim, plc, logs, t: 0 };
  r.run = secs => { const dt = 0.005; for (const end = r.t + secs; r.t < end; r.t += dt) { plc.scan(dt, sim.IN, sim.PQI, OUT); sim.step(dt, n => OUT[n]); } };
  r.press = k => { sim.W.pb[k] = true; r.run(0.1); sim.W.pb[k] = false; r.run(0.1); };
  r.start = () => { r.run(0.5); r.press('start'); };
  return r;
}

// 1. Ciclo normal
let r = rig(); r.start(); r.run(150);
check('Ciclo normal: 2 pallets, nenhuma caixa perdida', r.sim.W.done >= 2 && r.sim.W.lost === 0, JSON.stringify({ pallets: r.sim.W.done, perdidas: r.sim.W.lost }));

// 2. Hub desconectado: evento 0x1800, diagnóstico 0x0006, CLP em falha, rearme
r.sim.S[3].disc = true; r.run(1);
const d3 = r.sim.diagCodes()[3];
check('Hub desconectado gera evento 0x1800 e diagnóstico 0x0006', r.sim.S[3].active.has(0x1800) && d3.err === 0x0006 && d3.add === 0x1800 && r.plc.state === 'FALHA');
r.sim.S[3].disc = false; r.run(1); r.press('reset');
check('Após reconectar e rearmar o CLP volta a Parado', r.plc.state === 'PARADO' && r.sim.S[3].state === 'OPERATE');

// 3. Troca do B1 pelo mesmo modelo com Data Storage (backup + restore)
r = rig(); r.start(); r.run(20);
r.sim.replaceDevice(1, 0); r.run(1.5); r.press('reset'); r.press('start'); r.run(60);
check('Data Storage restaura SP1 = 750 no B1 novo', r.sim.S[1].dev.params[0x3C] === 750, `SP1=${r.sim.S[1].dev.params[0x3C]}`);
check('Célula segue sem perder caixas após a troca', r.sim.W.lost === 0, `perdidas=${r.sim.W.lost}`);

// 4. Mesma troca sem Data Storage: device fica com o valor de fábrica
r = rig(); r.sim.configure(1, { ...r.sim.S[1].cfg, vds: 1 }, 'tela'); r.run(1);
r.sim.replaceDevice(1, 0); r.run(1.5);
check('Sem Data Storage o B1 novo fica com SP1 de fábrica (1000)', r.sim.S[1].dev.params[0x3C] === 1000);

// 5. Modelo diferente com validação: erro de validação, PQ = 0, DevCom = 1
r = rig(); r.sim.replaceDevice(5, 1); r.run(1.5);
const d5 = r.sim.diagCodes()[5];
check('LDS-1500 no lugar do LDS-3000 é recusado pela validação', r.sim.S[5].state === 'ERRO_VALIDACAO' && r.sim.PQI[5] === 0x40 && d5.add === 0x1803 && d5.err === 0x0010,
  `estado=${r.sim.S[5].state} PQI=0x${r.sim.PQI[5].toString(16)}`);

// 6. Mesmo modelo diferente sem validação: entra, mas sai da faixa de medição
r = rig(); r.sim.configure(5, { ...r.sim.S[5].cfg, vds: 0 }, 'tela'); r.run(1);
r.sim.replaceDevice(5, 1); r.run(1.5);
check('Sem validação o LDS-1500 entra e acusa faixa excedida (0x8C20)', r.sim.S[5].state === 'OPERATE' && r.sim.S[5].active.has(0x8C20) && (r.sim.PQI[5] & 0x20));

// 7. Tempo de ciclo alto no laser do elevador
r = rig(); r.sim.configure(5, { ...r.sim.S[5].cfg, cycle: 100 }, 'tela'); r.run(1); r.press('reset'); r.start(); r.run(150);
check('Ciclo de 100 ms no B2: a célula continua rodando', r.sim.cycleMs(5) === 100 && r.sim.W.done >= 1, `pallets=${r.sim.W.done} perdidas=${r.sim.W.lost}`);

// 8. IOL_CALL
r = rig(); r.run(0.5);
let res = iol.handle(r.sim, iol.request(2, false, 0x3C));
check('IOL_CALL lê SP1 do X1 (porta 2)', res.ok && res.buf.length === 10 && res.buf.readUInt16BE(8) === 750, res.buf.toString('hex'));
res = iol.handle(r.sim, iol.request(5, true, 0x50, Buffer.from([0x01, 0xF4])));
check('IOL_CALL recusa 500 mm/s no X4 com erro 0x8030', !res.ok && res.buf[4] === 0x80 && res.buf.readUInt16BE(8) === 0x8030);
res = iol.handle(r.sim, iol.request(5, true, 0x50, Buffer.from([0x01, 0x2C])));
check('IOL_CALL grava 300 mm/s e o backup é atualizado', res.ok && r.sim.S[4].dev.params[0x50] === 300 && r.sim.S[4].backup.params[0x50] === 300);

console.log(falhas ? `\n${falhas} teste(s) falharam` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
