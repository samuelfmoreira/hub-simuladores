/**
 * Simulador de Processo com Sistema de Visão 3D — tela (Socket.IO + cena 3D Three.js + imagem da câmera)
 * front → back: connect_plc · disconnect_plc · set_polling_rate · set_config · write_coil
 * back → front: status_update · config_update · polling_rate_update · io_status · log
 * A cena só DESENHA: toda a física vem do servidor (evento 'estado').
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// =====================================================================
//  IMAGEM DA CÂMERA (canvas 2D, também usado como textura no monitor 3D)
//  Dois modos: AO VIVO (o que está sob a câmera agora) e CAPTURA (resultado da inspeção)
// =====================================================================
const CAM_ESC = 74 / 0.35;          // px por metro: o disco (raio 0,35 m) aparece com raio 74 px
const CAM_TOPO = 26, CAM_RODAPE = 26;

function fundoCamera(c, W, H, deslocPx = 0) {
  c.fillStyle = '#07090c'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#16191e'; c.fillRect(0, CAM_TOPO, W, H - CAM_TOPO - CAM_RODAPE);
  c.strokeStyle = 'rgba(255,255,255,.05)';
  const passo = 18, ini = ((deslocPx % passo) + passo) % passo;   // taliscas da correia andam com o motor
  for (let x = ini; x < W; x += passo) { c.beginPath(); c.moveTo(x, CAM_TOPO); c.lineTo(x, H - CAM_RODAPE); c.stroke(); }
}

function barraTopo(c, W, texto, aoVivo) {
  c.fillStyle = '#0d1014'; c.fillRect(0, 0, W, CAM_TOPO);
  c.font = '600 11px ui-monospace, Consolas, monospace';
  c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillStyle = '#8d96a4';
  c.fillText(texto, 10, 13);
  if (aoVivo) {
    c.fillStyle = '#ef4444'; c.beginPath(); c.arc(W - 62, 13, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fca5a5'; c.fillText('AO VIVO', W - 54, 13);
  }
}

function rodape(c, W, H, texto, cor = '#8d96a4') {
  c.fillStyle = '#0d1014'; c.fillRect(0, H - CAM_RODAPE, W, CAM_RODAPE);
  c.fillStyle = cor; c.font = '600 11px ui-monospace, Consolas, monospace';
  c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText(texto, 10, H - 13);
}

// Disco metálico com furo central e 6 furos; devolve a posição dos furos (para as ferramentas)
function desenharDisco(c, cx, cy, R, defeito, variante) {
  const g = c.createRadialGradient(cx - R * 0.27, cy - R * 0.32, R * 0.13, cx, cy, R);
  g.addColorStop(0, '#f4f6f8'); g.addColorStop(0.7, '#b9c0c8'); g.addColorStop(1, '#8a929c');
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#e9edf1'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#050608'; c.beginPath(); c.arc(cx, cy, R * 0.5, 0, Math.PI * 2); c.fill();
  const furos = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 - Math.PI / 2;
    const fx = cx + Math.cos(a) * R * 0.75, fy = cy + Math.sin(a) * R * 0.75;
    const falta = defeito === 'furo_faltante' && i === variante;
    furos.push({ fx, fy, falta });
    if (!falta) { c.fillStyle = '#050608'; c.beginPath(); c.arc(fx, fy, R * 0.14, 0, Math.PI * 2); c.fill(); }
  }
  if (defeito === 'risco') {
    const a = variante * Math.PI / 6;
    c.strokeStyle = 'rgba(40,30,25,.85)'; c.lineWidth = 2.2; c.beginPath();
    c.moveTo(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55);
    c.quadraticCurveTo(cx + Math.cos(a + 0.5) * R * 0.85, cy + Math.sin(a + 0.5) * R * 0.85, cx + Math.cos(a + 0.9) * R * 0.95, cy + Math.sin(a + 0.9) * R * 0.95);
    c.stroke();
  }
  return furos;
}

// AO VIVO: desenha a correia, as peças e o empurrador na posição real (dados do servidor)
function desenharAoVivo(cv, est, G, numInspecao, flash) {
  const c = cv.getContext('2d', { willReadFrequently: true }); // canvas na CPU: upload barato para a textura 3D
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2 + 6, R = G.R * CAM_ESC;
  fundoCamera(c, W, H, est.correia * CAM_ESC);
  c.save();
  c.beginPath(); c.rect(0, CAM_TOPO, W, H - CAM_TOPO - CAM_RODAPE); c.clip();

  // empurrador do cilindro (entra pela parte de baixo da imagem)
  const face = G.CIL_Z_RECUADO - est.cilindro * G.CIL_CURSO;
  const yFace = cy + face * CAM_ESC;
  const xCil = cx + (G.X_CIL - G.X_VISAO) * CAM_ESC, larg = G.CIL_MEIA_LARG * 2 * CAM_ESC;
  c.fillStyle = '#1d4ed8'; c.fillRect(xCil - larg / 2, yFace, larg, 10);
  c.fillStyle = '#9aa1aa'; c.fillRect(xCil - 4, yFace + 10, 8, H);

  // peças sobre a correia (e as que estão sendo empurradas)
  let sob = null;
  for (const p of est.pecas) {
    if (!['esteira', 'queda_rejeito'].includes(p.estado)) continue;
    const px = cx + (p.x - G.X_VISAO) * CAM_ESC, py = cy + p.z * CAM_ESC;
    if (px < -R || px > W + R) continue;
    desenharDisco(c, px, py, R, p.defeito, p.variante);
    if (Math.abs(p.x - G.X_VISAO) < 0.3 && p.estado === 'esteira') sob = p;
  }
  c.restore();

  // janela de busca da ferramenta (fixa)
  c.lineWidth = 1.5; c.setLineDash([4, 3]); c.strokeStyle = sob ? 'rgba(96,165,250,.9)' : 'rgba(96,165,250,.45)';
  c.strokeRect(cx - R - 10, cy - R - 10, (R + 10) * 2, (R + 10) * 2);
  c.setLineDash([]);

  if (flash > 0) { c.fillStyle = `rgba(255,255,255,${0.75 * flash})`; c.fillRect(0, CAM_TOPO, W, H - CAM_TOPO - CAM_RODAPE); }

  barraTopo(c, W, `CAM 01 · INSP #${String(numInspecao).padStart(4, '0')}`, true);
  const texto = est.visao.processando ? 'Capturando e processando...'
    : sob ? `Peça #${sob.id} na janela · aguardando trigger` : 'Sem peça na janela · aguardando trigger';
  rodape(c, W, H, texto, sob ? '#93c5fd' : '#8d96a4');
}

// CAPTURA: imagem congelada no trigger, com as ferramentas de inspeção e o resultado
function desenharVisao(cv, v, numInspecao = 0) {
  const c = cv.getContext('2d', { willReadFrequently: true }); // canvas na CPU: upload barato para a textura 3D
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2 + 6, R = 74;
  fundoCamera(c, W, H);
  barraTopo(c, W, `CAM 01 · INSP #${String(numInspecao).padStart(4, '0')}`, false);

  if (!v || !v.resultadoSeq) {
    c.fillStyle = '#5e6774'; c.textAlign = 'center';
    c.fillText('AGUARDANDO TRIGGER', cx, cy);
    c.textAlign = 'left';
    rodape(c, W, H, 'Sem imagem');
    return;
  }

  const temPeca = v.bom !== null;
  const furos = temPeca ? desenharDisco(c, cx, cy, R, v.defeito, v.variante) : [];
  // ferramentas de inspeção
  c.lineWidth = 1.5; c.setLineDash([4, 3]); c.strokeStyle = 'rgba(96,165,250,.8)';
  c.strokeRect(cx - R - 10, cy - R - 10, (R + 10) * 2, (R + 10) * 2);
  c.setLineDash([]);
  for (const f of furos) {
    c.strokeStyle = f.falta ? '#ef4444' : '#22c55e'; c.lineWidth = f.falta ? 2.5 : 1.5;
    c.beginPath(); c.arc(f.fx, f.fy, R * 0.2, 0, Math.PI * 2); c.stroke();
  }
  if (v.defeito === 'risco') {
    const a = v.variante * Math.PI / 6 + 0.45;
    c.strokeStyle = '#ef4444'; c.lineWidth = 2.5;
    c.strokeRect(cx + Math.cos(a) * R * 0.78 - 24, cy + Math.sin(a) * R * 0.78 - 24, 48, 48);
  }
  const ok = v.resultado === 'OK';
  c.fillStyle = ok ? '#16a34a' : '#dc2626';
  c.beginPath(); c.roundRect(W - 70, 4, 62, 18, 4); c.fill();
  c.fillStyle = '#fff'; c.font = '800 12px ui-monospace, Consolas, monospace'; c.textAlign = 'center';
  c.fillText(v.resultado, W - 39, 13.5);
  c.textAlign = 'left';
  const furosOk = furos.filter(f => !f.falta).length;
  const texto = !temPeca ? 'Nenhuma peça na janela'
    : v.defeito === 'furo_faltante' ? `Furos ${furosOk}/6 · FURO FALTANTE`
    : v.defeito === 'risco' ? 'Furos 6/6 · RISCO DETECTADO' : 'Furos 6/6 · Superfície OK';
  rodape(c, W, H, `Peça #${v.pecaId ?? '-'} · ${texto}`, ok ? '#86efac' : '#fca5a5');
}

// =====================================================================
//  CENA 3D
// =====================================================================
const VISTAS = {
  geral: { pos: [-0.6, 8.6, 14.6], alvo: [1.2, 0.5, -0.6] },
  entrada: { pos: [-7.6, 3.4, 4.4], alvo: [-4.5, 1.2, -0.3] },
  inspecao: { pos: [-2.3, 3.3, 4.1], alvo: [0.2, 1.2, -0.3] },
  robo: { pos: [3.6, 3.4, 3.6], alvo: [6.5, 1.0, -0.9] },
  topo: { pos: [0.8, 15, 0.6], alvo: [0.8, 0, -0.4] },
};
const std = o => new THREE.MeshStandardMaterial(o);
const M = {
  aluminio: std({ color: 0xc3c9d0, metalness: 0.8, roughness: 0.32 }),
  aco: std({ color: 0x9aa1aa, metalness: 0.9, roughness: 0.25 }),
  grafite: std({ color: 0x30353d, metalness: 0.4, roughness: 0.55 }),
  preto: std({ color: 0x15171b, metalness: 0.2, roughness: 0.5 }),
  borracha: std({ color: 0x0b0c0e, roughness: 0.9 }),
  azul: std({ color: 0x1d4ed8, metalness: 0.3, roughness: 0.45 }),
  azulMotor: std({ color: 0x3b5b7a, metalness: 0.5, roughness: 0.45 }),
  laranja: std({ color: 0xf26b1d, metalness: 0.2, roughness: 0.42 }),
  peca: std({ color: 0xe1e5ea, metalness: 0.95, roughness: 0.22 }),
  refugo: std({ color: 0xb91c1c, metalness: 0.2, roughness: 0.6 }),
  caixaOk: std({ color: 0x1f6f43, metalness: 0.2, roughness: 0.6 }),
  acrilico: std({ color: 0xdbeafe, transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
};
function caixa(w, h, d, mat, x = 0, y = 0, z = 0, sombra = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = sombra; m.receiveShadow = true;
  return m;
}
function cilindro(r, h, mat, eixo = 'y', seg = 28) {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (eixo === 'z') g.rotateX(Math.PI / 2);
  if (eixo === 'x') g.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const lampadaMat = cor => std({ color: new THREE.Color(cor).multiplyScalar(0.25), emissive: cor, emissiveIntensity: 0, roughness: 0.3, transparent: true, opacity: 0.95 });

class Cena3D {
  constructor(container, canvasVisao, G) {
    this.G = G;
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    container.appendChild(this.renderer.domElement);
    this.rotulosRenderer = new CSS2DRenderer();
    this.rotulosRenderer.domElement.className = 'camada-rotulos';
    container.appendChild(this.rotulosRenderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x12151a);
    this.scene.fog = new THREE.Fog(0x12151a, 26, 60);
    this.scene.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(...VISTAS.geral.pos);
    this.controles = new OrbitControls(this.camera, this.renderer.domElement);
    this.controles.target.set(...VISTAS.geral.alvo);
    this.controles.enableDamping = true;
    this.controles.maxPolarAngle = Math.PI * 0.49;
    this.controles.minDistance = 2;
    this.controles.maxDistance = 30;

    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1612, 0.35));
    const sol = new THREE.DirectionalLight(0xffffff, 1.45);
    sol.position.set(5, 12, 7);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -11, right: 11, top: 8, bottom: -8, near: 1, far: 40 });
    sol.shadow.bias = -0.0004;
    this.scene.add(sol);

    this.pecas = new Map();
    this.geoPecas = new Map();
    this.correiaVis = 0; this.correiaAlvo = null;
    this.cilVis = 0; this.cilAlvo = 0;
    this.toolVis = new THREE.Vector3(G.ROBO_HOME.x, G.ROBO_HOME.y, G.ROBO_HOME.z);
    this.toolAlvo = this.toolVis.clone();
    this.flashNivel = 0;
    this.transicao = null;

    this._chao();
    this._esteira();
    this._alimentador();
    this.sensores = {
      S1_ENTRADA: this._sensor(G.X_S1, 'S1 · Entrada'),
      S2_INSPECAO: this._sensor(G.X_S2, 'S2 · Inspeção'),
      S3_SAIDA: this._sensor(G.X_S3, 'S3 · Saída'),
    };
    this._estacaoVisao(canvasVisao);
    this._cilindro();
    this._refugo();
    this._robo();
    this._caixaOk();

    new ResizeObserver(() => this._redimensionar()).observe(container);
    this._redimensionar();
    this.relogio = new THREE.Timer();
    this.renderer.setAnimationLoop(() => this._quadro());
  }

  atualizar(est) {
    const io = est.io;
    if (this.correiaAlvo === null) this.correiaVis = est.correia;
    this.correiaAlvo = est.correia;
    this.cilAlvo = est.cilindro;
    this.toolAlvo.set(est.robo.tool.x, est.robo.tool.y, est.robo.tool.z);

    const vistas = new Set();
    for (const p of est.pecas) {
      vistas.add(p.id);
      let obj = this.pecas.get(p.id);
      if (!obj) {
        obj = this._criarPeca(p);
        obj.position.set(p.x, p.y, p.z);
        this.pecas.set(p.id, obj);
        this.scene.add(obj);
      }
      obj.userData.alvo.set(p.x, p.y, p.z);
      obj.userData.ry = p.ry;
    }
    for (const [id, obj] of this.pecas) if (!vistas.has(id)) { this.scene.remove(obj); this.pecas.delete(id); }

    for (const [nome, s] of Object.entries(this.sensores)) {
      const on = !!io[nome];
      s.led.material.emissiveIntensity = on ? 3 : 0.15;
      s.feixe.material.color.setHex(on ? 0xff8a00 : 0xff2020);
      s.feixe.material.opacity = on ? 0.85 : 0.28;
      s.rotulo.element.classList.toggle('ativo', on);
    }
    this.ledMotor.material.emissiveIntensity = io.MOTOR_ESTEIRA ? 3 : 0.1;
    this.rotMotor.element.classList.toggle('ativo', !!io.MOTOR_ESTEIRA);
    this.rotAlim.element.classList.toggle('ativo', !!io.ALIMENTADOR);
    this.ledValvula.material.emissiveIntensity = io.CILINDRO_REJEITO ? 3 : 0.1;
    this.ledReed.material.emissiveIntensity = io.CIL_AVANCADO ? 3 : 0.1;
    this.rotCil.element.classList.toggle('ativo', !!io.CILINDRO_REJEITO);
    this.anelRobo.material.emissiveIntensity = est.robo.ativo ? 2.5 : 0.15;
    this.rotRobo.element.classList.toggle('ativo', !!io.ROBO_PICK);
    this.torre.verde.material.emissiveIntensity = io.LAMP_VERDE ? 3.2 : 0;
    this.torre.amarela.material.emissiveIntensity = io.LAMP_AMARELA ? 3.2 : 0;
    this.torre.vermelha.material.emissiveIntensity = io.LAMP_VERMELHA ? 3.2 : 0;
    this.ledCamera.material.emissiveIntensity = io.VISAO_TRIGGER ? 3 : 0.2;
    this.rotVisao.element.classList.toggle('ativo', !!io.VISAO_TRIGGER);
  }

  flash() { this.flashNivel = 1; }
  atualizarTexturaVisao() { if (this.texVisao) this.texVisao.needsUpdate = true; }
  mostrarRotulos(ver) { this.rotulosRenderer.domElement.style.display = ver ? '' : 'none'; }
  definirVista(nome) {
    const v = VISTAS[nome];
    if (!v) return;
    this.transicao = {
      t: 0, dePos: this.camera.position.clone(), deAlvo: this.controles.target.clone(),
      paraPos: new THREE.Vector3(...v.pos), paraAlvo: new THREE.Vector3(...v.alvo),
    };
  }

  _quadro() {
    this.relogio.update();
    const dt = Math.min(this.relogio.getDelta(), 0.1);
    const k = 1 - Math.exp(-dt * 18); // suaviza entre pacotes do servidor
    const G = this.G;

    if (this.correiaAlvo !== null) {
      const antes = this.correiaVis;
      this.correiaVis += (this.correiaAlvo - this.correiaVis) * k;
      const d = this.correiaVis - antes;
      this.texCorreia.offset.x = -(this.correiaVis / 0.5) % 1;
      for (const r of this.rolos) r.rotation.z -= d / 0.09;
      this.ventoinha.rotation.z += d * 6;
    }
    for (const obj of this.pecas.values()) {
      const alvo = obj.userData.alvo;
      if (obj.position.distanceTo(alvo) > 1.5) obj.position.copy(alvo); else obj.position.lerp(alvo, k);
      obj.rotation.y += (obj.userData.ry - obj.rotation.y) * k;
    }
    this.cilVis += (this.cilAlvo - this.cilVis) * k;
    const face = G.CIL_Z_RECUADO - this.cilVis * G.CIL_CURSO;
    this.placaCil.position.z = face + 0.02;
    this.hasteCil.position.z = face + 0.04 + 0.65;

    this.toolVis.lerp(this.toolAlvo, k);
    this._ik(this.toolVis);

    if (this.flashNivel > 0.001) this.flashNivel *= Math.exp(-dt * 16); else this.flashNivel = 0;
    this.difusor.material.emissiveIntensity = 0.35 + this.flashNivel * 14;
    this.luzFlash.intensity = this.flashNivel * 9;

    if (this.transicao) {
      const tr = this.transicao;
      tr.t = Math.min(1, tr.t + dt / 0.9);
      const e = tr.t < 0.5 ? 4 * tr.t ** 3 : 1 - (-2 * tr.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(tr.dePos, tr.paraPos, e);
      this.controles.target.lerpVectors(tr.deAlvo, tr.paraAlvo, e);
      if (tr.t >= 1) this.transicao = null;
    }
    this.controles.update();
    this.renderer.render(this.scene, this.camera);
    this.rotulosRenderer.render(this.scene, this.camera);
  }

  _redimensionar() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.rotulosRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _rotulo(texto, x, y, z, pai = this.scene) {
    const div = document.createElement('div');
    div.className = 'rotulo3d';
    div.textContent = texto;
    const obj = new CSS2DObject(div);
    obj.position.set(x, y, z);
    pai.add(obj);
    return obj;
  }

  _chao() {
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), std({ color: 0x1b1e23, roughness: 0.95 }));
    chao.rotation.x = -Math.PI / 2;
    chao.receiveShadow = true;
    this.scene.add(chao);
    const grade = new THREE.GridHelper(40, 40, 0x2c3139, 0x24282f);
    grade.position.y = 0.002;
    this.scene.add(grade);
    // faixa zebrada da célula do robô
    const zebra = document.createElement('canvas');
    zebra.width = 64; zebra.height = 8;
    const zc = zebra.getContext('2d');
    for (let i = -8; i < 72; i += 16) {
      zc.fillStyle = '#facc15'; zc.beginPath(); zc.moveTo(i, 8); zc.lineTo(i + 8, 0); zc.lineTo(i + 16, 0); zc.lineTo(i + 8, 8); zc.fill();
      zc.fillStyle = '#111'; zc.beginPath(); zc.moveTo(i + 8, 8); zc.lineTo(i + 16, 0); zc.lineTo(i + 24, 0); zc.lineTo(i + 16, 8); zc.fill();
    }
    const tex = new THREE.CanvasTexture(zebra);
    tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const faixa = (x1, z1, x2, z2) => {
      const comp = Math.hypot(x2 - x1, z2 - z1);
      const t = tex.clone(); t.needsUpdate = true; t.repeat.x = comp / 0.6;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(comp, 0.08), std({ map: t, roughness: 0.8 }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
      m.position.set((x1 + x2) / 2, 0.004, (z1 + z2) / 2);
      m.receiveShadow = true;
      this.scene.add(m);
    };
    faixa(5.1, -0.8, 8.5, -0.8); faixa(8.5, -0.8, 8.5, -2.5); faixa(8.5, -2.5, 5.1, -2.5); faixa(5.1, -2.5, 5.1, -0.8);
  }

  _esteira() {
    const G = this.G;
    const L = G.X_FIM - G.X_INI, cx = (G.X_FIM + G.X_INI) / 2, W = G.MEIA_LARG * 2;
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const c = cv.getContext('2d', { willReadFrequently: true }); // canvas na CPU: upload barato para a textura 3D
    c.fillStyle = '#1c1f24'; c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`; c.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    c.fillStyle = '#2a2e35'; c.fillRect(0, 0, 10, 128);
    c.fillStyle = '#121418'; c.fillRect(10, 0, 3, 128);
    this.texCorreia = new THREE.CanvasTexture(cv);
    this.texCorreia.wrapS = this.texCorreia.wrapT = THREE.RepeatWrapping;
    this.texCorreia.repeat.set(L / 0.5, 1);
    this.texCorreia.colorSpace = THREE.SRGBColorSpace;
    this.texCorreia.anisotropy = 8;
    this.scene.add(caixa(L, 0.04, W, std({ map: this.texCorreia, roughness: 0.85 }), cx, G.TOPO - 0.02, 0));

    const cvr = document.createElement('canvas'); cvr.width = 64; cvr.height = 8;
    const cr = cvr.getContext('2d');
    cr.fillStyle = '#aab1ba'; cr.fillRect(0, 0, 64, 8); cr.fillStyle = '#5b626c'; cr.fillRect(0, 0, 10, 8); cr.fillRect(32, 0, 10, 8);
    const texRolo = new THREE.CanvasTexture(cvr);
    this.rolos = [G.X_INI, G.X_FIM].map(x => {
      const r = cilindro(0.09, W + 0.06, std({ map: texRolo, metalness: 0.7, roughness: 0.35 }), 'z');
      r.position.set(x, G.TOPO - 0.09, 0);
      this.scene.add(r);
      return r;
    });
    for (const z of [-1, 1]) {
      this.scene.add(caixa(L + 0.3, 0.16, 0.06, M.aluminio, cx, G.TOPO - 0.11, z * (G.MEIA_LARG + 0.04)));
      for (const x of [G.X_INI - 0.15, G.X_FIM + 0.15]) this.scene.add(caixa(0.05, 0.22, 0.04, M.grafite, x, G.TOPO - 0.09, z * (G.MEIA_LARG + 0.06)));
    }
    for (const x of [-5.6, -2.0, 2.0, 5.6]) {
      for (const z of [-1, 1]) {
        this.scene.add(caixa(0.07, G.TOPO - 0.19, 0.07, M.aluminio, x, (G.TOPO - 0.19) / 2, z * (G.MEIA_LARG - 0.04)));
        this.scene.add(caixa(0.16, 0.03, 0.16, M.grafite, x, 0.015, z * (G.MEIA_LARG - 0.04)));
      }
      this.scene.add(caixa(0.05, 0.05, W - 0.1, M.aluminio, x, 0.3, 0));
    }
    // motorredutor
    const mot = new THREE.Group();
    mot.position.set(G.X_INI, G.TOPO - 0.09, G.MEIA_LARG + 0.2);
    mot.add(caixa(0.26, 0.26, 0.2, M.azulMotor));
    const corpo = cilindro(0.11, 0.42, M.azulMotor, 'z'); corpo.position.z = 0.3; mot.add(corpo);
    const tampa = cilindro(0.115, 0.08, M.grafite, 'z'); tampa.position.z = 0.55; mot.add(tampa);
    this.ventoinha = caixa(0.18, 0.02, 0.01, M.preto, 0, 0, 0.6, false); mot.add(this.ventoinha);
    mot.add(caixa(0.12, 0.08, 0.12, M.grafite, 0, 0.14, 0.28));
    this.ledMotor = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), lampadaMat(0x22c55e));
    this.ledMotor.position.set(0, 0.19, 0.28);
    mot.add(this.ledMotor);
    this.scene.add(mot);
    this.rotMotor = this._rotulo('Motor', G.X_INI, G.TOPO + 0.32, G.MEIA_LARG + 0.5);
  }

  _alimentador() {
    const G = this.G;
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(G.R + 0.06, G.R + 0.06, 0.55, 40, 1, true), M.acrilico);
    tubo.position.set(G.X_S1, G.ALIM_Y + 0.12, 0);
    this.scene.add(tubo);
    const aro = new THREE.Mesh(new THREE.TorusGeometry(G.R + 0.06, 0.02, 8, 40), M.aluminio);
    aro.rotation.x = Math.PI / 2;
    aro.position.set(G.X_S1, G.ALIM_Y + 0.4, 0);
    this.scene.add(aro);
    this.scene.add(caixa(0.08, G.ALIM_Y + 0.5, 0.08, M.aluminio, G.X_S1, (G.ALIM_Y + 0.5) / 2, -1.0));
    this.scene.add(caixa(0.06, 0.06, 0.6, M.aluminio, G.X_S1, G.ALIM_Y + 0.4, -0.7));
    this.rotAlim = this._rotulo('Alimentador', G.X_S1, G.ALIM_Y + 0.62, 0);
  }

  // Sensor fotoelétrico difuso com feixe visível
  _sensor(x, texto) {
    const G = this.G;
    const g = new THREE.Group();
    g.position.x = x;
    const y = G.TOPO + 0.06;
    g.add(caixa(0.04, y + 0.05, 0.04, M.aluminio, 0, (y + 0.05) / 2, G.MEIA_LARG + 0.28));
    g.add(caixa(0.03, 0.03, 0.18, M.aco, 0, y, G.MEIA_LARG + 0.2));
    const corpo = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.1, 0.06, 2, 0.012), M.grafite);
    corpo.position.set(0, y, G.MEIA_LARG + 0.1);
    corpo.castShadow = true;
    g.add(corpo);
    const lente = cilindro(0.02, 0.01, M.preto, 'z', 16);
    lente.position.set(0, y, G.MEIA_LARG + 0.068);
    g.add(lente);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.02), lampadaMat(0xffa500));
    led.position.set(0, y + 0.056, G.MEIA_LARG + 0.1);
    g.add(led);
    const comp = G.MEIA_LARG * 2 + 0.06;
    const feixe = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, comp, 6).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.3, depthWrite: false }));
    feixe.position.set(0, y, G.MEIA_LARG + 0.068 - comp / 2);
    g.add(feixe);
    this.scene.add(g);
    return { led, feixe, rotulo: this._rotulo(texto, 0, y + 0.22, G.MEIA_LARG + 0.12, g) };
  }

  _estacaoVisao(canvasVisao) {
    const G = this.G;
    const X = G.X_VISAO, xc = X + 0.75, zc = -0.95, hTopo = 2.45;
    this.scene.add(caixa(0.4, 0.03, 0.4, M.grafite, xc, 0.015, zc));
    this.scene.add(caixa(0.1, hTopo + 0.05, 0.1, M.aluminio, xc, (hTopo + 0.05) / 2, zc));
    this.scene.add(caixa(0.08, 0.08, -zc + 0.06, M.aluminio, xc, hTopo, zc / 2));
    this.scene.add(caixa(xc - X + 0.06, 0.08, 0.08, M.aluminio, (xc + X) / 2, hTopo, 0));

    // câmera (ilustrativa)
    const cam = new THREE.Group();
    cam.position.set(X, hTopo - 0.06, 0);
    const corpo = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.2, 0.15, 3, 0.02), M.preto);
    corpo.position.y = -0.12; corpo.castShadow = true;
    cam.add(corpo);
    cam.add(caixa(0.152, 0.025, 0.152, M.refugo, 0, -0.06, 0, false));
    const lente = cilindro(0.05, 0.18, M.grafite); lente.position.y = -0.31; cam.add(lente);
    const vidro = cilindro(0.035, 0.01, std({ color: 0x0a1a2a, metalness: 1, roughness: 0.05 })); vidro.position.y = -0.405; cam.add(vidro);
    this.ledCamera = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), lampadaMat(0x22c55e));
    this.ledCamera.position.set(0, -0.08, 0.078);
    cam.add(this.ledCamera);
    this.scene.add(cam);

    // iluminação em anel: caixa quadrada com difusor circular
    const yAnel = G.TOPO + 0.62;
    const quadrado = new THREE.Shape();
    quadrado.moveTo(-0.26, -0.26); quadrado.lineTo(0.26, -0.26); quadrado.lineTo(0.26, 0.26); quadrado.lineTo(-0.26, 0.26); quadrado.closePath();
    const furo = new THREE.Path(); furo.absarc(0, 0, 0.09, 0, Math.PI * 2, true); quadrado.holes.push(furo);
    const geoCaixa = new THREE.ExtrudeGeometry(quadrado, { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 32 });
    geoCaixa.rotateX(-Math.PI / 2);
    const carcaca = new THREE.Mesh(geoCaixa, M.grafite);
    carcaca.position.set(X, yAnel, 0);
    carcaca.castShadow = true;
    this.scene.add(carcaca);
    this.difusor = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.21, 48).rotateX(Math.PI / 2),
      std({ color: 0xeef2f6, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.4, side: THREE.DoubleSide }));
    this.difusor.position.set(X, yAnel - 0.012, 0);
    this.scene.add(this.difusor);
    for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      this.scene.add(caixa(0.015, hTopo - 0.06 - yAnel - 0.02, 0.015, M.aco, X + dx * 0.5, (hTopo - 0.06 + yAnel + 0.05) / 2, dz * 0.5, false));
    }
    this.luzFlash = new THREE.SpotLight(0xffffff, 0, 3, 0.75, 0.5, 2);
    this.luzFlash.position.set(X, yAnel - 0.03, 0);
    this.luzFlash.target.position.set(X, 0, 0);
    this.scene.add(this.luzFlash, this.luzFlash.target);
    this.rotVisao = this._rotulo('Sistema de visão', X, hTopo + 0.22, 0);

    // sinaleiro (torre luminosa)
    const torre = new THREE.Group();
    torre.position.set(xc, hTopo + 0.04, zc);
    torre.add(cilindro(0.05, 0.08, M.grafite).translateY(0.04));
    const seg = (cor, i) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 28), lampadaMat(cor));
      m.position.y = 0.14 + i * 0.125;
      torre.add(m);
      return m;
    };
    this.torre = { verde: seg(0x22c55e, 0), amarela: seg(0xfacc15, 1), vermelha: seg(0xef4444, 2) };
    torre.add(cilindro(0.065, 0.03, M.grafite).translateY(0.5));
    this.scene.add(torre);
    this._rotulo('Sinaleiro', xc, hTopo + 0.75, zc);

    // controlador + monitor com a imagem da câmera
    const xm = X + 1.95, zm = -1.75;
    this.scene.add(caixa(1.1, 0.06, 0.62, M.grafite, xm, 0.86, zm));
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.26, 0.26]) this.scene.add(caixa(0.05, 0.83, 0.05, M.aluminio, xm + dx, 0.415, zm + dz));
    const ctrl = new THREE.Group();
    ctrl.position.set(xm - 0.32, 0.89, zm);
    const caixaCtrl = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.34, 0.3, 2, 0.015), M.preto);
    caixaCtrl.position.y = 0.17; caixaCtrl.castShadow = true;
    ctrl.add(caixaCtrl);
    ctrl.add(caixa(0.222, 0.018, 0.302, M.refugo, 0, 0.31, 0, false));
    for (let i = 0; i < 4; i++) ctrl.add(caixa(0.05, 0.03, 0.01, M.grafite, -0.05 + (i % 2) * 0.08, 0.12 + Math.floor(i / 2) * 0.06, 0.152, false));
    this.scene.add(ctrl);
    const mon = new THREE.Group();
    mon.position.set(xm + 0.16, 0.89, zm - 0.05);
    mon.rotation.y = -0.35;
    mon.add(caixa(0.18, 0.02, 0.12, M.preto, 0, 0.01, 0));
    mon.add(caixa(0.04, 0.22, 0.03, M.preto, 0, 0.12, 0));
    mon.add(caixa(0.6, 0.43, 0.035, M.preto, 0, 0.42, 0.02));
    this.texVisao = new THREE.CanvasTexture(canvasVisao);
    this.texVisao.colorSpace = THREE.SRGBColorSpace;
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.385), new THREE.MeshBasicMaterial({ map: this.texVisao, toneMapped: false }));
    tela.position.set(0, 0.42, 0.039);
    mon.add(tela);
    this.scene.add(mon);
    this._rotulo('Controlador de visão', xm, 1.55, zm);

    const curva = new THREE.CatmullRomCurve3([
      new THREE.Vector3(X, hTopo - 0.02, 0.05), new THREE.Vector3(X + 0.2, hTopo + 0.12, 0.05), new THREE.Vector3(xc, hTopo + 0.08, 0.05),
      new THREE.Vector3(xc + 0.08, hTopo - 0.2, zc), new THREE.Vector3(xc + 0.08, 1.3, zc), new THREE.Vector3(xm - 0.32, 1.1, zm + 0.1),
    ]);
    const cabo = new THREE.Mesh(new THREE.TubeGeometry(curva, 60, 0.012, 6), M.preto);
    cabo.castShadow = true;
    this.scene.add(cabo);
  }

  _cilindro() {
    const G = this.G;
    const y = G.TOPO + 0.085;
    const g = new THREE.Group();
    g.position.x = G.X_CIL;
    const zIni = G.CIL_Z_RECUADO + 0.1, comp = 1.25;
    const camisa = cilindro(0.065, comp, M.aluminio, 'z');
    camisa.position.set(0, y, zIni + comp / 2);
    g.add(camisa);
    g.add(caixa(0.16, 0.16, 0.07, M.azul, 0, y, zIni));
    g.add(caixa(0.16, 0.16, 0.07, M.azul, 0, y, zIni + comp));
    g.add(caixa(0.06, y, 0.06, M.aluminio, 0, y / 2, zIni + comp - 0.05));
    g.add(caixa(0.06, y - 0.08, 0.06, M.aluminio, 0, (y - 0.08) / 2, zIni + 0.05));
    this.hasteCil = cilindro(0.022, 1.3, M.aco, 'z');
    this.hasteCil.position.set(0, y, 0);
    g.add(this.hasteCil);
    this.placaCil = new THREE.Mesh(new RoundedBoxGeometry(G.CIL_MEIA_LARG * 2, 0.13, 0.04, 2, 0.01), M.azul);
    this.placaCil.position.set(0, y, G.CIL_Z_RECUADO);
    this.placaCil.castShadow = true;
    g.add(this.placaCil);
    g.add(caixa(0.03, 0.02, 0.08, M.grafite, 0, y + 0.075, zIni + 0.2, false));
    this.ledReed = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.01, 0.02), lampadaMat(0xffa500));
    this.ledReed.position.set(0, y + 0.09, zIni + 0.2);
    g.add(this.ledReed);
    g.add(caixa(0.1, 0.14, 0.12, M.grafite, 0.18, y, zIni + comp - 0.1));
    this.ledValvula = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), lampadaMat(0xfacc15));
    this.ledValvula.position.set(0.18, y + 0.08, zIni + comp - 0.1);
    g.add(this.ledValvula);
    this.scene.add(g);
    this.rotCil = this._rotulo('Cilindro de rejeito', G.X_CIL, y + 0.3, zIni + 0.6);
  }

  _caixaAberta(x, z, L, P, H, mat) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(caixa(L, 0.04, P, mat, 0, 0.02, 0));
    g.add(caixa(L, H, 0.03, mat, 0, H / 2, -P / 2));
    g.add(caixa(L, H, 0.03, mat, 0, H / 2, P / 2));
    g.add(caixa(0.03, H, P, mat, -L / 2, H / 2, 0));
    g.add(caixa(0.03, H, P, mat, L / 2, H / 2, 0));
    this.scene.add(g);
  }

  _refugo() {
    const G = this.G;
    const { x, z } = G.LIXEIRA;
    const P = 1.0, H = 0.5;
    this._caixaAberta(x, z, 1.2, P, H, M.refugo);
    const z1 = -G.MEIA_LARG - 0.05, y1 = G.TOPO - 0.04, z2 = z + P / 2 + 0.02, y2 = H + 0.02;
    const calha = caixa(0.9, 0.02, Math.hypot(z1 - z2, y1 - y2), M.aco, x, (y1 + y2) / 2, (z1 + z2) / 2);
    calha.rotation.x = -Math.atan2(y1 - y2, z1 - z2);
    this.scene.add(calha);
    this._rotulo('Refugo (NG)', x, H + 0.25, z - 0.1);
  }

  _caixaOk() {
    const { x, z } = this.G.CAIXA;
    this._caixaAberta(x, z, 1.0, 0.9, 0.42, M.caixaOk);
    this._rotulo('Aprovadas (OK)', x, 0.67, z);
  }

  _robo() {
    const G = this.G, R = G.ROBO;
    const base = new THREE.Group();
    base.position.set(G.ROBO_BASE.x, 0, G.ROBO_BASE.z);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.5, 32), M.grafite);
    pedestal.position.y = 0.25; pedestal.castShadow = true;
    base.add(pedestal);
    this.anelRobo = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.015, 8, 40), lampadaMat(0x22c55e));
    this.anelRobo.rotation.x = Math.PI / 2;
    this.anelRobo.position.y = 0.47;
    base.add(this.anelRobo);

    this.giro = new THREE.Group();
    this.giro.position.y = 0.5;
    base.add(this.giro);
    const torreta = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.29, 0.2, 32), M.laranja);
    torreta.position.y = 0.1; torreta.castShadow = true;
    this.giro.add(torreta);
    this.giro.add(caixa(0.3, R.H - 0.55, 0.34, M.laranja, 0, (R.H - 0.5) / 2 + 0.08, 0));

    this.ombro = new THREE.Group();
    this.ombro.position.y = R.H - 0.5;
    this.giro.add(this.ombro);
    this.ombro.add(cilindro(0.15, 0.42, M.grafite, 'z'));
    const braco = new THREE.Mesh(new RoundedBoxGeometry(R.L1 + 0.1, 0.17, 0.2, 3, 0.05), M.laranja);
    braco.position.x = R.L1 / 2; braco.castShadow = true;
    this.ombro.add(braco);

    this.cotovelo = new THREE.Group();
    this.cotovelo.position.x = R.L1;
    this.ombro.add(this.cotovelo);
    this.cotovelo.add(cilindro(0.12, 0.3, M.grafite, 'z'));
    const antebraco = new THREE.Mesh(new RoundedBoxGeometry(R.L2 + 0.04, 0.13, 0.15, 3, 0.04), M.laranja);
    antebraco.position.x = R.L2 / 2; antebraco.castShadow = true;
    this.cotovelo.add(antebraco);

    this.punho = new THREE.Group();
    this.punho.position.x = R.L2;
    this.cotovelo.add(this.punho);
    this.punho.add(cilindro(0.075, 0.18, M.grafite, 'z'));
    const ferr = cilindro(0.028, R.FERR - 0.05, M.aco);
    ferr.position.y = -(R.FERR - 0.05) / 2;
    this.punho.add(ferr);
    const ventosa = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.075, 0.05, 24), M.borracha);
    ventosa.position.y = -R.FERR + 0.025;
    ventosa.castShadow = true;
    this.punho.add(ventosa);
    this.scene.add(base);
    this.rotRobo = this._rotulo('Robô', G.ROBO_BASE.x, 0.85, G.ROBO_BASE.z - 0.45);
    this._ik(this.toolVis);
  }

  // Cinemática inversa: giro da base + 2 elos no plano vertical; ventosa sempre vertical
  _ik(tool) {
    const G = this.G, R = G.ROBO;
    const dx = tool.x - G.ROBO_BASE.x, dz = tool.z - G.ROBO_BASE.z;
    const r = Math.hypot(dx, dz);
    const h = tool.y + R.FERR - R.H;
    const d = Math.min(Math.max(Math.hypot(r, h), 0.05), R.L1 + R.L2 - 1e-3);
    const cosA = (R.L1 ** 2 + d * d - R.L2 ** 2) / (2 * R.L1 * d);
    const a1 = Math.atan2(h, r) + Math.acos(Math.min(1, Math.max(-1, cosA))); // cotovelo para cima
    const a2 = Math.atan2(h - R.L1 * Math.sin(a1), r - R.L1 * Math.cos(a1));
    this.giro.rotation.y = Math.atan2(-dz, dx);
    this.ombro.rotation.z = a1;
    this.cotovelo.rotation.z = a2 - a1;
    this.punho.rotation.z = -a2;
  }

  // Disco furado (6 furos + furo central); ângulos espelhados para bater com a imagem 2D
  _geoPeca(faltante) {
    const chave = String(faltante);
    if (this.geoPecas.has(chave)) return this.geoPecas.get(chave);
    const { R, ALT } = this.G;
    const s = new THREE.Shape();
    s.absarc(0, 0, R, 0, Math.PI * 2, false);
    const central = new THREE.Path(); central.absarc(0, 0, R * 0.5, 0, Math.PI * 2, true); s.holes.push(central);
    for (let i = 0; i < 6; i++) {
      if (i === faltante) continue;
      const a = -(i * Math.PI / 3 - Math.PI / 2);
      const f = new THREE.Path();
      f.absarc(Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75, R * 0.14, 0, Math.PI * 2, true);
      s.holes.push(f);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: ALT - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2, curveSegments: 36 });
    g.rotateX(-Math.PI / 2);
    g.center();
    this.geoPecas.set(chave, g);
    return g;
  }

  _criarPeca(p) {
    const { R, ALT } = this.G;
    const grupo = new THREE.Group();
    const corpo = new THREE.Mesh(this._geoPeca(p.defeito === 'furo_faltante' ? p.variante : -1), M.peca);
    corpo.castShadow = true; corpo.receiveShadow = true;
    grupo.add(corpo);
    if (p.defeito === 'risco') {
      const a = p.variante * Math.PI / 6;
      const pt = (ang, rr) => new THREE.Vector3(Math.cos(ang) * R * rr, ALT / 2 + 0.002, Math.sin(ang) * R * rr);
      const curva = new THREE.QuadraticBezierCurve3(pt(a, 0.55), pt(a + 0.5, 0.85), pt(a + 0.9, 0.95));
      grupo.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 16, 0.006, 4), std({ color: 0x3a2a20, roughness: 0.9 })));
    }
    grupo.userData = { alvo: new THREE.Vector3(), ry: p.ry };
    grupo.rotation.y = p.ry;
    return grupo;
  }
}

// =====================================================================
//  INTERFACE
// =====================================================================
const socket = io();
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let cena = null;
let cfg = null;
let conectado = false;
let ultFlash = null, ultResultado = null, numInspecao = 0;
let ultimaCaptura = null, capturaAte = 0, flashEm = 0;   // CAPTURA fica na tela por CAPTURA_MS no modo Auto
const CAPTURA_MS = 2000;
let ultDesenhoCam = 0, ultTexturaCam = 0;
let editandoMapa = false;
const canvasVisao = $('#canvasVisao');
desenharVisao(canvasVisao, null);

// ---------- painel: índices 0 = LIGA, 1 = DESLIGA, 2 = EMERGÊNCIA
function botaoMomentaneo(el, index) {
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('pressionado');
    socket.emit('write_coil', { index, value: true });
  });
  const soltar = () => {
    if (!el.classList.contains('pressionado')) return;
    el.classList.remove('pressionado');
    socket.emit('write_coil', { index, value: false });
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => el.addEventListener(ev, soltar));
}
botaoMomentaneo($('#btLiga'), 0);
botaoMomentaneo($('#btDesliga'), 1);
$('#btEmerg').addEventListener('click', () => {
  const travar = !$('#btEmerg').classList.contains('acionada');
  $('#btEmerg').classList.toggle('acionada', travar);
  socket.emit('write_coil', { index: 2, value: travar });
});
const lamp = (sel, on) => $(sel).classList.toggle('on', !!on);

// ---------- sirene (bipe a cada borda de subida)
let audio = null, sireneAnt = false;
function bipe() {
  if (!$('#chkSom').checked) return;
  try {
    audio ||= new AudioContext();
    const osc = audio.createOscillator(), ganho = audio.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    ganho.gain.setValueAtTime(0.05, audio.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
    osc.connect(ganho).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.2);
  } catch { /* sem áudio */ }
}

