// Tela do simulador: sessão do aluno, estado ao vivo (SSE), comandos (POST), aula guiada, bancada, aba CLP,
// assistente "Comunicação com o CLP", missões, curva de eco e cena 3D. A física roda no servidor (src/nucleo.js).
import { criarCena, G } from './cena3d.js';
import { MISSOES, avaliar } from './missoes.mjs';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v, n = 2) => Number(v).toFixed(n).replace('.', ',').replace('-', '−');
const REDUZIDO = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const VERSAO_TELA = '1.1.1.1';   // tem de ser igual à versão do package.json (os testes conferem)
let INFO = null;      // dados fixos do servidor (tabela de variáveis, parâmetros, programas ST)
let E = null;         // último estado da sessão
let sid = null, es = null, cena = null, ok3d = false;
const vis = { nivel: 1 };                      // nível suavizado entre duas mensagens do servidor
const P = { s: 0, wait: 0, paused: REDUZIDO }; // pulso em câmera lenta (só visual)
const VVIS = 1.6;                              // m/s na tela: cerca de 215× mais lento que o som

// ------------------------------------------------------------------ servidor
async function api(rota, corpo) {
  const r = await fetch(rota, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : undefined);
  return r.json();
}
const cmd = (c) => api(`api/comando?s=${sid}`, c);
const pendentes = {};                          // comandos de slider: no máximo um a cada 70 ms, o último vence
function cmdSuave(chave, c) {
  const p = pendentes[chave] || (pendentes[chave] = {});
  p.c = c;
  if (p.t) return;
  p.t = setTimeout(() => { p.t = null; cmd(p.c); }, 70);
}
const mexido = {};                             // controle que o usuário acabou de mexer não é sobrescrito pelo estado
const mexeu = (id) => { mexido[id] = performance.now(); };
const livre = (id) => performance.now() - (mexido[id] || 0) > 900 && document.activeElement !== $(id);

// ------------------------------------------------------------------ sessão
const CHAVE = 'lt01.sessao';
const ler = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* sem armazenamento */ } };

async function entrar(id) {
  if (!id) return false;
  const r = await fetch(`api/estado?s=${encodeURIComponent(id)}`);
  if (!r.ok) return false;
  E = await r.json(); sid = id; gravar(CHAVE, id);
  vis.nivel = E.proc.nivel; carregarMissoes();
  $('dlgSessao').hidden = true;
  if (es) es.close();
  es = new EventSource(`api/eventos?s=${sid}`);
  es.onmessage = (m) => { E = JSON.parse(m.data); aoEstado(); };
  es.addEventListener('fim', () => { es.close(); abrirSessoes('Esta sessão foi excluída.'); });
  es.onerror = () => {
    $('chipRede').textContent = 'Simulador desconectado'; $('chipRede').className = 'chip erro';
    if (es.readyState === 2) fetch(`api/estado?s=${sid}`).then((x) => { if (!x.ok) abrirSessoes('A sessão não existe mais neste simulador.'); }).catch(() => {});
  };
  sincronizar(true); aoEstado();
  return true;
}
async function abrirSessoes(aviso) {
  const d = $('dlgSessao'); d.hidden = false;
  $('msgSessao').hidden = !aviso; $('msgSessao').textContent = aviso || '';
  $('btnFecharSessao').hidden = !(sid && E);
  const { sessoes } = await api('api/sessoes');
  $('blocoSessoes').hidden = !sessoes.length;
  $('listaSessoes').innerHTML = sessoes.map((s) => `<li><b>${esc(s.nome)}</b><small>${s.conectado ? (s.demo ? 'CLP de demonstração' : 'CLP ' + esc(s.clp)) : 'sem CLP'}${s.telas ? ' · aberta em ' + s.telas + ' tela' + (s.telas > 1 ? 's' : '') : ''}</small>
    <button class="btn small" data-entrar="${s.id}">Entrar</button><button class="btn small" data-excluir="${s.id}">Excluir</button></li>`).join('');
  if (!$('inNome').value) $('inNome').placeholder = `Seu nome ou bancada (ex.: Bancada ${sessoes.length + 1})`;
  if (INFO && INFO.enderecos.length) $('enderecos').textContent = `Outros PCs da rede abrem este simulador em ${INFO.enderecos.map((i) => `http://${i}:${INFO.porta}`).join(' ou ')}.`;
  setTimeout(() => $('inNome').focus(), 30);
}
function ligarSessoes() {
  $('formSessao').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const r = await api('api/sessoes', { nome: $('inNome').value });
    if (!r.ok) { $('msgSessao').hidden = false; $('msgSessao').textContent = r.erro; return; }
    $('inNome').value = ''; await entrar(r.id);
  });
  $('listaSessoes').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.entrar) await entrar(b.dataset.entrar);
    else if (b.dataset.excluir) {
      if (b.dataset.certeza !== '1') { b.dataset.certeza = '1'; b.textContent = 'Excluir mesmo?'; setTimeout(() => { b.dataset.certeza = ''; b.textContent = 'Excluir'; }, 3000); return; }
      await api('api/sessoes', { excluir: b.dataset.excluir });
      if (b.dataset.excluir === sid) { sid = null; E = null; }
      abrirSessoes();
    }
  });
  $('chipSessao').addEventListener('click', () => abrirSessoes());
  $('btnFecharSessao').addEventListener('click', () => { $('dlgSessao').hidden = true; });
}

// ------------------------------------------------------------------ pulso em câmera lenta (visual)
function avancarPulso(dt) {
  if (P.paused || !E || E.med.status === 'desligado') return;
  const dT = G.E - vis.nivel, sel = E.med.sel;
  const stop = sel ? 2 * sel.dReal : 2 * dT;
  const total = Math.max(2 * dT, stop) + 0.25;
  if (P.wait > 0) { P.wait -= dt; if (P.wait <= 0) P.s = 0; }
  else { P.s += VVIS * dt; if (P.s >= total) P.wait = 0.8; }
}
function leituraPulso() {
  if (E.med.status === 'desligado') return { ms: 0, txt: 'transmissor sem alimentação', cls: 'bad' };
  const dT = G.E - vis.nivel, sel = E.med.sel;
  const stop = sel ? 2 * sel.dReal : Infinity;
  const s = Math.min(P.s, stop, 2 * Math.max(dT, sel ? sel.dReal : dT) + 0.25);
  const ms = s / E.med.cReal * 1000;
  if (P.s >= stop) {
    if (sel.tipo === 'nivel') return { ms, txt: 'eco recebido', cls: 'rx' };
    if (sel.tipo === 'falso') return { ms, txt: 'eco falso recebido primeiro', cls: 'bad' };
    return { ms, txt: '2º eco recebido (zona morta)', cls: 'bad' };
  }
  if (!sel && P.s >= 2 * dT) return { ms, txt: 'nenhum eco acima do limiar', cls: 'bad' };
  if (P.s < dT) return { ms, txt: 'pulso descendo', cls: 'tx' };
  if (P.s < 2 * dT) return { ms, txt: 'eco subindo', cls: 'rx' };
  return { ms, txt: 'eco refletindo de novo', cls: 'rx' };
}

