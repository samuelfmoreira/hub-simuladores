// Som da sirene H4 (Web Audio, sem arquivos): tom bitonal industrial 650/950 Hz, alternando a cada 0,4 s.
// O navegador só libera áudio depois de um clique na página; até lá o botão mostra "clique para ativar o som".
export function createSirene(btn) {
  let ctx = null, osc = null, gain = null, timer = null, tocando = false, pedido = false;
  let mudo = false;
  try { mudo = localStorage.getItem('sirene-mudo') === '1'; } catch (_) { /* sem storage */ }
  const rotulo = () => {
    if (!btn) return;
    btn.textContent = mudo ? '🔇 Som desligado' : (ctx && ctx.state === 'running' ? '🔊 Som ligado' : '🔈 Clique para ativar o som');
    btn.setAttribute('aria-pressed', String(!mudo));
  };
  function garantirContexto() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().then(rotulo).catch(() => {});
    return ctx;
  }
  // qualquer clique na página libera o áudio (exigência dos navegadores)
  window.addEventListener('pointerdown', () => { if (!mudo) { garantirContexto(); rotulo(); if (pedido && !tocando) iniciar(); } }, { passive: true });
  function iniciar() {
    const c = garantirContexto(); if (!c || c.state !== 'running' || tocando || mudo) return;
    osc = c.createOscillator(); gain = c.createGain();
    osc.type = 'square'; osc.frequency.value = 650;
    const filtro = c.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 2200;
    gain.gain.value = 0; gain.gain.setTargetAtTime(0.06, c.currentTime, 0.02);
    osc.connect(filtro); filtro.connect(gain); gain.connect(c.destination); osc.start();
    let alto = false;
    timer = setInterval(() => { alto = !alto; osc.frequency.setTargetAtTime(alto ? 950 : 650, c.currentTime, 0.01); }, 400);
    tocando = true;
  }
  function parar() {
    if (!tocando) return;
    clearInterval(timer); timer = null;
    try { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03); const o = osc; setTimeout(() => { try { o.stop(); } catch (_) { /* já parou */ } }, 150); } catch (_) { /* ok */ }
    osc = null; tocando = false;
  }
  if (btn) btn.onclick = () => { mudo = !mudo; try { localStorage.setItem('sirene-mudo', mudo ? '1' : '0'); } catch (_) { /* ok */ } if (mudo) parar(); else { garantirContexto(); if (pedido) iniciar(); } rotulo(); };
  rotulo();
  return function update(ligada) {
    pedido = !!ligada;
    if (pedido && !tocando) iniciar(); else if (!pedido && tocando) parar();
    rotulo();
  };
}