// ---------- produção
$('#chkAuto').addEventListener('change', e => socket.emit('alimentacao', { auto: e.target.checked }));
$('#rngIntervalo').addEventListener('input', e => {
  $('#outIntervalo').textContent = `${e.target.value} s`;
  socket.emit('alimentacao', { intervalo: Number(e.target.value) });
});
$('#rngDefeito').addEventListener('input', e => {
  $('#outDefeito').textContent = `${e.target.value}%`;
  socket.emit('alimentacao', { defeitoPct: Number(e.target.value) });
});
$('#btPecaBoa').addEventListener('click', () => socket.emit('inserirPeca', { bom: true }));
$('#btPecaRuim').addEventListener('click', () => socket.emit('inserirPeca', { bom: false }));
$('#btZerar').addEventListener('click', () => socket.emit('zerarContadores'));
$('#btResetar').addEventListener('click', () => {
  if (confirm('Resetar o simulador?\n\nTodas as peças serão removidas e os contadores zerados.')) socket.emit('resetar_simulador');
});
// Servidor confirmou o reset: limpa câmera, contagem de inspeções e eventos da tela
socket.on('simulador_resetado', () => {
  numInspecao = 0;
  ultResultado = 0;
  ultimaCaptura = null;
  capturaAte = 0;
  desenharVisao(canvasVisao, null);
  cena?.atualizarTexturaVisao();
  $('#log').innerHTML = '';
});
socket.on('alimentacao', a => {
  $('#chkAuto').checked = a.auto;
  $('#rngIntervalo').value = a.intervalo; $('#outIntervalo').textContent = `${a.intervalo} s`;
  $('#rngDefeito').value = a.defeitoPct; $('#outDefeito').textContent = `${a.defeitoPct}%`;
});

