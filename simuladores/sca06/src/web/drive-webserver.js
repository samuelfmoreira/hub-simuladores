/* =============================================================================
 *  Servidor WEB do acessório Ethernet  [ETH cap. 10, Figura 10.1]
 *  Página HTML simples: configuração de IP/CIDR/Gateway/DHCP, taxa de comunicação,
 *  Reboot e "Parameter Data" (lista de parâmetros com valores inteiros).
 *  Acesse:  http://<ip-do-pc>:<porta>/webserver/
 * ===========================================================================*/
'use strict';
const qs = require('querystring');

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
body{font-family:Verdana,Arial,sans-serif;font-size:12px;background:#c9d6e0;margin:0;padding:18px;color:#000}
.box{background:#fff;max-width:640px;margin:0 auto;padding:14px 22px 22px;border:1px solid #9fb2c0}
h1{color:#2d5a86;text-align:center;font-size:18px;margin:4px 0 2px} h2{color:#c0272d;text-align:center;font-size:13px;margin:0 0 14px;font-weight:bold}
table{width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #6d7f8c} th{background:#c5d0d8;text-align:left;padding:3px 6px;font-size:11px}
td{padding:3px 6px;border-top:1px solid #e3e8ec} td:first-child{width:45%} input[type=text],select{width:190px;font-size:11px}
.btn{text-align:center;padding:6px} button{font-size:11px;padding:2px 10px}
.nav{text-align:center;margin-top:10px} .nav a{color:#2d5a86;font-weight:bold;margin:0 12px;text-decoration:none} .nav a:before{content:"► ";color:#c0272d}
.note{color:#555;font-size:10px;text-align:center;margin-top:12px}
tr:nth-child(even) td{background:#f4f6f8}
</style></head><body><div class="box">${body}<div class="note">Servidor WEB simulado do acessório ECO5 — SCA06 (Manual Ethernet, cap. 10)</div></div></body></html>`;
}

function handle(req, res, drive, url) {
  const p = url.pathname.replace(/^\/webserver/, '') || '/';
  const send = (html) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); };
  const g = (n) => drive.get(n);
  if (req.method === 'POST') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const f = qs.parse(body);
      if (f.action === 'ip') {
        const ip = String(f.ip || '').split('.').map(Number), gw = String(f.gw || '').split('.').map(Number);
        if (ip.length === 4) ip.forEach((o, i) => drive.write(811 + i, o, 'net'));
        if (gw.length === 4) gw.forEach((o, i) => drive.write(816 + i, o, 'net'));
        drive.write(815, Number(f.cidr), 'net');
        drive.write(810, f.dhcp ? 1 : 0, 'net');
      }
      if (f.action === 'eth') drive.write(803, Number(f.rate), 'net');
      if (f.action === 'reboot') drive.write(849, 1, 'net');
      res.writeHead(303, { Location: '/webserver/network' }); res.end();
    });
    return;
  }
  const nav = `<div class="nav"><a href="/webserver/">Main</a><a href="/webserver/network">Network interface</a><a href="/webserver/params">Parameter Data</a></div>`;
  if (p === '/' || p === '/index.html') {
    const v = drive.view();
    return send(page('SCA-06', `<h1>SCA-06</h1><h2>Main</h2>
<table><tr><th colspan=2>Device</th></tr>
<tr><td>Product</td><td>SCA06 + ECO5 (EtherNet/IP)</td></tr>
<tr><td>Firmware</td><td>${(g(23) / 100).toFixed(2)}</td></tr>
<tr><td>Communication state (P0801)</td><td>${g(801)}</td></tr>
<tr><td>Drive state (P0006)</td><td>${g(6)}</td></tr>
<tr><td>Motor speed (P0002)</td><td>${g(2)} rpm</td></tr>
<tr><td>Motor current (P0003)</td><td>${g(3)} (x0.1 A)</td></tr>
<tr><td>Status word</td><td>${v.status.toString(16).padStart(4, '0')}h</td></tr></table>${nav}`));
  }
  if (p === '/network') {
    const ip = [g(811), g(812), g(813), g(814)].join('.'), gw = [g(816), g(817), g(818), g(819)].join('.');
    const rates = ['Auto', '10 Mbit/s half duplex', '10 Mbit/s full duplex', '100 Mbit/s half duplex', '100 Mbit/s full duplex'];
    return send(page('SCA-06 Network configuration', `<h1>SCA-06</h1><h2>Network configuration</h2>
<form method="post"><input type="hidden" name="action" value="ip"><table><tr><th colspan=2>IP Configuration</th></tr>
<tr><td>IP address:</td><td><input type="text" name="ip" value="${ip}"></td></tr>
<tr><td>CIDR:</td><td><input type="text" name="cidr" value="${g(815)}"></td></tr>
<tr><td>Gateway:</td><td><input type="text" name="gw" value="${gw}"></td></tr>
<tr><td>DHCP:</td><td><input type="checkbox" name="dhcp" ${g(810) ? 'checked' : ''}></td></tr>
<tr><td></td><td><button>Store settings</button></td></tr></table></form>
<form method="post"><input type="hidden" name="action" value="eth"><table><tr><th colspan=2>Ethernet Configuration</th></tr>
<tr><td>Comm Settings:</td><td><select name="rate">${rates.map((r, i) => `<option value="${i}" ${g(803) === i ? 'selected' : ''}>${r}</option>`).join('')}</select></td></tr>
<tr><td></td><td><button>Store settings</button></td></tr></table></form>
<form method="post" class="btn"><input type="hidden" name="action" value="reboot"><button>Reboot</button></form>
<div class="note">As alterações valem após Reboot (P0849 = 1) ou desligar/ligar.</div>${nav}`));
  }
  if (p === '/params') {
    const rows = drive.constructor && require('../../public/core/sca06-core.js').PARAM_LIST.filter(n => n < 1050 || (n >= 1100 && n <= 1113))
      .map(n => `<tr><td>P${String(n).padStart(4, '0')}</td><td>${g(n)}</td></tr>`).join('');
    return send(page('SCA-06 Parameter Data', `<h1>SCA-06</h1><h2>Parameter Data</h2><table><tr><th>Parameter</th><th>Value</th></tr>${rows}</table>${nav}`));
  }
  res.writeHead(404); res.end('not found');
}
module.exports = { handle };
