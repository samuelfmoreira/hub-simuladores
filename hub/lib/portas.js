/**
 * Portas e IPs: descobre os IPs do PC e testa se uma porta TCP/UDP está livre num IP.
 */
'use strict';
const net = require('net');
const dgram = require('dgram');
const os = require('os');

function ipsLocais() {
  const lista = [];
  for (const [iface, ifs] of Object.entries(os.networkInterfaces())) {
    for (const i of ifs || []) {
      if (i.family === 'IPv4' || i.family === 4) {
        lista.push({ interface: iface, ip: i.address, mascara: i.netmask, interno: i.internal });
      }
    }
  }
  return lista;
}

const ipExiste = (ip) => ipsLocais().some((i) => i.ip === ip);

/** Resolve com null se a porta está livre, ou com o código do erro (EADDRINUSE, EACCES...). */
function testarTcp(ip, porta) {
  return new Promise((ok) => {
    const s = net.createServer();
    s.once('error', (e) => ok(e.code || e.message));
    s.listen({ port: porta, host: ip === '0.0.0.0' ? undefined : ip, exclusive: true }, () => s.close(() => ok(null)));
  });
}

function testarUdp(ip, porta) {
  return new Promise((ok) => {
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: false });
    s.once('error', (e) => { try { s.close(); } catch (_) { /* */ } ok(e.code || e.message); });
    s.bind({ port: porta, address: ip === '0.0.0.0' ? undefined : ip, exclusive: true }, () => s.close(() => ok(null)));
  });
}

const testar = (proto, ip, porta) => (proto === 'udp' ? testarUdp(ip, porta) : testarTcp(ip, porta));

/** Primeira porta TCP livre a partir de "inicio", pulando as reservadas. */
async function portaLivre(inicio, reservadas = new Set()) {
  for (let p = inicio; p < inicio + 200; p++) {
    if (reservadas.has(p)) continue;
    if (!(await testarTcp('0.0.0.0', p))) return p;
  }
  return null;
}

/** Espera algo responder na porta TCP (usado para saber se a tela do simulador já subiu). */
function aguardarPorta(porta, { host = '127.0.0.1', tempoMs = 25000, intervalo = 400, cancelado = () => false } = {}) {
  const fim = Date.now() + tempoMs;
  return new Promise((ok) => {
    const tentar = () => {
      if (cancelado()) return ok(false);
      const c = net.connect({ port: porta, host });
      c.once('connect', () => { c.destroy(); ok(true); });
      c.once('error', () => {
        c.destroy();
        if (Date.now() > fim) ok(false); else setTimeout(tentar, intervalo);
      });
    };
    tentar();
  });
}

module.exports = { ipsLocais, ipExiste, testar, testarTcp, testarUdp, portaLivre, aguardarPorta };
