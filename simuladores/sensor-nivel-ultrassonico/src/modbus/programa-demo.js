'use strict';
// Programa de demonstração do CLP: é a tradução, linha a linha, do docs/PRG_Nivel.st (a solução de referência).
// Trabalha só com as variáveis nomeadas da GVL_SIM. Os testes (tools/teste.js) rodam este programa contra o núcleo.
const LIMITES = { LL: 10, L: 20, H: 80, HH: 90, histerese: 2, falhaBruto: -410, scanMs: 20 };

function criarProgramaDemo({ le, escreve }) {
  const plc = { pct: 0, falha: false, LALL: false, LAL: false, LAH: false, LAHH: false };
  function scan() {
    const L = LIMITES;
    const bruto = le('LT01_Bruto');
    // 1. escala: contagem do A/D (0..32767) para % (0..100)
    plc.pct = bruto / 32767 * 100;
    // 2. falha do transmissor: abaixo de 3,8 mA (bruto < −410)
    plc.falha = bruto < L.falhaBruto;
    // 3. alarmes com histerese; em falha, nenhum alarme de nível vale
    if (plc.falha) { plc.LALL = plc.LAL = plc.LAH = plc.LAHH = false; }
    else {
      if (plc.pct >= L.HH) plc.LAHH = true; else if (plc.pct < L.HH - L.histerese) plc.LAHH = false;
      if (plc.pct >= L.H) plc.LAH = true; else if (plc.pct < L.H - L.histerese) plc.LAH = false;
      if (plc.pct <= L.L) plc.LAL = true; else if (plc.pct > L.L + L.histerese) plc.LAL = false;
      if (plc.pct <= L.LL) plc.LALL = true; else if (plc.pct > L.LL + L.histerese) plc.LALL = false;
    }
    // 4. saídas para o painel do simulador (só se o retorno do CLP estiver ligado na sessão)
    escreve('LALL_01', plc.LALL); escreve('LAL_01', plc.LAL); escreve('LAH_01', plc.LAH); escreve('LAHH_01', plc.LAHH);
    escreve('Falha_LT01', plc.falha);
    escreve('Nivel_Pct', plc.falha ? 0 : Math.max(0, Math.min(100, plc.pct)));
  }
  return { scan, plc, LIMITES };
}
module.exports = { criarProgramaDemo, LIMITES };
