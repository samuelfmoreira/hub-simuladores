'use strict';
/**
 * PRG_IHM_Servo em JavaScript: espelho, linha a linha, do programa em texto estruturado do guia
 * (Parte 9). Roda no CLP de demonstração da IHM e nos testes, ciclo a ciclo (20 ms).
 *
 * Entradas do ciclo:
 *   ihm   { CMD_HABILITA, CMD_PARTIR, CMD_DISPARO, CMD_STOP, CMD_RESET,      (coils, BOOL)
 *           SP_MODO, SP_VELOCIDADE, SP_CORRENTE, SP_DESTINO, SP_PASSO, SP_VEL_POS }   (holding registers, INT)
 *   drv   { VEL, IQ, POS_FRACAO, POS_VOLTAS, POS_ESTADO, POS_LAG }            (palavras de entrada do SCA06)
 * Saídas: this.ihmOut (DI e IR para a IHM) e this.drvOut (palavras 5 a 11 para o SCA06).
 */
const LIVRE = 0, PREPARANDO = 1, DISPARANDO = 2;      // estados do envio de um movimento ao drive

class PrgIhmServo {
  constructor() {
    this.modoAtivo = 1;
    this.eEnvio = LIVRE; this.tEnvio = 0;
    this.xPedido = false; this.ped = { tipo: 2, vel: 0, frac: 0, voltas: 0 };
    this.iUltTipo = -1; this.iUltVel = -32768;        // último movimento enviado (forma "nenhum")
    this.xTravaStop = true;                            // motor parado até um novo Partir
    this.ant = { disparo: false, stop: false };
    this.xAguardaPasso = false; this.xViuMovimento = false; this.iPassos = 0;
    this.drvOut = { POS_HAB: 0, POS_DISPARO: 0, POS_DESTINO: 0, POS_RESET: 0, POS_TIPO: 2, POS_VEL: 0, POS_VOLTAS_ALVO: 0 };
    this.ihmOut = {};
  }