// ---------- comunicação
$('#btConectar').addEventListener('click', () => {
  const ip = $('#inIp').value.trim();
  const port = Number($('#inPorta').value) || 502;
  if (!ip) return toast('Informe o IP do CLP.', true);
  $('#btConectar').disabled = true;
  $('#btConectar').textContent = 'Conectando…';
  socket.emit('connect_plc', { ip, port });
});
$('#btDesconectar').addEventListener('click', () => socket.emit('disconnect_plc'));
function aplicarPolling() { socket.emit('set_polling_rate', Math.max(50, Number($('#inPolling').value) || 200)); }
$('#btPolling').addEventListener('click', aplicarPolling);
$('#inPolling').addEventListener('keydown', e => { if (e.key === 'Enter') aplicarPolling(); });
$('#chkSim').addEventListener('change', e => socket.emit('set_simulacao', e.target.checked));

socket.on('status_update', ({ connected }) => {
  conectado = connected;
  $('#btConectar').disabled = connected;
  $('#btConectar').textContent = 'Conectar';
  $('#btDesconectar').disabled = !connected;
  $('#inIp').disabled = connected;
  $('#inPorta').disabled = connected;
  $('#ledConexao').classList.toggle('on', connected);
  $('#chkSim').disabled = connected;
  atualizarChips();
});
socket.on('polling_rate_update', ms => { $('#inPolling').value = ms; });
socket.on('modbus_stats', st => {
  $('#stCiclos').textContent = st.ciclos;
  $('#stLeit').textContent = st.leituras;
  $('#stEscr').textContent = st.escritas;
  $('#stCiclo').textContent = st.connected ? `${st.cicloMs} ms` : '—';
});
socket.on('io_status', arr => {
  $$('#corpoCoils tr.saida').forEach(tr => tr.querySelector('.led').classList.toggle('on', !!arr[Number(tr.dataset.index)]));
});