// ------------------------------------------------------------------ curva de eco
const css = getComputedStyle(document.documentElement);
const C = Object.fromEntries(['ink', 'muted', 'line', 'tx', 'rx', 'bad'].map((k) => [k, css.getPropertyValue('--' + k).trim()]));
const F_NUM = css.getPropertyValue('--font-num'), F_DISP = css.getPropertyValue('--font-display');
function desenharEco() {
  const c = $('echo'), dpr = Math.min(window.devicePixelRatio || 1, 2), W = c.clientWidth, H = c.clientHeight;
  if (!W || !H || !E) return;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const Lm = 50, Rm = 12, Tm = 18, Bm = 34, pw = W - Lm - Rm, ph = H - Tm - Bm, XM = 3.5, YM = 108;
  const X = (x) => Lm + x / XM * pw, Y = (a) => Tm + ph - clamp(a, 0, YM) / YM * ph;
  g.font = '11px ' + F_NUM; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(197,39,29,.13)'; g.fillRect(X(0), Tm, X(G.zonaMorta) - X(0), ph);
  g.strokeStyle = '#e1e4df'; g.lineWidth = 1; g.fillStyle = C.muted;
  for (const a of [0, 50, 100]) { g.beginPath(); g.moveTo(Lm, Y(a)); g.lineTo(W - Rm, Y(a)); g.stroke(); g.textAlign = 'right'; g.fillText(a + ' dB', Lm - 5, Y(a)); }
  g.textAlign = 'center';
  for (let x = 0; x <= 3.5; x += 0.5) { g.beginPath(); g.moveTo(X(x), Tm); g.lineTo(X(x), Tm + ph); g.stroke(); g.fillText(fmt(x, 1), X(x), Tm + ph + 10); }
  g.fillText('distância a partir do transdutor (m)', Lm + pw / 2, Tm + ph + 25);
  const m = E.med, kc = m.cUsado / m.cReal;
  g.strokeStyle = C.muted; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(G.E * kc), Tm); g.lineTo(X(G.E * kc), Tm + ph); g.stroke(); g.setLineDash([]);
  g.textAlign = 'right'; g.fillText('fundo', X(G.E * kc) - 4, Tm + 7);
  if (m.status === 'desligado') { g.textAlign = 'center'; g.fillStyle = C.bad; g.font = '600 15px ' + F_DISP; g.fillText('transmissor sem alimentação: sem curva de eco', Lm + pw / 2, Tm + ph / 2); return; }

  const cv = E.curva, N = cv.length - 1, dx = 0.02;
  g.beginPath(); g.moveTo(X(0), Y(0));
  for (let i = 0; i <= N; i++) g.lineTo(X(i * dx), Y(cv[i]));
  g.lineTo(X(N * dx), Y(0)); g.closePath(); g.fillStyle = 'rgba(10,135,148,.16)'; g.fill();
  g.beginPath(); for (let i = 0; i <= N; i++) { i ? g.lineTo(X(i * dx), Y(cv[i])) : g.moveTo(X(0), Y(cv[0])); }
  g.strokeStyle = C.rx; g.lineWidth = 2; g.stroke();
  g.beginPath(); let prim = true;
  for (let i = 0; i <= N; i++) { const x = i * dx; if (x < G.zonaMorta - 0.001) continue; prim ? g.moveTo(X(x), Y(E.limiar[i])) : g.lineTo(X(x), Y(E.limiar[i])); prim = false; }
  g.strokeStyle = C.ink; g.lineWidth = 1.4; g.setLineDash([6, 4]); g.stroke(); g.setLineDash([]);

  g.font = '600 12.5px ' + F_DISP;
  g.textAlign = 'left'; g.fillStyle = C.bad; g.fillText('pulso de emissão', X(0.2) + 4, Tm + 7);
  let ultimoX = -99;
  for (const o of m.ecos) {
    if (o.tipo === 'nivel' && o.x < G.zonaMorta) { g.textAlign = 'left'; g.fillStyle = C.bad; g.fillText('eco do nível escondido aqui', X(0.2) + 4, Tm + 22); continue; }
    if (o.x < 0.19) continue;
    const nome = o.tipo === 'nivel' ? 'eco do nível' : o.tipo === 'falso' ? 'eco falso' : o.n + 'º eco';
    const px = X(o.x), py = Y(Math.min(100, o.a)) - 9;
    if (px - ultimoX < 46) continue; ultimoX = px;
    g.textAlign = 'center'; g.fillStyle = o.tipo === 'falso' ? C.bad : o.tipo === 'nivel' ? C.rx : C.muted;
    g.fillText(nome, clamp(px, Lm + 30, W - Rm - 30), Math.max(Tm + 7, py));
  }
  if (m.sel) {
    const px = X(m.sel.x); g.strokeStyle = C.tx; g.lineWidth = 2.5; g.beginPath(); g.moveTo(px, Y(Math.min(100, m.sel.a)) + 2); g.lineTo(px, Tm + ph); g.stroke();
    g.fillStyle = C.tx; g.beginPath(); g.moveTo(px - 6, Tm + ph + 1); g.lineTo(px + 6, Tm + ph + 1); g.lineTo(px, Tm + ph - 8); g.closePath(); g.fill();
  }
}

