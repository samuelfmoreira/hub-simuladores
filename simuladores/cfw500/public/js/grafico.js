// Registro de tendência (últimos 30 s) — frequência, referência, corrente, Ud, rotação
export class Grafico {
  constructor(canvas, legenda) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.janela = 30; this.dados = [];
    this.series = [
      { k: 'f', nome: 'Frequência de saída (Hz)', cor: '#1d4f9a', max: 70, min: -70 },
      { k: 'ref', nome: 'Referência (Hz)', cor: '#7aa3d8', max: 70, min: -70, tracejado: true },
      { k: 'i', nome: 'Corrente (A) ×10', cor: '#cf2e2e', esc: 10, max: 70, min: -70 },
      { k: 'ixt', nome: 'Ixt motor P0037 (%)', cor: '#e07b14', esc: 0.7, max: 70, min: -70 },
      { k: 'vel', nome: 'Correia (m/s) ×100', cor: '#2e9e4a', esc: 100, max: 70, min: -70 },
    ];
    legenda.innerHTML = this.series.map((s) => `<span style="--c:${s.cor}">${s.nome}</span>`).join('');
  }
  adicionar(est) {
    const t = performance.now() / 1000;
    const d = est.drive;
    this.dados.push({ t, f: d.f, ref: d.pwm ? d.ref : 0, i: d.i, ixt: d.ixt, vel: d.planta.vel });
    while (this.dados.length && t - this.dados[0].t > this.janela) this.dados.shift();
  }
  desenhar() {
    const c = this.c; const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth; const H = c.clientHeight;
    if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const x = this.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const m = { e: 44, d: 10, t: 10, b: 24 };
    const pw = W - m.e - m.d; const ph = H - m.t - m.b;
    const yv = (v) => m.t + ph * (1 - (v + 70) / 140);
    x.strokeStyle = '#e1e3de'; x.fillStyle = '#6c736f'; x.font = '12px Barlow, sans-serif'; x.lineWidth = 1;
    for (let v = -60; v <= 60; v += 20) {
      x.beginPath(); x.moveTo(m.e, yv(v)); x.lineTo(W - m.d, yv(v)); x.stroke();
      x.fillText(String(v), 8, yv(v) + 4);
    }
    x.strokeStyle = '#9da29b'; x.beginPath(); x.moveTo(m.e, yv(0)); x.lineTo(W - m.d, yv(0)); x.stroke();
    if (this.dados.length < 2) return;
    const t1 = this.dados[this.dados.length - 1].t;
    const xt = (t) => m.e + pw * (1 - (t1 - t) / this.janela);
    for (let s = 0; s <= this.janela; s += 5) x.fillText(`-${s}s`, xt(t1 - s) - 10, H - 6);
    for (const s of this.series) {
      x.strokeStyle = s.cor; x.lineWidth = 2; x.setLineDash(s.tracejado ? [6, 4] : []);
      x.beginPath();
      this.dados.forEach((p, i) => { const v = p[s.k] * (s.esc || 1); const px = xt(p.t); const py = yv(Math.max(-70, Math.min(70, v))); if (i) x.lineTo(px, py); else x.moveTo(px, py); });
      x.stroke();
    }
    x.setLineDash([]);
  }
}