// ---------- mapa de endereços
function montarTabela() {
  const corpo = $('#corpoCoils');
  corpo.innerHTML = '';
  const grupo = titulo => corpo.insertAdjacentHTML('beforeend', `<tr class="grupo"><td colspan="3">${titulo}</td></tr>`);
  grupo('Escritas · cliente → CLP · coil (FC5)');
  cfg.sinais.escritas.forEach((s, i) => corpo.insertAdjacentHTML('beforeend', `
    <tr class="entrada" data-index="${i}">
      <td><i class="led"></i></td>
      <td class="nome">${s.rotulo}<small>${i} · ${s.nome}</small></td>
      <td class="end"><input type="number" min="0" max="65535" value="${cfg.writeAddresses[i]}"></td>
    </tr>`));
  grupo('Leituras · CLP → cliente · input (FC2) ou coil (FC1)');
  cfg.sinais.leituras.forEach((s, i) => {
    const r = cfg.readAddresses[i];
    corpo.insertAdjacentHTML('beforeend', `
    <tr class="saida" data-index="${i}">
      <td><i class="led"></i></td>
      <td class="nome">${s.rotulo}<small>${i} · ${s.nome}</small></td>
      <td class="end">
        <select><option value="input"${r.type === 'input' ? ' selected' : ''}>input</option><option value="coil"${r.type === 'coil' ? ' selected' : ''}>coil</option></select>
        <input type="number" min="0" max="65535" value="${r.address}">
      </td>
    </tr>`);
  });
  corpo.querySelectorAll('input, select').forEach(el => el.addEventListener('input', () => { editandoMapa = true; }));
}
$('#btSalvarMapa').addEventListener('click', () => {
  const writeAddresses = $$('#corpoCoils tr.entrada').map(tr => Number(tr.querySelector('input').value));
  const readAddresses = $$('#corpoCoils tr.saida').map(tr => ({ address: Number(tr.querySelector('input').value), type: tr.querySelector('select').value }));
  socket.emit('set_config', { writeAddresses, readAddresses }, resp => {
    if (resp?.success) { editandoMapa = false; toast('Mapa salvo.'); }
    else toast((resp?.erros || ['Mapa inválido.']).join(' '), true);
  });
});
$('#btPadraoMapa').addEventListener('click', () => {
  const p = cfg.padrao;
  $$('#corpoCoils tr.entrada').forEach((tr, i) => { tr.querySelector('input').value = p.writeAddresses[i]; });
  $$('#corpoCoils tr.saida').forEach((tr, i) => {
    tr.querySelector('input').value = p.readAddresses[i].address;
    tr.querySelector('select').value = p.readAddresses[i].type;
  });
  editandoMapa = true;
  toast('Endereços padrão preenchidos. Clique em "Salvar mapa".');
});