// ------------------------------------------------------------------ leituras e chips
const ESTADOS = {
  ok: ['ok', 'Eco válido'], falso: ['bad', 'Preso em eco falso'], multiplo: ['bad', 'Zona morta: leitura errada'],
  aguardando: ['warn', 'Sem eco, aguardando'], falha: ['bad', 'Falha'], desligado: ['bad', 'Sem alimentação: cabo rompido'],
};
function desenharLeituras() {
  const m = E.med, p = E.par, fal = m.status === 'falha', off = m.status === 'desligado', sem = fal || off;
  $('fC').textContent = p.correcaoTemp ? `331,3 + 0,606 × ${fmt(E.proc.temp, 0)} °C` : `fixa em 20 °C (ar real: ${fmt(m.cReal, 1)})`;
  $('vC').textContent = fmt(m.cUsado, 1) + ' m/s';
  $('vT').textContent = sem ? (off ? '—' : 'sem eco') : fmt(m.tof, 2) + ' ms';
  $('fD').textContent = sem ? 'c × t ÷ 2' : `c × t ÷ 2 = ${fmt(m.cUsado, 1)} × ${fmt(m.tof / 1000, 5)} ÷ 2`;
  $('vD').textContent = sem ? '—' : fmt(m.D, 3) + ' m';
  $('fL').textContent = sem ? '(mín − D) ÷ faixa' : `(${fmt(p.calMin, 3)} − ${fmt(m.D, 3)}) ÷ ${fmt(p.calMin - p.calMax, 3)}`;
  $('vL').textContent = off ? 'apagado' : fal ? m.erro : `${fmt(m.pct, 1)} % · ${fmt(m.L, 3)} m`;
  $('fI').textContent = off ? 'laço aberto' : fal ? `modo de falha: ${m.modoFalha}` : `4 + 16 × ${fmt(m.pct, 1)} ÷ 100`;
  $('vI').textContent = fmt(m.mA, 2) + ' mA';
  $('vR').textContent = String(m.bruto).replace('-', '−') + (m.mA > 20.004 ? ' (saturado)' : '');
  const pos = clamp((m.mA - 3.6) / 18.4 * 100, 0, 100);
  $('loopPin').style.left = pos + '%'; $('loopFill').style.width = pos + '%';
  $('vReal').textContent = fmt(E.proc.nivel, 3) + ' m';
  const er = $('vErr');
  if (sem) { er.textContent = off ? 'sem medição' : (p.modoFalha === 1 ? 'saída congelada, sem medição' : 'sem medição'); er.className = 'err bad'; }
  else { const mm = Math.round((m.L - E.proc.nivel) * 1000); er.textContent = `erro da indicação: ${mm > 0 ? '+' : mm < 0 ? '−' : ''}${Math.abs(mm)} mm`; er.className = 'err ' + (Math.abs(mm) <= 8 ? 'ok' : 'bad'); }
  let [cls, txt] = ESTADOS[m.status] || ESTADOS.ok;
  if (m.status === 'aguardando') txt = `Sem eco, aguardando ${Math.max(1, Math.ceil(4 - m.semEco))} s`;
  if (fal) txt = m.erro === 'E017' ? 'E017 · faixa de calibração pequena demais' : 'E013 · sem valor de medição';
  const st = $('status'); st.className = 'pill ' + cls; st.textContent = txt;

  // chips do topo
  $('chipSessao').textContent = `Sessão: ${E.nome}`;
  $('chipSinal').textContent = `LT-01  ${fmt(m.mA, 2)} mA  ·  ${String(m.bruto).replace('-', '−')}`;
  const ce = $('chipEco'); ce.textContent = fal ? m.erro : off ? 'sem alimentação' : txt.split(':')[0].split(',')[0]; ce.className = 'chip ' + (cls === 'ok' ? 'ok' : cls === 'warn' ? 'alerta' : 'erro');
  const r = E.rede, cr = $('chipRede');
  if (r.conectado) { cr.textContent = r.demo ? 'CLP de demonstração' : `CLP ${r.endpoint.split(' ')[0]}`; cr.className = 'chip ok'; }
  else if (r.desejado) { cr.textContent = 'Procurando o CLP…'; cr.className = 'chip alerta'; }
  else { cr.textContent = 'Sem CLP'; cr.className = 'chip'; }
}
function desenharCronometro() {
  const r = leituraPulso();
  $('tofLive').textContent = fmt(r.ms, 2) + ' ms';
  const ph = $('tofPhase'); if (ph.textContent !== r.txt) { ph.textContent = r.txt; ph.className = 'ph ' + r.cls; }
}

