/**
 * =====================================================================
 *  PLANTA: ESTEIRA TRANSPORTADORA (física simplificada)
 * =====================================================================
 *  Cadeia mecânica:   Motor ──► Redutor (i, η) ──► Tambor (D) ──► Correia
 *
 *  v_correia [m/s] = (n_motor [rpm] / i) · π · D / 60
 *
 *  Cargas vistas pelo eixo do MOTOR:
 *   - Atrito (Coulomb): (F_correia + Σ m·g·μ·cosθ + F_travamento) · r / (i · η)
 *   - Gravidade (esteira inclinada): Σ m·g·sinθ · r / i  (puxa a carga para trás)
 *   - Viscoso: b · ω
 *   - Inércia refletida: J = J_redutor + (J_tambores + (m_correia + Σm)·r²) / i²
 *
 *  As caixas ficam sobre a correia (sem escorregamento) e passam por dois
 *  sensores fotoelétricos: S1 (entrada) e S2 (saída).
 *  Didaticamente os sensores estão ligados às entradas DI5 e DI6 do
 *  CFW500 — assim o CLP pode lê-los pela rede através do P0012
 *  (mapeando P0820 = 12 na palavra de leitura #3).
 * =====================================================================
 */
'use strict';

const G = 9.81;

class Conveyor {
  constructor() {
    this.cfg = {
      reducao: 25,          // i  (redutor 25:1)
      diamTambor: 0.14,     // m
      comprimento: 4.0,     // m (entre centros dos tambores)
      massaCorreia: 30,     // kg
      atritoCorreia: 150,   // N (correia deslizando sobre a mesa)
      mu: 0.5,              // atrito caixa/mesa transmitido à correia
      inclinacao: 0,        // graus (positivo: sobe no sentido de avanço)
      massaCaixa: 20,       // kg (massa das novas caixas)
      rendimento: 0.9,      // η do redutor
      jTambores: 0.08,      // kg·m² (soma dos dois tambores)
      jRedutor: 0.0015,     // kg·m² (lado do motor)
      compCaixa: 0.30,      // m
      posS1: 0.55,          // m
      posS2: 3.55,          // m
    };
    this.caixas = [];        // {id, x, massa}
    this.proxId = 1;
    this.posCorreia = 0;     // deslocamento acumulado da correia (m) — usado na textura 3D
    this.angTambor = 0;      // rad
    this.travada = false;    // simula objeto preso / esteira travada
    this.fTrav = 0;          // força de travamento atual (N)
    this.alimentador = { auto: false, intervalo: 4.0, t: 0 };
    this.contEntregues = 0;
    this.contDevolvidas = 0;
    this.s1 = false; this.s2 = false;
  }

  get raio() { return this.cfg.diamTambor / 2; }

  /** Velocidade linear da correia para uma dada velocidade do motor (rad/s) */
  velCorreia(omegaMotor) { return (omegaMotor / this.cfg.reducao) * this.raio; }

  /** Massa total transportada */
  massaTotal() { return this.caixas.reduce((s, c) => s + c.massa, 0); }

  /**
   * Esforços refletidos no eixo do motor.
   * Retorna { tAtrito (módulo, N·m), tGrav (com sinal, N·m), b (N·m·s/rad), j (kg·m²) }
   */
  cargaNoMotor() {
    const c = this.cfg;
    const th = (c.inclinacao * Math.PI) / 180;
    const m = this.massaTotal();
    const fAtr = c.atritoCorreia + m * G * c.mu * Math.cos(th) + this.fTrav;
    const fGrav = m * G * Math.sin(th);
    const k = this.raio / c.reducao;               // transforma força na correia em torque no motor
    return {
      tAtrito: (fAtr * k) / c.rendimento,
      tGrav: -fGrav * k,                            // negativo: tende a fazer a correia voltar
      b: 0.0008,
      j: c.jRedutor + (c.jTambores + (c.massaCorreia + m) * this.raio ** 2) / c.reducao ** 2,
    };
  }

  adicionarCaixa(massa) {
    const xIni = this.cfg.compCaixa / 2 + 0.02;
    // evita sobrepor caixas na entrada
    if (this.caixas.some((cx) => Math.abs(cx.x - xIni) < this.cfg.compCaixa + 0.12)) return false;
    this.caixas.push({ id: this.proxId++, x: xIni, massa: massa || this.cfg.massaCaixa });
    return true;
  }

  limpar() { this.caixas = []; }

  /** Avança a simulação da planta em dt segundos com o motor a omegaMotor (rad/s) */
  passo(dt, omegaMotor) {
    // travamento progressivo (material acumulando): força cresce em ~1,5 s
    this.fTrav += ((this.travada ? 9000 : 0) - this.fTrav) * Math.min(1, dt / 1.5);
    const v = this.velCorreia(omegaMotor);
    const dx = v * dt;
    this.posCorreia += dx;
    this.angTambor += (omegaMotor / this.cfg.reducao) * dt;

    const L = this.cfg.comprimento;
    for (const cx of this.caixas) cx.x += dx;
    // caixas que saíram pela extremidade de descarga caem na caçamba
    const antes = this.caixas.length;
    this.caixas = this.caixas.filter((cx) => {
      if (cx.x > L + 0.25) { this.contEntregues++; return false; }
      if (cx.x < -0.25) { this.contDevolvidas++; return false; }
      return true;
    });
    void antes;

    // alimentador automático
    if (this.alimentador.auto) {
      this.alimentador.t += dt;
      if (this.alimentador.t >= this.alimentador.intervalo) {
        if (this.adicionarCaixa()) this.alimentador.t = 0;
      }
    }

    // sensores fotoelétricos (feixe interrompido pela caixa)
    const meia = this.cfg.compCaixa / 2;
    this.s1 = this.caixas.some((cx) => Math.abs(cx.x - this.cfg.posS1) <= meia);
    this.s2 = this.caixas.some((cx) => Math.abs(cx.x - this.cfg.posS2) <= meia);
  }

  estado(omegaMotor) {
    return {
      cfg: this.cfg,
      caixas: this.caixas.map((c) => ({ id: c.id, x: +c.x.toFixed(4), massa: c.massa })),
      posCorreia: this.posCorreia,
      angTambor: this.angTambor,
      vel: this.velCorreia(omegaMotor),
      travada: this.travada,
      alimentador: { auto: this.alimentador.auto, intervalo: this.alimentador.intervalo },
      s1: this.s1, s2: this.s2,
      entregues: this.contEntregues, devolvidas: this.contDevolvidas,
    };
  }
}

module.exports = { Conveyor };
