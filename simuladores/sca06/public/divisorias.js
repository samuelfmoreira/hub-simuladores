/* Divisórias arrastáveis entre os painéis (drive | painel do meio | bancada 3D).
   Arraste para mudar a largura; dois cliques voltam ao padrão. As larguras ficam guardadas neste PC. */
(() => {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  const largo = matchMedia('(min-width: 1200px)');
  const medio = matchMedia('(min-width: 901px)');
  const CHAVE = 'sca06.paineis';
  const MIN = { front: 220, side: 340, stage: 360 };
  let salvo = {};
  try { salvo = JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch (_) { salvo = {}; }
  const front = () => layout.querySelector('.front');
  const side = () => layout.querySelector('.side');

  const criar = (id, titulo) => {
    const d = document.createElement('div');
    d.className = 'splitter'; d.id = id; d.title = titulo;
    d.setAttribute('role', 'separator'); d.setAttribute('aria-orientation', 'vertical');
    layout.appendChild(d);
    return d;
  };
  const spFront = criar('spFront', 'Arraste para mudar a largura do drive. Dois cliques voltam ao padrão.');
  const spSide = criar('spSide', 'Arraste para mudar a largura do painel. Dois cliques voltam ao padrão.');

  let pedido = 0;
  const avisar3D = () => { cancelAnimationFrame(pedido); pedido = requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); };

  function posicionar() {
    if (!medio.matches) { spFront.hidden = true; spSide.hidden = true; return; }
    const base = layout.getBoundingClientRect().left;
    const s = side().getBoundingClientRect();
    spSide.hidden = false;
    spSide.style.left = (s.right - base) + 'px';
    if (largo.matches) {
      spFront.hidden = false;
      spFront.style.left = (front().getBoundingClientRect().right - base) + 'px';
    } else spFront.hidden = true;
  }
  function aplicar() {
    if (salvo.front) layout.style.setProperty('--col-front', salvo.front + 'px'); else layout.style.removeProperty('--col-front');
    if (salvo.side) layout.style.setProperty('--col-side', salvo.side + 'px'); else layout.style.removeProperty('--col-side');
    requestAnimationFrame(() => { posicionar(); avisar3D(); });
  }
  const guardar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(salvo)); } catch (_) { /* sem armazenamento: só nesta sessão */ } };

  function arrastar(sp, qual) {
    sp.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sp.setPointerCapture(e.pointerId);
      sp.classList.add('drag'); document.body.classList.add('arrastando');
      const total = layout.getBoundingClientRect();
      const mover = (ev) => {
        if (qual === 'front') {
          const f = front().getBoundingClientRect();
          const maxF = total.width - side().getBoundingClientRect().width - MIN.stage;
          salvo.front = Math.round(Math.max(MIN.front, Math.min(maxF, ev.clientX - f.left)));
          layout.style.setProperty('--col-front', salvo.front + 'px');
        } else {
          const s = side().getBoundingClientRect();
          const antes = largo.matches ? front().getBoundingClientRect().width : 0;
          const maxS = total.width - antes - MIN.stage;
          salvo.side = Math.round(Math.max(MIN.side, Math.min(maxS, ev.clientX - s.left)));
          layout.style.setProperty('--col-side', salvo.side + 'px');
        }
        posicionar(); avisar3D();
      };
      const soltar = () => {
        sp.classList.remove('drag'); document.body.classList.remove('arrastando');
        sp.removeEventListener('pointermove', mover); sp.removeEventListener('pointerup', soltar); sp.removeEventListener('pointercancel', soltar);
        guardar();
      };
      sp.addEventListener('pointermove', mover); sp.addEventListener('pointerup', soltar); sp.addEventListener('pointercancel', soltar);
    });
    sp.addEventListener('dblclick', () => { delete salvo[qual]; guardar(); aplicar(); });
  }
  arrastar(spFront, 'front');
  arrastar(spSide, 'side');

  window.addEventListener('resize', posicionar);
  largo.addEventListener('change', aplicar);
  medio.addEventListener('change', aplicar);
  aplicar();
})();
