'use strict';
// Carga mecânica da bomba B-01 vista pelo motor do CFW500.
// Mesma interface que src/plant/conveyor.js do simulador CFW500: cargaNoMotor(), passo(dt, omega), estado(omega).
// O torque vem da hidráulica (vazão e altura manométrica informadas pela física a cada passo).

const RHO_G = 1000 * 9.81;

class PlantaBomba {
  constructor(opts = {}) {
    this.eta = opts.eta ?? 0.62;        // rendimento hidráulico da bomba
    this.j = opts.j ?? 0.004;           // inércia do rotor + acoplamento (kg·m²)
    this.tAtrito = opts.tAtrito ?? 0.15; // atrito seco nos mancais (N·m)
    this.tn = opts.tn ?? 8.4;           // torque nominal do motor (N·m) — 1,5 kW a 1710 rpm
    this.omegaN = opts.omegaN ?? (1710 * 2 * Math.PI / 60);
    this.fracShutoff = opts.fracShutoff ?? 0.30; // potência no shutoff (fração da nominal)
    this.q = 0; this.hb = 0; this.cavit = 0; this.omega = 0;
    this.tCarga = 0;
  }
  // chamado pela física antes de cada passo do inversor
  setHidraulica({ q = 0, hb = 0, cavit = 0 } = {}) { this.q = q; this.hb = hb; this.cavit = cavit; }
  cargaNoMotor() {
    const w = Math.abs(this.omega);
    let t = 0;
    if (w > 1) {
      const pHid = RHO_G * (this.q / 3600) * Math.max(0, this.hb) / this.eta;   // W no eixo
      const tHid = pHid / w;
      const tShut = this.fracShutoff * this.tn * (w / this.omegaN) ** 2;       // bomba contra válvula fechada
      t = Math.max(tHid, tShut) * (1 - 0.6 * this.cavit);                     // cavitando: a bomba "alivia"
    }
    this.tCarga = t;
    // o modelo do CFW500 usa torque viscoso b·ω: b = T/ω reproduz T ∝ ω² ao longo do passo
    return { j: this.j, tGrav: 0, tAtrito: this.tAtrito, b: w > 1 ? t / w : 0 };
  }
  passo(dt, omegaMotor) { this.omega = omegaMotor; }
  estado(omegaMotor) { return { tipo: 'bomba', rpm: (omegaMotor * 60) / (2 * Math.PI), torque: this.tCarga, q: this.q, hb: this.hb }; }
}

module.exports = { PlantaBomba };