// ------------------------------------------------------------------ aula guiada
const AULA = [
  { t: 'Tempo de voo', run: 'Ver o pulso em câmera lenta', cam: 'geral', proc: {}, par: {},
    h: `<p>O sensor não enxerga o líquido. Ele emite um pulso curto de ultrassom (70 kHz, acima do que o ouvido escuta), espera o eco e mede uma única coisa: <b>o tempo de ida e volta</b>.</p>
        <div class="formula">D = c × t ÷ 2</div>
        <p>Divide por 2 porque o som percorre o caminho duas vezes. <b>c</b> é a velocidade do som no ar, cerca de 343 m/s a 20 °C.</p>
        <p class="see"><b>Observe:</b> o pulso laranja desce, bate no líquido e o eco verde-azulado sobe. O cronômetro mostra o tempo real, em milissegundos.</p>` },
  { t: 'Da distância ao nível', run: 'Encher o tanque', cam: 'geral', proc: { nivel: 0.2, vazao: 1 }, par: {},
    h: `<p>O plano de referência é a borda inferior do transdutor. O sensor mede a distância <b>D</b> até a superfície, e o nível sai por subtração:</p>
        <div class="formula">L = E − D</div>
        <p><b>E</b> é a distância do sensor ao fundo. Na parametrização, a calibração mín. diz qual distância vale 0 % (4 mA) e a calibração máx. diz qual vale 100 % (20 mA). Dá para calibrar com o tanque vazio: basta digitar as duas distâncias.</p>
        <p class="see"><b>Observe:</b> enquanto o tanque enche, D diminui e L aumenta. A corrente e a contagem LT01_Bruto sobem juntas.</p>` },
  { t: 'Zona morta', run: 'Encher até a zona morta', cam: 'feixe', proc: { nivel: 2.3, vazao: 1 }, par: {},
    h: `<p>Depois de emitir, o cristal do transdutor continua vibrando por um instante e não consegue ouvir. Ecos que voltam nesse intervalo se perdem. Neste sensor, isso cobre os primeiros <b>0,25 m</b>.</p>
        <p>O nível nunca pode entrar na zona morta: a medição deixa de acompanhar o líquido e indica nível menor com o tanque transbordando. Por isso o 100 % fica abaixo dela, e a proteção contra transbordo usa uma chave de nível separada.</p>
        <p class="see"><b>Observe:</b> quando o líquido entra na faixa vermelha, o eco do nível some dentro do pulso de emissão na curva e o sensor se agarra ao 2º eco.</p>` },
  { t: 'Feixe e ecos falsos', run: 'Colocar o obstáculo', cam: 'feixe', proc: { nivel: 0.8, obstaculo: 1 }, par: {},
    h: `<p>O som abre em cone de 11°. Quanto mais longe, maior o círculo coberto no líquido:</p>
        <div class="formula">Ø = 2 × D × tan(5,5°)</div>
        <p>Tudo o que entra no cone devolve eco: tubo, escada, serpentina, cordão de solda, jato de enchimento. O eco do obstáculo chega antes do eco do líquido e o sensor passa a indicar um nível alto e fixo.</p>
        <p>Correções: mudar o sensor de lugar ou ligar a <b>supressão de sinal falso</b>, que grava os ecos fixos do tanque e sobe o limiar naquele ponto.</p>
        <p class="see"><b>Observe:</b> com o obstáculo, a indicação trava em 1,80 m (72 %). Na aba Bancada, ligue “Supressão de sinal falso” e veja o limiar cobrir o eco falso.</p>` },
  { t: 'Temperatura', run: 'Aquecer a 50 °C sem correção', cam: 'geral', proc: { temp: 50 }, par: { correcaoTemp: 0 },
    h: `<p>A velocidade do som no ar depende da temperatura:</p>
        <div class="formula">c ≈ 331,3 + 0,606 × T  (m/s)</div>
        <p>São cerca de 0,17 % por °C. Se o sensor calculasse sempre com 20 °C e o ar estivesse a 50 °C, a distância sairia 5 % menor. Por isso o transdutor tem um sensor de temperatura e corrige <b>c</b> sozinho.</p>
        <p>A correção só vale para ar. Vapor de solvente e outros gases mudam <b>c</b> e o erro volta. Sol direto no sensor também engana a correção.</p>
        <p class="see"><b>Observe:</b> sem a correção, a 50 °C, o nível indicado sobe cerca de 10 cm com o líquido parado. Religue a correção na Bancada e o erro some.</p>` },
  { t: 'Espuma e perda de eco', run: 'Cobrir de espuma', cam: 'geral', proc: { espuma: 90 }, par: {},
    h: `<p>Espuma densa, superfície muito agitada e vapor amortecem o som. O eco enfraquece até cair abaixo do limiar de detecção.</p>
        <p>Sem eco válido, o transmissor mostra <b>E013</b> e leva a corrente para o modo de falha escolhido: abaixo de 3,6 mA, 20,5 mA, 22 mA ou manter o último valor.</p>
        <p>Com espuma permanente, use tubo acalmador ou radar de onda guiada.</p>
        <p class="see"><b>Observe:</b> na Bancada, mova a espuma aos poucos e veja o pico baixar na curva. Depois troque o modo de falha para “Manter valor”: a saída congela e ninguém percebe o defeito.</p>` },
  { t: 'Regras de instalação', run: 'Ver o tanque por cima', cam: 'topo', proc: {}, par: {},
    h: `<ul>
        <li>Pelo menos <b>200 mm</b> da parede. Em teto abaulado, fora do centro, que concentra ecos múltiplos.</li>
        <li>Nunca sobre o jato de enchimento.</li>
        <li>Perpendicular à superfície do líquido.</li>
        <li>A ponta do transdutor sai pelo menos <b>10 mm</b> abaixo da luva ou do bocal.</li>
        <li>Aperto pelo sextavado de 60 mm, no máximo <b>25 Nm</b>. Nunca girar pela carcaça.</li>
        <li>Nível máximo sempre abaixo da zona morta.</li>
        <li>Supressão de sinal falso com o nível baixo, e com o agitador ligado se houver.</li>
        </ul>
        <p class="see"><b>Observe:</b> na vista de topo, o círculo laranja é a área que o feixe cobre no líquido. Ela precisa ficar livre.</p>` },
  { t: 'Do transmissor ao CLP', run: 'Ligar o CLP de demonstração', cam: 'painel', proc: { nivel: 1.5 }, par: {}, demo: true,
    h: `<p>O transmissor entrega <b>corrente</b>: 4 mA em 0 % e 20 mA em 100 %. O cartão analógico do CLP converte em contagem de 15 bits:</p>
        <div class="formula">LT01_Bruto = (I − 4) ÷ 16 × 32767</div>
        <p>O programa do CLP desfaz a conta (<b>% = bruto ÷ 32767 × 100</b>), compara com os limites e acende os sinaleiros do painel. A IHM mostra só o que o CLP calculou.</p>
        <p>Abaixo de 3,8 mA a contagem fica menor que −410: é falha do transmissor ou cabo rompido, não é tanque vazio.</p>
        <p class="see"><b>Observe:</b> com o CLP de demonstração ligado, mova o nível na Bancada e veja LAL, LAH e os outros acenderem no painel. Depois faça o mesmo com o seu CLP, pelo botão “Comunicação com o CLP”.</p>` },
];
let passo = 0;
function mostrarPasso(i) {
  passo = clamp(i, 0, AULA.length - 1);
  const L = AULA[passo];
  $('lsTitle').textContent = `${passo + 1}. ${L.t}`;
  $('lsBody').innerHTML = L.h;
  $('lsRun').textContent = L.run;
  $('lsCount').textContent = `passo ${passo + 1} de ${AULA.length}`;
  $('lsPrev').disabled = passo === 0; $('lsNext').disabled = passo === AULA.length - 1;
  [...$('steps').children].forEach((b, k) => (k === passo ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
}
async function montarPasso() {
  const L = AULA[passo];
  await cmd({ tipo: 'cenario', proc: L.proc, par: L.par });
  if (L.demo && !(E.rede.conectado)) await cmd({ tipo: 'demo', ligado: true });
  P.s = 0; P.wait = 0;
  for (const k of Object.keys(mexido)) mexido[k] = 0;
  if (ok3d) cena.ir(L.cam);
}

// ------------------------------------------------------------------ bancada
function sincronizar(forcar) {
  if (!E) return;
  const pr = E.proc, p = E.par, set = (id, v) => { if (forcar || livre(id)) $(id).value = v; };
  set('inLevel', pr.nivel); $('outLevel').textContent = fmt(livre('inLevel') || forcar ? pr.nivel : +$('inLevel').value, 2) + ' m';
  set('inTemp', pr.temp); $('outTemp').textContent = fmt(+$('inTemp').value, 0) + ' °C';
  set('inFoam', pr.espuma); $('outFoam').textContent = $('inFoam').value + ' %';
  set('inDamp', Math.min(10, p.atenuacao)); $('outDamp').textContent = (forcar || livre('inDamp') ? p.atenuacao : $('inDamp').value) + ' s';
  if (forcar || livre('inCalMin')) $('inCalMin').value = p.calMin.toFixed(3);
  if (forcar || livre('inCalMax')) $('inCalMax').value = p.calMax.toFixed(3);
  if (forcar || livre('inFail')) $('inFail').value = p.modoFalha;
  for (const [id, v] of [['inObs', pr.obstaculo], ['inCabo', pr.cabo], ['inMap', p.supressao], ['inComp', p.correcaoTemp]]) if (forcar || livre(id)) $(id).checked = !!v;
  $('btnDrain').setAttribute('aria-pressed', String(pr.vazao < 0));
  $('btnStop').setAttribute('aria-pressed', String(pr.vazao === 0));
  $('btnFill').setAttribute('aria-pressed', String(pr.vazao > 0));
  // conexão
  const r = E.rede;
  if (forcar || (livre('inHost') && livre('inPort') && livre('inUnit'))) { $('inHost').value = r.alvo.host; $('inPort').value = r.alvo.port; $('inUnit').value = r.alvo.unitId; }
}
function ligarBancada() {
  const faixa = (id, campo, chave, tipo = 'proc') => $(id).addEventListener('input', (e) => { mexeu(id); cmdSuave(chave, tipo === 'proc' ? { tipo, campo, v: +e.target.value } : { tipo: 'param', id: campo, v: +e.target.value }); sincronizar(); });
  faixa('inLevel', 'nivel', 'nivel'); faixa('inTemp', 'temp', 'temp'); faixa('inFoam', 'espuma', 'espuma'); faixa('inDamp', 'atenuacao', 'at', 'param');
  const chave = (id, tipo, campo) => $(id).addEventListener('change', (e) => { mexeu(id); cmd(tipo === 'proc' ? { tipo, campo, v: e.target.checked ? 1 : 0 } : { tipo: 'param', id: campo, v: e.target.checked ? 1 : 0 }); });
  chave('inObs', 'proc', 'obstaculo'); chave('inCabo', 'proc', 'cabo'); chave('inMap', 'param', 'supressao'); chave('inComp', 'param', 'correcaoTemp');
  $('inFail').addEventListener('change', (e) => { mexeu('inFail'); cmd({ tipo: 'param', id: 'modoFalha', v: +e.target.value }); });
  for (const [id, par] of [['inCalMin', 'calMin'], ['inCalMax', 'calMax']]) {
    $(id).addEventListener('input', () => mexeu(id));
    $(id).addEventListener('change', async (e) => { const r = await cmd({ tipo: 'param', id: par, v: +String(e.target.value).replace(',', '.') }); mexido[id] = 0; if (r.ok) e.target.value = r.v.toFixed(3); });
  }
  $('btnDrain').addEventListener('click', () => cmd({ tipo: 'proc', campo: 'vazao', v: -1 }));
  $('btnStop').addEventListener('click', () => cmd({ tipo: 'proc', campo: 'vazao', v: 0 }));
  $('btnFill').addEventListener('click', () => cmd({ tipo: 'proc', campo: 'vazao', v: 1 }));
  $('btnReset').addEventListener('click', async () => { await cmd({ tipo: 'cenario' }); for (const k of Object.keys(mexido)) mexido[k] = 0; if (ok3d) cena.ir('geral'); });
  $('btnPause').addEventListener('click', (e) => { P.paused = !P.paused; e.currentTarget.setAttribute('aria-pressed', String(P.paused)); e.currentTarget.textContent = P.paused ? 'Soltar pulso' : 'Pausar pulso'; });
  if (P.paused) { $('btnPause').setAttribute('aria-pressed', 'true'); $('btnPause').textContent = 'Soltar pulso'; P.s = 1.2; }
  document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => ok3d && cena.ir(b.dataset.cam)));
}

