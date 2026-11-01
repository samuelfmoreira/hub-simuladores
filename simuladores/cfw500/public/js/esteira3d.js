// =====================================================================
//  Esteira transportadora 3D (three.js) acionada pelo CFW500 simulado
//  Toda a física roda no servidor; aqui só desenhamos e interpolamos.
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const L = 4.0;          // comprimento entre tambores (m) — igual ao servidor
const W = 0.6;          // largura da correia (m)
const ALT = 0.8;        // altura da superfície da correia (m)
const R_TAMBOR = 0.07;
const PASSO_TEX = 0.25; // comprimento de um "módulo" da textura da correia

let renderer, cena, camera, controles, relogio;
let grupoEsteira, texCorreia, texRetorno, tamborCab, tamborCauda, ventoinha, pernas = [];
let feixe1, feixe2, ledS1, ledS2, lampadas, objPreso, eixoAcopl;
let painelGrupo, telaIHM, texIHM, ledIHM, canvasIHM, aoTocarIHM, apontarIHM, voo = null;
const raio = new THREE.Raycaster();
const ponteiro = new THREE.Vector2();
const VISTA = { pos: new THREE.Vector3(-0.4, 2.1, 3.6), alvo: new THREE.Vector3(2.1, 0.6, -0.2) };
const caixas = new Map();
const caindo = [];
const descarregadas = new Set();   // caixas que já saíram da correia (o servidor ainda as conta até L + 0,25 m)
const vagas = [null, null, null, null];   // 4 posições no fundo da caçamba
let contDescarga = 0;
// calha de descarga (fixa no mundo): mesma geometria criada em construirEsteira()
const ANG_CALHA = 0.3;                        // inclinação da calha (rad, ~17°)
const COMP_CALHA = 1.25;                      // comprimento da calha (m)
const X_CACAMBA = L + 1.9;                    // centro da caçamba
const CALHA_TOPO = { x: L + 0.16, y: ALT - 0.05 };
const CALHA = {
  cx: CALHA_TOPO.x + Math.cos(ANG_CALHA) * COMP_CALHA / 2,
  cy: CALHA_TOPO.y - Math.sin(ANG_CALHA) * COMP_CALHA / 2 + 0.011,
  meio: COMP_CALHA / 2,
};
let snap = null;
let tSnap = 0;

function texturaCanvas(w, h, desenhar) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  desenhar(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function rotulo(texto, { cor = '#1f2426', fundo = 'rgba(243,244,241,.92)', escala = 0.0016 } = {}) {
  const pad = 16;
  const ctx0 = document.createElement('canvas').getContext('2d');
  ctx0.font = '600 40px "Barlow Condensed", sans-serif';
  const w = Math.ceil(ctx0.measureText(texto).width) + pad * 2;
  const tex = texturaCanvas(w, 64, (ctx) => {
    ctx.fillStyle = fundo; ctx.fillRect(0, 0, w, 64);
    ctx.font = '600 40px "Barlow Condensed", sans-serif'; ctx.fillStyle = cor; ctx.textBaseline = 'middle';
    ctx.fillText(texto, pad, 34);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
  sp.scale.set(w * escala, 64 * escala, 1);
  return sp;
}

const mat = (cor, o = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: o.r ?? 0.6, metalness: o.m ?? 0.1, ...o.extra });

export function iniciarEsteira(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.prepend(renderer.domElement);

  cena = new THREE.Scene();
  cena.background = new THREE.Color('#b9beb6');
  cena.fog = new THREE.Fog('#b9beb6', 12, 26);

  camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
  camera.position.set(-0.4, 2.1, 3.6);
  controles = new OrbitControls(camera, renderer.domElement);
  controles.target.set(2.1, 0.6, -0.2);
  controles.enableDamping = true;
  controles.maxPolarAngle = Math.PI * 0.49;
  controles.minDistance = 0.2; controles.maxDistance = 12;

  cena.add(new THREE.HemisphereLight('#f4f6f2', '#6f756c', 1.1));
  const sol = new THREE.DirectionalLight('#ffffff', 2.0);
  sol.position.set(3, 6, 4);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -5, right: 7, top: 5, bottom: -5 });
  cena.add(sol);

  // piso de concreto com faixa de segurança
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat('#a3a79e', { r: 0.95 }));
  piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; cena.add(piso);
  const faixa = texturaCanvas(256, 32, (c, w, h) => {
    for (let i = -2; i < 12; i++) { c.fillStyle = i % 2 ? '#1f2426' : '#e3b11a'; c.beginPath(); c.moveTo(i * 32, h); c.lineTo(i * 32 + 32, 0); c.lineTo(i * 32 + 64, 0); c.lineTo(i * 32 + 32, h); c.fill(); }
  });
  faixa.wrapS = THREE.RepeatWrapping; faixa.repeat.set(14, 1);
  for (const z of [-1.25, 1.35]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 0.08), new THREE.MeshStandardMaterial({ map: faixa, roughness: 0.9 }));
    f.rotation.x = -Math.PI / 2; f.position.set(2, 0.002, z); cena.add(f);
  }

  construirEsteira();
  if (!canvasIHM) { canvasIHM = document.createElement('canvas'); canvasIHM.width = 1280; canvasIHM.height = 800; }
  construirPainel();
  ligarToque3D();

  relogio = new THREE.Clock();
  const ro = new ResizeObserver(() => redimensionar(container));
  ro.observe(container);
  redimensionar(container);
  renderer.setAnimationLoop(animar);
}

