/**
 * Gerenciador de processos: inicia, acompanha e encerra cada simulador.
 *
 * Antes de iniciar, faz a "verificação de pré-voo":
 *   - decide o IP (o atribuído, se existir no PC; senão "todas as placas" com aviso)
 *   - decide a porta web (a preferida, ou a próxima livre se o simulador aceitar trocar)
 *   - procura conflito de porta com outros simuladores do HUB e com outros programas do PC
 *
 * Contrato com o simulador (variáveis de ambiente):
 *   HUB=1, SIM_IP, SIM_HTTP_PORT e SIM_<VARIAVEL> para cada item de "variaveis" da ficha.
 *   Placeholders {ip}, {http} e {variavel} também podem ser usados em iniciar.args.
 */
'use strict';
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const portas = require('./portas');
const runtime = require('./runtime');

const MAX_LINHAS = 600;
const PORTA_WEB_ALTERNATIVA = 3100;
const semAnsi = (t) => t.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

class Gerenciador extends EventEmitter {
  constructor() {
    super();
    this.inst = new Map();   // id -> instância
  }

  _inst(id) {
    if (!this.inst.has(id)) {
      this.inst.set(id, { id, estado: 'parado', proc: null, linhas: [], ip: null, httpPort: null, portas: [], avisos: [], inicio: null, codigoSaida: null, tarefa: null });
    }
    return this.inst.get(id);
  }

  resumo(id) {
    const i = this._inst(id);
    return { estado: i.estado, ip: i.ip, httpPort: i.httpPort, portas: i.portas, avisos: i.avisos, inicio: i.inicio, codigoSaida: i.codigoSaida, pid: i.proc?.pid || null, tarefa: i.tarefa, modo: i.modo || null };
  }

  log(id, linha, tipo = 'saida') {
    const i = this._inst(id);
    for (const l of semAnsi(String(linha)).split(/\r?\n/)) {
      if (!l.trim()) continue;
      const item = { t: Date.now(), tipo, texto: l };
      i.linhas.push(item);
      if (i.linhas.length > MAX_LINHAS) i.linhas.shift();
      this.emit('log', id, item);
    }
  }

  _mudar(id, campos) {
    Object.assign(this._inst(id), campos);
    this.emit('estado', id, this.resumo(id));
  }

  emExecucao() {
    return [...this.inst.values()].filter((i) => ['iniciando', 'rodando'].includes(i.estado));
  }