// ------------------------------------------------------------------ abas
function abrirAba(nome) {
  mostrarLado();
  document.querySelectorAll('.abas button').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === nome));
  document.querySelectorAll('.painel').forEach((p) => { p.hidden = p.id !== `aba-${nome}`; });
}

// ------------------------------------------------------------------ ocultar o painel lateral e recolher seções
function ligarLayout() {
  const app = document.querySelector('.app'), b = $('btnLado');
  const aplicar = (oculto) => { app.classList.toggle('sem-lado', oculto); b.setAttribute('aria-pressed', String(oculto)); b.textContent = oculto ? 'Mostrar painel' : 'Ocultar painel'; };
  aplicar(ler('lt01.lado') === 'oculto');
  b.addEventListener('click', () => { const oculto = !app.classList.contains('sem-lado'); aplicar(oculto); gravar('lt01.lado', oculto ? 'oculto' : 'visivel'); });
  let salvas = {}; try { salvas = JSON.parse(ler('lt01.secoes') || '{}'); } catch (_) { salvas = {}; }
  document.querySelectorAll('details.sec').forEach((d) => {
    if (d.id in salvas) d.open = !!salvas[d.id];
    d.addEventListener('toggle', () => { salvas[d.id] = d.open; gravar('lt01.secoes', JSON.stringify(salvas)); });
  });
}
function mostrarLado() { if (document.querySelector('.app').classList.contains('sem-lado')) $('btnLado').click(); }

