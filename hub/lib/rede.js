/**
 * Rede virtual: mostra quais IPs o laboratório precisa e quais já existem no PC,
 * e chama o script do sistema (rede/rede-hub.ps1 no Windows, rede/rede-hub.sh no Linux)
 * para criar, completar ou remover a placa virtual.
 *
 * No Windows a alteração pede permissão de administrador (janela do UAC); o resultado
 * volta por um arquivo JSON temporário.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { RAIZ } = require('./config');
const portas = require('./portas');

const PS1 = path.join(RAIZ, 'rede', 'rede-hub.ps1');
const SH = path.join(RAIZ, 'rede', 'rede-hub.sh');
const WIN = process.platform === 'win32';
const ehIp = (t) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(t || '') && t.split('.').every((n) => +n <= 255);

/** Lista do que a rede precisa ter: CLP + um IP por simulador que pede IP + extras. */
function planoDeIps(cfg, fichas) {
  const itens = [{ ip: cfg.rede.ipClp, papel: 'CLP / CODESYS', id: null, origem: true }];
  for (const f of fichas) {
    if (!f.rede.precisaIp) continue;
    const ip = cfg.ips[f.id] || f.rede.ipSugerido;
    if (ehIp(ip)) itens.push({ ip, papel: f.nome, id: f.id, origem: false });
  }
  for (const ip of cfg.rede.ipsExtras || []) if (ehIp(ip)) itens.push({ ip, papel: 'IP extra', id: null, origem: false, extra: true });
  return itens;
}

function detalhesWindows(adaptador) {
  return new Promise((ok) => {
    if (!WIN || !fs.existsSync(PS1)) return ok(null);
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Acao', 'status', '-Adaptador', adaptador],
      { windowsHide: true, timeout: 20000, maxBuffer: 1 << 20 }, (erro, saida) => {
        if (erro) return ok({ erro: erro.message });
        try { ok(JSON.parse(saida.trim().replace(/^\uFEFF/, ''))); } catch (_) { ok({ erro: 'Resposta inesperada do PowerShell', bruto: saida.slice(0, 500) }); }
      });
  });
}

async function status(cfg, fichas) {
  const locais = portas.ipsLocais();
  const plano = planoDeIps(cfg, fichas).map((p) => {
    const achado = locais.find((l) => l.ip === p.ip);
    return { ...p, existe: !!achado, interface: achado?.interface || null };
  });
  // IPs repetidos no plano (dois simuladores com o mesmo IP)
  const contagem = {};
  for (const p of plano) contagem[p.ip] = (contagem[p.ip] || 0) + 1;
  for (const p of plano) p.repetido = contagem[p.ip] > 1;

  const detalhes = await detalhesWindows(cfg.rede.adaptador);
  const adaptadorLinux = !WIN ? Object.keys(os.networkInterfaces()).includes('simhub') : null;
  return {
    plataforma: process.platform,
    adaptador: cfg.rede.adaptador,
    prefixo: cfg.rede.prefixo,
    ipClp: cfg.rede.ipClp,
    plano,
    faltando: plano.filter((p) => !p.existe).map((p) => p.ip),
    locais: locais.filter((l) => !l.interno),
    windows: detalhes,
    linux: WIN ? null : { interfaceExiste: adaptadorLinux, root: typeof process.getuid === 'function' && process.getuid() === 0 },
    pronta: plano.every((p) => p.existe),
  };
}

/**
 * Executa uma ação de rede. Ações: criar (cria/completa), remover-ip, remover-tudo, migrar, firewall.
 * Retorna { ok, mensagens[], comando? }.
 */
function aplicar(acao, cfg, fichas, { ips } = {}) {
  const permitidas = ['criar', 'remover-ip', 'remover-tudo', 'migrar', 'firewall'];
  if (!permitidas.includes(acao)) return Promise.reject(new Error(`Ação desconhecida: ${acao}`));
  const plano = planoDeIps(cfg, fichas);
  const ipsDispositivos = acao === 'remover-ip' ? (ips || []).filter(ehIp) : plano.filter((p) => !p.origem).map((p) => p.ip);
  const ipsUnicos = [...new Set(ipsDispositivos)].filter((ip) => ip !== cfg.rede.ipClp);

  if (!WIN) {
    const args = acao === 'remover-tudo' ? ['remover-tudo']
      : acao === 'remover-ip' ? ['remover-ip', ...ipsUnicos]
        : ['criar', `${cfg.rede.ipClp}/${cfg.rede.prefixo}`, ...ipsUnicos.map((ip) => `${ip}/${cfg.rede.prefixo}`)];
    const comando = `sudo bash "${SH}" ${args.join(' ')}`;
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      return new Promise((ok) => execFile('bash', [SH, ...args], (e, so, se) => ok({ ok: !e, mensagens: `${so}${se}`.split('\n').filter(Boolean), comando })));
    }
    return Promise.resolve({ ok: false, precisaTerminal: true, comando, mensagens: ['No Linux, rode este comando num terminal (pede a senha de administrador):'] });
  }

  const tmp = path.join(os.tmpdir(), `hub-rede-${Date.now()}.json`);
  const q = (s) => `"${String(s).replace(/"/g, '')}"`;
  const interno = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', q(PS1), '-Acao', acao, '-Adaptador', q(cfg.rede.adaptador),
    '-Prefixo', cfg.rede.prefixo, '-IpClp', cfg.rede.ipClp, '-Ips', q(ipsUnicos.join(',')), '-PortaHub', cfg.hubPorta, '-Resultado', q(tmp)].join(' ');
  const externo = "$ErrorActionPreference = 'Stop'\n" +
    `try { $p = Start-Process -FilePath 'powershell.exe' -ArgumentList '${interno.replace(/'/g, "''")}' -Verb RunAs -Wait -PassThru; exit $p.ExitCode }\n` +
    "catch { Write-Output 'UAC_NEGADO'; exit 1223 }";
  const codificado = Buffer.from(externo, 'utf16le').toString('base64');

  return new Promise((ok) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', codificado], { windowsHide: true });
    let saida = '';
    p.stdout.on('data', (d) => { saida += d; });
    p.on('exit', (codigo) => {
      let r = null;
      try { r = JSON.parse(fs.readFileSync(tmp, 'utf8').replace(/^\uFEFF/, '')); fs.unlinkSync(tmp); } catch (_) { /* sem resultado */ }
      if (r) return ok(r);
      if (saida.includes('UAC_NEGADO') || codigo === 1223) return ok({ ok: false, mensagens: ['A permissão de administrador foi negada. Nada foi alterado.'] });
      ok({ ok: false, mensagens: [`O script de rede terminou sem resultado (código ${codigo}).`] });
    });
  });
}

module.exports = { status, aplicar, planoDeIps, ehIp };
