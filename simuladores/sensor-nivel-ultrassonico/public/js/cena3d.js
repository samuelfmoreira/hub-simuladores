// Processo em 3D (three.js local, funciona sem internet): tanque TQ-01 em corte, transmissor LT-01, feixe, pulsos e
// painel do CLP. Tudo é animado pelo estado que vem do servidor (objeto V montado em app.js); aqui não há física.
// Dimensões reais: sensor pelas cotas do desenho dimensional do VEGASON 61 (mm), coluna de comando de 2,0 m com a
// IHM na altura dos olhos (1,62 m) e sinaleiros de 22 mm a 1,33 m. Sem boneco na cena.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rad = (d) => d * Math.PI / 180;
const fmt = (v, n = 2) => v.toFixed(n).replace('.', ',').replace('-', '−');

export const G = { R: 1.0, yb: 0.30, roof: 3.05, E: 3.0, sx: 0.30, obsD: 1.20, obsEdge: 0.07, zonaMorta: 0.25, feixe: 11 };
const HALF = rad(G.feixe / 2);
const FACE_Y = G.yb + G.E;
const ROOF_Y = G.yb + G.roof;
const SINALEIROS = [
  { tag: 'LALL_01', txt: 'LALL', cor: 0xa82219, luz: 0xff3b2e },
  { tag: 'LAL_01', txt: 'LAL', cor: 0xb07a00, luz: 0xffc21a },
  { tag: 'LAH_01', txt: 'LAH', cor: 0xb07a00, luz: 0xffc21a },
  { tag: 'LAHH_01', txt: 'LAHH', cor: 0xa82219, luz: 0xff3b2e },
  { tag: 'Falha_LT01', txt: 'FALHA', cor: 0x1b4f9c, luz: 0x3d8bff },
];

const CAMS = {
  geral: { p: [4.3, 3.3, 5.7], t: [0.4, 1.8, 0] },
  sensor: { p: [1.2, 3.98, 1.25], t: [0.32, 3.4, 0] },
  feixe: { p: [2.9, 3.15, 4.3], t: [0.3, 2.3, 0] },
  topo: { p: [0.3, 7.9, 0.45], t: [0.3, 1.3, 0] },
  painel: { p: [2.74, 1.6, 1.62], t: [2.35, 1.53, 0.28] },
};

