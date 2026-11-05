// Casa de bombas de incêndio em 3D (three.js), animada pelo estado do simulador.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/CSS2DRenderer.js';

const KGF = 1 / 0.980665;
const C = {
  fireRed: 0xa51e22, wegBlue: 0x1f5fb4, steel: 0xc3c7c2, darkSteel: 0x3c444a, concrete: 0x9b9d97,
  panel: 0xd6d8d2, yellow: 0xe8b020, base: 0x4a5258, water: 0x3b8fd0,
};

export function createProcess3D(host, { onHydrantToggle, onAction } = {}) {
  // ---------------------------------------------------------------- Renderizadores
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'p3d-labels';
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef0eb);
  scene.fog = new THREE.Fog(0xeef0eb, 30, 70);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(7.5, 7, 12.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.8, 1.2, -0.6);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.5;
  controls.maxDistance = 28;
  controls.maxPolarAngle = Math.PI * 0.47;

  // ---------------------------------------------------------------- Luzes
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a958a, 1.5));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(8, 14, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -10, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xeef3ff, 0.8);
  fill.position.set(-10, 6, -4);
  scene.add(fill);

  // ---------------------------------------------------------------- Materiais
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.15 }, o));
  const M = {
    red: mat(C.fireRed, { roughness: 0.4, metalness: 0.2 }),
    green: mat(C.wegBlue, { roughness: 0.38, metalness: 0.3 }), // azul padrão WEG
    steel: mat(C.steel, { roughness: 0.3, metalness: 0.75 }),
    dark: mat(C.darkSteel, { roughness: 0.6, metalness: 0.4 }),
    base: mat(C.base, { roughness: 0.7, metalness: 0.3 }),
    concrete: mat(0xc4c6c0, { roughness: 0.95, metalness: 0 }),
    yellow: mat(C.yellow, { roughness: 0.5 }),
    guard: mat(C.yellow, { roughness: 0.5, transparent: true, opacity: 0.45 }),
    panel: mat(C.panel, { roughness: 0.6 }),
    black: mat(0x1b1e20, { roughness: 0.6 }),
    brass: mat(0xb08d3c, { roughness: 0.35, metalness: 0.8 }),
    water: new THREE.MeshStandardMaterial({ color: 0x1565c0, transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0, emissive: 0x0d47a1, emissiveIntensity: 0.3 }),
    flow: new THREE.MeshStandardMaterial({ color: 0x1565c0, emissive: 0x1e88e5, emissiveIntensity: 0.9, roughness: 0.3 }),
  };
  const shadow = (o) => { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; };
  const add = (o, parent = scene) => { parent.add(shadow(o)); return o; };
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (r, h, m, seg = 32, r2) => new THREE.Mesh(new THREE.CylinderGeometry(r2 ?? r, r, h, seg), m);

  // ---------------------------------------------------------------- Piso, parede, faixas
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), M.concrete);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0x8d8f89, 0x8d8f89);
  grid.material.opacity = 0.18; grid.material.transparent = true; grid.position.y = 0.002; scene.add(grid);
  const wall = box(30, 5, 0.25, mat(0xe2e4de, { roughness: 0.9 })); wall.position.set(0, 2.5, -5); add(wall);
  const wallBand = box(30, 0.35, 0.27, mat(0x8f938c, { roughness: 0.9 })); wallBand.position.set(0, 0.175, -5); add(wallBand);
  const stripe = (x, z, w, d) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0xf0c419, { roughness: 0.8 })); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.004, z); s.receiveShadow = true; scene.add(s); };

  // ---------------------------------------------------------------- Tubulação
  const flowPaths = {};
  function pipe(points, r, m = M.red, { flanges = [] } = {}) {
    const g = new THREE.Group();
    const v = points.map((p) => new THREE.Vector3(...p));
    const path = new THREE.CurvePath();
    for (let i = 0; i < v.length - 1; i++) {
      const a = v[i], b = v[i + 1], len = a.distanceTo(b);
      const c = cyl(r, len, m, 24);
      c.position.copy(a).add(b).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(c);
      path.add(new THREE.LineCurve3(a, b));
      if (i > 0) { const e = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 20, 14), m); e.position.copy(a); g.add(e); }
    }
    flanges.forEach((t) => {
      const p = path.getPointAt(t), tg = path.getTangentAt(t);
      const f = cyl(r * 1.55, 0.06, M.dark, 24);
      f.position.copy(p); f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg); g.add(f);
    });
    add(g);
    return path;
  }
  // Marcadores de fluxo (setas luminosas que andam sobre o tubo)
  const flowMarkers = [];
  function flowOn(path, r, spacing = 0.7) {
    const len = path.getLength(), n = Math.max(2, Math.floor(len / spacing));
    const geo = new THREE.ConeGeometry(r * 0.45, r * 1.1, 10);
    const list = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, M.flow);
      m.visible = false; scene.add(m); list.push(m);
    }
    const fm = { path, r, list, phase: 0, speed: 0 };
    flowMarkers.push(fm);
    return fm;
  }
  const up = new THREE.Vector3(0, 1, 0);
  function animFlow(fm, dt) {
    const on = fm.speed > 0.02;
    fm.phase = (fm.phase + dt * fm.speed * 0.25) % 1;
    fm.list.forEach((m, i) => {
      m.visible = on;
      if (!on) return;
      const t = (i / fm.list.length + fm.phase) % 1;
      const p = fm.path.getPointAt(t), tg = fm.path.getTangentAt(t);
      const side = Math.abs(tg.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : up;
      m.position.copy(p).addScaledVector(side, fm.r + 0.03);
      m.quaternion.setFromUnitVectors(up, tg);
    });
  }

  // ---------------------------------------------------------------- Reservatório
  const tank = new THREE.Group();
  const shell = cyl(2.1, 5, mat(0xb8bcb6, { roughness: 0.35, metalness: 0.7 }), 48); shell.position.y = 2.5; tank.add(shell);
  const roof = new THREE.Mesh(new THREE.SphereGeometry(2.1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 5), mat(0xa9ada7, { metalness: 0.7, roughness: 0.35 })); roof.position.y = 3.3; tank.add(roof);
  for (let y = 0.6; y < 5; y += 1.1) { const ring = new THREE.Mesh(new THREE.TorusGeometry(2.11, 0.035, 8, 64), M.dark); ring.rotation.x = Math.PI / 2; ring.position.y = y; tank.add(ring); }
  // escada
  for (let y = 0.4; y < 5.2; y += 0.35) { const rung = box(0.5, 0.03, 0.03, M.dark); rung.position.set(0, y, 2.22); tank.add(rung); }
  [-0.25, 0.25].forEach((x) => { const rail = box(0.04, 5.3, 0.04, M.dark); rail.position.set(x, 2.65, 2.22); tank.add(rail); });
  // visor de nível
  const glass = cyl(0.06, 4, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }), 12); glass.position.set(1.5, 2.4, 1.5); tank.add(glass);
  const lvl = cyl(0.045, 3.2, M.water, 12); lvl.position.set(1.5, 2.0, 1.5); tank.add(lvl);
  tank.position.set(-8.5, 0, -1.6);
  add(tank);

  // ---------------------------------------------------------------- Bombas
  const Y_SUC = 0.62, Z_SUC = -1.7, Y_DIS = 2.9, Z_DIS = -1.0;
  const sucPath = pipe([[-6.4, Y_SUC, Z_SUC], [4.6, Y_SUC, Z_SUC]], 0.2, M.red, { flanges: [0.05, 0.35, 0.65] });
  const sucFlow = flowOn(sucPath, 0.2, 0.9);
  const rotors = {};

  function mainPump(x, key, title) {
    const g = new THREE.Group();
    g.position.set(x, 0, 0);
    const plinth = box(1.5, 0.22, 3.0, mat(0xa7a9a3, { roughness: 0.95 })); plinth.position.set(0, 0.11, 0.35); g.add(plinth);
    const skid = box(1.1, 0.14, 2.7, M.base); skid.position.set(0, 0.29, 0.35); g.add(skid);
    // voluta (eixo em z)
    const volute = cyl(0.46, 0.34, M.red, 40); volute.rotation.x = Math.PI / 2; volute.position.set(0, 0.88, -0.75); g.add(volute);
    const vfoot = box(0.5, 0.28, 0.3, M.red); vfoot.position.set(0, 0.5, -0.75); g.add(vfoot);
    const eye = cyl(0.17, 0.32, M.red, 24); eye.rotation.x = Math.PI / 2; eye.position.set(0, 0.88, -1.06); g.add(eye);
    const outlet = cyl(0.15, 0.4, M.red, 24); outlet.position.set(0, 1.42, -0.75); g.add(outlet);
    // mancal e acoplamento
    const brg = cyl(0.13, 0.55, M.dark, 20); brg.rotation.x = Math.PI / 2; brg.position.set(0, 0.88, -0.32); g.add(brg);
    const guard = box(0.44, 0.44, 0.45, M.guard); guard.position.set(0, 0.88, 0.2); g.add(guard);
    const rotor = new THREE.Group(); rotor.position.set(0, 0.88, 0.2);
    const hub = cyl(0.16, 0.22, M.steel, 24); hub.rotation.x = Math.PI / 2; rotor.add(hub);
    const markK = box(0.04, 0.3, 0.24, M.yellow); rotor.add(markK);
    g.add(rotor);
    // motor WEG (verde) com aletas
    const motor = cyl(0.42, 1.05, M.green, 40); motor.rotation.x = Math.PI / 2; motor.position.set(0, 0.95, 0.98); g.add(motor);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const fin = box(0.03, 0.08, 0.95, M.green);
      fin.position.set(Math.cos(a) * 0.46, 0.95 + Math.sin(a) * 0.46, 0.98); fin.rotation.z = a; g.add(fin);
    }
    const tbox = box(0.3, 0.2, 0.32, M.green); tbox.position.set(0, 1.45, 0.85); g.add(tbox);
    const fanCover = cyl(0.4, 0.28, M.green, 40); fanCover.rotation.x = Math.PI / 2; fanCover.position.set(0, 0.95, 1.62); g.add(fanCover);
    const grille = cyl(0.33, 0.02, M.black, 40); grille.rotation.x = Math.PI / 2; grille.position.set(0, 0.95, 1.77); g.add(grille);
    const fan = new THREE.Group(); fan.position.set(0, 0.95, 1.785);
    for (let i = 0; i < 6; i++) { const b = box(0.06, 0.3, 0.01, M.steel); b.rotation.z = (i / 6) * Math.PI * 2; b.position.set(Math.sin((i / 6) * Math.PI * 2) * 0.12, Math.cos((i / 6) * Math.PI * 2) * 0.12, 0); fan.add(b); }
    g.add(fan);
    const feet = box(0.9, 0.18, 0.7, M.green); feet.position.set(0, 0.45, 0.98); g.add(feet);
    add(g);
    // sucção e recalque
    const s = pipe([[x, Y_SUC, Z_SUC], [x, Y_SUC + 0.26, Z_SUC], [x, 0.88, -1.22]], 0.16, M.red, { flanges: [0.95] });
    const d = pipe([[x, 1.62, -0.75], [x, 2.05, -0.75], [x, 2.05, Z_DIS], [x, Y_DIS, Z_DIS]], 0.14, M.red, { flanges: [0.2, 0.75] });
    // válvula de retenção e gaveta (com volante)
    const chk = box(0.34, 0.3, 0.42, M.dark); chk.position.set(x, 2.05, -0.9); add(chk);
    const gv = cyl(0.2, 0.32, M.dark, 20); gv.position.set(x, 2.55, Z_DIS); add(gv);
    const stem = cyl(0.025, 0.5, M.steel, 8); stem.rotation.z = Math.PI / 2; stem.position.set(x + 0.4, 2.55, Z_DIS); add(stem);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 24), M.red); wheel.rotation.y = Math.PI / 2; wheel.position.set(x + 0.65, 2.55, Z_DIS); add(wheel);
    rotors[key] = { rotor, fan, motor, flowS: flowOn(s, 0.16, 0.5), flowD: flowOn(d, 0.14, 0.5), angle: 0 };
    stripe(x, 0.35, 1.9, 0.06); stripe(x, 1.95, 1.9, 0.06); stripe(x - 0.95, 0.35 + 0.8, 0.06, 1.66); stripe(x + 0.95, 0.35 + 0.8, 0.06, 1.66);
    rotors[key].label = label(`${title}`, new THREE.Vector3(x, 1.75, 1.75));
    return g;
  }

  function jockeyPump(x) {
    const g = new THREE.Group(); g.position.set(x, 0, -0.4);
    const plinth = box(0.9, 0.2, 0.9, mat(0xa7a9a3, { roughness: 0.95 })); plinth.position.y = 0.1; g.add(plinth);
    const foot = cyl(0.3, 0.2, M.steel, 28); foot.position.y = 0.3; g.add(foot);
    const body = cyl(0.17, 0.95, M.steel, 28); body.position.y = 0.85; g.add(body);
    for (let i = 0; i < 4; i++) { const tie = cyl(0.015, 0.95, M.dark, 6); tie.position.set(Math.cos(i * 1.57) * 0.22, 0.85, Math.sin(i * 1.57) * 0.22); g.add(tie); }
    const lant = cyl(0.2, 0.22, M.dark, 24); lant.position.y = 1.42; g.add(lant);
    const motor = cyl(0.25, 0.6, M.green, 32); motor.position.y = 1.83; g.add(motor);
    const cap = cyl(0.23, 0.14, M.green, 32); cap.position.y = 2.2; g.add(cap);
    const fan = new THREE.Group(); fan.position.y = 2.28;
    for (let i = 0; i < 5; i++) { const b = box(0.05, 0.01, 0.2, M.steel); b.rotation.y = (i / 5) * Math.PI * 2; b.position.set(Math.sin((i / 5) * Math.PI * 2) * 0.08, 0, Math.cos((i / 5) * Math.PI * 2) * 0.08); fan.add(b); }
    g.add(fan);
    add(g);
    const s = pipe([[x, Y_SUC, Z_SUC], [x, Y_SUC, -0.75], [x, 0.3, -0.75], [x, 0.3, -0.4]], 0.08, M.red, { flanges: [0.6] });
    const d = pipe([[x + 0.22, 0.3, -0.4], [x + 0.55, 0.3, -0.4], [x + 0.55, Y_DIS, -0.4], [x + 0.55, Y_DIS, Z_DIS]], 0.08, M.red, { flanges: [0.3] });
    const chk = box(0.2, 0.2, 0.24, M.dark); chk.position.set(x + 0.55, 1.4, -0.4); add(chk);
    rotors.jockey = { rotor: fan, fan, motor, flowS: flowOn(s, 0.08, 0.35), flowD: flowOn(d, 0.08, 0.4), angle: 0, vertical: true };
    stripe(x, -0.4, 1.2, 1.2);
    rotors.jockey.label = label('Jockey', new THREE.Vector3(x, 0.05, 0.55), 'below'); // no piso, à frente da base: não cobre a bomba
  }

  // ---------------------------------------------------------------- Rótulos
  function label(text, pos, cls = '') {
    const d = document.createElement('div');
    d.className = `p3d-tag ${cls}`;
    d.innerHTML = `<b>${text}</b><span></span>`;
    const o = new CSS2DObject(d);
    o.position.copy(pos);
    scene.add(o);
    return { o, el: d, sub: d.querySelector('span') };
  }

  jockeyPump(-3.6);
  mainPump(-0.6, 'main1', 'Bomba 01');
  mainPump(2.8, 'main2', 'Bomba 02');

  // Barrilete de recalque e hidrante
  const disPath = pipe([[-3.05, Y_DIS, Z_DIS], [7.6, Y_DIS, Z_DIS], [7.6, 1.2, Z_DIS], [7.6, 1.2, 2.0]], 0.17, M.red, { flanges: [0.15, 0.45, 0.62] });
  const disFlow = flowOn(disPath, 0.17, 0.8);
  // hidrante (válvula angular + requinte)
  const hv = new THREE.Group(); hv.position.set(7.6, 1.2, 2.05);
  const hvBody = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), M.brass); hv.add(hvBody);
  const hvStem = cyl(0.03, 0.4, M.steel, 8); hvStem.position.y = 0.35; hv.add(hvStem);
  const hvWheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 10, 28), M.red); hvWheel.rotation.x = Math.PI / 2; hvWheel.position.y = 0.55; hv.add(hvWheel);
  for (let i = 0; i < 3; i++) { const sp = box(0.4, 0.02, 0.02, M.red); sp.rotation.y = i * Math.PI / 3; sp.position.y = 0.55; hv.add(sp); }
  const nozzle = cyl(0.07, 0.5, M.brass, 20, 0.11); nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 0, 0.42); hv.add(nozzle);
  add(hv);
  const hvHit = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hvHit.position.set(7.6, 1.5, 2.1); scene.add(hvHit);
  const hydLabel = label('Hidrante', new THREE.Vector3(7.6, 2.05, 2.1), 'warn');

  // Jato do hidrante (partículas)
  const NP = 2600;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(NP * 3), pVel = new Float32Array(NP * 3), pLife = new Float32Array(NP);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  // gota com borda suave (textura radial), em azul água bem visível sobre o fundo claro
  const dropCv = document.createElement('canvas'); dropCv.width = dropCv.height = 64;
  { const c = dropCv.getContext('2d'); const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(25,110,215,1)'); g.addColorStop(0.55, 'rgba(13,80,180,0.9)'); g.addColorStop(1, 'rgba(10,60,150,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
  const dropTex = new THREE.CanvasTexture(dropCv);
  const pMat = new THREE.PointsMaterial({ map: dropTex, color: 0xffffff, size: 0.18, transparent: true, opacity: 0.95, depthWrite: false, alphaTest: 0.02 });
  const spray = new THREE.Points(pGeo, pMat); spray.frustumCulled = false; scene.add(spray);
  for (let i = 0; i < NP; i++) { pLife[i] = 0; pPos[i * 3 + 1] = -10; }
  const nozzleTip = new THREE.Vector3(7.6, 1.2, 2.75);
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x1557a8, transparent: true, opacity: 0, roughness: 0.05, metalness: 0.1, depthWrite: false });
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 48), puddleMat);
  puddle.rotation.x = -Math.PI / 2; puddle.position.set(7.6, 0.01, 5.2); puddle.scale.setScalar(0.01); scene.add(puddle);
  let wet = 0;
  let emitAcc = 0;
  function animSpray(dt, hyd, pBar) {
    const rate = hyd > 0 && pBar > 0.1 ? 1500 * (hyd / 100) : 0;
    const v0 = 1.5 + Math.sqrt(Math.max(0, pBar)) * 2.6; // jato mais forte com mais pressão
    emitAcc += rate * dt;
    for (let i = 0; i < NP; i++) {
      if (pLife[i] > 0) {
        pLife[i] -= dt;
        pVel[i * 3 + 1] -= 9.8 * dt;
        pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        if (pPos[i * 3 + 1] < 0.02) { pPos[i * 3 + 1] = 0.02; pVel[i * 3 + 1] = 0; pVel[i * 3] *= 0.6; pVel[i * 3 + 2] *= 0.6; }
        if (pLife[i] <= 0) pPos[i * 3 + 1] = -10;
      } else if (emitAcc >= 1) {
        emitAcc -= 1;
        pLife[i] = 1.15;
        pVel[i * 3] = (Math.random() - 0.5) * 0.35; pVel[i * 3 + 1] = 1.2 + (Math.random() - 0.5) * 0.4; pVel[i * 3 + 2] = v0 * (0.92 + Math.random() * 0.16);
        const f = Math.random() * dt; // espalha a emissão dentro do quadro (jato contínuo)
        pPos[i * 3] = nozzleTip.x + pVel[i * 3] * f; pPos[i * 3 + 1] = nozzleTip.y + pVel[i * 3 + 1] * f; pPos[i * 3 + 2] = nozzleTip.z + pVel[i * 3 + 2] * f;
      }
    }
    if (emitAcc > 300) emitAcc = 300;
    pGeo.attributes.position.needsUpdate = true;
    // poça: cresce enquanto o hidrante joga água e seca devagar quando fecha
    wet = Math.min(1, Math.max(0, wet + (rate > 0 ? dt * 0.12 * (hyd / 100) : -dt * 0.02)));
    puddle.scale.setScalar(0.01 + wet * 2.2); puddleMat.opacity = wet * 0.6;
  }

  // Manômetro (mostrador desenhado em canvas)
  const gcv = document.createElement('canvas'); gcv.width = gcv.height = 256;
  const gtx = new THREE.CanvasTexture(gcv); gtx.colorSpace = THREE.SRGBColorSpace;
  let gaugeShown = -1;
  function drawGauge(p) {
    const c = gcv.getContext('2d'), cx = 128, cy = 128;
    c.clearRect(0, 0, 256, 256);
    c.fillStyle = '#fbfbf7'; c.beginPath(); c.arc(cx, cy, 120, 0, Math.PI * 2); c.fill();
    c.lineWidth = 10; c.strokeStyle = '#3c444a'; c.stroke();
    const ang = (v) => (-225 + (v / 16) * 270) * Math.PI / 180;
    c.strokeStyle = '#1b2125'; c.fillStyle = '#1b2125'; c.font = 'bold 20px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let v = 0; v <= 16; v++) {
      const a = ang(v), r1 = 104, r2 = v % 2 ? 96 : 88;
      c.lineWidth = v % 2 ? 2 : 4;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); c.stroke();
      if (v % 4 === 0) c.fillText(String(v), cx + Math.cos(a) * 70, cy + Math.sin(a) * 70);
    }
    c.font = '16px Arial'; c.fillText('bar', cx, cy + 46);
    const a = ang(Math.min(16, Math.max(0, p)));
    c.strokeStyle = '#c0392b'; c.lineWidth = 6; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 92, cy + Math.sin(a) * 92); c.stroke();
    c.fillStyle = '#3c444a'; c.beginPath(); c.arc(cx, cy, 10, 0, Math.PI * 2); c.fill();
    gtx.needsUpdate = true;
  }
  drawGauge(0);
  const gStub = cyl(0.04, 0.5, M.steel, 10); gStub.position.set(5.2, Y_DIS + 0.4, Z_DIS); add(gStub);
  const gCase = cyl(0.3, 0.1, M.dark, 32); gCase.rotation.x = Math.PI / 2; gCase.position.set(5.2, Y_DIS + 0.85, Z_DIS + 0.02); add(gCase);
  const gFace = new THREE.Mesh(new THREE.CircleGeometry(0.27, 40), new THREE.MeshBasicMaterial({ map: gtx })); gFace.position.set(5.2, Y_DIS + 0.85, Z_DIS + 0.075); scene.add(gFace);
  // rótulos dos instrumentos abaixo do barrilete (não cobrem manômetro e pressostatos)
  // um rótulo só para manômetro, PJ e PB, acima deles: não cobre os instrumentos
  const instrLabel = label('Instrumentos', new THREE.Vector3(6.1, Y_DIS + 1.7, Z_DIS), 'small'); // acima dos instrumentos, com folga

  // Pressostatos KP
  const pss = {};
  [['PJ', 6.15], ['PB', 6.95]].forEach(([n, x]) => {
    const stub = cyl(0.03, 0.55, M.steel, 8); stub.position.set(x, Y_DIS + 0.42, Z_DIS); add(stub);
    const b = box(0.28, 0.36, 0.16, mat(0xe9e9e4)); b.position.set(x, Y_DIS + 0.85, Z_DIS); add(b);
    const tag = box(0.22, 0.06, 0.005, M.red); tag.position.set(x, Y_DIS + 0.78, Z_DIS + 0.083); scene.add(tag);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x000000 }));
    led.position.set(x + 0.08, Y_DIS + 0.95, Z_DIS + 0.085); scene.add(led);
    pss[n] = { led };
  });

  // Painel de comando: espelho do painel de operação 2D (mesma disposição e plaquetas), operável em 3D
  const interactive = [];
  function plateTex(lines, { w = 512, h = 144, bg = '#f6f6f1', fg = '#1b2125', size = 44, sub = 30, border = '#a5a99f' } = {}) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = border; c.lineWidth = 5; c.strokeRect(2.5, 2.5, w - 5, h - 5);
    c.fillStyle = '#9a9e96'; [[18, h / 2], [w - 18, h / 2]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `600 ${size}px Arial, sans-serif`;
    c.fillText(lines[0], w / 2, lines[1] ? h * 0.38 : h / 2);
    if (lines[1]) { c.font = `${sub}px Arial, sans-serif`; c.fillStyle = '#5d666c'; c.fillText(lines[1], w / 2, h * 0.75); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  function plate(parent, lines, x, y, w = 0.42, h = 0.11, opts) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: plateTex(lines, opts), roughness: 0.7 }));
    m.position.set(x, y, 0.236); parent.add(m); return m;
  }
  const pnl = new THREE.Group(); pnl.position.set(-4.8, 0, -4.55);
  const cab = box(2.5, 2.2, 0.45, M.panel); cab.position.y = 1.3; pnl.add(cab);
  const doorEdge = box(2.44, 2.14, 0.02, mat(0xdfe1db, { roughness: 0.6 })); doorEdge.position.set(0, 1.3, 0.225); pnl.add(doorEdge);
  const plinthP = box(2.5, 0.2, 0.45, M.dark); plinthP.position.y = 0.1; pnl.add(plinthP);
  [[-1.14, 1.9], [-1.14, 0.7]].forEach(([x, y]) => { const h = box(0.05, 0.16, 0.04, M.dark); h.position.set(x, y, 0.25); pnl.add(h); });
  plate(pnl, ['SISTEMA DE INCÊNDIO — PAINEL DE OPERAÇÃO'], 0, 2.24, 1.7, 0.1, { w: 1536, h: 90, bg: '#a51e22', fg: '#ffffff', size: 46, border: '#7a1418' });
  const COLX = [-0.84, -0.28, 0.28, 0.84];
  const lampSlots = []; // índice = posição em sim.lamps
  const knobs3d = {}; const btns3d = {};
  const LAMP_COL = [0x46e36d, 0x46e36d, 0xff3b2f, 0xff3b2f, 0xff3b2f, 0x46e36d, 0x46e36d, 0x46e36d];
  function lamp(x, y, idx, lines) {
    const bez = cyl(0.07, 0.04, M.steel, 28); bez.rotation.x = Math.PI / 2; bez.position.set(x, y, 0.245); pnl.add(bez);
    const lensMat = new THREE.MeshStandardMaterial({ color: LAMP_COL[idx], emissive: 0x000000, roughness: 0.25, transparent: true, opacity: 0.92 });
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lensMat);
    lens.rotation.x = Math.PI / 2; lens.position.set(x, y, 0.262); pnl.add(lens);
    lampSlots[idx] = lensMat;
    plate(pnl, lines, x, y - 0.145);
  }
  function selector(x, y, name, vals, labels, lines) {
    const bez = cyl(0.085, 0.04, M.steel, 28); bez.rotation.x = Math.PI / 2; bez.position.set(x, y, 0.245); pnl.add(bez);
    const knob = new THREE.Group(); knob.position.set(x, y, 0.27);
    const body = cyl(0.065, 0.05, M.black, 28); body.rotation.x = Math.PI / 2; knob.add(body);
    const bar = box(0.03, 0.11, 0.03, mat(0xe9e9e4)); bar.position.z = 0.03; knob.add(bar);
    const tip = box(0.03, 0.04, 0.032, mat(0xffffff)); tip.position.set(0, 0.045, 0.031); knob.add(tip);
    pnl.add(knob);
    const pos = plate(pnl, [labels.join('      ')], x, y + 0.14, 0.42, 0.06, { w: 512, h: 72, bg: '#dfe1db', border: '#dfe1db', size: 34 });
    pos.material.transparent = true;
    plate(pnl, lines, x, y - 0.165);
    const hit = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.set(x, y, 0.3); hit.userData = { kind: 'selector', name, vals }; pnl.add(hit); interactive.push(hit);
    knobs3d[name] = { knob, vals };
  }
  function pushButton(x, y, name, green, lines) {
    const bez = cyl(0.08, 0.04, M.steel, 28); bez.rotation.x = Math.PI / 2; bez.position.set(x, y, 0.245); pnl.add(bez);
    const cap = cyl(0.06, 0.05, mat(green ? 0x2c8f48 : 0xb8241f, { roughness: 0.35 }), 28);
    cap.rotation.x = Math.PI / 2; cap.position.set(x, y, 0.28); pnl.add(cap);
    plate(pnl, lines, x, y - 0.14);
    cap.userData = { kind: 'button', name }; interactive.push(cap);
    btns3d[name] = cap;
  }
  // Coluna 1: seleção
  plate(pnl, ['Seleção de bombas'], COLX[0], 1.96, 0.5, 0.08, { w: 512, h: 80, bg: '#dfe1db', border: '#dfe1db', size: 40 });
  lamp(COLX[0], 1.76, 0, ['Bomba 01 selecionada', 'LB1_S']);
  lamp(COLX[0], 1.47, 1, ['Bomba 02 selecionada', 'LB2_S']);
  selector(COLX[0], 1.08, 'B_SEL', ['B1', '0', 'B2'], ['B01', '0', 'B02'], ['Seleção de bombas', 'B_SEL']);
  // Colunas das bombas
  [['Bomba 01', 2, 5, 'B1_MA', 'B1_L', 'B1_D', 'LB1'], ['Bomba 02', 3, 6, 'B2_MA', 'B2_L', 'B2_D', 'LB2'], ['Bomba jockey', 4, 7, 'BJ_MA', 'BJ_L', 'BJ_D', 'LBJ']].forEach(([t, iL, iD, ma, on, off, lb], c) => {
    const x = COLX[c + 1];
    plate(pnl, [t], x, 1.96, 0.5, 0.08, { w: 512, h: 80, bg: '#dfe1db', border: '#dfe1db', size: 40 });
    lamp(x, 1.76, iL, ['Em operação', `${lb}_L`]);
    lamp(x, 1.47, iD, ['Desligada', `${lb}_D`]);
    selector(x, 1.08, ma, ['A', '0', 'M'], ['Auto', '0', 'Man'], ['Manual / automático', ma]);
    pushButton(x, 0.73, on, true, ['Liga local', `${on} · NA`]);
    pushButton(x, 0.44, off, false, ['Desliga local', `${off} · NF`]);
  });
  // Quadro elétrico (lateral) para dar contexto
  add(pnl);
  label('Painel de operação', new THREE.Vector3(-4.8, 2.7, -4.3), 'small');
  const pLabel = label('Pressão', new THREE.Vector3(1.6, Y_DIS + 0.55, Z_DIS), 'big');
  label('Reservatório', new THREE.Vector3(-8.5, 5.8, -1.6), 'small');

  // ---------------------------------------------------------------- Interação
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function rayFrom(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function pickAt(ev) {
    rayFrom(ev);
    const hits = ray.intersectObjects([hvHit, ...interactive], false);
    return hits.length ? hits[0] : null;
  }
  let downAt = null;
  let held = null; // botoeira pressionada
  const release = () => {
    if (held) { onAction?.({ type: 'button', name: held, value: false }); held = null; }
    controls.enabled = true;
  };
  renderer.domElement.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
    const h = pickAt(e);
    if (h && h.object.userData.kind === 'button') {
      controls.enabled = false;
      held = h.object.userData.name;
      onAction?.({ type: 'button', name: held, value: true });
    }
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    const wasHeld = !!held;
    release();
    if (wasHeld || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const h = pickAt(e);
    if (!h) return;
    if (h.object === hvHit) { onHydrantToggle?.(); return; }
    const u = h.object.userData;
    if (u.kind === 'selector') {
      const center = new THREE.Vector3(); h.object.getWorldPosition(center);
      const dir = h.point.x < center.x ? -1 : 1;
      const i = Math.max(0, u.vals.indexOf(S?.panel[u.name] ?? '0'));
      const j = Math.min(u.vals.length - 1, Math.max(0, i + dir));
      if (j !== i) onAction?.({ type: 'selector', name: u.name, value: u.vals[j] });
    }
  });
  renderer.domElement.addEventListener('pointerleave', release);
  renderer.domElement.addEventListener('pointermove', (e) => { if (!held) renderer.domElement.style.cursor = pickAt(e) ? 'pointer' : 'grab'; });

  const VIEWS = {
    geral: [[7.5, 7, 12.5], [0.8, 1.2, -0.6]],
    bombas: [[1.5, 3.2, 6.2], [0.2, 1.0, -0.4]],
    hidrante: [[11, 3.2, 6.5], [7.2, 1.4, 0.8]],
    painel: [[-4.8, 1.4, -1.25], [-4.8, 1.28, -4.4]],
  };
  let tween = null;
  function goView(name) {
    const v = VIEWS[name]; if (!v) return;
    tween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...v[0]), t1: new THREE.Vector3(...v[1]) };
  }

  // ---------------------------------------------------------------- Laço
  let S = null;
  let visible = true;
  const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0.01 });
  io.observe(host);
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); labels.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();
  let last = performance.now();
  const fmt = (v, d = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible || document.hidden) return;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 0.9);
      const k = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - Math.pow(-2 * tween.t + 2, 2) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, k); controls.target.lerpVectors(tween.t0, tween.t1, k);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
    if (S) {
      const sp = { jockey: S.jockeySpeed, main1: S.ssw[0].speed, main2: S.ssw[1].speed };
      const dirJ = S.jockeyLink?.reverse ? -1 : 1;
      for (const [k, r] of Object.entries(rotors)) {
        // sentido de giro: jockey com fases trocadas; principais com sequência invertida sem a proteção PHASE SEQ
        const dir = k === 'jockey' ? dirJ : (S.ssw[k === 'main1' ? 0 : 1].reverse ? -1 : 1);
        r.angle += sp[k] * dt * Math.PI * 2 * 5 * dir;
        if (r.vertical) r.rotor.rotation.y = r.angle;
        else { r.rotor.rotation.z = r.angle; r.fan.rotation.z = r.angle; }
        const fl = S.flows[k];
        r.flowS.speed = fl > 0.01 ? 0.6 + fl * 1.5 : 0;
        r.flowD.speed = r.flowS.speed;
        // pequena vibração do motor em funcionamento
        r.motor.position.x = sp[k] > 0.05 ? (Math.random() - 0.5) * 0.004 : 0;
      }
      const totalIn = S.flows.jockey + S.flows.main1 + S.flows.main2;
      sucFlow.speed = totalIn > 0.01 ? 0.5 + totalIn : 0;
      disFlow.speed = S.flows.out > 0.05 || totalIn > 0.01 ? 0.5 + Math.max(S.flows.out, totalIn) : 0;
      animSpray(dt, S.process.hydrant, S.pressure);
    }
    flowMarkers.forEach((f) => animFlow(f, dt));
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    goView,
    setLabels(on) { labels.domElement.style.display = on ? '' : 'none'; },
    update(sim) {
      S = sim;
      const s0 = sim.ssw[0], s1 = sim.ssw[1];
      const st = (s) => (s.fault ? 'erro' : s.state === 'accel' ? 'acelerando' : s.state === 'decel' ? 'desacelerando' : s.state === 'run' ? 'by-pass' : 'parada');
      rotors.main1.label.sub.textContent = `${fmt(s0.speed * 100)} % · ${fmt(s0.currentA, 1)} A · ${st(s0)}`;
      rotors.main2.label.sub.textContent = `${fmt(s1.speed * 100)} % · ${fmt(s1.currentA, 1)} A · ${st(s1)}`;
      rotors.jockey.label.sub.textContent = sim.jockeySpeed > 0.05 ? `${fmt(sim.jockeySpeed * 100)} %${sim.jockeyLink?.reverse ? ' · invertida' : ''}` : (sim.jockeyLink?.wired ? 'parada' : 'motor desligado do painel');
      [rotors.main1, rotors.main2, rotors.jockey].forEach((r, i) => r.label.el.classList.toggle('on', [s0.speed, s1.speed, sim.jockeySpeed][i] > 0.05));
      pLabel.el.querySelector('b').textContent = `${fmt(sim.pressure, 2)} bar`;
      pLabel.sub.textContent = `${fmt(sim.pressure * KGF, 2)} kgf/cm²`;
      hydLabel.sub.textContent = sim.process.hydrant > 0 ? `aberto ${fmt(sim.process.hydrant)} % · clique para fechar` : 'fechado · clique para abrir';
      hydLabel.el.classList.toggle('on', sim.process.hydrant > 0);
      ['PJ', 'PB'].forEach((n) => {
        const c = sim.pressostats[n].closed;
        pss[n].led.material.emissive.setHex(c ? 0x39c463 : 0x000000);
        pss[n].led.material.color.setHex(c ? 0x39c463 : 0x555555);
      });
      sim.lamps.forEach((on, i) => { const m = lampSlots[i]; if (!m) return; m.emissive.setHex(on ? LAMP_COL[i] : 0x000000); m.emissiveIntensity = on ? 1.6 : 0; m.color.setHex(on ? LAMP_COL[i] : (LAMP_COL[i] === 0xff3b2f ? 0x5a1d1a : 0x1f4a2a)); });
      Object.entries(knobs3d).forEach(([n, k]) => { const i = k.vals.indexOf(sim.panel[n]); k.knob.rotation.z = -(i - 1) * Math.PI / 4; });
      Object.entries(btns3d).forEach(([n, c]) => { c.position.z = sim.buttons[n] ? 0.262 : 0.28; });
      if (Math.abs(sim.pressure - gaugeShown) > 0.03) { gaugeShown = sim.pressure; drawGauge(sim.pressure); }
      instrLabel.sub.textContent = `manômetro ${fmt(sim.pressure, 1)} bar · PJ ${sim.pressostats.PJ.closed ? 'fechado' : 'aberto'} · PB ${sim.pressostats.PB.closed ? 'fechado' : 'aberto'}`;
    },
  };
}