function redimensionar(container) {
  const w = container.clientWidth; const h = container.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  // campo de visão horizontal fixo (~66°): a esteira inteira cabe mesmo em telas estreitas
  const hfov = (66 * Math.PI) / 180;
  camera.fov = Math.min(75, Math.max(38, (2 * Math.atan(Math.tan(hfov / 2) / camera.aspect) * 180) / Math.PI));
  camera.updateProjectionMatrix();
}

function construirEsteira() {
  grupoEsteira = new THREE.Group();
  grupoEsteira.position.set(0, ALT, 0);
  cena.add(grupoEsteira);
  const aluminio = mat('#c8ccce', { m: 0.6, r: 0.35 });

  // textura da correia: borracha com nervuras transversais
  const desenharCorreia = (c, w, h) => {
    c.fillStyle = '#2d3133'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { c.fillStyle = '#3c4245'; c.fillRect(i * w / 4, 0, w / 16, h); }
    c.fillStyle = '#e3b11a'; c.fillRect(0, 0, w / 64, h);     // emenda amarela: ajuda a ver o movimento
    c.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < 300; i++) c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  };
  texCorreia = texturaCanvas(256, 128, desenharCorreia);
  texCorreia.wrapS = THREE.RepeatWrapping; texCorreia.repeat.set(L / (PASSO_TEX * 4), 1);
  const correia = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshStandardMaterial({ map: texCorreia, roughness: 0.85 }));
  correia.rotation.x = -Math.PI / 2; correia.position.set(L / 2, 0, 0); correia.receiveShadow = true;
  grupoEsteira.add(correia);
  texRetorno = texCorreia.clone(); texRetorno.needsUpdate = true;
  const retorno = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshStandardMaterial({ map: texRetorno, roughness: 0.9, color: '#9a9a9a' }));
  retorno.rotation.x = Math.PI / 2; retorno.position.set(L / 2, -2 * R_TAMBOR, 0);
  grupoEsteira.add(retorno);

  // tambores com marcação para ver o giro
  const texTambor = texturaCanvas(128, 64, (c, w, h) => { c.fillStyle = '#8d9396'; c.fillRect(0, 0, w, h); c.fillStyle = '#e3b11a'; c.fillRect(0, 0, w / 8, h); c.fillRect(w / 2, 0, w / 8, h); });
  const geoT = new THREE.CylinderGeometry(R_TAMBOR, R_TAMBOR, W + 0.06, 32);
  tamborCauda = new THREE.Mesh(geoT, new THREE.MeshStandardMaterial({ map: texTambor, metalness: 0.5, roughness: 0.4 }));
  tamborCauda.rotation.x = Math.PI / 2; tamborCauda.position.set(0, -R_TAMBOR, 0); tamborCauda.castShadow = true;
  tamborCab = tamborCauda.clone(); tamborCab.position.x = L;
  grupoEsteira.add(tamborCauda, tamborCab);

  // longarinas e guias laterais
  for (const s of [-1, 1]) {
    const lg = new THREE.Mesh(new THREE.BoxGeometry(L + 0.28, 0.16, 0.035), aluminio);
    lg.position.set(L / 2, -0.07, s * (W / 2 + 0.06)); lg.castShadow = true; grupoEsteira.add(lg);
    const guia = new THREE.Mesh(new THREE.BoxGeometry(L - 0.1, 0.05, 0.015), mat('#e3b11a', { r: 0.5 }));
    guia.position.set(L / 2, 0.06, s * (W / 2 + 0.045)); grupoEsteira.add(guia);
  }

  // conjunto motorredutor na cabeceira (lado +z)
  const zM = W / 2 + 0.08;
  const redutor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.16), mat('#5c666d', { m: 0.3 }));
  redutor.position.set(L, -R_TAMBOR, zM + 0.08); redutor.castShadow = true; grupoEsteira.add(redutor);
  const verdeWEG = mat('#3a6249', { r: 0.45, m: 0.2 });
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.3, 32), verdeWEG);
  motor.rotation.x = Math.PI / 2; motor.position.set(L, -R_TAMBOR, zM + 0.31); motor.castShadow = true; grupoEsteira.add(motor);
  for (let i = 0; i < 12; i++) { // aletas
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.26), verdeWEG);
    const ang = (i / 12) * Math.PI * 2;
    a.position.set(L + Math.cos(ang) * 0.1, -R_TAMBOR + Math.sin(ang) * 0.1, zM + 0.31); a.rotation.z = ang; grupoEsteira.add(a);
  }
  const tampa = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 32, 1, true), mat('#2f3335', { side: THREE.DoubleSide }));
  tampa.rotation.x = Math.PI / 2; tampa.position.set(L, -R_TAMBOR, zM + 0.49); grupoEsteira.add(tampa);
  ventoinha = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.004), mat(i === 0 ? '#e3b11a' : '#d8dad6'));
    p.position.x = 0.04; const g = new THREE.Group(); g.rotation.z = (i / 6) * Math.PI * 2; g.add(p); ventoinha.add(g);
  }
  ventoinha.position.set(L, -R_TAMBOR, zM + 0.505); grupoEsteira.add(ventoinha);
  const cxLig = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), verdeWEG);
  cxLig.position.set(L, -R_TAMBOR + 0.12, zM + 0.3); grupoEsteira.add(cxLig);
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshBasicMaterial({ map: texturaCanvas(240, 120, (c) => {
    c.fillStyle = '#d9dcd6'; c.fillRect(0, 0, 240, 120); c.fillStyle = '#1d4f9a'; c.font = 'bold 30px sans-serif'; c.fillText('WEG W22', 12, 36);
    c.fillStyle = '#222'; c.font = '20px sans-serif'; c.fillText('1,5 kW  4 polos', 12, 66); c.fillText('380 V  60 Hz  1710 rpm', 12, 94);
  }) }));
  placa.position.set(L + 0.097, -R_TAMBOR, zM + 0.31); placa.rotation.y = Math.PI / 2;
  grupoEsteira.add(placa);
  eixoAcopl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 12), mat('#9ba0a2', { m: 0.7 }));
  eixoAcopl.rotation.x = Math.PI / 2; eixoAcopl.position.set(L, -R_TAMBOR, W / 2 + 0.04); grupoEsteira.add(eixoAcopl);

  // sensores fotoelétricos S1 (entrada) e S2 (saída)
  const criarSensor = (x, nome) => {
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.04), mat('#2f3335'));
    corpo.position.set(x, 0.1, -(W / 2 + 0.1)); grupoEsteira.add(corpo);
    const haste = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.02), aluminio);
    haste.position.set(x, 0.02, -(W / 2 + 0.1)); grupoEsteira.add(haste);
    const refl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.01), mat('#c62828', { r: 0.3 }));
    refl.position.set(x, 0.1, W / 2 + 0.09); grupoEsteira.add(refl);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.009), new THREE.MeshBasicMaterial({ color: '#333' }));
    led.position.set(x, 0.14, -(W / 2 + 0.1)); grupoEsteira.add(led);
    const fx = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, W + 0.18, 6), new THREE.MeshBasicMaterial({ color: '#ff3030', transparent: true, opacity: 0.55 }));
    fx.rotation.x = Math.PI / 2; fx.position.set(x, 0.1, 0); grupoEsteira.add(fx);
    const r = rotulo(nome); r.position.set(x, 0.3, -(W / 2 + 0.1)); grupoEsteira.add(r);
    return { led, fx };
  };
  ({ led: ledS1, fx: feixe1 } = criarSensor(0.55, 'S1 → DI5'));
  ({ led: ledS2, fx: feixe2 } = criarSensor(3.55, 'S2 → DI6'));

  // calha de descarga e caçamba
  const chapaCalha = mat('#9aa0a3', { m: 0.5, r: 0.4 });
  const calha = new THREE.Group();
  calha.add(new THREE.Mesh(new THREE.BoxGeometry(COMP_CALHA, 0.02, W), chapaCalha));
  for (const s of [-1, 1]) {                                             // abas laterais
    const aba = new THREE.Mesh(new THREE.BoxGeometry(COMP_CALHA, 0.08, 0.015), chapaCalha);
    aba.position.set(0, 0.04, s * (W / 2)); calha.add(aba);
  }
  calha.position.set(CALHA.cx, CALHA.cy - 0.011, 0); calha.rotation.z = -ANG_CALHA;
  calha.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  cena.add(calha);
  const xPe = CALHA.cx + Math.cos(ANG_CALHA) * (CALHA.meio - 0.06);   // pés na ponta de baixo
  const yPe = CALHA.cy - Math.sin(ANG_CALHA) * (CALHA.meio - 0.06) - 0.02;
  for (const s of [-1, 1]) {
    const pe = new THREE.Mesh(new THREE.BoxGeometry(0.03, yPe, 0.03), aluminio);
    pe.position.set(xPe, yPe / 2, s * (W / 2 - 0.03)); pe.castShadow = true; cena.add(pe);
  }
  const cacamba = new THREE.Group();
  const chapa = mat('#3f6fb3', { r: 0.5 });
  const fundo = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), chapa); fundo.position.y = 0.02; cacamba.add(fundo);
  for (const [dx, dz, sx, sz] of [[0.45, 0, 0.03, 0.9], [-0.45, 0, 0.03, 0.9], [0, 0.45, 0.9, 0.03], [0, -0.45, 0.9, 0.03]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.25, sz), chapa); p.position.set(dx, 0.125, dz); p.castShadow = true; cacamba.add(p);
  }
  cacamba.position.set(X_CACAMBA, 0, 0); cena.add(cacamba);

  // objeto preso (aparece quando a esteira é travada)
  objPreso = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, W + 0.1), mat('#8a5a2b'));
  objPreso.position.set(L - 0.12, 0.05, 0); objPreso.rotation.z = 0.5; objPreso.visible = false; grupoEsteira.add(objPreso);

  // pernas (fora do grupo para acompanharem a inclinação até o piso)
  for (const x of [0.25, L / 2, L - 0.25]) for (const z of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1, 0.045), aluminio);
    p.castShadow = true; p.userData = { x, z: z * (W / 2 + 0.06) }; cena.add(p); pernas.push(p);
  }
  ajustarPernas(0);

  const r1 = rotulo('Alimentação'); r1.position.set(-0.25, ALT + 0.25, 0.25); cena.add(r1);
  const r2 = rotulo('Descarga'); r2.position.set(X_CACAMBA, 0.55, 0); cena.add(r2);
}

