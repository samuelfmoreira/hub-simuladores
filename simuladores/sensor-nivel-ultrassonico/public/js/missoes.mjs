// Missões do simulador. Cada check usa só o estado da sessão (o "retrato" que o servidor manda) e uma memória própria.
//   c   = estado da sessão        mem = memória da missão (objeto)        dt = segundos desde a última avaliação
// precisaClp: só vale com um CLP conectado e com o retorno do CLP ligado na sessão (o simulador lendo os sinaleiros).
// Este arquivo é carregado pela tela e também pelos testes (tools/teste.js), que cumprem cada missão automaticamente.
const clp = (c) => c.clp || {};
const comClp = (c) => !!(c.rede && c.rede.conectado && c.clp);
const medindo = (c) => c.med.status === 'ok';
const nenhumNivel = (c) => !clp(c).LALL_01 && !clp(c).LAL_01 && !clp(c).LAH_01 && !clp(c).LAHH_01;

export const MISSOES = [
  { id: 'com', precisaClp: false, titulo: 'Abrir a comunicação',
    texto: 'Configure o Modbus TCP Slave Device no CODESYS e conecte pela aba CLP. Online no CODESYS, o LT01_Bruto deve mostrar a mesma contagem da tela.',
    dica: 'O simulador é o cliente: quem precisa estar em RUN, escutando na porta 502, é o CLP.',
    check: (c) => !!(c.rede && c.rede.conectado) },
  { id: 'escala', precisaClp: true, titulo: 'Escalar o nível em %',
    texto: 'Converta LT01_Bruto em % e devolva em Nivel_Pct. A IHM do painel precisa mostrar o mesmo que o transmissor, com menos de 0,5 % de diferença, por 3 s.',
    dica: '% = bruto ÷ 32767 × 100. No Modbus, o Nivel_Pct viaja multiplicado por 100.',
    check: (c, mem, dt) => { const ok = comClp(c) && medindo(c) && c.med.pct > 5 && c.med.pct < 95 && Math.abs(clp(c).Nivel_Pct - c.med.pct) < 0.5; mem.t = ok ? (mem.t || 0) + dt : 0; return mem.t >= 3; } },
  { id: 'alto', precisaClp: true, titulo: 'Alarme de nível alto',
    texto: 'Leve o nível para a faixa de 81 a 89 %. Só o sinaleiro LAH pode acender.',
    dica: 'LAH liga em 80 %. O LAHH só entra em 90 %.',
    check: (c) => comClp(c) && medindo(c) && c.med.pct >= 81 && c.med.pct <= 89 && clp(c).LAH_01 && !clp(c).LAHH_01 && !clp(c).LAL_01 && !clp(c).LALL_01 },
  { id: 'muitoAlto', precisaClp: true, titulo: 'Alarme de nível muito alto',
    texto: 'Passe de 91 %. LAH e LAHH acendem juntos.',
    dica: 'O 100 % foi calibrado em 2,50 m; 91 % são 2,28 m.',
    check: (c) => comClp(c) && medindo(c) && c.med.pct >= 91 && clp(c).LAH_01 && clp(c).LAHH_01 },
  { id: 'baixos', precisaClp: true, titulo: 'Alarmes de nível baixo',
    texto: 'Esvazie até menos de 9 %. LAL e LALL acendem; os de nível alto ficam apagados.',
    dica: 'LAL liga em 20 % e LALL em 10 %.',
    check: (c) => comClp(c) && medindo(c) && c.med.pct <= 9 && clp(c).LAL_01 && clp(c).LALL_01 && !clp(c).LAH_01 && !clp(c).LAHH_01 },
  { id: 'histerese', precisaClp: true, titulo: 'Histerese do alarme',
    texto: 'Acenda o LAH acima de 81 %, baixe para 78,5 a 79,5 % com ele ainda aceso por 1 s, e só então apague abaixo de 77 %.',
    dica: 'Sem histerese o alarme pisca quando o nível fica em cima do limite. Ligue em 80 %, desligue em 78 %.',
    check: (c, mem, dt) => {
      if (!comClp(c) || !medindo(c)) return false;
      const p = c.med.pct, h = clp(c).LAH_01;
      if (!mem.e) { if (p >= 81 && h) mem.e = 1; }
      else if (mem.e === 1) { if (p >= 78.5 && p <= 79.5 && h) { mem.t = (mem.t || 0) + dt; if (mem.t >= 1) mem.e = 2; } else { mem.t = 0; if (!h) mem.e = 0; } }
      else if (mem.e === 2) { if (p < 77 && !h) return true; if (p > 81) mem.e = 1; }
      return false;
    } },
  { id: 'falha', precisaClp: true, titulo: 'Falha do transmissor',
    texto: 'Com o modo de falha em "< 3,6 mA", cubra o líquido de espuma até aparecer E013. O CLP precisa acender FALHA e apagar os alarmes de nível.',
    dica: 'Abaixo de 3,8 mA a contagem fica menor que −410. Nível baixo de verdade nunca passa de 0.',
    check: (c) => comClp(c) && c.med.erro === 'E013' && c.med.bruto < -410 && clp(c).Falha_LT01 && nenhumNivel(c) },
  { id: 'cabo', precisaClp: true, titulo: 'Cabo rompido',
    texto: 'Rompa o cabo do laço na Bancada. O CLP lê −8192 e precisa tratar como falha, não como tanque vazio.',
    dica: 'É a mesma regra da missão anterior: contagem menor que −410.',
    check: (c) => comClp(c) && c.proc.cabo === 1 && clp(c).Falha_LT01 && nenhumNivel(c) },
  { id: 'ecoFalso', precisaClp: false, titulo: 'Eco falso',
    texto: 'Coloque o obstáculo no feixe com o nível baixo, veja a leitura travar e corrija com a supressão de sinal falso.',
    dica: 'O sensor fica com "Eco válido" de novo quando o limiar cobre o eco do obstáculo.',
    check: (c, mem) => { if (c.med.status === 'falso') mem.viu = true; return !!mem.viu && c.proc.obstaculo === 1 && c.par.supressao === 1 && medindo(c); } },
  { id: 'falha22', precisaClp: true, titulo: 'A armadilha do 22 mA',
    texto: 'Troque o modo de falha para 22 mA e provoque a perda de eco. Observe o que o seu CLP conclui.',
    dica: 'O A/D deste CLP satura em 32767 com 20 mA. Com 22 mA o programa enxerga tanque cheio, com LAHH e sem FALHA. Por isso, neste cartão, o modo de falha seguro é "< 3,6 mA".',
    check: (c) => comClp(c) && c.med.status === 'falha' && c.par.modoFalha === 3 && c.med.bruto === 32767 && clp(c).LAHH_01 && !clp(c).Falha_LT01 },
];

/** Avalia todas as missões; devolve { id: true/false }. mems guarda a memória de cada uma entre as chamadas. */
export function avaliar(c, mems, dt) {
  const r = {};
  for (const m of MISSOES) { mems[m.id] = mems[m.id] || {}; try { r[m.id] = !!m.check(c, mems[m.id], dt); } catch (_) { r[m.id] = false; } }
  return r;
}
