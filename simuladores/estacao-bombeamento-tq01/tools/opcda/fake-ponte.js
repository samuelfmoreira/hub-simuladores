'use strict';
// Processo que imita a ponte OPC DA (mesmo protocolo JSON por linha) com um "CLP" mínimo dentro,
// para testar o cliente OPC DA do simulador sem Windows/MasterTool. Uso: só pelos testes.
const readline = require('readline');
const TG = require('../../server/tags');
const vals = {};
for (const t of TG.TAGS) vals[t.nome] = t.tipo === 'BOOL' ? false : 0;
vals.IHM_Velocidade = 75; vals.IHM_Setpoint = 200; vals.S2_Desliga_NF = true; vals.S0_Emerg_NF = true;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let ligado = false, memS1 = false;
out({ ok: true, itens: Object.keys(vals).length, faltam: [], servidor: 'FAKE.OPC.DA', prefixo: 'PLC.Application.GVL_SIM.' });
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (l) => { try { const c = JSON.parse(l); if (c.w) { for (const [n, v] of c.w) if (n in vals) vals[n] = v; out({ wok: c.id, erros: [] }); } } catch (e) { out({ err: e.message }); } });
rl.on('close', () => process.exit(0));
let t = 0;
setInterval(() => {
  t += 0.1;
  // lógica mínima do "aluno": selo por S1; cai com S2/S0/LSHH
  const ok = vals.S0_Emerg_NF && vals.S2_Desliga_NF && !vals.LSHH;
  if (!ok) ligado = false;
  if (vals.S1_Liga && !memS1 && ok) ligado = true;
  memS1 = vals.S1_Liga;
  vals.Inv_Gira = ligado; vals.H1 = vals.Inv_Rodando;
  vals.Ref_Bruto = ligado ? Math.round(vals.IHM_Velocidade / 100 * 32767) : 0; vals.IHM_Nivel = Math.round(vals.LT01_Bruto / 32767 * 350);
  if (Math.round(t * 10) % 5 === 0) vals.HB_CLP = (vals.HB_CLP + 1) & 0xffff;
  const r = {}; for (const t of TG.doClp) r[t.nome] = vals[t.nome];
  out({ r, t: Date.now() });
}, 100);