socket.on('config_update', c => {
  cfg = c;
  if (!cena) { cena = new Cena3D($('#cena'), canvasVisao, c.geometria); cena.atualizarTexturaVisao(); }
  if (!conectado) { $('#inIp').value = c.ip; $('#inPorta').value = c.port; }
  $('#chkSim').checked = c.simulacao;
  if (!editandoMapa) montarTabela();
  atualizarChips();
});

function atualizarChips() {
  const modo = $('#chipModo'), cx = $('#chipConexao');
  if (conectado) {
    modo.textContent = 'Modbus TCP'; modo.className = 'chip info';
    cx.textContent = `CLP ${$('#inIp').value}:${$('#inPorta').value}`; cx.className = 'chip ok';
  } else if (cfg?.simulacao) {
    modo.textContent = 'Simulação'; modo.className = 'chip aviso';
    cx.textContent = 'CLP virtual'; cx.className = 'chip ok';
  } else {
    modo.textContent = 'Modbus TCP'; modo.className = 'chip info';
    cx.textContent = 'Desconectado'; cx.className = 'chip erro';
  }
}

// ---------- estado da máquina (~30 Hz)
socket.on('estado', est => {
  if (!cena) return;
  cena.atualizar(est);
  atualizarCamDinamica(est);
  const io = est.io;
  lamp('#lpSistema', io.LAMP_SISTEMA);
  lamp('#lpOk', io.LAMP_VERDE);
  lamp('#lpNg', io.LAMP_VERMELHA);
  lamp('#lpAlarme', io.LAMP_AMARELA);
  lamp('#lpSirene', io.SIRENE);
  if (io.SIRENE && !sireneAnt) bipe();
  sireneAnt = !!io.SIRENE;
  $('#btEmerg').classList.toggle('acionada', !!io.BT_EMERGENCIA);

  const v = est.visao;
  const agora = performance.now();
  if (ultFlash !== null && v.flashSeq !== ultFlash) {
    cena.flash();
    flashEm = agora;
    const f = $('#flash');
    f.classList.remove('ativo'); void f.offsetWidth; f.classList.add('ativo');
  }
  ultFlash = v.flashSeq;
  if (v.resultadoSeq !== ultResultado) {
    if (ultResultado !== null && v.resultadoSeq > 0) {
      numInspecao++;
      ultimaCaptura = { ...v };
      capturaAte = agora + CAPTURA_MS;
    }
    ultResultado = v.resultadoSeq;
  }
  // Escolhe o que a câmera mostra: Auto = ao vivo, e a captura fica CAPTURA_MS após cada inspeção
  // Redesenha no máx. 15 quadros/s; o monitor 3D é atualizado no máx. 5 vezes/s (poupa a placa de vídeo)
  if (agora - ultDesenhoCam >= 66) {
    ultDesenhoCam = agora;
    const modoCam = $('#selCamModo').value;
    const mostrarCaptura = modoCam === 'captura' || (modoCam === 'auto' && agora < capturaAte);
    if (mostrarCaptura) desenharVisao(canvasVisao, ultimaCaptura, numInspecao);
    else desenharAoVivo(canvasVisao, est, cfg.geometria, numInspecao, Math.max(0, 1 - (agora - flashEm) / 180));
    if (agora - ultTexturaCam >= 200) { ultTexturaCam = agora; cena.atualizarTexturaVisao(); }
  }

  const c = est.contadores;
  $('#cTotal').textContent = c.total;
  $('#cOk').textContent = c.ok;
  $('#cNg').textContent = c.ng;
  $('#cRend').textContent = c.ok + c.ng ? `${Math.round(100 * c.ok / (c.ok + c.ng))}%` : '—';

  const chip = $('#chipEstado');
  if (io.BT_EMERGENCIA) { chip.textContent = 'Emergência'; chip.className = 'chip erro'; }
  else if (est.clp) { chip.textContent = est.clp.nomeEstado + (est.clp.sistemaOn ? '' : ' · desligado'); chip.className = `chip ${est.clp.sistemaOn ? 'ok' : ''}`; }
  else { chip.textContent = io.LAMP_SISTEMA ? 'Sistema ligado' : 'Sistema desligado'; chip.className = `chip ${io.LAMP_SISTEMA ? 'ok' : ''}`; }

  $$('#corpoCoils tr.entrada').forEach(tr => {
    tr.querySelector('.led').classList.toggle('on', !!io[cfg.sinais.escritas[Number(tr.dataset.index)].nome]);
  });
});

