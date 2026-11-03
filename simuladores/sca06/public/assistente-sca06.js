/* Assistente de comunicação com o CLP — etapas do SCA06 + ECO5 (EtherNet/IP).
 * Dois modos: velocidade e torque (P0202 = 6, conexão de 4 palavras) ou posição pelo aplicativo
 * Ladder DISCO_POS (P0202 = 4, conexão de 8 palavras). Usa assistente-clp.js e window.SCA06App. */
(function () {
  'use strict';
  const A = () => window.SCA06App;
  const ler = (n) => { const a = A(); return a && a.S.P ? a.S.P[n] : undefined; };

  const OPC = {
    0: { 0: 'bloqueada', 5: 'liberada' },
    202: { 1: 'Modo Torque', 2: 'Modo Velocidade (HMI)', 3: 'Função Posicionador', 4: 'Ladder', 5: 'CANopen/DeviceNet/EtherCAT', 6: 'Profibus DP/Ethernet' },
    662: { 0: 'Mostra alarme', 1: 'Gera falha', 2: 'Executa função STOP', 3: 'Desabilita drive' },
    810: { 0: 'Parâmetros', 1: 'DHCP' },
    849: { 0: 'Operação normal', 1: 'Atualiza configuração' },
    1020: { 0: 'Para programa', 1: 'Executa programa' },
  };
  const MAPA = { 1100: 'comando', 1101: 'alvo/incremento', 1102: 'velocidade', 1103: 'tipo de movimento', 1110: 'status', 1111: 'posição atual', 1112: 'erro de posição', 1113: 'posicionamentos' };
  const fmt = (n, v) => {
    if (OPC[n] && OPC[n][v] !== undefined) return `${v} (${OPC[n][v]})`;
    if ((n >= 820 && n <= 823) || (n >= 835 && n <= 838)) return v ? `${v} (${MAPA[v] || 'P' + v})` : '0 (nenhuma)';
    return String(v);
  };

  function ipDoDrive() {
    const a = A(); const ip = String((a && (a.S.deviceIp || (a.S.info && a.S.info.deviceIp))) || '');
    return /^\d+\.\d+\.\d+\.\d+$/.test(ip) && ip !== '0.0.0.0' && !ip.startsWith('127.') ? ip : '192.168.100.22';
  }

  function etapas(modo) {
    const ip = ipDoDrive(), o = ip.split('.').map(Number), pos = modo === 'pos';
    const mudam = ['P0810', ...[192, 168, 0, 10].map((f, k) => (o[k] !== f ? 'P081' + (k + 1) : null)).filter(Boolean)].join(', ');
    const extras = pos
      ? [[820, 1110, 'Palavra de entrada #5', 'o drive manda o status do posicionamento (P1110)'], [821, 1111, 'Palavra de entrada #6', 'a posição atual (P1111)'],
        [822, 1112, 'Palavra de entrada #7', 'o erro de posição (P1112)'], [823, 1113, 'Palavra de entrada #8', 'quantos movimentos terminaram (P1113)'],
        [835, 1100, 'Palavra de saída #5', 'o CLP escreve o comando: habilita, pulso, STOP… (P1100)'], [836, 1101, 'Palavra de saída #6', 'o destino ou o incremento (P1101)'],
        [837, 1102, 'Palavra de saída #7', 'a velocidade do movimento (P1102)'], [838, 1103, 'Palavra de saída #8', 'o tipo de movimento (P1103)']]
      : [[820, 0, 'Palavra de entrada #5', 'sem palavra extra'], [821, 0, 'Palavra de entrada #6', 'sem palavra extra'], [822, 0, 'Palavra de entrada #7', 'sem palavra extra'],
        [823, 0, 'Palavra de entrada #8', 'sem palavra extra'], [835, 0, 'Palavra de saída #5', 'sem palavra extra'], [836, 0, 'Palavra de saída #6', 'sem palavra extra'],
        [837, 0, 'Palavra de saída #7', 'sem palavra extra'], [838, 0, 'Palavra de saída #8', 'sem palavra extra']];
    return [
      { titulo: 'Liberar a senha',
        porque: 'O SCA06 protege os parâmetros com <b>senha</b>: sem ela, a HMI só mostra os valores e recusa alterações. Com <b>P0000 = 5</b> os parâmetros podem ser alterados.',
        hmi: 'display em <b>P00000</b> → <b>P</b> → <b>▲ 5 vezes</b> → <b>P</b>.',
        itens: [{ n: 0, v: 5, nome: 'Acesso aos parâmetros', faz: 'a senha: 5 libera a alteração' }] },
      { titulo: 'Endereço IP',
        porque: `O CLP encontra o drive pelo <b>endereço IP</b> do módulo ECO5. De fábrica ele vem em <b>DHCP</b>: pede um IP a um servidor da rede. Numa máquina, normalmente não há esse servidor e o CLP precisa saber o IP de antemão, por isso se usa <b>IP fixo, programado nos parâmetros</b>. Ele precisa estar na mesma rede do CLP e ser único: aqui, <b>${ip}</b> (o CODESYS é o 192.168.100.10).`,
        hmi: `<b>▲</b> até <b>P00810</b> → 0 · P00811…P00814 = ${ip} · P00815 = 24. Partindo da fábrica (192.168.0.10), mudam: ${mudam}.`,
        itens: [
          { n: 810, v: 0, nome: 'Configuração do endereço IP', faz: 'de onde vem o IP: dos parâmetros ou de um servidor DHCP' },
          { n: 811, v: o[0], nome: 'IP, 1º número', faz: `${o[0]}.x.x.x` },
          { n: 812, v: o[1], nome: 'IP, 2º número', faz: `x.${o[1]}.x.x` },
          { n: 813, v: o[2], nome: 'IP, 3º número', faz: `x.x.${o[2]}.x` },
          { n: 814, v: o[3], nome: 'IP, 4º número', faz: `x.x.x.${o[3]}: o número do drive na rede` },
          { n: 815, v: 24, nome: 'Máscara (CIDR)', faz: '24 = 255.255.255.0: a rede é a dos três primeiros números' },
        ] },
      pos
        ? { titulo: 'Quem manda no drive',
          porque: 'De fábrica, o SCA06 vem com <b>P0202 = 2</b>: a velocidade vem da própria HMI. Para posicionar pela rede, o manual Ethernet manda usar o <b>modo Ladder (P0202 = 4)</b>: um aplicativo de posicionamento roda dentro do drive (aqui, o DISCO_POS) e o CLP conversa com ele por parâmetros do usuário. O <b>P1020 = 1</b> mantém esse aplicativo em execução. O drive precisa estar desabilitado.',
          hmi: '<b>P00202</b> → <b>P</b> → <b>P</b> → ▲ 2 vezes (00004) → <b>P</b> · <b>P01020</b>: confira que vale 1.',
          itens: [
            { n: 202, v: 4, nome: 'Modo de operação', faz: 'Ladder: o aplicativo de posicionamento comanda o motor' },
            { n: 1020, v: 1, nome: 'Comando da PLC (Ladder)', faz: 'mantém o aplicativo em execução (já vem 1 de fábrica)' },
          ] }
        : { titulo: 'Quem manda no drive',
          porque: 'De fábrica, o SCA06 vem com <b>P0202 = 2</b>: a velocidade vem da própria HMI. Com <b>P0202 = 6</b> ele passa a obedecer às <b>palavras de saída do CLP</b>: palavra de controle, referência de velocidade, referência de torque e modo de controle. Sem isso, o CLP conecta, mas o drive ignora o que ele manda. O drive precisa estar desabilitado.',
          hmi: '<b>▲ 37 vezes</b> até <b>P00202</b> → <b>P</b> (mostra o valor) → <b>P</b> (o dígito pisca) → ▲ 4 vezes (00006) → <b>P</b>.',
          itens: [{ n: 202, v: 6, nome: 'Modo de operação', faz: 'Profibus DP/Ethernet: quem manda é o CLP pela rede' }] },
      { titulo: 'O que vai nas palavras de troca',
        porque: pos
          ? 'A conexão sempre troca <b>4 palavras fixas</b> em cada sentido. Para posicionar, o CLP precisa de mais 4 em cada sentido, que conversam com o aplicativo de posicionamento: nas <b>entradas</b> (P0820…P0823) o drive manda status, posição, erro e contador; nas <b>saídas</b> (P0835…P0838) o CLP escreve comando, destino, velocidade e tipo de movimento. A conexão no CLP passa a ter <b>8 palavras (16 bytes) em cada sentido</b>.'
          : 'A conexão troca <b>4 palavras fixas</b> em cada sentido: no CLP, 8 bytes de entrada e 8 de saída. As palavras extras (P0820…P0823 e P0835…P0838) ficam <b>zeradas</b>: assim, se o drive já tinha sido configurado para posição, a conexão volta a ter 4 palavras.',
        hmi: pos ? '<b>P00820</b> = 1110 (◄ ▲ ◄ ▲ ◄ ▲), P00821 = 1111, P00822 = 1112, P00823 = 1113 · <b>P00835</b> = 1100 (◄ ◄ ▲ ◄ ▲), P00836 = 1101, P00837 = 1102, P00838 = 1103.'
          : 'confira <b>P00820</b>…P00823 e <b>P00835</b>…P00838 = 0 (de fábrica já vêm zerados).',
        itens: extras.map(([n, v, nome, faz]) => ({ n, v, nome, faz })) },
      { titulo: 'Segurança se a comunicação cair',
        porque: 'Se o cabo romper ou o CLP parar, o que o drive faz? De fábrica (<b>P0662 = 0</b>) ele só mostra o alarme e o motor <b>continua girando</b> com a última referência: perigoso numa máquina. Com <b>P0662 = 3</b> ele <b>desabilita</b> o motor.',
        hmi: '<b>▲</b> até <b>P00662</b> → <b>P</b> → ▲ 3 vezes → <b>P</b>.',
        itens: [{ n: 662, v: 3, nome: 'Ação para erro de comunicação', faz: 'o que fazer se a rede cair: desabilitar o drive' }] },
      { titulo: 'Aplicar',
        porque: 'As mudanças de rede (o IP e as palavras de troca) só passam a valer depois de <b>aplicadas</b>, como no drive real. <b>P0849 = 1</b> reinicia a interface Ethernet: se o CLP estiver conectado, a conexão cai e volta. O P0849 volta sozinho para 0.',
        hmi: '<b>▲</b> até <b>P00849</b> → <b>P</b> → ▲ → <b>P</b>.',
        itens: [{ n: 849, v: 1, nome: 'Atualiza a configuração Ethernet', faz: 'aplica o IP e as palavras de troca' }] },
    ];
  }

  function resumo(modo) {
    const ip = ipDoDrive(), pos = modo === 'pos';
    const l = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
    return `<p class="aclp-porque">O drive está pronto. No CODESYS, configure o SCA06 com estes valores (o passo a passo completo está no <b>Guia</b> do HUB, ${pos ? 'Parte 8' : 'Partes 2 e 3'}):</p>
      <table><tbody>
      ${l('Placa de rede do CLP (Ethernet)', '<b>SIM-HUB (192.168.100.10)</b>')}
      ${l('Arquivo EDS', '<b>0355002B00060200_SCA06_SIM.eds</b> (no HUB: Dispositivos → Servomotor → Arquivos para o CLP)')}
      ${l('IP do SCA06 (aba General)', `<b>${ip}</b>`)}
      ${l('Conexão', pos ? '<b>Exclusive Owner, 8 palavras (posicao)</b>' : '<b>Exclusive Owner, 4 palavras (velocidade e torque)</b>')}
      ${l('O→T e T→O', pos ? '<b>16 bytes</b> em cada sentido' : '<b>8 bytes</b> em cada sentido')}
      ${l('RPI', '10 a 30 ms')}
      ${pos ? l('Para habilitar', 'bit 0 da 5ª palavra de saída (P1100)') + l('O pulso', 'bit 1 da 5ª palavra de saída: cada subida 0 → 1 inicia um movimento')
        : l('Para habilitar', 'bit 3 da 1ª palavra de saída (palavra de controle)') + l('Modo de controle (4ª palavra de saída)', '<b>1 = velocidade</b>, 0 = torque')}
      </tbody></table>
      <p class="aclp-porque">Como conferir aqui no simulador: o chip <b>P0202</b> do topo mostra <b>${pos ? 4 : 6}</b> e, quando o CODESYS entrar em RUN, o chip <b>P0801</b> fica em <b>Data Active</b>.</p>`;
  }

  function abrir() {
    if (!A()) return;
    window.AssistenteCLP.abrir({
      titulo: 'Assistente de comunicação com o CLP',
      subtitulo: 'SCA06 + ECO5 · EtherNet/IP · o mesmo que você faria parâmetro por parâmetro na HMI',
      perguntaModo: 'Como o CLP vai comandar o servomotor?',
      textoModo: 'Escolha o modo de controle. Cada modo pede uma configuração diferente no drive e uma conexão diferente no CLP; o assistente mostra as etapas do modo escolhido.',
      modos: [
        { id: 'vel', nome: 'Velocidade e torque', texto: 'O CLP diz quão rápido girar (rpm) ou com quanta força (A). No drive: P0202 = 6. No CLP: conexão de 4 palavras.' },
        { id: 'pos', nome: 'Posição (absoluta e por pulso)', texto: 'O CLP diz para onde o disco vai (ex.: 90°) ou quantos graus andar a cada pulso (ex.: 45°). No drive: P0202 = 4. No CLP: conexão de 8 palavras.' },
      ],
      etapas, ler, fmt, resumo,
      gravar: async (n, v) => {
        const r = (await A().req({ t: 'param', n, v, hmi: true })).result;
        const MOT = { RO: 'parâmetro somente leitura', RANGE: 'valor fora da faixa', ENABLED: 'desabilite o drive antes (A00124)', NOEXIST: 'parâmetro inexistente', LOCKED: 'senha não liberada (P0000 = 5)' };
        if (r && r.ok && A().buildParams) A().buildParams();
        return r && r.ok ? { ok: true } : { ok: false, msg: MOT[r && r.code] || (r && r.code) || 'erro' };
      },
      bloqueio: () => {
        const v = A().S.v || {};
        if (v.enabled) return 'O drive está habilitado. Desabilite-o antes (pelo CLP ou pela aba Mestre): o modo de operação só muda com o drive desabilitado.';
        return null;
      },
    });
  }
  document.querySelectorAll('[data-assistente]').forEach((b) => { b.addEventListener('click', abrir); });
})();