export function criarCena({ view, canvas, labelsEl, insetEl, reduzido = false, aoMudarCamera = () => {} }) {
  const T3 = {}, labels = [];
  let tween = null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const BG = 0xe4e7e2;
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 18, 46);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 120);
  camera.position.set(...CAMS.geral.p);
  const camInset = new THREE.PerspectiveCamera(30, 1, 0.02, 30);
  camInset.position.set(G.sx + 0.38, FACE_Y + 0.46, 0.60);
  camInset.lookAt(G.sx + 0.012, FACE_Y + 0.118, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...CAMS.geral.t);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 0.5; controls.maxDistance = 18; controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.addEventListener('start', () => { tween = null; aoMudarCamera(null); });

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9bfb8, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(5, 9.5, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 7, bottom: -3, near: 1, far: 30 });
  scene.add(sun);

  // ---------------------------------------------------------------- ajudantes
  function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow; return m; }
  const cylG = (r1, r2, h, seg = 32, open = false) => new THREE.CylinderGeometry(r1, r2, h, seg, 1, open);
  function tube(points, r, mat) {
    const g = new THREE.Group(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < points.length - 1; i++) {
      const a = new THREE.Vector3(...points[i]), b = new THREE.Vector3(...points[i + 1]);
      const d = b.clone().sub(a), len = d.length();
      const m = mesh(cylG(r, r, len, 16), mat);
      m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(up, d.normalize()); g.add(m);
      const s = mesh(new THREE.SphereGeometry(r, 16, 10), mat); s.position.copy(b); g.add(s);
    }
    return g;
  }
  function canvasTex(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return { c, g: c.getContext('2d'), tex }; }
  function addLabel(cls, text, pos, anchor = 'c') { const el = document.createElement('div'); el.className = 'lb ' + cls; el.textContent = text; labelsEl.appendChild(el); const L = { el, pos: new THREE.Vector3(...pos), anchor, show: true, text }; labels.push(L); return L; }
  function setText(L, t) { if (L.text !== t) { L.text = t; L.el.textContent = t; } }
  function makeDim(color) {
    const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color });
    const bar = new THREE.Mesh(cylG(0.008, 0.008, 1, 8), mat);
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 12), mat), b = a.clone(); b.rotation.x = Math.PI;
    g.add(bar, a, b);
    g.set = (x, z, y0, y1) => {
      const h = y1 - y0; g.visible = h > 0.03; if (!g.visible) return;
      const s = Math.min(1, h / 0.3);
      bar.scale.y = h; bar.position.set(x, (y0 + y1) / 2, z);
      a.scale.setScalar(s); b.scale.setScalar(s);
      a.position.set(x, y1 - 0.05 * s, z); b.position.set(x, y0 + 0.05 * s, z);
    };
    return g;
  }
  const capGeo = (theta) => new THREE.SphereGeometry(1, 40, 8, 0, Math.PI * 2, 0, theta);

  // ---------------------------------------------------------------- materiais
  const mFloor = new THREE.MeshStandardMaterial({ color: 0xd6d9d3, roughness: 0.95 });
  const mConcrete = new THREE.MeshStandardMaterial({ color: 0xaab0ab, roughness: 0.9 });
  const mSteel = new THREE.MeshStandardMaterial({ color: 0xdde2e4, metalness: 0.05, roughness: 0.6, side: THREE.DoubleSide });
  const mSteelDark = new THREE.MeshStandardMaterial({ color: 0x7f8d99, metalness: 0.1, roughness: 0.5 });
  const mPipe = new THREE.MeshStandardMaterial({ color: 0xa9b6c0, metalness: 0.1, roughness: 0.45 });
  const mGlass = new THREE.MeshStandardMaterial({ color: 0x9cc1d6, transparent: true, opacity: 0.12, roughness: 0.08, side: THREE.DoubleSide, depthWrite: false });
  const mRoof = new THREE.MeshStandardMaterial({ color: 0xb9cbd6, transparent: true, opacity: 0.22, roughness: 0.2, depthWrite: false });
  const mLiquid = new THREE.MeshStandardMaterial({ color: 0x2b7bcc, transparent: true, opacity: 0.74, roughness: 0.2 });
  const mSurf = new THREE.MeshStandardMaterial({ color: 0x4d9be2, transparent: true, opacity: 0.9, roughness: 0.18, metalness: 0.1, side: THREE.DoubleSide });
  const mBody = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.55 });            // transdutor e conexão em PVDF
  const mHouse = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.55 });            // carcaça (acabamento genérico)
  const mLid = new THREE.MeshStandardMaterial({ color: 0x17324d, roughness: 0.5 });
  const mCabinet = new THREE.MeshStandardMaterial({ color: 0xd7d9d2, roughness: 0.6, metalness: 0.1 });   // RAL 7035
  const mBlack = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.6 });
  const TX = 0xe0650a, RX = 0x0a8794, BAD = 0xc5271d;

  // ---------------------------------------------------------------- piso e base
  const floor = mesh(new THREE.CircleGeometry(40, 72), mFloor); floor.rotation.x = -Math.PI / 2; floor.castShadow = false; scene.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0xbdc3bc, 0xc9cec8); grid.position.y = 0.003; scene.add(grid);
  const mark = new THREE.Mesh(new THREE.RingGeometry(1.72, 1.8, 96), new THREE.MeshBasicMaterial({ color: 0xeab308 }));
  mark.rotation.x = -Math.PI / 2; mark.position.y = 0.006; scene.add(mark);
  scene.add(mesh(cylG(1.28, 1.3, G.yb - 0.02, 64), mConcrete, 0, (G.yb - 0.02) / 2, 0));

  // ---------------------------------------------------------------- tanque em corte: costado atrás, visor na frente
  const Rw = G.R + 0.012, Hs = G.roof, yMid = G.yb + Hs / 2;
  { const sh = mesh(new THREE.CylinderGeometry(Rw, Rw, Hs, 72, 1, true, rad(85), rad(190)), mSteel, 0, yMid, 0); sh.receiveShadow = false; scene.add(sh); }
  const glass = mesh(new THREE.CylinderGeometry(Rw, Rw, Hs, 72, 1, true, rad(-85), rad(170)), mGlass, 0, yMid, 0, false); glass.renderOrder = 6; scene.add(glass);
  scene.add(mesh(cylG(Rw + 0.02, Rw + 0.02, 0.02, 72), mSteelDark, 0, G.yb - 0.01, 0));
  for (const y of [G.yb + 0.012, ROOF_Y]) { const t = mesh(new THREE.TorusGeometry(Rw + 0.006, 0.016, 10, 96), mSteelDark, 0, y, 0); t.rotation.x = Math.PI / 2; scene.add(t); }
  for (const a of [-85, 85]) scene.add(mesh(cylG(0.016, 0.016, Hs, 10), mSteelDark, Rw * Math.sin(rad(a)), yMid, Rw * Math.cos(rad(a))));
  const roof = mesh(cylG(Rw + 0.01, Rw + 0.01, 0.006, 72), mRoof, 0, ROOF_Y + 0.003, 0, false); roof.renderOrder = 7; scene.add(roof);
  for (let i = 0; i <= 6; i++) scene.add(mesh(new THREE.BoxGeometry(0.07, 0.006, 0.006), mBlack, Rw * Math.sin(rad(-83)) + 0.03, G.yb + i * 0.5, Rw * Math.cos(rad(-83)) + 0.012, false));

  // ---------------------------------------------------------------- líquido e espuma
  const liqGeo = cylG(0.985, 0.985, 1, 64); liqGeo.translate(0, 0.5, 0);
  T3.liquid = mesh(liqGeo, mLiquid, 0, G.yb, 0, false); T3.liquid.renderOrder = 1; scene.add(T3.liquid);
  T3.surfGeo = new THREE.RingGeometry(0.0001, 0.985, 64, 14);
  T3.surf = mesh(T3.surfGeo, mSurf, 0, 0, 0, false); T3.surf.rotation.x = -Math.PI / 2; T3.surf.renderOrder = 1; scene.add(T3.surf);
  const NF = 340;
  T3.foam = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfbfcfa, roughness: 0.9 }), NF);
  { const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < NF; i++) { const r = 0.93 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2, s = 0.035 + rnd() * 0.05; ps.set(r * Math.cos(a), s * 0.25, r * Math.sin(a)); sc.set(s, s * 0.7, s); mtx.compose(ps, q, sc); T3.foam.setMatrixAt(i, mtx); } }
  T3.foam.castShadow = false; scene.add(T3.foam);
  T3.foamSlab = mesh(cylG(0.98, 0.98, 1, 48), new THREE.MeshStandardMaterial({ color: 0xf2f5f3, roughness: 0.95, transparent: true, opacity: 0.9 }), 0, 0, 0, false); T3.foamSlab.renderOrder = 2; scene.add(T3.foamSlab);

  // ---------------------------------------------------------------- sensor: cotas do desenho dimensional (mm → m), a partir da face
  const sen = new THREE.Group(); sen.position.set(G.sx, FACE_Y, 0); scene.add(sen);
  sen.add(mesh(cylG(0.0195, 0.0195, 0.066, 40), mBody, 0, 0.033, 0));                        // transdutor Ø39 × 66
  T3.faceMat = new THREE.MeshStandardMaterial({ color: 0x59636c, roughness: 0.4, emissive: TX, emissiveIntensity: 0 });
  sen.add(mesh(cylG(0.0172, 0.0172, 0.0012, 40), T3.faceMat, 0, -0.0004, 0, false));
  sen.add(mesh(cylG(0.0232, 0.0232, 0.022, 40), mBody, 0, 0.077, 0));                        // rosca G1½, 22 mm
  for (let i = 0; i < 8; i++) { const t = mesh(new THREE.TorusGeometry(0.0234, 0.0011, 6, 40), mBody, 0, 0.0675 + i * 0.0027, 0); t.rotation.x = Math.PI / 2; sen.add(t); }
  sen.add(mesh(cylG(0.03464, 0.03464, 0.020, 6), mBody, 0, 0.098, 0));                      // sextavado de 60 mm
  sen.add(mesh(cylG(0.037, 0.037, 0.042, 48), mBody, 0, 0.129, 0));                          // corpo Ø74
  sen.add(mesh(cylG(0.030, 0.037, 0.005, 48), mBody, 0, 0.1525, 0));                         // total 155 mm
  sen.add(mesh(cylG(0.024, 0.024, 0.014, 40), mHouse, 0, 0.162, 0));                         // carcaça Ø77, 112 + 9 mm (tampa com visor)
  sen.add(mesh(cylG(0.0385, 0.026, 0.016, 48), mHouse, 0, 0.177, 0));
  sen.add(mesh(cylG(0.0385, 0.0385, 0.050, 48), mHouse, 0, 0.210, 0));
  sen.add(mesh(cylG(0.0405, 0.0405, 0.041, 48), mLid, 0, 0.2555, 0));
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; const r = mesh(new THREE.BoxGeometry(0.004, 0.03, 0.007), mLid, 0.0415 * Math.cos(a), 0.258, 0.0415 * Math.sin(a), false); r.rotation.y = -a; sen.add(r); }
  T3.disp = canvasTex(256, 256);
  { const d = mesh(new THREE.CircleGeometry(0.034, 48), new THREE.MeshBasicMaterial({ map: T3.disp.tex }), 0, 0.2764, 0, false); d.rotation.x = -Math.PI / 2; sen.add(d); }
  sen.add(mesh(new THREE.BoxGeometry(0.024, 0.032, 0.058), mHouse, 0.046, 0.210, 0));        // saída dos prensa-cabos M20
  for (const z of [-0.0145, 0.0145]) {
    const n = mesh(cylG(0.0135, 0.0135, 0.008, 6), mBlack, 0.062, 0.210, z); n.rotation.z = Math.PI / 2; sen.add(n);
    const b = mesh(cylG(0.0105, 0.0105, z > 0 ? 0.02 : 0.008, 20), mBlack, z > 0 ? 0.076 : 0.070, 0.210, z); b.rotation.z = Math.PI / 2; sen.add(b);
  }
  // luva roscada G1½ soldada no teto: a ponta do transdutor fica 50 mm para dentro do tanque
  scene.add(mesh(cylG(0.034, 0.034, FACE_Y + 0.088 - (ROOF_Y + 0.006), 40), mSteelDark, G.sx, (FACE_Y + 0.088 + ROOF_Y + 0.006) / 2, 0));
  // cabo de 2 fios e eletroduto até a coluna de comando
  scene.add(tube([[G.sx + 0.085, FACE_Y + 0.21, 0.0145], [G.sx + 0.15, FACE_Y + 0.21, 0.0145], [G.sx + 0.15, ROOF_Y + 0.02, 0.0145]], 0.0038, mBlack));
  scene.add(tube([[G.sx + 0.15, ROOF_Y + 0.02, 0.0145], [1.09, ROOF_Y + 0.02, 0.0145], [1.09, 0.05, 0.0145], [2.06, 0.05, 0.0145], [2.06, 0.3, 0.0145]], 0.0095, mPipe));

  // ---------------------------------------------------------------- feixe, zona morta, pegada
  const coneGeo = new THREE.ConeGeometry(1, 1, 56, 1, true); coneGeo.translate(0, -0.5, 0);
  T3.cone = mesh(coneGeo, new THREE.MeshBasicMaterial({ color: TX, transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false }), G.sx, FACE_Y, 0, false); T3.cone.renderOrder = 3; scene.add(T3.cone);
  T3.foot = mesh(new THREE.RingGeometry(0.94, 1, 64), new THREE.MeshBasicMaterial({ color: TX, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }), G.sx, 0, 0, false);
  T3.foot.rotation.x = -Math.PI / 2; T3.foot.renderOrder = 4; scene.add(T3.foot);
  T3.dz = mesh(cylG(0.13, 0.13, G.zonaMorta, 40), new THREE.MeshBasicMaterial({ color: BAD, transparent: true, opacity: 0.16, depthWrite: false }), G.sx, FACE_Y - G.zonaMorta / 2, 0, false); T3.dz.renderOrder = 3; scene.add(T3.dz);
  { const r = mesh(new THREE.TorusGeometry(0.13, 0.004, 6, 48), new THREE.MeshBasicMaterial({ color: BAD }), G.sx, FACE_Y - G.zonaMorta, 0, false); r.rotation.x = Math.PI / 2; scene.add(r); }

  // ---------------------------------------------------------------- frentes de onda
  const capDown = capGeo(HALF), capUp = capGeo(HALF), capFalse = capGeo(0.55);
  const wm = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  T3.down = []; T3.up = []; T3.fal = [];
  for (let i = 0; i < 3; i++) {
    const d = mesh(capDown, wm(TX), G.sx, FACE_Y, 0, false); d.rotation.x = Math.PI; d.renderOrder = 5; scene.add(d); T3.down.push(d);
    const u = mesh(capUp, wm(RX), G.sx, 0, 0, false); u.renderOrder = 5; scene.add(u); T3.up.push(u);
    const f = mesh(capFalse, wm(BAD), G.sx + G.obsEdge, FACE_Y - G.obsD, 0, false); f.renderOrder = 5; scene.add(f); T3.fal.push(f);
  }

  // ---------------------------------------------------------------- nível indicado (quando difere do real)
  T3.ghost = new THREE.Group();
  { const gd = mesh(new THREE.CircleGeometry(0.985, 64), new THREE.MeshBasicMaterial({ color: TX, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, false); gd.rotation.x = -Math.PI / 2; gd.renderOrder = 4;
    const gr = mesh(new THREE.TorusGeometry(0.985, 0.008, 6, 96), new THREE.MeshBasicMaterial({ color: TX }), 0, 0, 0, false); gr.rotation.x = Math.PI / 2;
    T3.ghost.add(gd, gr); scene.add(T3.ghost); }

  // ---------------------------------------------------------------- obstáculo: tubo horizontal a 1,20 m do sensor
  T3.obs = mesh(cylG(0.03, 0.03, 1.78, 20), mSteelDark, G.sx + G.obsEdge + 0.03, FACE_Y - G.obsD - 0.03, 0); T3.obs.rotation.x = Math.PI / 2; scene.add(T3.obs);

  // ---------------------------------------------------------------- entrada (fora do feixe) e saída com válvula
  const inX = -0.55, inZ = -0.25;
  scene.add(tube([[inX, ROOF_Y - 0.06, inZ], [inX, ROOF_Y + 0.45, inZ], [-1.45, ROOF_Y + 0.45, inZ], [-1.45, 0.02, inZ]], 0.04, mPipe));
  const stGeo = cylG(0.028, 0.034, 1, 16); stGeo.translate(0, -0.5, 0);
  T3.stream = mesh(stGeo, new THREE.MeshStandardMaterial({ color: 0x4d9be2, transparent: true, opacity: 0.8, roughness: 0.2 }), inX, ROOF_Y - 0.06, inZ, false); T3.stream.renderOrder = 2; scene.add(T3.stream);
  const oy = G.yb + 0.14, oz = -0.55;
  scene.add(tube([[0.86, oy, oz], [1.75, oy, oz], [1.75, 0.02, oz]], 0.04, mPipe));
  scene.add(mesh(new THREE.SphereGeometry(0.075, 24, 16), mSteelDark, 1.3, oy, oz));
  scene.add(mesh(cylG(0.012, 0.012, 0.16, 12), mSteelDark, 1.3, oy + 0.13, oz));
  T3.wheel = mesh(new THREE.TorusGeometry(0.075, 0.011, 10, 32), new THREE.MeshStandardMaterial({ color: 0xc5271d, roughness: 0.5 }), 1.3, oy + 0.21, oz); T3.wheel.rotation.x = Math.PI / 2;
  { const s1 = mesh(new THREE.BoxGeometry(0.15, 0.012, 0.012), T3.wheel.material); const s2 = s1.clone(); s2.rotation.z = Math.PI / 2; T3.wheel.add(s1, s2); }
  scene.add(T3.wheel);

  // ---------------------------------------------------------------- coluna de comando de 2,0 m (painel do CLP)
  const cx = 2.35, cz = 0.1, front = cz + 0.175;
  scene.add(mesh(new THREE.BoxGeometry(0.6, 0.1, 0.35), mSteelDark, cx, 0.05, cz));
  scene.add(mesh(new THREE.BoxGeometry(0.6, 1.9, 0.35), mCabinet, cx, 1.05, cz));
  scene.add(mesh(new THREE.BoxGeometry(0.54, 1.78, 0.008), new THREE.MeshStandardMaterial({ color: 0xe1e3dc, roughness: 0.6 }), cx, 1.05, front + 0.004, false));
  T3.painel = new THREE.Group(); scene.add(T3.painel);            // sinaleiros e plaquetas: só aparecem com o retorno do CLP ligado
  scene.add(mesh(new THREE.BoxGeometry(0.215, 0.172, 0.012), mBlack, cx, 1.62, front + 0.012, false));         // IHM de 7" (184 × 141 mm), sempre no painel
  T3.ihm = canvasTex(736, 564);
  scene.add(mesh(new THREE.PlaneGeometry(0.184, 0.141), new THREE.MeshBasicMaterial({ map: T3.ihm.tex }), cx, 1.62, front + 0.0185, false));
  T3.lamp = {};
  const plaquetas = canvasTex(920, 70);
  plaquetas.g.fillStyle = '#d7d9d2'; plaquetas.g.fillRect(0, 0, 920, 70);
  SINALEIROS.forEach((s, i) => {
    const x = cx + (i - 2) * 0.092;
    const bz = mesh(cylG(0.015, 0.015, 0.006, 24), mSteelDark, x, 1.33, front + 0.01, false); bz.rotation.x = Math.PI / 2; T3.painel.add(bz);
    const m = new THREE.MeshStandardMaterial({ color: s.cor, emissive: s.luz, emissiveIntensity: 0, roughness: 0.35 });
    const l = mesh(cylG(0.011, 0.011, 0.012, 24), m, x, 1.33, front + 0.016, false); l.rotation.x = Math.PI / 2; T3.painel.add(l);
    T3.lamp[s.tag] = m;
    const px = 460 + (i - 2) * 184;                                    // plaqueta gravada sob cada sinaleiro
    plaquetas.g.fillStyle = '#f6f6f2'; plaquetas.g.fillRect(px - 72, 10, 144, 50);
    plaquetas.g.fillStyle = '#13212e'; plaquetas.g.font = '700 34px Arial'; plaquetas.g.textAlign = 'center'; plaquetas.g.textBaseline = 'middle'; plaquetas.g.fillText(s.txt, px, 37);
  });
  plaquetas.tex.needsUpdate = true;
  T3.painel.add(mesh(new THREE.PlaneGeometry(0.46, 0.035), new THREE.MeshBasicMaterial({ map: plaquetas.tex }), cx, 1.285, front + 0.009, false));
  { const plate = canvasTex(480, 110);
    plate.g.fillStyle = '#f4f5f2'; plate.g.fillRect(0, 0, 480, 110); plate.g.fillStyle = '#13212e'; plate.g.font = '700 58px Arial'; plate.g.textAlign = 'center'; plate.g.textBaseline = 'middle'; plate.g.fillText('TQ-01 · LT-01', 240, 58); plate.tex.needsUpdate = true;
    scene.add(mesh(new THREE.PlaneGeometry(0.22, 0.055), new THREE.MeshBasicMaterial({ map: plate.tex }), cx, 1.9, front + 0.009, false)); }

  // ---------------------------------------------------------------- cotas
  const zc = 0.62, xE = -1.75, xD = -1.24, ink = 0x13212e;
  T3.dimE = makeDim(ink); T3.dimD = makeDim(TX); T3.dimL = makeDim(0x2b7bcc); scene.add(T3.dimE, T3.dimD, T3.dimL);
  T3.dimE.set(xE, zc, G.yb, FACE_Y);
  const lead = (y, x0) => mesh(new THREE.BoxGeometry(-0.8 - x0, 0.005, 0.005), new THREE.MeshBasicMaterial({ color: ink }), (x0 - 0.8) / 2, y, zc, false);
  scene.add(lead(FACE_Y, xE - 0.08), lead(G.yb, xE - 0.08));
  T3.leadL = lead(1, xD - 0.1); scene.add(T3.leadL);

  // ---------------------------------------------------------------- rótulos
  const lb = {
    tag: addLabel('tag', 'LT 01', [G.sx, FACE_Y + 0.46, 0]),
    E: addLabel('', 'E = 3,000 m', [xE, G.yb + G.E * 0.5, zc], 'r'),
    D: addLabel('tx', '', [xD, 0, zc]),
    L: addLabel('rx', '', [xD, 0, zc]),
    dz: addLabel('bad', 'Zona morta 0,25 m', [G.sx + 0.15, FACE_Y - 0.125, 0], 'l'),
    foot: addLabel('tx', '', [G.sx, 0, 0], 'l'),
    obs: addLabel('bad', 'Obstáculo no feixe', [G.sx + G.obsEdge + 0.03, FACE_Y - G.obsD - 0.03, 0.82], 'l'),
    ghost: addLabel('tx', 'Nível indicado', [-0.5, 0, 0.87]),
    inl: addLabel('quiet', 'Entrada', [-1.0, ROOF_Y + 0.6, inZ]),
    out: addLabel('quiet', 'Saída', [1.3, oy + 0.4, oz]),
    clp: addLabel('quiet', 'Painel do CLP', [cx, 2.13, cz]),
  };

  function resize() { const w = view.clientWidth, h = view.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(view); resize();

  function ir(name, instant = false) {
    const c = CAMS[name]; if (!c) return;
    const t = new THREE.Vector3(...c.t), p = new THREE.Vector3(...c.p);
    const m = clamp(1.3 / camera.aspect, 1, 2.3);            // em telas estreitas, afasta a câmera
    p.sub(t).multiplyScalar(m).add(t);
    aoMudarCamera(name);
    if (instant || reduzido) { camera.position.copy(p); controls.target.copy(t); tween = null; return; }
    tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: t, k: 0 };
  }

  // ---------------------------------------------------------------- telas desenhadas: display do sensor e IHM do painel
  function telas(V) {
    { const { g, tex } = T3.disp; g.clearRect(0, 0, 256, 256);
      g.fillStyle = '#2b3138'; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
      g.fillStyle = V.ligado ? '#c9d6c4' : '#5b6660'; g.fillRect(48, 70, 160, 96);
      if (V.ligado) {
        g.fillStyle = '#18222b'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '700 50px Arial'; g.fillText(V.erro || fmt(V.pct, 1) + ' %', 128, 112);
        g.font = '600 20px Arial'; g.fillText(V.erro ? 'sem medição' : fmt(V.D, 3) + ' m(d)', 128, 150);
      }
      g.fillStyle = '#8a949c'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(68 + i * 40, 200, 11, 0, 7); g.fill(); }
      tex.needsUpdate = true; }
    { const { g, tex } = T3.ihm, W = 736, H = 564, c = V.clp; g.fillStyle = '#0f1d29'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1d3954'; g.fillRect(0, 0, W, 72);
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '700 36px Arial'; g.fillText('TQ-01  NÍVEL  LT-01', 26, 38);
      g.strokeStyle = '#8fa3b5'; g.lineWidth = 5; g.strokeRect(46, 112, 150, 392);
      // com o retorno do CLP ligado, a IHM mostra o que o CLP calculou; desligado, mostra o valor que o transmissor envia
      const local = !V.retorno, valor = local ? (V.valido ? V.pct : null) : (c && typeof c.Nivel_Pct === 'number' ? c.Nivel_Pct : null);
      const tem = valor !== null;
      if (tem) { const p = clamp(valor / 100, 0, 1); g.fillStyle = '#2b7bcc'; g.fillRect(49, 501 - 386 * p, 144, 386 * p); }
      g.textAlign = 'right';
      g.fillStyle = '#fff'; g.font = '700 118px Arial'; g.fillText(tem ? fmt(valor, 1) : '—', 640, 190);
      g.fillStyle = '#8fa3b5'; g.font = '700 48px Arial'; g.fillText('%', 706, 204);
      g.font = '700 38px Arial';
      if (local) {
        g.fillStyle = V.valido ? '#fff' : '#ff5a4d'; g.font = '600 46px Arial';
        g.fillText(fmt(V.mA, 2) + ' mA', 706, 304);
        g.fillText('bruto ' + String(V.bruto).replace('-', '−'), 706, 366);
        g.fillStyle = '#8fa3b5'; g.font = '600 30px Arial'; g.fillText(V.erro ? V.erro + ' · transmissor em falha' : V.ligado ? 'valor enviado ao CLP' : 'laço aberto', 706, 440);
      } else if (!c) { g.fillStyle = '#ffb547'; g.fillText('SEM COMUNICAÇÃO', 706, 320); g.fillText('COM O CLP', 706, 372); }
      else {
        const ativos = SINALEIROS.filter((s) => c[s.tag]).map((s) => s.txt);
        g.fillStyle = ativos.length ? '#ff5a4d' : '#3ddc84';
        g.fillText(ativos.length ? ativos.join('  ') : 'SEM ALARMES', 706, 320);
        g.fillStyle = '#8fa3b5'; g.font = '600 30px Arial'; g.fillText('valor calculado no CLP', 706, 384);
      }
      tex.needsUpdate = true; }
  }

  // ---------------------------------------------------------------- quadro
  const v3 = new THREE.Vector3();
  function quadro(dt, t, V, P) {
    if (tween) {
      tween.k = Math.min(1, tween.k + dt / 0.9);
      const e = tween.k < 0.5 ? 4 * tween.k ** 3 : 1 - Math.pow(-2 * tween.k + 2, 3) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e);
      if (tween.k >= 1) tween = null;
    }
    controls.update();

    const dT = G.E - V.nivel, ySurf = G.yb + V.nivel;
    T3.liquid.scale.y = Math.max(0.002, V.nivel);
    T3.surf.position.y = ySurf + 0.002;
    if (!reduzido) {
      const sp = T3.surfGeo.attributes.position, A0 = V.vazao !== 0 ? 0.006 : 0.0022;
      for (let i = 0; i < sp.count; i++) {
        const x = sp.getX(i), y = sp.getY(i);
        let z = A0 * Math.sin(5 * x + 2.1 * t) * Math.cos(4 * y - 1.7 * t);
        if (V.vazao > 0) { const d = Math.hypot(x - inX, y + inZ); z += 0.022 * Math.exp(-d * 1.7) * Math.sin(15 * d - 9 * t); }
        sp.setZ(i, z);
      }
      sp.needsUpdate = true; T3.surfGeo.computeVertexNormals();
    }
    const f = V.espuma / 100;
    T3.foam.count = Math.round(NF * Math.min(1, f * 1.15));
    T3.foam.visible = f > 0.01; T3.foam.position.y = ySurf + 0.1 * f; T3.foam.scale.set(1, 0.5 + f, 1);
    T3.foamSlab.visible = f > 0.03; T3.foamSlab.scale.y = Math.max(0.001, 0.11 * f); T3.foamSlab.position.y = ySurf + 0.055 * f;

    const rc = dT * Math.tan(HALF);
    T3.cone.visible = T3.foot.visible = V.ligado;
    T3.cone.scale.set(rc, dT, rc);
    T3.foot.scale.setScalar(rc); T3.foot.position.y = ySurf + 0.006 + 0.11 * f;

    // frentes de onda (P.s é a distância percorrida pelo pulso, em câmera lenta)
    const show = V.ligado && P.wait <= 0;
    const flash = show && P.s < 0.14 ? 1 : 0;
    const stop = V.sel ? 2 * V.sel.dReal : -1;
    const got = show && stop > 0 && Math.abs(P.s - stop) < 0.12 ? 1 : 0;
    T3.faceMat.emissive.setHex(got ? (V.sel.tipo === 'nivel' ? RX : BAD) : TX);
    T3.faceMat.emissiveIntensity = Math.max(flash, got) * 2.2;
    for (let i = 0; i < 3; i++) {
      const r = P.s - i * 0.055;
      const d = T3.down[i]; d.visible = show && r > 0.02 && r < dT; if (d.visible) { d.scale.setScalar(r); d.material.opacity = 0.62 - 0.1 * (r / 3); }
      const u = T3.up[i]; u.visible = show && r > dT && r < 2 * dT;
      if (u.visible) { u.position.y = FACE_Y - 2 * dT; u.scale.setScalar(r); u.material.opacity = Math.max(0.05, 0.55 * (1 - f * 0.92)); }
      const fa = T3.fal[i], rf = r - G.obsD; fa.visible = show && V.ecoFalso && rf > 0.02 && rf < G.obsD; if (fa.visible) { fa.scale.setScalar(rf); fa.material.opacity = 0.5 * (1 - rf / G.obsD * 0.5); }
    }

    T3.stream.visible = V.vazao > 0; if (V.vazao > 0) T3.stream.scale.y = Math.max(0.01, ROOF_Y - 0.06 - ySurf);
    if (V.vazao < 0 && !reduzido) T3.wheel.rotation.z += dt * 2.5;
    T3.obs.visible = !!V.obstaculo;

    // nível indicado e cotas
    const yInd = G.yb + clamp(V.L, 0, G.E);
    const ghost = V.valido && Math.abs(V.L - V.nivel) > 0.02;
    T3.ghost.visible = ghost; T3.ghost.position.y = yInd;
    T3.dimD.visible = T3.dimL.visible = T3.leadL.visible = V.valido;
    if (V.valido) { T3.dimD.set(xD, zc, yInd, FACE_Y); T3.dimL.set(xD, zc, G.yb, yInd); T3.leadL.position.y = yInd; }

    // sinaleiros: acendem só com o que o CLP manda
    T3.painel.visible = !!V.retorno;
    for (const s of SINALEIROS) T3.lamp[s.tag].emissiveIntensity = V.clp && V.clp[s.tag] ? 2.2 : 0;

    // rótulos
    const fromTop = camera.position.y - controls.target.y > 0.9 * camera.position.distanceTo(controls.target);
    lb.D.show = lb.L.show = V.valido && !fromTop; lb.E.show = lb.dz.show = !fromTop;
    lb.D.pos.y = (yInd + FACE_Y) / 2; lb.L.pos.y = (G.yb + yInd) / 2;
    setText(lb.D, `D = ${fmt(V.D, 3)} m`); setText(lb.L, `L = ${fmt(V.L, 3)} m`);
    if (V.valido && FACE_Y - yInd < 0.22) lb.D.pos.y = FACE_Y + 0.14;
    if (V.valido && yInd - G.yb < 0.22) lb.L.pos.y = G.yb - 0.14;
    lb.foot.pos.set(G.sx + rc + 0.06, ySurf + 0.02, 0.0); setText(lb.foot, `Ø ${fmt(2 * rc, 2)} m`); lb.foot.show = V.ligado && rc > 0.05;
    lb.obs.show = !!V.obstaculo && !fromTop;
    lb.ghost.show = ghost && !fromTop; lb.ghost.pos.y = yInd;
    setText(lb.tag, V.ligado ? 'LT 01' : 'LT 01 sem alimentação');

    // desenha: cena e detalhe do sensor no canto
    const w = view.clientWidth, h = view.clientHeight;
    renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
    renderer.render(scene, camera);
    const ir_ = insetEl.getBoundingClientRect(), vr = view.getBoundingClientRect();
    const iw = ir_.width - 4, ih = ir_.height - 4 - 22, ix = ir_.left - vr.left + 2, iy = h - (ir_.top - vr.top + 2) - ih;
    if (iw > 20 && ih > 20) {
      camInset.aspect = iw / ih; camInset.updateProjectionMatrix();
      renderer.setScissorTest(true); renderer.setScissor(ix, iy, iw, ih); renderer.setViewport(ix, iy, iw, ih);
      const fog = scene.fog; scene.fog = null; T3.dz.visible = false;
      renderer.render(scene, camInset);
      scene.fog = fog; T3.dz.visible = true; renderer.setScissorTest(false);
    }
    // projeta os rótulos
    const ix0 = ir_.left - vr.left, iy1 = ir_.bottom - vr.top;
    for (const L of labels) {
      v3.copy(L.pos).project(camera);
      const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
      const vis = L.show && v3.z < 1 && x > -40 && x < w + 40 && y > -20 && y < h + 20 && !(x > ix0 - 30 && y < iy1 + 12);
      L.el.style.display = vis ? '' : 'none';
      if (!vis) continue;
      const ax = L.anchor === 'l' ? '8px' : L.anchor === 'r' ? 'calc(-100% - 8px)' : '-50%';
      L.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(${ax},-50%)`;
    }
  }

  return { quadro, telas, ir };
}