// ---------- vistas e rótulos
function marcarVista(nome) { $$('.vistas button').forEach(x => x.classList.toggle('ativo', x.dataset.vista === nome)); }
$$('.vistas button').forEach(b => b.addEventListener('click', () => {
  if ($('#chkCamDin').checked) { $('#chkCamDin').checked = false; salvarPref('camDin', false); } // escolha manual desliga o modo dinâmico
  marcarVista(b.dataset.vista);
  cena?.definirVista(b.dataset.vista);
}));

// ---------- câmera dinâmica: segue a peça pelos sensores S1 → S2 → S3
// Cada borda de subida gera um "pedido" de vista. A vista atual fica no mínimo CAM_MIN_MS
// e não sai enquanto a etapa estiver acontecendo (inspeção/rejeito ou ciclo do robô).
const EVENTOS_CAM = [
  { sinal: 'S1_ENTRADA', vista: 'entrada', prio: 1, validade: 1500 },
  { sinal: 'S2_INSPECAO', vista: 'inspecao', prio: 2, validade: 2500 },
  { sinal: 'S3_SAIDA', vista: 'robo', prio: 3, validade: 3000 },
];
const CAM_MIN_MS = 2500, CAM_OCIOSA_MS = 8000;
const camDin = { ant: {}, atual: 'geral', desde: 0, pedidos: {}, ultimoEvento: 0 };