function ajustarPernas(incl) {
  const th = (incl * Math.PI) / 180;
  for (const p of pernas) {
    const x = p.userData.x;
    const yTopo = ALT - 0.15 + x * Math.sin(th);
    p.scale.y = Math.max(0.1, yTopo);
    p.position.set(x * Math.cos(th), yTopo / 2, p.userData.z);
  }
}

function construirPainel() {
  // painel elétrico RAL 7035 (piso) com a IHM 10" na porta e a torre de sinalização
  const g = new THREE.Group();
  const chapa = mat('#cdd0c9', { r: 0.55 });
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.4), chapa);
  corpo.position.y = 1.0; corpo.castShadow = true; corpo.receiveShadow = true; g.add(corpo);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.1, 0.42), mat('#4a5054')); base.position.y = 0.05; g.add(base);
  const zP = 0.201;   // face da porta
  // frisos da porta e dobradiças
  const friso = mat('#b8bcb4', { r: 0.6 });
  for (const [w, h, x, y] of [[0.76, 0.006, 0, 1.87], [0.76, 0.006, 0, 0.13], [0.006, 1.74, -0.38, 1.0], [0.006, 1.74, 0.38, 1.0]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.004), friso); f.position.set(x, y, zP); g.add(f);
  }
  for (const y of [0.4, 1.6]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 12), mat('#8d9295', { m: 0.6 })); d.position.set(-0.39, y, zP); g.add(d); }
  const puxador = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), mat('#2f3335', { r: 0.4 })); puxador.position.set(0.33, 1.05, zP + 0.015); g.add(puxador);

  const plaqueta = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.045), new THREE.MeshBasicMaterial({ map: texturaCanvas(256, 72, (c) => {
    c.fillStyle = '#1f2426'; c.fillRect(0, 0, 256, 72); c.fillStyle = '#f1f2ee'; c.font = 'bold 40px sans-serif'; c.fillText('QC-01', 64, 50);
  }) }));
  plaqueta.position.set(0, 1.86 - 0.06, zP + 0.002); g.add(plaqueta);

  // ---------------- IHM 10,1" (cliente Modbus TCP) ----------------
  const ihm = new THREE.Group();
  const moldura = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.2, 0.035), mat('#24282b', { r: 0.45, m: 0.15 }));
  moldura.castShadow = true; ihm.add(moldura);
  const aro = new THREE.Mesh(new THREE.BoxGeometry(0.272, 0.172, 0.002), mat('#0b0d0f', { r: 0.2 }));
  aro.position.set(0, 0.006, 0.0181); ihm.add(aro);
  texIHM = new THREE.CanvasTexture(canvasIHM);
  texIHM.colorSpace = THREE.SRGBColorSpace; texIHM.anisotropy = 8; texIHM.generateMipmaps = true; texIHM.minFilter = THREE.LinearMipmapLinearFilter;
  telaIHM = new THREE.Mesh(new THREE.PlaneGeometry(0.256, 0.16), new THREE.MeshBasicMaterial({ map: texIHM, toneMapped: false }));
  telaIHM.position.set(0, 0.006, 0.0193); ihm.add(telaIHM);
  const vidro = new THREE.Mesh(new THREE.PlaneGeometry(0.256, 0.16), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, roughness: 0.05, metalness: 0.9 }));
  vidro.position.set(0, 0.006, 0.0196); vidro.raycast = () => {}; ihm.add(vidro);
  const rotIHM = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.012), new THREE.MeshBasicMaterial({ transparent: true, map: texturaCanvas(256, 28, (c) => {
    c.fillStyle = '#8d959b'; c.font = '600 20px "Barlow Condensed", sans-serif'; c.fillText('IHM 10,1"  ·  MODBUS TCP', 4, 21);
  }) }));
  rotIHM.position.set(-0.07, -0.088, 0.0182); ihm.add(rotIHM);
  ledIHM = new THREE.Mesh(new THREE.CircleGeometry(0.0035, 16), new THREE.MeshBasicMaterial({ color: '#3cff6a' }));
  ledIHM.position.set(0.128, -0.088, 0.0182); ihm.add(ledIHM);
  ihm.position.set(0, 1.42, zP + 0.0175);
  g.add(ihm);

  // torre de sinalização
  const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12), mat('#999')); poste.position.set(0.28, 1.96, 0); g.add(poste);
  lampadas = {};
  [['verde', '#2e9e4a', 2.06], ['amarelo', '#e3b11a', 2.16], ['vermelho', '#cf2e2e', 2.26]].forEach(([k, c, y]) => {
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.05, transparent: true, opacity: 0.9 });
    m.userData.cor = new THREE.Color(c); m.userData.apagada = new THREE.Color(c).multiplyScalar(0.35);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 24), m); l.position.set(0.28, y, 0); g.add(l); lampadas[k] = m;
  });
  g.position.set(1.3, 0, -2.1); g.rotation.y = 0.1;
  cena.add(g);
  painelGrupo = g;
  const r = rotulo('Painel QC-01 · IHM + CFW500'); r.position.set(0.72, 2.12, -1.95); cena.add(r);
}