// ------------------------------------------------------------------ aba CLP
function copiar(texto, onde) {
  const feito = () => { if (onde) { onde.textContent = 'copiado'; setTimeout(() => { onde.textContent = ''; }, 1800); } };
  if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(texto).then(feito, () => copiarAntigo(texto, feito)); } else copiarAntigo(texto, feito);
}
function copiarAntigo(texto, feito) {      // por IP (http) o navegador não libera a área de transferência moderna
  const t = document.createElement('textarea'); t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); feito(); } catch (_) { /* o usuário copia à mão */ }
  t.remove();
}
function montarTabelaTags() {
  const linhas = (dir) => INFO.tags.filter((t) => t.dir === dir).map((t) => `<tr${dir === 'clp' ? ' class="do-clp"' : ''} title="${esc(t.desc)}"><td class="n">${t.nome}</td><td>${t.tipo}</td><td>${t.tabela.replace(' register', '').replace(' input', '')} ${t.endereco}</td><td class="e">${t.codesys}</td><td class="v" id="tv-${t.nome}">—</td></tr>`).join('');
  $('tabTags').innerHTML = `<colgroup><col style="width:26%"><col style="width:12%"><col style="width:21%"><col style="width:20%"><col style="width:21%"></colgroup>
    <tr><th>Variável</th><th>Tipo</th><th>Modbus</th><th>CODESYS</th><th class="v">Valor</th></tr>
    <tr class="sep"><td colspan="5">o simulador escreve, o CLP lê (FC16)</td></tr>${linhas('sim')}
    <tr class="sep do-clp"><td colspan="5">retorno do CLP: o CLP escreve, o simulador lê (FC02 e FC04)</td></tr>${linhas('clp')}`;
  $('inFail').innerHTML = INFO.parametros.find((p) => p.id === 'modoFalha').opcoes.map((o, i) => `<option value="${i}">${esc(o)}</option>`).join('');
}
function textoTabela() {
  return ['Variável\tSentido\tTipo\tTabela Modbus\tEndereço\tClássico\tCODESYS\tEscala\tDescrição']
    .concat(INFO.tags.map((t) => [t.nome, t.sentido, t.tipo, t.tabela, t.endereco, t.classico, t.codesys, t.escala, t.desc].join('\t'))).join('\n');
}
function desenharClp() {
  const r = E.rede, c = E.clp;
  const pill = $('pillRede');
  if (r.conectado) { pill.className = 'pill ok'; pill.textContent = r.demo ? 'CLP de demonstração' : 'Conectado'; }
  else if (r.desejado) { pill.className = 'pill warn'; pill.textContent = 'Procurando o CLP…'; }
  else { pill.className = 'pill warn'; pill.textContent = 'Sem CLP'; }
  desenharTarja();
  $('tabTags').classList.toggle('sem-retorno', !r.retorno);
  if (livre('inRetorno')) $('inRetorno').checked = !!r.retorno;
  if (!acaoRede) $('btnDemo').textContent = r.demo ? 'Desligar CLP de demonstração' : 'Ligar CLP de demonstração';
  $('btnDesconectar').disabled = !r.desejado;
  const v = { LT01_Bruto: E.med.bruto };
  for (const t of INFO.tags) {
    const el = $('tv-' + t.nome); if (!el) continue;
    let x = t.dir === 'sim' ? v[t.nome] : c ? c[t.nome] : undefined;
    if (x === undefined || x === null) { el.textContent = '—'; el.classList.remove('on'); continue; }
    if (t.tipo === 'BOOL') { el.textContent = x ? '1' : '0'; el.classList.toggle('on', !!x); } else el.textContent = t.tipo === 'REAL' ? fmt(x, 2) + (t.un ? ' ' + t.un : '') : String(x).replace('-', '−');
  }
  const e = r.est, d = $('filaStats');
  d.innerHTML = e ? `<dt>Requisições por segundo</dt><dd>${fmt(e.taxa, 1)}</dd>
    <dt>Enviadas · respondidas</dt><dd>${e.enviadas} · ${e.ok}</dd>
    <dt>Resposta: última · média · máx.</dt><dd>${e.rtUltimo} · ${fmt(e.rtMedio, 1)} · ${e.rtMax} ms</dd>
    <dt>Timeouts · exceções · repetições</dt><dd>${e.timeouts} · ${e.excecoes} · ${e.retentativas}</dd>
    <dt>Esperando na fila (P0 P1 P2 P3)</dt><dd>${e.fila.join(' ')}</dd>
    <dt>Varredura: leitura · escrita · sincronismo</dt><dd>${r.periodos.leitura || 'desligada'} · ${r.periodos.escrita} · ${r.periodos.sinc} ms${r.lento ? ' (reduzida)' : ''}</dd>
    <dt>Reconexões</dt><dd>${r.reconexoes}</dd>` : '<dt>Sem conexão</dt><dd>—</dd>';
  $('msgs').innerHTML = E.mensagens.slice().reverse().map((m) => `<li>${m.h}  ${esc(m.msg)}</li>`).join('');
}
// Tarja de estado: o aluno precisa VER o que aconteceu depois de clicar em Conectar.
let acaoRede = null, erroLocal = '', horaConexao = '', tarjaAnt = '';
function desenharTarja() {
  const r = E.rede, alvo = `${$('inHost').value.trim()}:${$('inPort').value}`;
  let cor, t, d;
  if (acaoRede) { cor = 'amarela'; t = acaoRede.t; d = acaoRede.d; }
  else if (r.conectado) {
    if (!horaConexao) horaConexao = new Date().toLocaleTimeString('pt-BR');
    cor = 'verde'; t = r.demo ? 'Conectado ao CLP de demonstração' : 'Conectado ao CLP';
    d = `${r.endpoint} · desde ${horaConexao} · LT01_Bruto entregue: ${r.enviado === null || r.enviado === undefined ? 'enviando…' : String(r.enviado).replace('-', '−')}`;
    if (r.aviso) { cor = 'amarela'; t = 'Conectado, mas o retorno do CLP falhou'; d = r.aviso; }
  } else {
    horaConexao = '';
    if (r.tentando) { cor = 'amarela'; t = 'Procurando o CLP…'; d = `Tentando ${r.alvo.host}:${r.alvo.port}.${r.erro ? ' Última resposta: ' + r.erro : ''}`; }
    else if (r.desejado) { const m = r.erro || 'O CLP não respondeu'; cor = 'vermelha'; t = 'Não conectou'; d = m.charAt(0).toUpperCase() + m.slice(1) + (/[.?!]$/.test(m) ? ' ' : '. ') + 'Nova tentativa automática a cada 5 s.'; }
    else if (erroLocal) { cor = 'vermelha'; t = 'Não conectou'; d = erroLocal.charAt(0).toUpperCase() + erroLocal.slice(1); }
    else { cor = 'cinza'; t = 'Sem CLP'; d = 'Digite o IP do seu CLP e clique em Conectar.'; }
  }
  const el = $('tarjaRede'), chave = cor + t;
  $('tarjaT').textContent = t; $('tarjaD').textContent = d;
  if (chave !== tarjaAnt) { tarjaAnt = chave; el.className = 'tarja ' + cor; void el.offsetWidth; el.classList.add('mudou'); }
}

function ligarClp() {
  for (const id of ['inHost', 'inPort', 'inUnit']) $(id).addEventListener('input', () => mexeu(id));
  // o botão é guardado numa variável: depois de um await, e.currentTarget já é nulo (era isso que travava o Conectar)
  const comBotao = (id, emCurso, tarja, acao) => $(id).addEventListener('click', async () => {
    const b = $(id), rotulo = b.textContent;
    b.disabled = true; b.textContent = emCurso; erroLocal = ''; acaoRede = tarja(); desenharTarja();
    let r; try { r = await acao(); } catch (err) { r = { ok: false, erro: 'o simulador não respondeu: ' + err.message }; }
    erroLocal = r.ok ? '' : r.erro; acaoRede = null; b.disabled = false; b.textContent = rotulo;
    try { E = await (await fetch(`api/estado?s=${sid}`)).json(); } catch (_) { /* o próximo estado chega pelo SSE */ }
    desenharClp();
  });
  comBotao('btnConectar', 'Conectando…', () => ({ t: 'Conectando…', d: `Abrindo a conexão com ${$('inHost').value.trim()}:${$('inPort').value}. Pode levar até 3 segundos.` }),
    () => { for (const k of ['inHost', 'inPort', 'inUnit']) mexido[k] = 0; return cmd({ tipo: 'conectar', host: $('inHost').value.trim(), port: +$('inPort').value, unitId: +$('inUnit').value }); });
  $('btnDesconectar').addEventListener('click', async () => { erroLocal = ''; await cmd({ tipo: 'desconectar' }); });
  comBotao('btnDemo', 'Aguarde…', () => ({ t: E.rede.demo ? 'Desligando o CLP de demonstração…' : 'Ligando o CLP de demonstração…', d: 'Um CLP interno, só da sua sessão.' }), () => cmd({ tipo: 'demo', ligado: !E.rede.demo }));
  $('inRetorno').addEventListener('change', (e) => { mexeu('inRetorno'); cmd({ tipo: 'retorno', ligado: e.target.checked }); });
  $('btnCopiarTags').addEventListener('click', () => copiar(textoTabela(), $('msgCopia')));
}

