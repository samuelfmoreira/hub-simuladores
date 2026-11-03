/* Assistente de comunicação com o CLP — etapas do CFW500 (EtherNet/IP).
 * Usa o componente comum assistente-clp.js e o que a tela expõe em window.CFW. */
(function () {
  'use strict';
  const C = () => window.CFW;
  const estado = () => (C() && C().estado()) || {};
  const ler = (n) => { const e = estado(); return e.vals ? e.vals[n] : undefined; };

  // textos das opções, para mostrar "1 (Sempre Remoto)" em vez de só "1"
  const OPC = {
    810: { 0: 'Parâmetros', 1: 'DHCP', 2: 'DCP' },
    220: { 0: 'Sempre Local', 1: 'Sempre Remoto', 2: 'Tecla HMI (LOC)', 3: 'Tecla HMI (REM)', 4: 'DIx' },
    222: { 0: 'Teclas HMI', 1: 'AI1', 11: 'Rede (CO/DN/PB/Eth)' },
    226: { 4: 'DIx', 9: 'Rede (H)', 10: 'Rede (AH)' },
    227: { 0: 'Tecla HMI', 1: 'DIx', 4: 'Rede (CO/DN/PB/Eth)' },
    228: { 1: 'Teclas HMI', 2: 'DIx', 5: 'Rede (CO/DN/PB/Eth)' },
    105: { 0: '1ª rampa', 1: '2ª rampa', 2: 'DIx', 5: 'Rede (CO/DN/DP)' },
    313: { 0: 'Inativo', 1: 'Para por rampa', 2: 'Desabilita geral', 5: 'Causa falha' },
    820: { 0: 'nenhuma', 3: 'P0003 (corrente)' },
    849: { 0: 'Operação normal', 1: 'Atualiza a config.' },
  };
  const fmt = (n, v) => (OPC[n] && OPC[n][v] !== undefined ? `${v} (${OPC[n][v]})` : String(v));

  function ipDoInversor() {
    const ini = String((estado().eip || {}).bindIni || '');
    return /^\d+\.\d+\.\d+\.\d+$/.test(ini) && ini !== '0.0.0.0' && !ini.startsWith('127.') ? ini : '192.168.100.20';
  }

  function etapas() {
    const ip = ipDoInversor(), o = ip.split('.').map(Number);
    return [
      { titulo: 'Endereço IP',
        porque: `O CLP encontra o inversor pelo <b>endereço IP</b>. De fábrica o CFW500 vem em <b>DHCP</b>: ele pede um IP a um servidor da rede. Numa máquina, normalmente não há esse servidor e o CLP precisa saber o IP de antemão, por isso se usa <b>IP fixo, programado nos parâmetros</b>. Ele precisa estar na mesma rede do CLP e ser único: aqui, <b>${ip}</b> (o CODESYS é o 192.168.100.10).`,
        hmi: `grupo <b>NET</b> → P0810 = 0 · P0811…P0814 = ${ip} · P0815 = 24. Partindo da fábrica (192.168.0.14), mudam: ${['P0810', ...[192, 168, 0, 14].map((f, k) => (o[k] !== f ? 'P081' + (k + 1) : null)).filter(Boolean)].join(', ')}.`,
        itens: [
          { n: 810, v: 0, nome: 'Origem do endereço IP', faz: 'de onde vem o IP: dos parâmetros, de um servidor DHCP ou por DCP' },
          { n: 811, v: o[0], nome: 'IP, 1º número', faz: `${o[0]}.x.x.x` },
          { n: 812, v: o[1], nome: 'IP, 2º número', faz: `x.${o[1]}.x.x` },
          { n: 813, v: o[2], nome: 'IP, 3º número', faz: `x.x.${o[2]}.x` },
          { n: 814, v: o[3], nome: 'IP, 4º número', faz: `x.x.x.${o[3]}: o número do inversor na rede` },
          { n: 815, v: 24, nome: 'Máscara (CIDR)', faz: '24 = 255.255.255.0: a rede é a dos três primeiros números' },
        ] },
      { titulo: 'Quem manda no inversor',
        porque: 'De fábrica, o inversor obedece à própria HMI e às entradas digitais: é a situação <b>LOCAL</b>. Estes parâmetros dizem: fique sempre em <b>REMOTO</b> e, em remoto, aceite <b>da rede</b> o comando de girar e parar, o sentido, a velocidade, o JOG e a escolha de rampa. Sem isso, o CLP conecta, mas o inversor ignora o que ele manda.',
        hmi: 'grupo <b>I/O</b> → P0105 = 5 · P0220 = 1 · P0222 = 11 · P0226 = 9 · P0227 = 4 · P0228 = 5.',
        itens: [
          { n: 220, v: 1, nome: 'Seleção LOC/REM', faz: 'sempre em remoto: o comando vem de fora da HMI' },
          { n: 227, v: 4, nome: 'Gira/Para em remoto', faz: 'quem manda girar e parar: a rede (Control Word bit 0)' },
          { n: 226, v: 9, nome: 'Sentido de giro em remoto', faz: 'quem escolhe o sentido: a rede (Control Word bit 2)' },
          { n: 222, v: 11, nome: 'Referência de velocidade em remoto', faz: 'de onde vem a velocidade: da rede (P0685, Speed Ref)' },
          { n: 228, v: 5, nome: 'JOG em remoto', faz: 'quem comanda o JOG: a rede' },
          { n: 105, v: 5, nome: 'Seleção da 1ª ou 2ª rampa', faz: 'quem escolhe a rampa: a rede' },
        ] },
      { titulo: 'Ler a corrente do motor pela rede',
        porque: 'De fábrica, a conexão EtherNet/IP leva ao CLP só <b>2 palavras</b>: a Status Word (P0680) e a velocidade (P0681). <b>A corrente não vai.</b> No CFW500, você escolhe o que vai nas palavras extras de leitura: o <b>P0820</b> (Leitura #3) diz qual parâmetro o inversor manda na <b>3ª palavra</b>. Com <b>P0820 = 3</b>, vai o <b>P0003, a corrente do motor, em décimos de ampère</b> (26 = 2,6 A). A conexão no CLP passa a ter <b>6 bytes de entrada</b> (e continua com 4 de saída). No CODESYS, essa palavra aparece em dois BYTEs, o baixo e o alto, que o programa junta e divide por 10.',
        hmi: 'grupo <b>NET</b> → ▲ 38 vezes a partir do P0308 (ou segure) até <b>P0820</b> → ENTER → ▲ 3 vezes → ENTER.',
        itens: [
          { n: 820, v: 3, nome: '3ª palavra de entrada (leitura #3)', faz: 'qual parâmetro o inversor manda na 3ª palavra: P0003, a corrente' },
        ] },
      { titulo: 'Segurança se a comunicação cair',
        porque: 'Se o cabo romper ou o CLP parar, o que o inversor faz? Com <b>P0313 = 1</b> ele <b>para o motor pela rampa</b> e mostra o alarme A0149. Sem uma ação definida, uma máquina poderia continuar andando sem ninguém no controle. No CFW500 esse já é o valor de fábrica: confira.',
        hmi: 'grupo <b>NET</b> → P0313 = 1.',
        itens: [
          { n: 313, v: 1, nome: 'Ação para erro de comunicação', faz: 'o que fazer se a rede cair: parar por rampa' },
        ] },
      { titulo: 'Aplicar',
        porque: 'As mudanças de rede (o IP e as palavras de troca) só passam a valer depois de <b>aplicadas</b>, como no inversor real. <b>P0849 = 1</b> reinicia a interface Ethernet: se o CLP estiver conectado, a conexão cai e volta. O P0849 volta sozinho para 0.',
        hmi: 'grupo <b>NET</b> → último parâmetro da lista (▼ no começo da lista) → P0849 = 1.',
        itens: [
          { n: 849, v: 1, nome: 'Atualiza a configuração Ethernet', faz: 'aplica o IP e as palavras de troca' },
        ] },
    ];
  }

  function resumo() {
    const ip = ipDoInversor();
    const l = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
    return `<p class="aclp-porque">O inversor está pronto. No CODESYS, configure o CFW500 com estes valores (o passo a passo completo está no <b>Guia</b> do HUB, Parte 3):</p>
      <table><tbody>
      ${l('Placa de rede do CLP (Ethernet)', '<b>SIM-HUB (192.168.100.10)</b>')}
      ${l('Arquivo EDS', '<b>eip_cfw500_ceth2_v11x.eds</b> (no HUB: Dispositivos → Inversor → Arquivos para o CLP)')}
      ${l('IP do CFW500 (aba General)', `<b>${ip}</b>`)}
      ${l('Conexão', '<b>100/150 Manufacturer Speed + I/O data</b>')}
      ${l('O→T, saída do CLP', '<b>4 bytes</b>: Control Word + Speed Ref')}
      ${l('T→O, entrada do CLP', '<b>6 bytes</b>: Status Word + Motor Speed + corrente')}
      ${l('Corrente do motor', '3ª palavra de entrada = <b>P0003 em décimos de ampère</b> (26 = 2,6 A). No I/O Mapping ela aparece em dois BYTEs: <b>…_Param2</b> (byte baixo) e <b>…_Param3</b> (byte alto). Guia, seção 3.4')}
      ${l('RPI', '10 a 30 ms')}
      </tbody></table>
      <p class="aclp-porque">Como conferir aqui no simulador: o display do inversor mostra <b>REM</b>, a aba Rede EtherNet/IP mostra <b>origem: parâmetros</b> e, quando o CODESYS entrar em RUN, o chip <b>P0801</b> fica em <b>Data Active</b>.</p>`;
  }

  function abrir() {
    if (!C()) return;
    window.AssistenteCLP.abrir({
      titulo: 'Assistente de comunicação com o CLP',
      subtitulo: 'CFW500 · EtherNet/IP · o mesmo que você faria parâmetro por parâmetro na HMI',
      etapas, ler, fmt, resumo,
      gravar: (n, v) => C().pedir('paramAssistente', { n, valor: v }),
      bloqueio: () => {
        const d = estado().drive || {};
        if (d.ligado === false) return 'O inversor está desenergizado. Energize-o no botão do topo.';
        if (d.pwm) return 'O motor está girando. Pare o motor antes: parâmetros de configuração só mudam com o motor parado (a HMI mostraria CONF).';
        return null;
      },
    });
  }
  document.querySelectorAll('[data-assistente]').forEach((b) => { b.addEventListener('click', abrir); });
})();