// ------------------------------------------------------------------
//  IHM 3D: toque por raycasting e câmera
// ------------------------------------------------------------------
function pontoNaTela(ev) {
  if (!telaIHM) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  ponteiro.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  raio.setFromCamera(ponteiro, camera);
  const hit = raio.intersectObjects([painelGrupo], true)[0];
  if (!hit || hit.object !== telaIHM || !hit.uv) return null;
  return { x: hit.uv.x * canvasIHM.width, y: (1 - hit.uv.y) * canvasIHM.height };
}

function ligarToque3D() {
  const el = renderer.domElement;
  let tocando = false;
  el.addEventListener('pointerdown', (ev) => {
    const p = pontoNaTela(ev);
    if (!p || !aoTocarIHM) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    tocando = true; controles.enabled = false;
    el.setPointerCapture(ev.pointerId);
    aoTocarIHM(p.x, p.y, 'down');
  }, { capture: true });
  el.addEventListener('pointerup', (ev) => {
    if (!tocando) return;
    tocando = false; controles.enabled = true;
    const p = pontoNaTela(ev);
    aoTocarIHM(p ? p.x : -1, p ? p.y : -1, p ? 'up' : 'cancel');
    ev.stopImmediatePropagation();
  }, { capture: true });
  el.addEventListener('pointercancel', () => { if (tocando) { tocando = false; controles.enabled = true; aoTocarIHM(-1, -1, 'cancel'); } });
  el.addEventListener('pointermove', (ev) => {
    if (ev.buttons && !tocando) return;
    const p = pontoNaTela(ev);
    el.style.cursor = p && apontarIHM && apontarIHM(p.x, p.y) ? 'pointer' : '';
  });
}