// ------------------------------------------------------------------ missões
let feitas = new Set(), mems = {}, vivas = {};
const chaveMissoes = () => `lt01.missoes.${sid}`;
function carregarMissoes() { try { feitas = new Set(JSON.parse(ler(chaveMissoes()) || '[]')); } catch (_) { feitas = new Set(); } mems = {}; desenharMissoes(true); }
function avaliarMissoes() {
  vivas = avaliar(E, mems, 0.1);
  $('notaMissoes').textContent = E.rede.retorno ? 'Programe no seu CLP e cumpra cada item. Com o CLP de demonstração elas acendem para você ver como é, mas não ficam gravadas.' : 'As missões de alarme leem os sinaleiros do seu CLP: ligue "Sinaleiros no painel (retorno do CLP)" na aba CLP para elas valerem.';
  let mudou = false;
  if (!E.rede.demo) for (const m of MISSOES) if (vivas[m.id] && !feitas.has(m.id)) { feitas.add(m.id); mudou = true; }
  if (mudou) gravar(chaveMissoes(), JSON.stringify([...feitas]));
  desenharMissoes(mudou);
}
let htmlMissoes = '';
function desenharMissoes() {
  const h = MISSOES.map((m) => `<li class="${feitas.has(m.id) ? 'feita' : vivas[m.id] ? 'vivo' : ''}"><b>${esc(m.titulo)}</b><span>${esc(m.texto)}</span><small>${esc(m.dica)}</small></li>`).join('');
  if (h !== htmlMissoes) { htmlMissoes = h; $('listaMissoes').innerHTML = h; }
  $('contMissoes').textContent = `${feitas.size}/${MISSOES.length}`;
}

// ------------------------------------------------------------------ assistente "Comunicação com o CLP"
let asPasso = 0;
const AS = [
  { t: '1. O que é trocado', h: () => { const ret = E && E.rede.retorno; return `<h3>O simulador é o cliente, o CLP é o servidor</h3>
      <p class="porque">O simulador faz o papel do transmissor e do cartão analógico: escreve a contagem do nível no CLP. ${ret ? 'Com o <b>retorno do CLP ligado</b>, o CLP devolve os sinaleiros e o valor da IHM do painel 3D.' : 'O <b>retorno do CLP está desligado</b> nesta sessão: o mapa inteiro é uma variável só, e os alarmes ficam por sua conta no CLP.'}</p>
      <div class="tw"><table class="tags"><tr><th>Variável</th><th>Sentido</th><th>Tipo</th><th>Modbus</th><th>CODESYS</th></tr>
      ${INFO.tags.filter((t) => ret || t.dir === 'sim').map((t) => `<tr title="${esc(t.desc)}"><td class="n">${t.nome}</td><td>${t.sentido}</td><td>${t.tipo}</td><td>${t.tabela} ${t.endereco}</td><td class="e">${t.codesys}</td></tr>`).join('')}</table></div>
      <p class="mini">LT01_Bruto: 0 a 32767 = 4 a 20 mA = 0 a 100 %.${ret ? ' Nivel_Pct viaja multiplicado por 100 (4000 = 40,00 %).' : ' Para ver os sinaleiros no painel 3D, ligue "Sinaleiros no painel (retorno do CLP)" na aba CLP.'}</p>`; } },
  { t: '2. A rede no CODESYS', h: () => { const ret = E && E.rede.retorno; return `<h3>Criar o servidor Modbus no CLP</h3>
      <ol>
        <li>Projeto padrão com o device <b>CODESYS Control Win V3 x64</b>.</li>
        <li>Botão direito em <b>Device</b> → <b>Add Device</b> → <b>Ethernet</b>. Na aba General, em <b>Interface</b>, escolha a placa de rede por onde o simulador chega (a do Wi-Fi ou do cabo; no HUB, a <b>SIM-HUB</b>).</li>
        <li>Botão direito em <b>Ethernet</b> → <b>Add Device</b> → Modbus → <b>Modbus TCP Slave Device</b>.</li>
        <li>Na configuração do Slave Device: <b>Slave Port 502</b> e <b>Holding Registers (%IW)</b> com 1 ou mais. Endereço inicial 0.${ret ? ' Como o retorno do CLP está ligado: <b>Input Registers (%QW)</b> com 1 ou mais, e marque <b>Discrete Bit Areas</b> com 8 ou mais <b>Discrete Inputs (%QX)</b>.' : ''}</li>
        <li>Desmarque o <b>Watchdog</b> do Slave Device, ou ponha 5000 ms: o simulador só reescreve o valor quando ele muda e uma vez por segundo.</li>
        <li><b>MainTask</b> cíclica de 20 ms.</li>
      </ol>
      <p class="mini">Os nomes dos campos são os do CODESYS V3.5 e podem mudar um pouco com a versão. Este roteiro foi conferido com o CLP de demonstração interno, não com um CODESYS real.</p>`; } },
  { t: '3. Variáveis e programa', h: () => `<h3>GVL_SIM, PRG_Modbus_IO e o seu programa</h3>
      <p>Crie uma GVL chamada <b>GVL_SIM</b> e um programa <b>PRG_Modbus_IO</b>, chamado no início da MainTask. Depois escreva o seu programa de escala e alarmes (ou use o PRG_Nivel como referência). Sem o retorno do CLP, do PRG_Modbus_IO só a linha do LT01_Bruto é necessária.</p>
      <div class="linha"><b>GVL_SIM</b><button class="btn small" data-copia="gvl">Copiar</button><span class="mini"></span></div><pre>${esc(INFO.st.gvl)}</pre>
      <div class="linha"><b>PRG_Modbus_IO</b><button class="btn small" data-copia="io">Copiar</button><span class="mini"></span></div><pre>${esc(INFO.st.io)}</pre>
      <div class="linha"><b>PRG_Nivel (solução de referência)</b><button class="btn small" data-copia="nivel">Copiar</button><span class="mini"></span></div><pre>${esc(INFO.st.nivel)}</pre>` },
  { t: '4. Conectar e conferir', h: () => `<h3>Ligar o simulador no seu CLP</h3>
      <ol>
        <li>Faça o download do programa e ponha o CLP em <b>RUN</b>.</li>
        <li>Na aba <b>CLP</b> deste simulador, digite o IP do <b>seu</b> CLP (o do PC onde o CODESYS roda) e clique em <b>Conectar</b>.</li>
        <li>Confira os itens abaixo.</li>
      </ol>
      <ul class="missoes" id="asCheck"></ul>
      <p class="mini">Se outro aluno já estiver conectado no mesmo IP e porta, o simulador recusa e avisa quem é.</p>` },
];
function desenharAssistente() {
  $('asTrilha').innerHTML = AS.map((x, i) => `<button class="${i === asPasso ? 'ativa' : ''}" data-i="${i}">${x.t}</button>`).join('');
  $('asCorpo').innerHTML = AS[asPasso].h();
  $('asVoltar').disabled = asPasso === 0;
  $('asAvancar').textContent = asPasso === AS.length - 1 ? 'Ir para a aba CLP' : 'Avançar';
  conferirAssistente();
}
function conferirAssistente() {
  const el = $('asCheck'); if (!el || !E) return;
  const r = E.rede, c = E.clp || {};
  const itens = [
    [r.conectado, 'Conexão aberta', r.conectado ? r.endpoint : (r.erro || 'ainda não conectou')],
    [r.conectado && r.enviado !== null, 'LT01_Bruto entregue ao CLP', r.conectado ? `último valor aceito pelo CLP: ${r.enviado ?? '—'}. No CODESYS, online, GVL_SIM.LT01_Bruto deve mostrar o mesmo` : 'o simulador escreve o holding register 0'],
  ];
  if (r.retorno) itens.push([r.conectado && E.med.status === 'ok' && Math.abs((c.Nivel_Pct ?? -999) - E.med.pct) < 0.5, 'Nivel_Pct igual ao do transmissor', `transmissor ${fmt(E.med.pct, 1)} % · CLP ${c.Nivel_Pct === undefined ? '—' : fmt(c.Nivel_Pct, 1) + ' %'}`]);
  const h = itens.map(([ok, t, d]) => `<li class="${ok ? 'feita' : ''}"><b>${t}</b><span>${esc(d)}</span></li>`).join('');
  if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; }
}
function ligarAssistente() {
  $('btnAssistente').addEventListener('click', () => { asPasso = 0; $('dlgAssist').hidden = false; desenharAssistente(); });
  $('asFechar').addEventListener('click', () => { $('dlgAssist').hidden = true; });
  $('asVoltar').addEventListener('click', () => { asPasso = Math.max(0, asPasso - 1); desenharAssistente(); });
  $('asAvancar').addEventListener('click', () => { if (asPasso === AS.length - 1) { $('dlgAssist').hidden = true; abrirAba('clp'); } else { asPasso++; desenharAssistente(); } });
  $('asTrilha').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { asPasso = +b.dataset.i; desenharAssistente(); } });
  $('asCorpo').addEventListener('click', (e) => { const b = e.target.closest('[data-copia]'); if (b) copiar(INFO.st[b.dataset.copia], b.nextElementSibling); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('dlgAssist').hidden = true; if (sid && E) $('dlgSessao').hidden = true; } });
}

