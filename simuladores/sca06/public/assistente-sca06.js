/* Assistente de comunicação com o CLP — etapas do SCA06 + ECO5 (EtherNet/IP), firmware V2.1X.
 * Dois modos: velocidade e torque (P0202 = 6, conexão de 4 palavras) ou posição pela Função
 * Posicionador (P0202 = 3, conexão de 8 palavras, sem programar ladder). Usa assistente-clp.js e window.SCA06App. */
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
    99: { 0: 'Não habilitado', 1: 'Habilita', 2: 'Habilita sem salvar' },
    1077: { 0: 'Borda de subida', 1: 'Nível' },
    1151: { 1: 'Controle de Iq', 2: 'Controle de velocidade', 3: 'Posicionamento relativo', 5: 'Posicionamento absoluto', 7: 'Jog' },
  };
  const MAPA = { 52: 'fração de volta P0052', 53: 'voltas P0053', 6: 'estado do servo P0006', 48: 'erro de lag P0048', 99: 'habilitação P0099', 1079: 'disparo P01079', 1171: 'destino do movimento 1 P01171', 219: 'reset de falhas P0219' };
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
      ? [[820, 52, 'Palavra de entrada #5', 'o drive manda a fração de volta da posição (P0052, 16384 = 1 volta)'], [821, 53, 'Palavra de entrada #6', 'o número de voltas (P0053)'],
        [822, 6, 'Palavra de entrada #7', 'o estado do servo (P0006: 1 = habilitado, 2 = falha…)'], [823, 48, 'Palavra de entrada #8', 'o erro de lag (P0048): quanto falta para chegar'],
        [835, 99, 'Palavra de saída #5', 'o CLP habilita o drive (P0099: 2 habilita, 0 desabilita)'], [836, 1079, 'Palavra de saída #6', 'o CLP dispara o movimento (P01079: pulso 0 → 1)'],
        [837, 1171, 'Palavra de saída #7', 'o CLP escreve o destino do movimento 1 (P01171, fração de volta)'], [838, 219, 'Palavra de saída #8', 'o CLP reseta falhas (P0219: pulso 0 → 1)']]
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
          porque: 'De fábrica, o SCA06 vem com <b>P0202 = 2</b>: a velocidade vem da própria HMI. Com <b>P0202 = 3</b> entra a <b>Função Posicionador</b> do firmware: os movimentos ficam programados em parâmetros e o CLP só habilita, escolhe o destino e dispara, tudo pela rede. Não é preciso programar ladder. Nesse modo a palavra de controle fixa não vale: a habilitação é pelo <b>P0099</b>, que fica em 0 agora e é escrito pelo CLP depois. O drive precisa estar desabilitado.',
          hmi: '<b>▲ 37 vezes</b> até <b>P00202</b> → <b>P</b> → <b>P</b> → ▲ 1 vez (00003) → <b>P</b> · <b>P00099</b>: confira que vale 0.',
          itens: [
            { n: 202, v: 3, nome: 'Modo de operação', faz: 'Função Posicionador: movimentos programados em parâmetros' },
            { n: 99, v: 0, nome: 'Habilitação', faz: 'começa desabilitado; quem habilita é o CLP, pela 5ª palavra de saída' },
          ] }
        : { titulo: 'Quem manda no drive',
          porque: 'De fábrica, o SCA06 vem com <b>P0202 = 2</b>: a velocidade vem da própria HMI. Com <b>P0202 = 6</b> ele passa a obedecer às <b>palavras de saída do CLP</b>: palavra de controle, referência de velocidade, referência de torque e modo de controle. Sem isso, o CLP conecta, mas o drive ignora o que ele manda. O drive precisa estar desabilitado.',
          hmi: '<b>▲ 37 vezes</b> até <b>P00202</b> → <b>P</b> (mostra o valor) → <b>P</b> (o dígito pisca) → ▲ 4 vezes (00006) → <b>P</b>.',
          itens: [{ n: 202, v: 6, nome: 'Modo de operação', faz: 'Profibus DP/Ethernet: quem manda é o CLP pela rede' }] },
      ...(pos ? [
        { titulo: 'O movimento',
          porque: 'A Função Posicionador guarda até <b>10 movimentos</b> (P01151 a P01230). Aqui se programa o <b>movimento 1</b> como <b>posicionamento absoluto</b>: o disco vai até um destino. O destino (P01171, em fração de volta: <b>16384 = 1 volta</b>, 4096 = 90°) quem escreve é o CLP, pela rede. A velocidade e as rampas ficam aqui.',
          hmi: 'segure <b>▲</b> até <b>P01151</b> → 5 · <b>P01191</b> = 100 · <b>P01201</b> = 1000 · <b>P01211</b> = 1000.',
          itens: [
            { n: 1151, v: 5, nome: 'Tipo do movimento 01', faz: 'posicionamento absoluto: vai até o destino' },
            { n: 1191, v: 100, nome: 'Velocidade do movimento 01', faz: '100 rpm durante o posicionamento' },
            { n: 1201, v: 1000, nome: 'Aceleração do movimento 01', faz: '1000 rpm/s para ganhar velocidade' },
            { n: 1211, v: 1000, nome: 'Desaceleração do movimento 01', faz: '1000 rpm/s para frear até o destino' },
          ] },
        { titulo: 'O ciclo e o disparo',
          porque: 'Os movimentos são executados em <b>ciclos</b> (até 10, cada um com até 5 movimentos). O <b>ciclo 1</b> fica só com o movimento 1. O <b>P01080 = 1</b> diz que o disparo pelo parâmetro <b>P01079</b> aciona o ciclo 1, e o <b>P01077 = 0</b> faz o disparo na <b>borda de subida</b>: cada vez que o CLP muda o P01079 de 0 para 1, o disco vai para o destino.',
          hmi: 'segure <b>▲</b> até <b>P01077</b> → 0 · <b>P01080</b> = 1 · <b>P01101</b> = 1 · <b>P01102</b> = 0.',
          itens: [
            { n: 1077, v: 0, nome: 'Acionamento por borda ou nível', faz: 'borda de subida: um disparo por pulso' },
            { n: 1080, v: 1, nome: 'Ciclo acionado pelo P01079', faz: 'o disparo aciona o ciclo 1' },
            { n: 1101, v: 1, nome: 'Primeiro movimento do ciclo 01', faz: 'o ciclo 1 executa o movimento 1' },
            { n: 1102, v: 0, nome: 'Segundo movimento do ciclo 01', faz: '0 = fim do ciclo' },
          ] },
      ] : []),
      { titulo: 'O que vai nas palavras de troca',
        porque: pos
          ? 'A conexão sempre troca <b>4 palavras fixas</b> em cada sentido (no modo 3 as saídas fixas são ignoradas). Para posicionar, o CLP precisa de mais 4 em cada sentido, e cada uma aponta para um parâmetro: nas <b>saídas</b> (P0835…P0838) o CLP escreve a habilitação, o disparo, o destino e o reset; nas <b>entradas</b> (P0820…P0823) o drive manda a posição (fração e voltas), o estado e o erro de lag. A conexão no CLP passa a ter <b>8 palavras (16 bytes) em cada sentido</b>.'
          : 'A conexão troca <b>4 palavras fixas</b> em cada sentido: no CLP, 8 bytes de entrada e 8 de saída. As palavras extras (P0820…P0823 e P0835…P0838) ficam <b>zeradas</b>: assim, se o drive já tinha sido configurado para posição, a conexão volta a ter 4 palavras.',
        hmi: pos ? '<b>P00820</b> = 52, P00821 = 53, P00822 = 6, P00823 = 48 · <b>P00835</b> = 99, P00836 = 1079, P00837 = 1171, P00838 = 219.'
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
      ${pos ? l('Para habilitar', '5ª palavra de saída (P0099) = <b>2</b>; 0 desabilita') + l('Destino', '7ª palavra de saída (P01171): fração de volta, <b>16384 = 1 volta</b> (90° = 4096)') + l('Disparar', '6ª palavra de saída (P01079): pulso <b>0 → 1</b>') + l('Posição atual', '5ª e 6ª palavras de entrada: (P0053 + P0052 / 16384) × 360 = graus')
        : l('Para habilitar', 'bit 3 da 1ª palavra de saída (palavra de controle)') + l('Modo de controle (4ª palavra de saída)', '<b>1 = velocidade</b>, 0 = torque')}
      </tbody></table>
      <p class="aclp-porque">Como conferir aqui no simulador: o chip <b>P0202</b> do topo mostra <b>${pos ? 3 : 6}</b> e, quando o CODESYS entrar em RUN, o chip <b>P0801</b> fica em <b>Data Active</b>.</p>`;
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
        { id: 'pos', nome: 'Posição (Função Posicionador)', texto: 'O CLP diz para onde o disco vai (ex.: 90°) e dispara o movimento. No drive: P0202 = 3, movimentos programados em parâmetros, sem ladder. No CLP: conexão de 8 palavras.' },
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