/** Leva a câmera para a frente da IHM (ou de volta à vista geral) */
export function focarIHM(perto = true) {
  if (!painelGrupo) return;
  let pos, alvo;
  if (perto) {
    const c = new THREE.Vector3(); telaIHM.getWorldPosition(c);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(telaIHM.getWorldQuaternion(new THREE.Quaternion()));
    // distância para a IHM (0,29 × 0,20 m) ocupar ~75% da vista
    const tv = 2 * Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(0.2 / (0.75 * tv), 0.29 / (0.75 * tv * camera.aspect));
    alvo = c; pos = c.clone().add(n.multiplyScalar(Math.max(0.22, dist)));
  } else { pos = VISTA.pos.clone(); alvo = VISTA.alvo.clone(); }
  voo = { t0: performance.now(), p0: camera.position.clone(), a0: controles.target.clone(), p1: pos, a1: alvo };
}

/** Ponto da tela da IHM (px do canvas) -> coordenadas na página (usado em testes automáticos) */
export function projetarIHM(x, y) {
  const v = new THREE.Vector3((x / canvasIHM.width - 0.5) * 0.256, (0.5 - y / canvasIHM.height) * 0.16, 0);
  telaIHM.localToWorld(v); v.project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}

/** Câmera em posição fixa (usado em testes automáticos e capturas) */
export function posicionarCamera(pos, alvo) {
  voo = null; camera.position.set(...pos); controles.target.set(...alvo); controles.update();
}