function etapaEmAndamento(vista, io, est) {
  if (vista === 'inspecao') return io.VISAO_TRIGGER || io.CILINDRO_REJEITO || est.visao.processando;
  if (vista === 'robo') return io.ROBO_PICK || est.robo.ativo;
  return false;
}

function irVistaDinamica(nome) {
  camDin.atual = nome;
  camDin.desde = performance.now();
  marcarVista(nome);
  cena.definirVista(nome);
}

function atualizarCamDinamica(est) {
  const io = est.io, agora = performance.now();
  for (const e of EVENTOS_CAM) {
    const on = !!io[e.sinal];
    if (on && !camDin.ant[e.sinal]) { camDin.pedidos[e.vista] = { ...e, em: agora }; camDin.ultimoEvento = agora; }
    camDin.ant[e.sinal] = on;
  }
  if (!$('#chkCamDin').checked) return;
  if (etapaEmAndamento(camDin.atual, io, est)) { camDin.ultimoEvento = agora; return; }
  if (agora - camDin.desde < CAM_MIN_MS) return;

  let melhor = null;
  for (const [vista, p] of Object.entries(camDin.pedidos)) {
    if (agora - p.em > p.validade || vista === camDin.atual) { delete camDin.pedidos[vista]; continue; }
    if (!melhor || p.prio > melhor.prio) melhor = p;
  }
  if (melhor) { delete camDin.pedidos[melhor.vista]; irVistaDinamica(melhor.vista); }
  else if (camDin.atual !== 'geral' && agora - camDin.ultimoEvento > CAM_OCIOSA_MS) irVistaDinamica('geral'); // parado → visão geral
}

