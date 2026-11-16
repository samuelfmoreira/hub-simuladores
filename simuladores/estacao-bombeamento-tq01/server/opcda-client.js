'use strict';
// Cliente "OPC DA" do simulador: fala com o MasterTool em modo Simulação através da ponte
// tools/opcda/ponte-opcda.ps1 (PowerShell + OPC Automation Wrapper), que conversa com o
// servidor CoDeSys.OPC.DA do MasterTool. Mesma interface do cliente OPC UA (opcua-client.js),
// então a fila de prioridade, o watchdog e a tela funcionam igual.
const EventEmitter = require('events');
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const TG = require('./tags');

function createOpcDaClient(opts = {}) {
  const ev = new EventEmitter();
  const cfg = Object.assign({ progId: 'CoDeSys.OPC.DA', prefixo: 'PLC.Application.GVL_SIMULADOR.', periodoMs: 100, log: () => {}, comando: null }, opts);
  const st = { conectado: false, endpoint: `opcda://${cfg.progId} (${cfg.prefixo})`, polling: true, reconexoes: 0, erros: 0, ultimoErro: '', assinaturas: {}, itens: 0, faltam: [] };
  let proc = null, pendentes = new Map(), seq = 0, snapshot = {}, ultimoEnvio = {};

  function comandoPS() {
    if (cfg.comando) return cfg.comando; // testes: um processo que fala o mesmo protocolo
    const win = process.platform === 'win32';
    const ps32 = win ? path.join(process.env.SystemRoot || 'C:\\Windows', 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'pwsh';
    const exe = win && require('fs').existsSync(ps32) ? ps32 : (win ? 'powershell' : 'pwsh');
    const script = path.join(__dirname, '..', 'tools', 'opcda', 'ponte-opcda.ps1');
    return { cmd: exe, args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ProgId', cfg.progId, '-Prefixo', cfg.prefixo, '-PeriodoMs', String(cfg.periodoMs)] };
  }

  function conectar() {
    return new Promise((resolve, reject) => {
      const { cmd, args } = comandoPS();
      let pronto = false;
      try { proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); }
      catch (e) { return reject(new Error(`não consegui iniciar o PowerShell: ${e.message}`)); }
      const timer = setTimeout(() => { if (!pronto) { st.ultimoErro = 'a ponte OPC DA não respondeu em 20 s'; try { proc.kill(); } catch (e) { /* ok */ } reject(new Error(st.ultimoErro)); } }, 20000);
      proc.on('error', (e) => { st.ultimoErro = e.message; if (!pronto) { clearTimeout(timer); reject(new Error(`PowerShell: ${e.message}`)); } });
      proc.stderr.on('data', (d) => { const t = String(d).trim(); if (t) cfg.log(`ponte OPC DA: ${t.slice(0, 300)}`); });
      proc.on('exit', (code) => { st.conectado = false; proc = null; for (const p of pendentes.values()) p.reject(new Error('ponte encerrada')); pendentes.clear(); ev.emit('conexao', false); cfg.log(`ponte OPC DA encerrada (código ${code})`); });
      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        let m; try { m = JSON.parse(line); } catch (e) { return; }
        if (m.err) { st.ultimoErro = m.err; st.erros++; if (!pronto) { clearTimeout(timer); reject(new Error(m.err)); } else cfg.log(`ponte OPC DA: ${m.err}`); return; }
        if (m.ok) { pronto = true; clearTimeout(timer); st.conectado = true; st.itens = m.itens; st.faltam = m.faltam || []; st.assinaturas = { rapida: { publish: cfg.periodoMs, sampling: cfg.periodoMs, itens: m.itens, pedidoPublish: cfg.periodoMs, pedidoSampling: cfg.periodoMs } }; cfg.log(`ponte OPC DA: ${m.itens} itens em ${m.servidor} com prefixo ${m.prefixo}${st.faltam.length ? ` (faltam: ${st.faltam.join(', ')})` : ''}`); ev.emit('conexao', true); resolve(); return; }
        if (m.wok !== undefined) { const p = pendentes.get(m.wok); if (p) { pendentes.delete(m.wok); if (m.erros && m.erros.length) { st.erros++; st.ultimoErro = `escrita recusada: ${m.erros.join(', ')}`; p.reject(new Error(st.ultimoErro)); } else p.resolve(); } return; }
        if (m.r) {
          for (const t of TG.doClp) {
            let valor = m.r[t.nome]; if (valor === undefined || valor === null) continue;
            valor = t.tipo === 'BOOL' ? !!valor : Number(valor) / (t.mb.escala || 1);
            ultimoEnvio[t.nome] = valor;
            if (snapshot[t.nome] !== valor) { snapshot[t.nome] = valor; ev.emit('leitura', { tag: t.nome, valor }); }
          }
        }
      });
    });
  }

  // writer para a fila: items = [{ tag, valor }] — arrays viram um item por elemento
  function escrever(items) {
    if (!proc || !st.conectado) return Promise.reject(new Error('ponte OPC DA não está conectada'));
    const w = items.map((it) => { const t = TG.porNome[it.tag]; return [it.tag, typeof it.valor === 'boolean' ? it.valor : Math.round(Number(it.valor) * ((t && t.mb.escala) || 1))]; });
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pendentes.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify({ id, w }) + '\n');
      setTimeout(() => { if (pendentes.has(id)) { pendentes.delete(id); reject(new Error('timeout da ponte OPC DA')); } }, 5000);
    });
  }

  async function ler(tags) { const out = {}; for (const t of tags) out[t] = ultimoEnvio[t]; return out; }

  async function desconectar() {
    if (proc) { try { proc.stdin.end(); } catch (e) { /* ok */ } const p = proc; setTimeout(() => { try { p.kill(); } catch (e) { /* ok */ } }, 1500); proc = null; }
    st.conectado = false;
  }

  function status() { return { conectado: st.conectado, endpoint: st.endpoint, polling: true, reconexoes: st.reconexoes, erros: st.erros, ultimoErro: st.ultimoErro, assinaturas: st.assinaturas, protocolo: 'opcda', itens: st.itens, faltam: st.faltam }; }

  return Object.assign(ev, { conectar, escrever, ler, desconectar, status });
}

module.exports = { createOpcDaClient };