export function registrarIHM3D(canvas, { tocar, apontar }) {
  canvasIHM = canvas; aoTocarIHM = tocar; apontarIHM = apontar;
}
export function atualizarTexturaIHM(comunicando) {
  if (texIHM) texIHM.needsUpdate = true;
  if (ledIHM) ledIHM.material.color.set(comunicando ? '#3cff6a' : Math.floor(performance.now() / 500) % 2 ? '#ffb020' : '#3a2a0a');
}

// ------------------------------------------------------------------
//  Caixas
// ------------------------------------------------------------------
const texCaixa = (() => {
  let t; return () => t || (t = texturaCanvas(128, 128, (c) => {
    c.fillStyle = '#b98b55'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#d9c69a'; c.fillRect(54, 0, 20, 128);
    c.strokeStyle = 'rgba(80,50,20,.35)'; c.lineWidth = 2; c.strokeRect(2, 2, 124, 124);
  }));
})();

function malhaCaixa(massa) {
  const h = 0.14 + Math.min(80, massa) / 80 * 0.2;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.36), new THREE.MeshStandardMaterial({ map: texCaixa(), roughness: 0.8 }));
  m.castShadow = true; m.receiveShadow = true; m.userData.h = h;
  const r = rotulo(`${massa} kg`, { escala: 0.0012 }); r.position.y = h / 2 + 0.05; m.add(r);
  return m;
}

