/* Exercícios interativos das aulas. Numa aula, a linha ":::widget nome" vira um destes. */
(function () {
  'use strict';
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hex = (n, d = 2) => (n >>> 0).toString(16).toUpperCase().padStart(d, '0');
  const W = {};

  function casca(el, titulo, html) {
    el.innerHTML = `<h4>${esc(titulo)}</h4><div class="corpo">${html}</div>`;
    return el.querySelector('.corpo');
  }
  const val = (raiz, sel) => raiz.querySelector(sel).value;

  // =================================================================== Modbus TCP: quadro byte a byte
  const CORES = { tid: '#7D878A', pid: '#A3ABAD', len: '#8E7CC3', uid: '#D99000', fc: '#1D5BA6', end: '#00808A', qtd: '#2F9E44', bc: '#B5651D', dados: '#C5362C' };
  const FCS = {
    1: { nome: 'Ler coils (bobinas)', tipo: 'qtd', max: 2000, faixa: '0xxxx', base: 1 },
    2: { nome: 'Ler entradas discretas', tipo: 'qtd', max: 2000, faixa: '1xxxx', base: 10001 },
    3: { nome: 'Ler holding registers', tipo: 'qtd', max: 125, faixa: '4xxxx', base: 40001 },
    4: { nome: 'Ler input registers', tipo: 'qtd', max: 125, faixa: '3xxxx', base: 30001 },
    5: { nome: 'Escrever 1 coil', tipo: 'coil', faixa: '0xxxx', base: 1 },
    6: { nome: 'Escrever 1 registrador', tipo: 'reg', faixa: '4xxxx', base: 40001 },
    15: { nome: 'Escrever vários coils', tipo: 'coils', max: 1968, faixa: '0xxxx', base: 1 },
    16: { nome: 'Escrever vários registradores', tipo: 'regs', max: 123, faixa: '4xxxx', base: 40001 },
  };
  W['modbus-quadro'] = (el) => {
    const c = casca(el, 'Monte um quadro Modbus TCP', `
      <div class="linha">
        <label>Função<select class="campo" data-k="fc">${Object.entries(FCS).map(([k, f]) => `<option value="${k}" ${k === '3' ? 'selected' : ''}>FC${k.padStart(2, '0')} · ${f.nome}</option>`).join('')}</select></label>
        <label>Endereço (offset)<input class="campo porta" data-k="end" type="number" min="0" max="65535" value="0"></label>
        <label data-p="qtd">Quantidade<input class="campo porta" data-k="qtd" type="number" min="1" value="2"></label>
        <label data-p="coil" hidden>Valor<select class="campo" data-k="coil"><option value="1">Ligar (FF00)</option><option value="0">Desligar (0000)</option></select></label>
        <label data-p="reg" hidden>Valor (0 a 65535)<input class="campo porta" data-k="reg" type="number" min="-32768" max="65535" value="1500"></label>
        <label data-p="lista" hidden>Valores, separados por vírgula<input class="campo" data-k="lista" value="1,0,1,1" style="width:22ch"></label>
        <label>Unit ID<input class="campo porta" data-k="uid" type="number" min="0" max="255" value="1"></label>
        <label>Transação<input class="campo porta" data-k="tid" type="number" min="0" max="65535" value="1"></label>
      </div>
      <div><strong>Pergunta do cliente (CLP ou IHM)</strong></div>
      <div class="bytes" data-saida="req"></div>
      <div class="campos-quadro" data-saida="campos"></div>
      <p data-saida="modicon" style="margin:12px 0 4px"></p>
      <div><strong>Resposta normal do servidor</strong></div>
      <div class="bytes" data-saida="resp"></div>
      <p data-saida="exc" style="margin:4px 0 0;color:var(--grafite-2);font-size:14px"></p>`);

    function montar() {
      const fc = +val(c, '[data-k=fc]'); const f = FCS[fc];
      c.querySelector('[data-p=qtd]').hidden = f.tipo !== 'qtd';
      c.querySelector('[data-p=coil]').hidden = f.tipo !== 'coil';
      c.querySelector('[data-p=reg]').hidden = f.tipo !== 'reg';
      c.querySelector('[data-p=lista]').hidden = !['coils', 'regs'].includes(f.tipo);
      if (f.tipo === 'coils' && !/^[01,\s]+$/.test(val(c, '[data-k=lista]'))) c.querySelector('[data-k=lista]').value = '1,0,1,1';
      const end = Math.max(0, Math.min(65535, +val(c, '[data-k=end]') | 0));
      const uid = +val(c, '[data-k=uid]') & 255; const tid = +val(c, '[data-k=tid]') & 0xFFFF;
      const campos = []; // [chave, rótulo, bytes[], explicação]
      const u16 = (n) => [(n >> 8) & 255, n & 255];
      let pdu = [[ 'fc', 'Função', [fc], `FC${fc} = ${f.nome.toLowerCase()}` ], [ 'end', 'Endereço inicial', u16(end), `offset ${end} (começa em 0)` ]];
      let qtd = 1; let erro = '';
      let resp = [];
      if (f.tipo === 'qtd') {
        qtd = +val(c, '[data-k=qtd]') | 0;
        if (qtd < 1 || qtd > f.max) erro = `Quantidade fora do limite: de 1 a ${f.max} para FC${fc}.`;
        pdu.push(['qtd', 'Quantidade', u16(qtd), `${qtd} ${fc <= 2 ? 'bits' : 'registradores'}`]);
        const nb = fc <= 2 ? Math.ceil(qtd / 8) : qtd * 2;
        resp = [[fc], [nb], new Array(Math.min(nb, 40)).fill(0)];
      } else if (f.tipo === 'coil') {
        const v = val(c, '[data-k=coil]') === '1' ? 0xFF00 : 0;
        pdu.push(['qtd', 'Valor', u16(v), v ? 'FF00 = liga (qualquer outro valor é inválido)' : '0000 = desliga']);
        resp = [[fc], u16(end), u16(v)];
      } else if (f.tipo === 'reg') {
        const v = (+val(c, '[data-k=reg]') | 0) & 0xFFFF;
        pdu.push(['qtd', 'Valor', u16(v), `${v} (0x${hex(v, 4)})`]);
        resp = [[fc], u16(end), u16(v)];
      } else {
        const itens = val(c, '[data-k=lista]').split(',').map((x) => x.trim()).filter((x) => x !== '');
        qtd = itens.length;
        if (!qtd || qtd > f.max) erro = `Informe de 1 a ${f.max} valores.`;
        let dados;
        if (f.tipo === 'coils') {
          dados = new Array(Math.ceil(qtd / 8)).fill(0);
          itens.forEach((b, k) => { if (b === '1') dados[k >> 3] |= 1 << (k & 7); });
        } else dados = itens.flatMap((v) => u16((+v | 0) & 0xFFFF));
        pdu.push(['qtd', 'Quantidade', u16(qtd), `${qtd} ${f.tipo === 'coils' ? 'coils' : 'registradores'}`]);
        pdu.push(['bc', 'Contagem de bytes', [dados.length], `${dados.length} bytes de dados a seguir`]);
        pdu.push(['dados', 'Dados', dados, f.tipo === 'coils' ? 'bits empacotados: o 1º coil é o bit 0 do 1º byte' : 'cada registrador em 2 bytes, byte alto primeiro (big-endian)']);
        resp = [[fc], u16(end), u16(qtd)];
      }
      if (end + qtd > 65536) erro = 'Endereço + quantidade passa de 65535.';
      const tamPdu = pdu.reduce((s, p) => s + p[2].length, 0);
      campos.push(['tid', 'Transação', u16(tid), 'número da pergunta; a resposta repete o mesmo valor']);
      campos.push(['pid', 'Protocolo', [0, 0], 'sempre 0 = Modbus']);
      campos.push(['len', 'Comprimento', u16(tamPdu + 1), `${tamPdu + 1} bytes depois deste campo (Unit ID + PDU)`]);
      campos.push(['uid', 'Unit ID', [uid], 'endereço do escravo; no TCP puro costuma ser 1 ou 255']);
      campos.push(...pdu);

      c.querySelector('[data-saida=req]').innerHTML = campos.flatMap(([k, , bytes]) => bytes.map((b) => `<span class="byte" data-c="${k}" style="--c:${CORES[k]}">${hex(b)}</span>`)).join('');
      c.querySelector('[data-saida=campos]').innerHTML = campos.map(([k, r, b, e]) => `<div data-c="${k}" style="--c:${CORES[k]}"><i></i><b>${r}</b><span>${e}${b.length > 1 ? ` · ${b.length} bytes` : ''}</span></div>`).join('') +
        (erro ? `<div><i style="background:var(--led-vermelho)"></i><b class="erro-txt">Inválido</b><span class="erro-txt">${erro}</span></div>` : '');
      const fim = end + Math.max(qtd, 1) - 1;
      c.querySelector('[data-saida=modicon]').innerHTML = `No estilo de tabela (${f.faixa}), isso é <b>${f.base + end}</b>${qtd > 1 ? ` a <b>${f.base + fim}</b>` : ''}. Muitos manuais e IHMs usam essa numeração, que começa em 1; no quadro vai o offset, que começa em 0.`;
      const r = resp.flat();
      const respComp = r.length + 1;
      c.querySelector('[data-saida=resp]').innerHTML = [...u16(tid), 0, 0, ...u16(respComp), uid].map((b, k) => `<span class="byte" style="--c:${CORES[['tid', 'tid', 'pid', 'pid', 'len', 'len', 'uid'][k]]}">${hex(b)}</span>`).join('') +
        r.map((b, k) => `<span class="byte" style="--c:${k === 0 ? CORES.fc : CORES.dados}">${hex(b)}</span>`).join('') + (f.tipo === 'qtd' && resp[2].length >= 40 ? ' …' : '');
      c.querySelector('[data-saida=exc]').textContent = `Se o endereço não existir, o servidor responde com exceção: função ${hex(fc | 0x80)} (FC + 80h) e código 02 (endereço ilegal).`;
    }
    c.addEventListener('input', montar);
    c.addEventListener('mouseover', (e) => {
      const k = e.target.closest('[data-c]')?.dataset.c;
      c.querySelectorAll('[data-ativo]').forEach((x) => x.removeAttribute('data-ativo'));
      if (k) c.querySelectorAll(`[data-c="${k}"]`).forEach((x) => x.setAttribute('data-ativo', ''));
    });
    montar();
  };

  // =================================================================== 32 bits em dois registradores
  const ORDENS = { ABCD: [0, 1, 2, 3], CDAB: [2, 3, 0, 1], BADC: [1, 0, 3, 2], DCBA: [3, 2, 1, 0] };
  W['registro-32'] = (el) => {
    const c = casca(el, 'Valor de 32 bits em dois registradores', `
      <div class="linha">
        <label>Valor<input class="campo" data-k="v" value="123.45" style="width:14ch"></label>
        <label>Tipo<select class="campo" data-k="t"><option value="real">REAL (float)</option><option value="dint">DINT (com sinal)</option><option value="udint">UDINT (sem sinal)</option></select></label>
        <label>Ordem das palavras<select class="campo" data-k="o"><option>ABCD</option><option>CDAB</option><option>BADC</option><option>DCBA</option></select></label>
      </div>
      <div class="resultado" data-saida="ida"></div>
      <h4 style="margin:18px 0 6px;font-size:17px">Do outro lado: chegaram estes dois registradores</h4>
      <div class="linha">
        <label>Registrador 1 (hex)<input class="campo porta" data-k="r1" value="42F6"></label>
        <label>Registrador 2 (hex)<input class="campo porta" data-k="r2" value="E666"></label>
      </div>
      <table class="tabela" data-saida="volta"></table>`);
    const dv = new DataView(new ArrayBuffer(4));
    function bytesDe(v, t) {
      if (t === 'real') dv.setFloat32(0, Number(v)); else if (t === 'dint') dv.setInt32(0, Math.trunc(Number(v))); else dv.setUint32(0, Math.trunc(Number(v)) >>> 0);
      return [0, 1, 2, 3].map((i) => dv.getUint8(i));
    }
    function calc() {
      const t = val(c, '[data-k=t]'); const o = val(c, '[data-k=o]');
      const v = val(c, '[data-k=v]').replace(',', '.');
      if (v === '' || isNaN(Number(v))) { c.querySelector('[data-saida=ida]').innerHTML = '<span class="erro-txt">Digite um número.</span>'; return; }
      const b = bytesDe(v, t); const x = ORDENS[o].map((i) => b[i]);
      const r1 = (x[0] << 8) | x[1]; const r2 = (x[2] << 8) | x[3];
      c.querySelector('[data-saida=ida]').innerHTML = `<dl>
        <dt>Bytes (A B C D)</dt><dd>${b.map((n) => hex(n)).join(' ')}</dd>
        <dt>Registrador 1</dt><dd>${hex(r1, 4)}h = ${r1}</dd>
        <dt>Registrador 2</dt><dd>${hex(r2, 4)}h = ${r2}</dd></dl>`;
    }
    function volta() {
      const r1 = parseInt(val(c, '[data-k=r1]'), 16) & 0xFFFF; const r2 = parseInt(val(c, '[data-k=r2]'), 16) & 0xFFFF;
      const rec = [r1 >> 8, r1 & 255, r2 >> 8, r2 & 255];
      const linhas = Object.entries(ORDENS).map(([nome, ord]) => {
        const b = [0, 0, 0, 0]; ord.forEach((origem, k) => { b[origem] = rec[k]; });
        b.forEach((n, i) => dv.setUint8(i, n));
        const f = dv.getFloat32(0); const di = dv.getInt32(0);
        return `<tr><td><code>${nome}</code></td><td>${Number.isFinite(f) ? +f.toPrecision(7) : f}</td><td>${di}</td></tr>`;
      });
      c.querySelector('[data-saida=volta]').innerHTML = `<thead><tr><th>Se a ordem for</th><th>REAL</th><th>DINT</th></tr></thead><tbody>${linhas.join('')}</tbody>`;
    }
    c.addEventListener('input', () => { calc(); volta(); });
    calc(); volta();
  };

  // =================================================================== escala de referência / velocidade
  const PRESETS = {
    cfw500: { nome: 'CFW500: velocidade 13 bits (8192 = P0403)', un: 'Hz', eng: 60, cru: 8192, extra: 'P0403 (Hz)' },
    sca06: { nome: 'SCA06: velocidade (7FFFh = 18750 rpm)', un: 'rpm', eng: 18750, cru: 32767 },
    livre: { nome: 'Escala livre', un: 'unid.', eng: 100, cru: 27648, extra: 'Fundo de escala' },
  };
  W['escala'] = (el) => {
    const c = casca(el, 'Conversor de escala', `
      <div class="linha">
        <label>Equipamento<select class="campo" data-k="p">${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.nome}</option>`).join('')}</select></label>
        <label data-p="extra">P0403 (Hz)<input class="campo porta" data-k="eng" type="number" value="60"></label>
        <label data-p="cru">Valor cru do fundo de escala<input class="campo porta" data-k="cru" type="number" value="8192"></label>
      </div>
      <div class="linha">
        <label><span data-saida="un">Em Hz</span><input class="campo porta" data-k="valor" type="number" step="any" value="30"></label>
        <span style="padding-bottom:8px">⇄</span>
        <label>Na rede (palavra de 16 bits)<input class="campo porta" data-k="raw" type="number" value="4096"></label>
      </div>
      <div class="resultado" data-saida="r"></div>`);
    let p = PRESETS.cfw500;
    function aplicarPreset() {
      p = PRESETS[val(c, '[data-k=p]')];
      c.querySelector('[data-p=extra]').hidden = !p.extra;
      c.querySelector('[data-p=extra]').firstChild.textContent = p.extra || '';
      c.querySelector('[data-p=cru]').hidden = val(c, '[data-k=p]') !== 'livre';
      c.querySelector('[data-k=eng]').value = p.eng; c.querySelector('[data-k=cru]').value = p.cru;
      c.querySelector('[data-saida=un]').textContent = `Em ${p.un}`;
    }
    function mostrar(raw) {
      const s16 = raw > 32767 ? raw - 65536 : raw;
      c.querySelector('[data-saida=r]').innerHTML = `<dl><dt>Decimal com sinal</dt><dd>${s16}</dd><dt>Hexadecimal</dt><dd>${hex(raw & 0xFFFF, 4)}h</dd>
        <dt>Binário</dt><dd>${(raw & 0xFFFF).toString(2).padStart(16, '0').replace(/(\d{4})(?=\d)/g, '$1 ')}</dd>
        ${s16 < 0 ? '<dt>Negativo</dt><dd>complemento de 2: é assim que o sentido anti-horário viaja na palavra</dd>' : ''}
        ${Math.abs(s16) > 32767 ? '' : ''}</dl>`;
    }
    const eng = () => +val(c, '[data-k=eng]') || 1; const cru = () => +val(c, '[data-k=cru]') || 1;
    function deValor() {
      let raw = Math.round((+val(c, '[data-k=valor]') / eng()) * cru());
      raw = Math.max(-32768, Math.min(32767, raw));
      c.querySelector('[data-k=raw]').value = raw; mostrar(raw & 0xFFFF);
    }
    function deRaw() {
      let raw = +val(c, '[data-k=raw]') | 0; if (raw > 32767) raw -= 65536;
      c.querySelector('[data-k=valor]').value = +((raw / cru()) * eng()).toFixed(3); mostrar(raw & 0xFFFF);
    }
    c.querySelector('[data-k=p]').addEventListener('change', () => { aplicarPreset(); deValor(); });
    c.querySelector('[data-k=valor]').addEventListener('input', deValor);
    c.querySelector('[data-k=raw]').addEventListener('input', deRaw);
    c.querySelector('[data-k=eng]').addEventListener('input', deValor);
    c.querySelector('[data-k=cru]').addEventListener('input', deValor);
    aplicarPreset(); deValor();
  };

  // =================================================================== sequência EtherNet/IP
  const PASSOS = [
    { de: 'CLP', para: 'Rede', via: 'UDP 44818 broadcast', nome: 'ListIdentity (0x0063)', o: 'Pergunta “quem está aí?”. Cada adapter responde com Vendor ID, Device Type, Product Code, revisão, nome e IP. É o que o botão “Scan” do CODESYS faz.', erro: 'Nada responde: firewall bloqueando UDP 44818, IP em outra sub-rede ou broadcast que não atravessa a placa escolhida.' },
    { de: 'CLP', para: 'Adapter', via: 'TCP 44818', nome: 'RegisterSession (0x0065)', o: 'Abre a sessão. O adapter devolve um Session Handle de 32 bits, que vai em todo pacote TCP daqui para frente.', erro: 'Conexão recusada: simulador fechado, porta ocupada por outro programa ou IP errado.' },
    { de: 'CLP', para: 'Adapter', via: 'TCP 44818 · SendRRData (0x006F)', nome: 'Forward Open (serviço 0x54, Connection Manager)', o: 'Pede a conexão de I/O: RPI de cada sentido, tamanho dos dados, ponto a ponto ou multicast, timeout multiplier, chave eletrônica e o caminho de conexão (config, O→T, T→O).', erro: 'Recusa com status 0x01 e código estendido: 0x0127/0x0128 tamanho errado, 0x0117 assembly errado, 0x0114 chave eletrônica, 0x0106 outro CLP já é dono.' },
    { de: 'Adapter', para: 'CLP', via: 'TCP 44818', nome: 'Resposta do Forward Open', o: 'Aceita: devolve os IDs de conexão O→T e T→O e o RPI real (API). A partir daqui o TCP fica quieto; o I/O vai por UDP.', erro: 'Aceitou mas o I/O não chega: T→O multicast numa placa loopback. Use ponto a ponto.' },
    { de: 'CLP', para: 'Adapter', via: 'UDP 2222 · a cada RPI', nome: 'I/O O→T (saídas do CLP)', o: 'Pacote com o ID da conexão, o número de sequência, o cabeçalho Run/Idle de 32 bits (bit 0 = Run) e os dados: palavra de controle, referência...', erro: 'CLP em STOP manda Idle: o adapter recebe, mas não aplica as saídas.' },
    { de: 'Adapter', para: 'CLP', via: 'UDP 2222 · a cada RPI', nome: 'I/O T→O (entradas do CLP)', o: 'O adapter produz na mesma cadência: palavra de estado, velocidade, resultado da inspeção... Sem cabeçalho Run/Idle.', erro: 'Dados chegam no PC mas não no CLP: firewall bloqueando UDP 2222 de entrada.' },
    { de: 'Adapter', para: '—', via: 'vigilância', nome: 'Timeout da conexão', o: 'Se nada chegar em RPI × multiplicador (ex.: 10 ms × 4 = 40 ms), a conexão cai. O equipamento executa a ação de falha de comunicação (no CFW500, P0313).', erro: 'Quedas aleatórias com RPI muito baixo num PC ocupado. Suba o RPI para 20 ou 50 ms.' },
    { de: 'CLP', para: 'Adapter', via: 'TCP 44818', nome: 'Forward Close (serviço 0x4E)', o: 'Encerra a conexão de forma limpa (download, CLP em stop com configuração para fechar, dispositivo removido).', erro: 'Sem Forward Close (cabo puxado, CLP desligado), quem fecha é o timeout.' },
  ];
  W['eip-sequencia'] = (el) => {
    const c = casca(el, 'Uma conexão EtherNet/IP, passo a passo', `
      <div class="passo-eip"><div class="ponta" data-s="de"></div><div class="seta"><span data-s="via"></span><b data-s="seta">→</b></div><div class="ponta" data-s="para"></div></div>
      <h4 data-s="nome" style="font-size:20px;margin:0 0 6px"></h4>
      <p data-s="o" style="margin:0 0 8px"></p>
      <p style="margin:0 0 14px;font-size:14px"><b>Onde costuma dar errado:</b> <span data-s="erro"></span></p>
      <div class="acoes"><button class="btn peq" data-a="-1">Anterior</button><button class="btn peq prim" data-a="1">Próximo</button><span data-s="n" style="align-self:center;color:var(--grafite-2);font-size:14px"></span></div>`);
    let i = 0;
    function mostrar() {
      const p = PASSOS[i];
      const ida = p.de === 'CLP';
      c.querySelector('[data-s=de]').textContent = ida ? 'CLP (scanner)' : 'Adapter (equipamento)';
      c.querySelector('[data-s=para]').textContent = ida ? (p.para === 'Rede' ? 'Todos na rede' : 'Adapter (equipamento)') : (p.para === '—' ? '—' : 'CLP (scanner)');
      c.querySelector('[data-s=seta]').textContent = p.para === '—' ? '⏱' : '→';
      for (const k of ['via', 'nome', 'o', 'erro']) c.querySelector(`[data-s=${k}]`).textContent = p[k];
      c.querySelector('[data-s=n]').textContent = `Passo ${i + 1} de ${PASSOS.length}`;
      c.querySelector('[data-a="-1"]').disabled = i === 0; c.querySelector('[data-a="1"]').disabled = i === PASSOS.length - 1;
    }
    c.addEventListener('click', (e) => { const a = e.target.closest('[data-a]'); if (a) { i = Math.max(0, Math.min(PASSOS.length - 1, i + +a.dataset.a)); mostrar(); } });
    mostrar();
  };

  // =================================================================== caminho de conexão (EPATH)
  W['eip-caminho'] = (el) => {
    const c = casca(el, 'Decodifique um caminho de conexão', `
      <div class="linha">
        <label>Bytes do caminho (hex)<input class="campo mono" data-k="p" value="20 04 24 01 2C 64 2C 96" style="width:30ch"></label>
        <div class="acoes"><button class="btn peq" data-ex="20 04 24 01 2C 64 2C 96">CFW500</button><button class="btn peq" data-ex="20 04 24 01 2C 96 2C 64">SCA06</button><button class="btn peq" data-ex="20 04 24 01 2C 65 2C 64">Keyence CV-X</button></div>
      </div>
      <table class="tabela" data-saida="t"></table>
      <p data-saida="r" style="margin:12px 0 0"></p>`);
    function decodificar() {
      const b = val(c, '[data-k=p]').trim().split(/[\s,]+/).filter(Boolean).map((x) => parseInt(x, 16));
      const linhas = []; const pontos = []; let classe = null; let inst = null; let i = 0; let erro = '';
      if (b.some((x) => isNaN(x) || x > 255)) erro = 'Use bytes em hexadecimal separados por espaço.';
      while (!erro && i < b.length) {
        const s = b[i];
        const tipos = { 0x20: ['Classe', 1], 0x21: ['Classe', 2], 0x24: ['Instância', 1], 0x25: ['Instância', 2], 0x2C: ['Ponto de conexão', 1], 0x2D: ['Ponto de conexão', 2], 0x30: ['Atributo', 1] };
        const t = tipos[s];
        if (!t) { erro = `Segmento ${hex(s)} não tratado neste exercício.`; break; }
        const tam = t[1]; const ini = tam === 2 ? i + 2 : i + 1;   // segmentos de 16 bits têm um byte de enchimento
        if (ini + tam > b.length) { erro = 'Caminho terminou no meio de um segmento.'; break; }
        const v = tam === 1 ? b[ini] : b[ini] | (b[ini + 1] << 8);
        const bytes = b.slice(i, ini + tam).map((x) => hex(x)).join(' ');
        let sig = '';
        if (t[0] === 'Classe') { classe = v; sig = v === 4 ? 'Assembly (objeto 0x04): blocos de dados de I/O' : v === 6 ? 'Connection Manager' : `classe ${v}`; }
        if (t[0] === 'Instância') { inst = v; sig = classe === 4 ? `assembly de configuração ${v}` : `instância ${v}`; }
        if (t[0] === 'Ponto de conexão') { pontos.push(v); sig = pontos.length === 1 ? `assembly ${v}: O→T, consumido pelo equipamento = SAÍDA do CLP` : `assembly ${v}: T→O, produzido pelo equipamento = ENTRADA do CLP`; }
        if (t[0] === 'Atributo') sig = `atributo ${v}`;
        linhas.push(`<tr><td><code>${bytes}</code></td><td>${t[0]} (${tam * 8} bits)</td><td>${v}</td><td>${sig}</td></tr>`);
        i = ini + tam;
      }
      c.querySelector('[data-saida=t]').innerHTML = `<thead><tr><th>Bytes</th><th>Segmento</th><th>Valor</th><th>Significado</th></tr></thead><tbody>${linhas.join('')}</tbody>`;
      c.querySelector('[data-saida=r]').innerHTML = erro ? `<span class="erro-txt">${erro}</span>`
        : pontos.length === 2 ? `No CLP: <b>saída</b> = assembly ${pontos[0]}, <b>entrada</b> = assembly ${pontos[1]}, <b>configuração</b> = ${inst ?? '—'}. A ordem no caminho é sempre: configuração, O→T, T→O.` : '';
    }
    c.addEventListener('input', decodificar);
    c.addEventListener('click', (e) => { const x = e.target.closest('[data-ex]'); if (x) { c.querySelector('[data-k=p]').value = x.dataset.ex; decodificar(); } });
    decodificar();
  };

  // =================================================================== sub-rede
  W['sub-rede'] = (el) => {
    const c = casca(el, 'Calculadora de sub-rede', `
      <div class="linha">
        <label>IP do CLP<input class="campo ip" data-k="a" value="192.168.100.10"></label>
        <label>IP do equipamento<input class="campo ip" data-k="b" value="192.168.100.20"></label>
        <label>Prefixo (bits da máscara)<input class="campo porta" data-k="p" type="number" min="1" max="32" value="24"></label>
      </div>
      <div class="resultado" data-saida="r"></div>`);
    const num = (ip) => { const p = ip.trim().split('.').map(Number); return p.length === 4 && p.every((x) => Number.isInteger(x) && x >= 0 && x <= 255) ? ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0 : null; };
    const txt = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
    function calc() {
      const a = num(val(c, '[data-k=a]')); const b = num(val(c, '[data-k=b]')); const p = Math.max(1, Math.min(32, +val(c, '[data-k=p]') | 0));
      const r = c.querySelector('[data-saida=r]');
      if (a === null || b === null) { r.innerHTML = '<span class="erro-txt">IP inválido. Use quatro números de 0 a 255 separados por ponto.</span>'; return; }
      const m = p === 32 ? 0xFFFFFFFF : (0xFFFFFFFF << (32 - p)) >>> 0;
      const rede = (a & m) >>> 0; const bc = (rede | (~m >>> 0)) >>> 0;
      const mesma = ((a & m) >>> 0) === ((b & m) >>> 0);
      const hosts = p >= 31 ? (p === 31 ? 2 : 1) : 2 ** (32 - p) - 2;
      r.innerHTML = `<dl><dt>Máscara</dt><dd>${txt(m)}</dd><dt>Rede</dt><dd>${txt(rede)}/${p}</dd><dt>Broadcast</dt><dd>${txt(bc)}</dd>
        <dt>IPs utilizáveis</dt><dd>${p >= 31 ? '—' : `${txt(rede + 1)} a ${txt(bc - 1)}`} (${hosts.toLocaleString('pt-BR')})</dd>
        <dt>Conversam direto?</dt><dd>${mesma ? '<span class="ok-txt">Sim, mesma sub-rede.</span>' : '<span class="erro-txt">Não. Estão em sub-redes diferentes: precisaria de um roteador.</span>'}</dd>
        ${a === b ? '<dt>Atenção</dt><dd class="erro-txt">Dois equipamentos com o mesmo IP: conflito.</dd>' : ''}
        ${a === rede || a === bc ? '<dt>Atenção</dt><dd class="erro-txt">O IP do CLP é o endereço da rede ou o broadcast; não pode ser usado.</dd>' : ''}</dl>`;
    }
    c.addEventListener('input', calc);
    calc();
  };

  // =================================================================== PQI (IO-Link)
  W['pqi'] = (el) => {
    const c = casca(el, 'Decodifique o PQI de uma porta', `
      <div class="linha">
        <label>PQI (hex)<input class="campo porta mono" data-k="v" value="C0"></label>
        <div class="acoes">${[['C0', 'operando'], ['E0', 'operando com aviso'], ['40', 'comunica, dados inválidos'], ['60', 'erro de validação'], ['00', 'sem device']].map(([v, t]) => `<button class="btn peq" data-ex="${v}">${v}: ${t}</button>`).join('')}</div>
      </div>
      <div class="bytes" data-saida="bits"></div>
      <div class="resultado" data-saida="r"></div>`);
    const BITS = [[7, 'PQ', 'dados de processo válidos'], [6, 'DevCom', 'device comunicando'], [5, 'DevErr', 'erro ou aviso no device ou na porta']];
    function calc() {
      const v = parseInt(val(c, '[data-k=v]'), 16);
      if (isNaN(v) || v > 255) { c.querySelector('[data-saida=r]').innerHTML = '<span class="erro-txt">Digite um byte em hexadecimal (00 a FF).</span>'; return; }
      c.querySelector('[data-saida=bits]').innerHTML = Array.from({ length: 8 }, (_, i) => 7 - i).map((b) => {
        const nome = BITS.find((x) => x[0] === b);
        return `<span class="byte" style="--c:${(v >> b) & 1 ? (b === 5 ? 'var(--led-ambar)' : 'var(--led-verde)') : 'var(--aco)'}" title="bit ${b}">${(v >> b) & 1}<br><small style="font-size:10px">${nome ? nome[1] : `b${b}`}</small></span>`;
      }).join('');
      const pq = (v >> 7) & 1; const com = (v >> 6) & 1; const err = (v >> 5) & 1;
      let leitura;
      if (pq && com && !err) leitura = '<span class="ok-txt">Use os dados.</span> Porta em OPERATE, device comunicando e sem problemas.';
      else if (pq && com && err) leitura = '<span class="ok-txt">Dados válidos</span>, mas o device avisa algo (ex.: lente suja, faixa excedida). Veja os eventos.';
      else if (!pq && com) leitura = '<span class="erro-txt">Não use os dados.</span> O device comunica, mas os dados não valem: porta em PREOPERATE, erro de validação (device errado) ou falha do device.';
      else if (!pq && !com && err) leitura = '<span class="erro-txt">Não use os dados.</span> Erro na porta sem comunicação: curto em L+ ou falha de alimentação.';
      else if (!pq && !com) leitura = '<span class="erro-txt">Não use os dados.</span> Sem device, porta desativada ou device ainda partindo.';
      else leitura = 'Combinação incomum: PQ = 1 sem comunicação IO-Link (porta em modo DI, por exemplo).';
      c.querySelector('[data-saida=r]').innerHTML = `<dl>${BITS.map(([b, n, t]) => `<dt>${n} (bit ${b})</dt><dd>${(v >> b) & 1 ? 'sim' : 'não'}: ${t}</dd>`).join('')}<dt>Leitura</dt><dd>${leitura}</dd></dl>`;
    }
    c.addEventListener('input', calc);
    c.addEventListener('click', (e) => { const x = e.target.closest('[data-ex]'); if (x) { c.querySelector('[data-k=v]').value = x.dataset.ex; calc(); } });
    calc();
  };

  function montarWidgets(raiz) {
    raiz.querySelectorAll('[data-widget]').forEach((el) => {
      const f = W[el.dataset.widget];
      if (f) { try { f(el); } catch (e) { el.textContent = `Erro no exercício ${el.dataset.widget}: ${e.message}`; } }
      else el.textContent = `Exercício desconhecido: ${el.dataset.widget}`;
    });
  }
  window.Widgets = { montarWidgets, lista: Object.keys(W) };
})();
