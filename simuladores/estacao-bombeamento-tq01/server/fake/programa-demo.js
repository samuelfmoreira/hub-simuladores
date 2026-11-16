'use strict';
// Programa de demonstração ("aluno"), comum aos CLPs falsos (Modbus e OPC UA). Trabalha só com as variáveis nomeadas
// da GVL_SIM: exercício 1 (partida/parada com intertravamentos), 3 (alarmes e fio rompido) e 4 (on/off de nível no
// automático: liga-desliga com histerese de ± 10 cm em torno do setpoint da IHM, sem TON). A referência é sempre
// a velocidade pedida na IHM.
function criarProgramaDemo({ le, escreve, fundo = 32767, demo = {} }) {
  const DEMO = Object.assign({ scanMs: 20 }, demo || {});
  const plc = { ligado: false, falha: false, alarme: false, memLiga: false, hbSim: 0, hbTempo: 0, comFalha: false, hbClp: 0, hbAcc: 0, sirene: false, enche: false };
  function scan(dt) {
    // escalonamento da contagem do A/D: 0..32767 = 0..3,5 m; abaixo de 3,8 mA = fio rompido
    const c = le('LT01_Bruto'); const nivel = c / fundo * 3.5; const fioRompido = c < -0.0125 * fundo;
    const hb = le('HB_Sim'); if (hb !== plc.hbSim) { plc.hbSim = hb; plc.hbTempo = 0; } else plc.hbTempo += dt;
    plc.comFalha = plc.hbTempo > 3;
    const condicao = le('S0_Emerg_NF') && le('S2_Desliga_NF') && le('Inv_OK') && !fioRompido && !plc.comFalha && !le('LSHH');
    if (le('S3_Reset')) { plc.falha = false; plc.sirene = false; }
    if (!condicao) { if (plc.ligado) { plc.falha = true; plc.sirene = true; } plc.ligado = false; }
    if (le('S1_Liga') && !plc.memLiga && condicao && !plc.falha) plc.ligado = true;
    plc.memLiga = le('S1_Liga');
    plc.alarme = nivel > 2.6 || nivel < 0.5 || le('LSHH') || le('LSLL');
    // automático igual ao Ladder da aula: nível em cm (IHM_Nivel), histerese ± 10 cm, sem TON
    const nivelCm = Math.round(c / fundo * 350) / 100;
    const sp = Math.max(0.5, Math.min(2.6, le('IHM_Setpoint') || 2.0));
    let roda = plc.ligado; const ref = le('IHM_Velocidade') || 0;
    if (le('S4_Auto') && le('S0_Emerg_NF') && !le('LSHH')) {
      if (nivelCm <= sp - 0.10) plc.enche = true;
      if (nivelCm >= sp + 0.10) plc.enche = false;
      roda = plc.enche;
    } else plc.enche = false;
    if (fioRompido) roda = false;
    const pct = roda ? Math.max(0, Math.min(100, ref)) : 0;
    escreve('Inv_Gira', roda); escreve('Inv_Reset', le('S3_Reset'));
    escreve('H1', le('Inv_Rodando')); escreve('H2', plc.alarme); escreve('H3', plc.falha); escreve('H4', plc.sirene);
    escreve('Ref_Bruto', Math.round(pct / 100 * fundo));
    escreve('IHM_Nivel', Math.round(nivel * 100) / 100);
    plc.hbAcc += dt; if (plc.hbAcc >= 0.5) { plc.hbAcc = 0; plc.hbClp = (plc.hbClp + 1) & 0xffff; escreve('HB_CLP', plc.hbClp); }
  }
  return { scan, plc, DEMO };
}
module.exports = { criarProgramaDemo };