// ------------------------------------------------------------------ estado novo e laço de desenho
function aoEstado() {
  if (!E) return;
  sincronizar(false); desenharLeituras(); desenharClp(); avaliarMissoes(); conferirAssistente();
}
function estadoVisual() {
  const m = E.med;
  return {
    nivel: vis.nivel, vazao: E.proc.vazao, espuma: E.proc.espuma, obstaculo: E.proc.obstaculo, sel: m.sel, ecoFalso: m.ecoFalso,
    D: m.D, L: m.L, pct: m.pct, erro: m.erro, ligado: m.status !== 'desligado', valido: m.status !== 'falha' && m.status !== 'desligado',
    clp: E.rede.conectado ? E.clp : null, retorno: E.rede.retorno, mA: m.mA, bruto: m.bruto,
  };
}
let ultimo = performance.now(), lento = 0;
function quadro(agora) {
  const dt = Math.min(0.1, (agora - ultimo) / 1000); ultimo = agora;
  if (E) {
    vis.nivel += (E.proc.nivel - vis.nivel) * (1 - Math.exp(-dt / 0.09));
    avancarPulso(dt);
    lento += dt; const tique = lento > 0.12; if (tique) lento = 0;
    if (ok3d) { const V = estadoVisual(); if (tique) cena.telas(V); cena.quadro(dt, agora / 1000, V, P); }
    desenharEco(); desenharCronometro();
  }
  requestAnimationFrame(quadro);
}

// ------------------------------------------------------------------ início
(async function iniciar() {
  INFO = await api('api/info');
  $('versaoTela').textContent = ` · v${VERSAO_TELA}`;
  if (INFO.versao !== VERSAO_TELA) {     // arquivos novos na pasta com o programa antigo ainda rodando (ou o contrário)
    const f = $('faixaVersao'); f.hidden = false;
    f.textContent = `Atenção: a tela é da versão ${VERSAO_TELA}, mas o programa do simulador que está rodando é da versão ${INFO.versao}. Feche o simulador (a janela preta ou o cartão do HUB) e abra de novo.`;
  }
  montarTabelaTags(); ligarLayout(); ligarSessoes(); ligarBancada(); ligarClp(); ligarAssistente();
  document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));
  const st = $('steps');
  AULA.forEach((L, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = i + 1; b.title = L.t; b.setAttribute('aria-label', `Passo ${i + 1}: ${L.t}`); b.addEventListener('click', () => mostrarPasso(i)); st.appendChild(b); });
  $('lsPrev').addEventListener('click', () => mostrarPasso(passo - 1));
  $('lsNext').addEventListener('click', () => mostrarPasso(passo + 1));
  $('lsRun').addEventListener('click', montarPasso);
  $('btnZerarMissoes').addEventListener('click', () => { feitas = new Set(); mems = {}; gravar(chaveMissoes(), '[]'); desenharMissoes(); });
  mostrarPasso(0);
  try {
    cena = criarCena({ view: $('view'), canvas: $('gl'), labelsEl: $('labels'), insetEl: $('inset'), reduzido: REDUZIDO,
      aoMudarCamera: (nome) => document.querySelectorAll('[data-cam]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === nome))) });
    cena.ir('geral', true); ok3d = true;
  } catch (err) { ok3d = false; $('view').classList.add('fail'); console.warn('3D indisponível:', err); }

  const daUrl = new URL(location.href).searchParams.get('s');
  if (!(await entrar(daUrl)) && !(await entrar(ler(CHAVE)))) abrirSessoes();
  requestAnimationFrame(quadro);
  window.__sim = { get E() { return E; }, cmd, entrar, abrirAba, mostrarPasso };
})();