// ------------------------------------------------------------------
export function atualizarEsteira(est) {
  snap = est; tSnap = performance.now();
  const pl = est.drive.planta;
  ajustarPernas(pl.cfg.inclinacao);
  grupoEsteira.rotation.z = (pl.cfg.inclinacao * Math.PI) / 180;
  objPreso.visible = pl.travada;

  // caixas: cria/remove conforme o servidor
  const ids = new Set(pl.caixas.map((c) => c.id));
  for (const id of descarregadas) if (!ids.has(id)) descarregadas.delete(id);
  for (const [id, m] of caixas) {
    if (!ids.has(id)) {
      caixas.delete(id);
      if (m.userData.x > L - 0.1) iniciarQueda(m);   // saiu pela cabeceira entre dois quadros
      else grupoEsteira.remove(m);                    // retirada ou devolvida pela cauda
    }
  }
  for (const c of pl.caixas) {
    if (descarregadas.has(c.id)) continue;
    let m = caixas.get(c.id);
    if (!m) { m = malhaCaixa(c.massa); caixas.set(c.id, m); grupoEsteira.add(m); }
    m.userData.x = c.x;
  }

  // sensores
  feixe1.visible = !pl.s1; feixe2.visible = !pl.s2;
  ledS1.material.color.set(pl.s1 ? '#ffb020' : '#2e9e4a');
  ledS2.material.color.set(pl.s2 ? '#ffb020' : '#2e9e4a');

  // torre de sinalização = estado do inversor
  const d = est.drive;
  const liga = (m, on) => { m.emissiveIntensity = on ? 2.5 : 0; m.color.copy(on ? m.userData.cor : m.userData.apagada); };
  liga(lampadas.verde, d.ligado && d.pwm);
  liga(lampadas.amarelo, d.ligado && d.alarmes.length > 0 && Math.floor(performance.now() / 400) % 2 === 0);
  liga(lampadas.vermelho, d.ligado && !!d.falha);
}