  ciclo(dt, ihm, drv) {
    const o = this.drvOut;
    // ---------- 1) LER o drive
    const rVel = drv.VEL * 18750 / 32767;
    const xMovendo = Math.abs(rVel) > 3;
    const xEmPosicao = !xMovendo && drv.POS_LAG >= 0 && drv.POS_LAG < 10;
    const xHab = drv.POS_ESTADO === 1, xFalha = drv.POS_ESTADO === 2;
    const rPos = (drv.POS_VOLTAS + drv.POS_FRACAO / 16384) * 360;
    const rPos360 = rPos - 360 * Math.floor(rPos / 360);

    // ---------- 2) HABILITAÇÃO e RESET (passam direto)
    o.POS_HAB = ihm.CMD_HABILITA ? 2 : 0;
    o.POS_RESET = ihm.CMD_RESET ? 1 : 0;

    // ---------- 3) BORDAS dos botões
    const rtDisparo = ihm.CMD_DISPARO && !this.ant.disparo; this.ant.disparo = ihm.CMD_DISPARO;
    const rtStop = ihm.CMD_STOP && !this.ant.stop; this.ant.stop = ihm.CMD_STOP;
    if (!ihm.CMD_PARTIR) this.xTravaStop = false;      // soltar o Partir libera a trava

    // ---------- 4) TROCA DE MODO: só com o envio livre; para o motor e exige novo Partir
    if (ihm.SP_MODO >= 1 && ihm.SP_MODO <= 4 && ihm.SP_MODO !== this.modoAtivo && this.eEnvio === LIVRE) {
      this.modoAtivo = ihm.SP_MODO;
      this.xTravaStop = true;
      this.pedir(2, 0, 0);                             // velocidade 0: segura o eixo parado
    }

    // ---------- 5) PEDIDOS de movimento (só com o drive habilitado)
    if (!xHab) {
      this.xPedido = false; this.iUltVel = -32768; this.xAguardaPasso = false;
    } else if (rtStop) {
      this.xTravaStop = true; this.xAguardaPasso = false;
      this.pedir(2, 0, 0);
    } else if (this.modoAtivo === 1 || this.modoAtivo === 2) {
      const andar = ihm.CMD_PARTIR && !this.xTravaStop;
      const tipo = andar && this.modoAtivo === 2 ? 1 : 2;        // parado = velocidade 0
      const vel = !andar ? 0 : this.modoAtivo === 1 ? ihm.SP_VELOCIDADE : ihm.SP_CORRENTE;
      if (tipo !== this.iUltTipo || vel !== this.iUltVel) this.pedir(tipo, vel, 0);
    } else if (rtDisparo && this.eEnvio === LIVRE && !xMovendo) {
      const velPos = ihm.SP_VEL_POS > 0 ? ihm.SP_VEL_POS : 100;      // registrador ainda zerado: 100 rpm
      if (this.modoAtivo === 3) {
        // destino absoluto pelo MENOR CAMINHO: o mesmo ângulo na volta atual, na anterior ou na seguinte
        let rAlvo = Math.floor(rPos / 360) * 360 + ihm.SP_DESTINO / 10;
        if (rAlvo - rPos > 180) rAlvo -= 360; else if (rAlvo - rPos < -180) rAlvo += 360;
        let voltas = Math.floor(rAlvo / 360), frac = Math.round((rAlvo - voltas * 360) * 16384 / 360);
        if (frac >= 16384) { frac -= 16384; voltas += 1; }
        this.pedir(5, velPos, frac, voltas);
      }
      else if (ihm.SP_PASSO > 0) { this.pedir(3, velPos, Math.round(ihm.SP_PASSO * 16384 / 3600)); this.xAguardaPasso = true; this.xViuMovimento = false; }
    }

    // ---------- 6) ENVIO ao drive: valores primeiro, disparo 60 ms depois, por 200 ms
    this.tEnvio += dt;
    if (this.eEnvio === LIVRE && this.xPedido) {
      o.POS_TIPO = this.ped.tipo; o.POS_VEL = this.ped.vel; o.POS_DESTINO = this.ped.frac; o.POS_VOLTAS_ALVO = this.ped.voltas;
      this.iUltTipo = this.ped.tipo; this.iUltVel = this.ped.vel; this.xPedido = false;
      this.eEnvio = PREPARANDO; this.tEnvio = 0;
    } else if (this.eEnvio === PREPARANDO && this.tEnvio >= 60) {
      this.eEnvio = DISPARANDO; this.tEnvio = 0;
    } else if (this.eEnvio === DISPARANDO && this.tEnvio >= 200) {
      this.eEnvio = LIVRE;
    }
    o.POS_DISPARO = this.eEnvio === DISPARANDO ? 1 : 0;

    // ---------- 7) CONTAR PASSOS (posição relativa): saiu do lugar e chegou
    if (this.xAguardaPasso && this.eEnvio === LIVRE) {
      if (xMovendo || drv.POS_LAG >= 10) this.xViuMovimento = true;
      if (this.xViuMovimento && xEmPosicao) { this.iPassos = (this.iPassos + 1) & 0xFFFF; this.xAguardaPasso = false; }
    }

    // ---------- 8) ESCREVER para a IHM
    this.ihmOut = {
      ST_HABILITADO: xHab, ST_MOVENDO: xMovendo, ST_EM_POSICAO: xEmPosicao, ST_FALHA: xFalha,
      ST_PRONTO: xHab && this.eEnvio === LIVRE && !xMovendo && !this.xPedido,
      VEL_ATUAL: Math.round(rVel), CORRENTE: drv.IQ, POSICAO: Math.min(3599, Math.round(rPos360 * 10)),
      PASSOS: this.iPassos, MODO_ATUAL: this.modoAtivo,
    };
  }

  pedir(tipo, vel, frac, voltas = 0) { this.xPedido = true; this.ped = { tipo, vel, frac, voltas }; }
}

module.exports = { PrgIhmServo };