  /** Decide IP, portas e variáveis. Não inicia nada. */
  async planejar(ficha, cfg) {
    const avisos = [];
    const bloqueios = [];
    const outros = this.emExecucao().filter((i) => i.id !== ficha.id);

    // ---------- variáveis ----------
    const vars = { ...ficha.variaveis };

    // ---------- IP ----------
    let ip = '0.0.0.0';
    if (ficha.rede.precisaIp) {
      const desejado = cfg.ips[ficha.id] || ficha.rede.ipSugerido;
      if (desejado && desejado !== '0.0.0.0' && portas.ipExiste(desejado)) {
        ip = desejado;
      } else {
        if (desejado && desejado !== '0.0.0.0') {
          avisos.push(`O IP ${desejado} não existe neste PC. O simulador vai responder em todas as placas de rede. Crie a rede virtual na aba Rede para usar o IP próprio.`);
        }
        Object.assign(vars, ficha.rede.seSemIp || {});
      }
      if (!ficha.contrato.ip && ip !== '0.0.0.0') {
        avisos.push('Esta versão do simulador não lê o IP enviado pelo HUB (SIM_IP). Ele vai usar o IP configurado nele mesmo.');
      }
    }

    // ---------- portas de rede declaradas na ficha ----------
    const resolver = (v) => (typeof v === 'string' ? Number(v.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')) : Number(v));
    const lista = (ficha.rede.portas || []).map((p) => ({ proto: p.proto || 'tcp', porta: resolver(p.porta), uso: p.uso || '', ip }))
      .filter((p) => Number.isInteger(p.porta) && p.porta > 0);

    const conflitos = new Map();   // simulador dono -> portas em conflito
    for (const p of lista) {
      const dono = outros.find((o) => o.portas.some((q) => q.proto === p.proto && q.porta === p.porta && (q.ip === p.ip || q.ip === '0.0.0.0' || p.ip === '0.0.0.0')));
      if (dono) {
        if (!conflitos.has(dono)) conflitos.set(dono, []);
        conflitos.get(dono).push(`${p.proto.toUpperCase()} ${p.porta}`);
        continue;
      }
      const erro = await portas.testar(p.proto, p.ip, p.porta);
      if (erro) {
        avisos.push(`${p.proto.toUpperCase()} ${p.porta} (${p.uso}) parece ocupada em ${p.ip === '0.0.0.0' ? 'todas as placas' : p.ip} por outro programa (${erro}). ` +
          'Pode ser o CODESYS, o RSLinx ou um simulador aberto fora do HUB.');
      }
    }
    for (const [dono, lst] of conflitos) {
      const algumTodos = ip === '0.0.0.0' || dono.ip === '0.0.0.0';
      bloqueios.push(`As portas ${lst.join(', ')} já estão em uso por "${dono.nome}" (${dono.ip === '0.0.0.0' ? 'todas as placas' : dono.ip}). ` +
        (algumTodos ? 'Para rodar os dois juntos, cada um precisa de um IP próprio: crie a rede virtual na aba Rede.' : 'Escolha outro IP para um deles.'));
    }

    // ---------- porta web ----------
    const reservadas = new Set(outros.map((o) => o.httpPort));
    reservadas.add(cfg.hubPorta);
    const preferida = Number(cfg.portasWeb[ficha.id]) || ficha.web.porta;
    let httpPort = preferida;
    const ocupada = reservadas.has(preferida) || (await portas.testarTcp('0.0.0.0', preferida));
    if (ocupada) {
      const dono = outros.find((o) => o.httpPort === preferida);
      if (ficha.contrato.portaWeb) {
        httpPort = await portas.portaLivre(PORTA_WEB_ALTERNATIVA, reservadas);
        avisos.push(`A porta web ${preferida} está ocupada${dono ? ` por "${dono.nome}"` : ''}; a tela vai abrir na porta ${httpPort}.`);
      } else {
        bloqueios.push(`A tela deste simulador usa a porta ${preferida}, fixa no código, e ela está ocupada${dono ? ` por "${dono.nome}"` : ' por outro programa'}. ` +
          'Pare o outro simulador ou atualize este para ler SIM_HTTP_PORT (veja modelo-simulador/CONTRATO.md).');
      }
    }

    return { ip, httpPort, vars, portas: lista, avisos, bloqueios };
  }

  /** Modo de execução escolhido (fichas com "modos"); confere plataforma e permissão. */
  modo(ficha, cfg, pedido) {
    if (!ficha.modos) return null;
    const m = ficha.modos.find((x) => x.id === (pedido || cfg.modos[ficha.id])) || ficha.modos[0];
    if (m.plataformas && !m.plataformas.includes(process.platform)) {
      throw new Error(`O modo "${m.nome}" não roda neste sistema.${m.observacao ? ` ${m.observacao}` : ''}`);
    }
    if (m.requerRoot && process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0) {
      throw new Error(`O modo "${m.nome}" precisa de root: inicie o HUB com sudo.`);
    }
    return m;
  }

  async iniciar(ficha, cfg, pedidoModo) {
    const i = this._inst(ficha.id);
    if (['iniciando', 'rodando', 'verificando', 'instalando'].includes(i.estado)) throw new Error('O simulador já está em execução ou ocupado.');
    if (!ficha.instalado) throw new Error('As dependências deste simulador não estão instaladas. Use "Instalar dependências".');

    const modo = this.modo(ficha, cfg, pedidoModo);
    this._mudar(ficha.id, { estado: 'verificando', avisos: [], codigoSaida: null });
    let plano;
    try { plano = await this.planejar(ficha, cfg); } catch (e) { this._mudar(ficha.id, { estado: 'erro' }); throw e; }
    if (plano.bloqueios.length) {
      for (const b of plano.bloqueios) this.log(ficha.id, b, 'erro');
      this._mudar(ficha.id, { estado: 'parado', avisos: plano.bloqueios });
      const e = new Error(plano.bloqueios.join('\n')); e.bloqueio = true; throw e;
    }
    for (const a of plano.avisos) this.log(ficha.id, a, 'aviso');

    const valores = { ...plano.vars, ip: plano.ip, http: plano.httpPort };
    const trocar = (s) => String(s).replace(/\{(\w+)\}/g, (_, k) => valores[k] ?? '');
    const argsFicha = ((modo && modo.args) || ficha.iniciar.args || []).map(trocar);
    const exec = ficha.iniciar.comando === 'node' ? runtime.node(argsFicha) : { comando: ficha.iniciar.comando, args: argsFicha, shell: false };
    const args = argsFicha;
    const env = { ...process.env, HUB: '1', SIM_IP: plano.ip, SIM_HTTP_PORT: String(plano.httpPort), FORCE_COLOR: '0' };
    for (const [k, v] of Object.entries(plano.vars)) env[`SIM_${k.toUpperCase()}`] = String(v);

    if (modo) this.log(ficha.id, `Modo: ${modo.nome}`, 'hub');
    const onde = ficha.rede.precisaIp ? `IP ${plano.ip === '0.0.0.0' ? 'todas as placas' : plano.ip}, ` : '';
    this.log(ficha.id, `> ${ficha.iniciar.comando} ${args.join(' ')}   (${onde}tela na porta ${plano.httpPort})`, 'hub');
    const proc = spawn(exec.comando, exec.args, { cwd: ficha.pasta, env, windowsHide: true, shell: exec.shell, stdio: ['ignore', 'pipe', 'pipe'] });
    this._mudar(ficha.id, { estado: 'iniciando', proc, ip: plano.ip, httpPort: plano.httpPort, portas: plano.portas, avisos: plano.avisos, inicio: Date.now(), nome: ficha.nome, modo: modo ? modo.id : null });
    i.nome = ficha.nome;

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (d) => this.log(ficha.id, d));
    proc.stderr.on('data', (d) => this.log(ficha.id, d, 'erro'));
    proc.on('error', (e) => { this.log(ficha.id, `Falha ao iniciar: ${e.message}`, 'erro'); this._mudar(ficha.id, { estado: 'erro', proc: null }); });
    proc.on('exit', (codigo, sinal) => {
      const parouPeloHub = i.parando;
      i.parando = false;
      this.log(ficha.id, parouPeloHub ? 'Simulador encerrado.' : `O simulador terminou sozinho (código ${codigo ?? sinal}). Veja as mensagens acima.`, parouPeloHub ? 'hub' : 'erro');
      this._mudar(ficha.id, { estado: parouPeloHub || codigo === 0 ? 'parado' : 'erro', proc: null, codigoSaida: codigo, portas: [] });
    });

    const pronto = await portas.aguardarPorta(plano.httpPort, { cancelado: () => i.proc !== proc });
    if (i.proc === proc) {
      if (pronto) { this._mudar(ficha.id, { estado: 'rodando' }); this.log(ficha.id, `Tela pronta em http://localhost:${plano.httpPort}${ficha.web.caminho}`, 'hub'); }
      else this.log(ficha.id, `A tela ainda não respondeu na porta ${plano.httpPort}. O simulador pode estar usando outra porta.`, 'aviso');
    }
    return this.resumo(ficha.id);
  }

  parar(id) {
    const i = this._inst(id);
    if (!i.proc) return Promise.resolve(this.resumo(id));
    i.parando = true;
    const proc = i.proc;
    return new Promise((ok) => {
      proc.once('exit', () => ok(this.resumo(id)));
      if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], () => { /* o evento exit resolve */ });
      } else {
        proc.kill('SIGTERM');
        setTimeout(() => { if (i.proc === proc) proc.kill('SIGKILL'); }, 3000);
      }
    });
  }

  async pararTodos() {
    await Promise.all([...this.inst.keys()].map((id) => this.parar(id)));
  }

  /** npm install na pasta do simulador, com a saída no console dele. */
  instalar(ficha) {
    const i = this._inst(ficha.id);
    if (i.proc) return Promise.reject(new Error('Pare o simulador antes de instalar as dependências.'));
    if (i.estado === 'instalando') return Promise.reject(new Error('Instalação já em andamento.'));
    this._mudar(ficha.id, { estado: 'instalando', tarefa: 'npm install' });
    this.log(ficha.id, '> npm install (precisa de internet)', 'hub');
    return new Promise((ok, falha) => {
      const cmd = runtime.npm(['install', '--no-audit', '--no-fund', '--omit=dev']);
      const p = spawn(cmd.comando, cmd.args, { cwd: ficha.pasta, shell: cmd.shell, windowsHide: true });
      p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
      p.stdout.on('data', (d) => this.log(ficha.id, d));
      p.stderr.on('data', (d) => this.log(ficha.id, d, 'aviso'));
      p.on('error', (e) => { this._mudar(ficha.id, { estado: 'erro', tarefa: null }); falha(e); });
      p.on('exit', (c) => {
        if (c === 0) { this.log(ficha.id, 'Dependências instaladas.', 'hub'); this._mudar(ficha.id, { estado: 'parado', tarefa: null }); ok(); }
        else { this.log(ficha.id, `npm install falhou (código ${c}). Verifique a internet ou o proxy.`, 'erro'); this._mudar(ficha.id, { estado: 'erro', tarefa: null }); falha(new Error('npm install falhou')); }
      });
    });
  }
}

module.exports = { Gerenciador };