// ------------------------------------------------------------------
//  Descarga: tomba na cabeceira -> escorrega pela calha -> cai na caçamba
// ------------------------------------------------------------------
const suave = (k) => k * k * (3 - 2 * k);
function iniciarQueda(m) {
  const ini = new THREE.Vector3(); m.getWorldPosition(ini);
  grupoEsteira.remove(m); cena.add(m); m.position.copy(ini); m.rotation.set(0, 0, 0);
  const h = m.userData.h;
  const d = new THREE.Vector2(Math.cos(ANG_CALHA), -Math.sin(ANG_CALHA));   // ao longo da calha, descendo
  const n = new THREE.Vector2(Math.sin(ANG_CALHA), Math.cos(ANG_CALHA));    // normal à calha, para cima
  const topo = new THREE.Vector2(CALHA.cx - d.x * CALHA.meio, CALHA.cy - d.y * CALHA.meio);
  const baixo = new THREE.Vector2(CALHA.cx + d.x * CALHA.meio, CALHA.cy + d.y * CALHA.meio);
  const B = topo.clone().addScaledVector(d, 0.13).addScaledVector(n, h / 2);
  const C = baixo.clone().addScaledVector(d, -0.1).addScaledVector(n, h / 2);
  // vaga na caçamba: 4 posições no fundo; a caixa mais antiga da vaga sai de cena
  const vaga = contDescarga++ % 4;
  if (vagas[vaga]) cena.remove(vagas[vaga]);
  vagas[vaga] = m;
  const D = new THREE.Vector3(X_CACAMBA + (vaga % 2 ? 0.2 : -0.18), 0.04 + h / 2, vaga < 2 ? -0.2 : 0.2);
  const desliza = Math.sqrt((2 * B.distanceTo(C)) / (9.81 * Math.sin(ANG_CALHA)));
  caindo.push({ m, t: 0, ini, B, C, D, t1: 0.22, t2: Math.max(0.35, desliza), t3: 0.3, giro: (vaga - 1.5) * 0.18 });
}
function passoQueda(q) {
  const { m, ini, B, C, D } = q;
  if (q.t < q.t1) {                                       // 1) tomba na cabeceira e cai na calha
    const k = q.t / q.t1;
    m.position.set(ini.x + (B.x - ini.x) * k, ini.y + (B.y - ini.y) * k * k, ini.z);
    m.rotation.z = -ANG_CALHA * suave(k);
    return false;
  }
  if (q.t < q.t1 + q.t2) {                                // 2) escorrega acelerando pela calha
    const k = (q.t - q.t1) / q.t2; const s2 = k * k;
    m.position.set(B.x + (C.x - B.x) * s2, B.y + (C.y - B.y) * s2, ini.z);
    m.rotation.z = -ANG_CALHA;
    return false;
  }
  const k = Math.min(1, (q.t - q.t1 - q.t2) / q.t3);     // 3) sai da calha e cai no fundo da caçamba
  m.position.set(C.x + (D.x - C.x) * k, C.y + (D.y - C.y) * k * k, ini.z + (D.z - ini.z) * suave(k));
  m.rotation.z = -ANG_CALHA * (1 - suave(k));
  m.rotation.y = q.giro * suave(k);
  return k >= 1;
}

function animar() {
  const dt = Math.min(0.05, relogio.getDelta());
  if (voo) {
    const t = Math.min(1, (performance.now() - voo.t0) / 900);
    const k = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    camera.position.lerpVectors(voo.p0, voo.p1, k);
    controles.target.lerpVectors(voo.a0, voo.a1, k);
    if (t >= 1) voo = null;
  }
  controles.update();
  if (snap) {
    const pl = snap.drive.planta;
    const ext = Math.min(0.12, (performance.now() - tSnap) / 1000);
    const pos = pl.posCorreia + pl.vel * ext;
    texCorreia.offset.x = -(pos / (PASSO_TEX * 4)) % 1;
    texRetorno.offset.x = (pos / (PASSO_TEX * 4)) % 1;
    const ang = pl.angTambor + (pl.vel / R_TAMBOR) * ext;
    tamborCab.rotation.y = -ang * (R_TAMBOR / R_TAMBOR); tamborCauda.rotation.y = -ang;
    eixoAcopl.rotation.y = -ang;
    // ventoinha do motor: velocidade real reduzida 1:12 só para o olho acompanhar o sentido
    ventoinha.rotation.z -= ((snap.drive.rpm / 60) * 2 * Math.PI / 12) * dt;
    for (const c of pl.caixas) {
      const m = caixas.get(c.id); if (!m) continue;
      const x = c.x + pl.vel * ext;
      m.position.set(Math.min(x, L + 0.02), m.userData.h / 2 + 0.003, 0);
      m.userData.x = x;
      // o centro da caixa passou do tambor: ela tomba e sai da correia
      if (x >= L + 0.02 && pl.vel > 0) { caixas.delete(c.id); descarregadas.add(c.id); iniciarQueda(m); }
    }
    // atualizar textura também quando inclinada não muda nada; ok
  }
  for (let i = caindo.length - 1; i >= 0; i--) {
    const q = caindo[i]; q.t += dt;
    if (passoQueda(q)) caindo.splice(i, 1);
  }
  renderer.render(cena, camera);
}