$('#chkCamDin').addEventListener('change', e => {
  salvarPref('camDin', e.target.checked);
  camDin.pedidos = {};
  if (e.target.checked && cena) irVistaDinamica('geral');
});

// Preferências da tela (só neste navegador)
function salvarPref(chave, valor) { try { localStorage.setItem(`simvisao.${chave}`, JSON.stringify(valor)); } catch { /* sem armazenamento */ } }
function lerPref(chave, padrao) { try { const v = localStorage.getItem(`simvisao.${chave}`); return v === null ? padrao : JSON.parse(v); } catch { return padrao; } }
$('#chkCamDin').checked = lerPref('camDin', false);
$('#chkRotulos').addEventListener('change', e => cena?.mostrarRotulos(e.target.checked));

// ---------- log ("[hh:mm:ss] mensagem"; cor pelo conteúdo)
function nivel(msg) {
  if (/ERRO|EMERGÊNCIA/i.test(msg)) return 'erro';
  if (/rejeitada|NG|Desconectado|desativada|aguarde/i.test(msg)) return 'aviso';
  if (/Conectado|OK|aprovada|salvo|ativada/i.test(msg)) return 'ok';
  return '';
}
socket.on('log', linha => {
  const m = /^\[([^\]]+)\]\s*(.*)$/.exec(linha) || [null, '', linha];
  const li = document.createElement('li');
  li.className = nivel(m[2]);
  li.innerHTML = '<time></time><span></span>';
  li.querySelector('time').textContent = m[1];
  li.querySelector('span').textContent = m[2];
  const ul = $('#log');
  ul.prepend(li);
  while (ul.children.length > 120) ul.lastChild.remove();
});
socket.on('disconnect', () => {
  $('#chipConexao').textContent = 'Servidor offline';
  $('#chipConexao').className = 'chip erro';
});

let timerToast;
function toast(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `ver${erro ? ' erro' : ''}`;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { t.className = ''; }, 3200);
}
