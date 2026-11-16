// Estação de bombeamento TQ-01 em 3D (three.js), animada pelo estado do simulador.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/CSS2DRenderer.js';

const C = {
  blue: 0x1f5fb4, pipe: 0x2a62a8, steel: 0xc3c7c2, darkSteel: 0x3c444a, concrete: 0x9b9d97,
  panel: 0xd6d8d2, yellow: 0xe8b020, base: 0x4a5258, water: 0x2b84d6, epoxy: 0x4f7a9a,
};
const fmt = (v, d = 1) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function createProcess3D(host, { onAction } = {}) {
  // ---------------------------------------------------------------- Renderizadores
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'p3d-labels';
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef0eb);
  scene.fog = new THREE.Fog(0xeef0eb, 32, 75);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  window.__p3d = { camera, controls };   // acesso de depuração (prints do guia e testes)
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 1.2; controls.maxDistance = 30; controls.maxPolarAngle = Math.PI * 0.47;
  const CAMS = {
    geral: { pos: [4.5, 6.0, 12], tgt: [0.2, 1.6, -1] },
    tanque: { pos: [5.6, 3.8, 3.2], tgt: [2.6, 2.0, -1.6] },
    bomba: { pos: [0.8, 2.8, 3.4], tgt: [-2.0, 1.1, -0.6] },
    quadro: { pos: [7.5, 1.6, -2.3], tgt: [6.6, 1.3, -4.5] },
  };
  let camTarget = null;
  function setCamera(name) { const c = CAMS[name] || CAMS.geral; camTarget = { pos: new THREE.Vector3(...c.pos), tgt: new THREE.Vector3(...c.tgt), t: 0 }; }
  camera.position.set(...CAMS.geral.pos); controls.target.set(...CAMS.geral.tgt);

  // ---------------------------------------------------------------- Luzes
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a958a, 1.5));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(8, 14, 9); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -10, near: 1, far: 40 }); sun.shadow.bias = -0.0005;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xeef3ff, 0.8); fill.position.set(-10, 6, -4); scene.add(fill);

  // ---------------------------------------------------------------- Materiais e utilitários
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.15 }, o));
  const M = {
    pipe: mat(C.pipe, { roughness: 0.42, metalness: 0.2 }),
    motor: mat(C.blue, { roughness: 0.38, metalness: 0.3 }),
    pump: mat(0x27538f, { roughness: 0.4, metalness: 0.25 }),
    steel: mat(C.steel, { roughness: 0.3, metalness: 0.75 }),
    tankSteel: mat(0xb8bcb6, { roughness: 0.35, metalness: 0.7 }),
    dark: mat(C.darkSteel, { roughness: 0.6, metalness: 0.4 }),
    base: mat(C.base, { roughness: 0.7, metalness: 0.3 }),
    concrete: mat(0xc4c6c0, { roughness: 0.95, metalness: 0 }),
    concreteDark: mat(0xa7a9a3, { roughness: 0.95 }),
    yellow: mat(C.yellow, { roughness: 0.5 }),
    guard: mat(C.yellow, { roughness: 0.5, transparent: true, opacity: 0.45 }),
    panel: mat(C.panel, { roughness: 0.6 }),
    black: mat(0x1b1e20, { roughness: 0.6 }),
    brass: mat(0xb08d3c, { roughness: 0.35, metalness: 0.8 }),
    white: mat(0xe9e9e4, { roughness: 0.5 }),
    water: new THREE.MeshStandardMaterial({ color: C.water, transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0, emissive: 0x0d47a1, emissiveIntensity: 0.25 }),
    flow: new THREE.MeshStandardMaterial({ color: 0x1565c0, emissive: 0x1e88e5, emissiveIntensity: 0.9, roughness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.1 }),
  };
  const shadow = (o) => { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; };
  const add = (o, parent = scene) => { parent.add(shadow(o)); return o; };
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (r, h, m, seg = 32, r2) => new THREE.Mesh(new THREE.CylinderGeometry(r2 ?? r, r, h, seg), m);
  const up = new THREE.Vector3(0, 1, 0);
  const interactive = []; // objetos clicáveis

  // ---------------------------------------------------------------- Piso, parede, faixas
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 28), M.concrete); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(44, 44, 0x8d8f89, 0x8d8f89); grid.material.opacity = 0.18; grid.material.transparent = true; grid.position.y = 0.002; scene.add(grid);
  const wall = box(34, 5, 0.25, mat(0xe2e4de, { roughness: 0.9 })); wall.position.set(0, 2.5, -5); add(wall);
  const wallBand = box(34, 0.35, 0.27, mat(0x8f938c, { roughness: 0.9 })); wallBand.position.set(0, 0.175, -5); add(wallBand);
  const stripe = (x, z, w, d) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0xf0c419, { roughness: 0.8 })); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.004, z); s.receiveShadow = true; scene.add(s); };

  // ---------------------------------------------------------------- Tubulação e fluxo
  function pipe(points, r, m = M.pipe, { flanges = [] } = {}) {
    const g = new THREE.Group();
    const v = points.map((p) => new THREE.Vector3(...p));
    const path = new THREE.CurvePath();
    for (let i = 0; i < v.length - 1; i++) {
      const a = v[i], b = v[i + 1], len = a.distanceTo(b);
      const c = cyl(r, len, m, 24);
      c.position.copy(a).add(b).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
      g.add(c);
      path.add(new THREE.LineCurve3(a, b));
      if (i > 0) { const e = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 20, 14), m); e.position.copy(a); g.add(e); }
    }
    flanges.forEach((t) => { const p = path.getPointAt(t), tg = path.getTangentAt(t); const f = cyl(r * 1.55, 0.06, M.dark, 24); f.position.copy(p); f.quaternion.setFromUnitVectors(up, tg); g.add(f); });
    add(g);
    return path;
  }
  const flowMarkers = [];
  function flowOn(path, r, spacing = 0.7) {
    const len = path.getLength(), n = Math.max(2, Math.floor(len / spacing));
    const geo = new THREE.ConeGeometry(r * 0.45, r * 1.1, 10);
    const list = [];
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, M.flow); m.visible = false; scene.add(m); list.push(m); }
    const fm = { path, r, list, phase: 0, speed: 0 }; flowMarkers.push(fm); return fm;
  }
  function animFlow(fm, dt) {
    const on = fm.speed > 0.02;
    fm.phase = (fm.phase + dt * fm.speed * 0.25) % 1;
    fm.list.forEach((m, i) => {
      m.visible = on; if (!on) return;
      const t = (i / fm.list.length + fm.phase) % 1;
      const p = fm.path.getPointAt(t), tg = fm.path.getTangentAt(t);
      const side = Math.abs(tg.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : up;
      m.position.copy(p).addScaledVector(side, fm.r + 0.03); m.quaternion.setFromUnitVectors(up, tg);
    });
  }
  // ---------------------------------------------------------------- Rótulos
  function label(text, pos, cls = '') {
    const d = document.createElement('div'); d.className = `p3d-tag ${cls}`; d.innerHTML = `<b>${text}</b><span></span>`;
    const o = new CSS2DObject(d); o.position.copy(pos); scene.add(o);
    return { o, el: d, sub: d.querySelector('span'), b: d.querySelector('b') };
  }

  // ---------------------------------------------------------------- Reservatório inferior (concreto, nível constante)
  const cap = new THREE.Group(); cap.position.set(-6.2, 0, -1.6);
  const CW = 3, CH = 2.6, CD = 3, T = 0.22;
  [[0, -CD / 2 + T / 2, CW, T], [0, CD / 2 - T / 2, CW, T]].forEach(([x, z, w, d]) => { const m = box(w, CH, d, M.concreteDark); m.position.set(x, CH / 2, z); cap.add(m); });
  [[-CW / 2 + T / 2, 0, T, CD], [CW / 2 - T / 2, 0, T, CD]].forEach(([x, z, w, d]) => { const m = box(w, CH, d, M.concreteDark); m.position.set(x, CH / 2, z); cap.add(m); });
  const capWater = box(CW - 2 * T, 2.0, CD - 2 * T, M.water); capWater.position.y = 1.2; cap.add(capWater);
  const capInlet = cyl(0.1, 0.9, M.pipe, 16); capInlet.rotation.z = Math.PI / 2; capInlet.position.set(-CW / 2 - 0.3, 2.3, 0.6); cap.add(capInlet);
  add(cap);
  const capLabel = label('Reservatório', new THREE.Vector3(-6.2, 3.4, -1.6), 'small');

  // ---------------------------------------------------------------- Tanque TQ-01 (2 m², 3 m)
  const TQ = { x: 2.6, z: -1.6, r: 0.8, h: 3.0 };
  const tank = new THREE.Group(); tank.position.set(TQ.x, 0, TQ.z);
  const legs = new THREE.Group(); [[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]].forEach(([x, z]) => { const l = box(0.08, 0.5, 0.08, M.dark); l.position.set(x, 0.25, z); legs.add(l); }); tank.add(legs);
  const shell = cyl(TQ.r, TQ.h, M.tankSteel, 48); shell.position.y = 0.5 + TQ.h / 2; tank.add(shell);
  const bottom = cyl(TQ.r + 0.02, 0.1, M.tankSteel, 48); bottom.position.y = 0.5; tank.add(bottom);
  const roof = cyl(TQ.r + 0.02, 0.12, M.tankSteel, 48, 0.6); roof.position.y = 0.5 + TQ.h + 0.06; tank.add(roof);
  for (let y = 1.0; y < 0.5 + TQ.h; y += 1.0) { const ring = new THREE.Mesh(new THREE.TorusGeometry(TQ.r + 0.01, 0.03, 8, 64), M.dark); ring.rotation.x = Math.PI / 2; ring.position.y = y; tank.add(ring); }
  for (let y = 0.3; y < 0.5 + TQ.h + 0.1; y += 0.32) { const rung = box(0.4, 0.03, 0.03, M.dark); rung.position.set(-0.7, y, TQ.r + 0.05); rung.rotation.y = -0.5; tank.add(rung); }
  [-0.9, -0.5].forEach((x) => { const rail = box(0.04, TQ.h + 0.9, 0.04, M.dark); rail.position.set(x, (TQ.h + 0.9) / 2, TQ.r - 0.1 + (x + 0.7) * 0.5); tank.add(rail); });
  // visor de nível com escala e LT-01 ultrassônico no topo
  const glassX = 0.7, glassZ = 0.55, Y0 = 0.5;
  // visor: tubo de vidro cobrindo de 0 a 3 m (fundo ao topo do tanque), ligado ao tanque por dois bocais
  const glass = cyl(0.06, TQ.h, M.glass, 12); glass.position.set(glassX, Y0 + TQ.h / 2, glassZ); tank.add(glass);
  const lvl = cyl(0.045, 1, M.water, 12); lvl.position.set(glassX, Y0 + 0.5, glassZ); tank.add(lvl);
  // bocais do visor: curtos, de aço, apontando para o centro do tanque (ligam o vidro ao costado)
  const thV = Math.atan2(glassX, glassZ), rV = Math.hypot(glassX, glassZ);
  [0.08, TQ.h - 0.08].forEach((y) => { const n = cyl(0.03, rV - TQ.r + 0.04, M.steel, 10); n.rotation.set(Math.PI / 2, 0, 0); const g = new THREE.Group(); g.rotation.y = thV; g.position.set(0, Y0 + y, 0); n.position.set(0, 0, (rV + TQ.r) / 2 - 0.02); g.add(n); tank.add(g); });
  // régua graduada em escala real: 0 m no fundo do tanque, 3 m no topo; traço a cada 10 cm, número a cada 0,5 m
  const regua = (() => {
    const W = 256, H = 2048, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const yDe = (m) => H - (m / TQ.h) * H;
    c.fillStyle = '#f7f7f2'; c.fillRect(0, 0, W, H); c.strokeStyle = '#1b2125'; c.fillStyle = '#1b2125';
    for (let cm = 0; cm <= TQ.h * 100; cm += 10) {
      const y = Math.min(H - 2, Math.max(2, yDe(cm / 100))), longo = cm % 50 === 0;
      c.lineWidth = longo ? 6 : 3; c.beginPath(); c.moveTo(0, y); c.lineTo(longo ? 110 : 60, y); c.stroke();
      if (longo) { c.font = 'bold 52px Arial'; c.textBaseline = cm === 0 ? 'bottom' : cm === TQ.h * 100 ? 'top' : 'middle'; c.fillText(`${(cm / 100).toFixed(1).replace('.', ',')}`, 122, y); }
    }
    // marcas das chaves de nível
    [[2.8, 'HH'], [0.3, 'LL']].forEach(([m, t]) => { const y = yDe(m); c.strokeStyle = '#c0392b'; c.lineWidth = 8; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); c.fillStyle = '#c0392b'; c.font = 'bold 40px Arial'; c.textBaseline = 'bottom'; c.fillText(t, 150, y - 6); });
    c.fillStyle = '#1b2125'; c.font = 'bold 44px Arial'; c.textBaseline = 'middle'; c.save(); c.translate(225, H / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillText('metros', 0, 0); c.restore();
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    return new THREE.Mesh(new THREE.PlaneGeometry(0.16, TQ.h), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.7 }));
  })();
  const th = Math.atan2(glassX, glassZ);                    // a régua fica ao lado do visor, virada para fora do tanque
  regua.rotation.y = th;
  regua.position.set(glassX + Math.cos(th) * 0.15 + Math.sin(th) * 0.02, Y0 + TQ.h / 2, glassZ - Math.sin(th) * 0.15 + Math.cos(th) * 0.02);
  tank.add(regua);
  const lt01 = new THREE.Group(); lt01.position.set(0.2, Y0 + TQ.h + 0.12, -0.2);
  lt01.add(cyl(0.14, 0.05, M.dark, 24)); const lt01Body = cyl(0.07, 0.3, M.steel, 20); lt01Body.position.y = 0.17; lt01.add(lt01Body);
  const lt01Head = box(0.22, 0.18, 0.16, M.white); lt01Head.position.y = 0.4; lt01.add(lt01Head); tank.add(lt01);
  const lt01Cable = cyl(0.012, 0.9, M.black, 6); lt01Cable.position.set(0.2, Y0 + TQ.h + 0.1, 0.2); lt01Cable.rotation.x = Math.PI / 2; tank.add(lt01Cable);
  // chaves de nível no lado direito-traseiro do tanque, longe do visor e da régua
  const BA = 2.05, BX = Math.sin(BA) * (TQ.r + 0.08), BZ = Math.cos(BA) * (TQ.r + 0.08);
  const boia = (y) => { const g = new THREE.Group(); g.position.set(BX, Y0 + y, BZ); g.rotation.y = BA - Math.PI / 2; g.add(box(0.16, 0.14, 0.14, M.white)); const stub = cyl(0.03, 0.2, M.steel, 10); stub.rotation.z = Math.PI / 2; stub.position.x = -0.12; g.add(stub); const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x000000 })); led.position.set(0.06, 0.05, 0.08); g.add(led); tank.add(g); return led; };
  const ledHH = boia(2.8), ledLL = boia(0.3);
  add(tank);
  const tqLabel = label('TQ-01', new THREE.Vector3(TQ.x, Y0 + TQ.h + 1.1, TQ.z), 'big');
  const lshhLabel = label('LSHH-01', new THREE.Vector3(TQ.x + BX * 1.35, Y0 + 2.95, TQ.z + BZ * 1.35), 'small warn on');
  const lsllLabel = label('LSLL-01', new THREE.Vector3(TQ.x + BX * 1.35, Y0 + 0.45, TQ.z + BZ * 1.35), 'small warn on');
  // ladrão (extravasor): bocal em 2,95 m e tubo descendo até o dreno; jorra quando o tanque transborda
  const LA = -2.3, LX = Math.sin(LA) * TQ.r, LZ = Math.cos(LA) * TQ.r;
  const ladrao = pipe([[TQ.x + LX, Y0 + 2.95, TQ.z + LZ], [TQ.x + LX * 1.35, Y0 + 2.95, TQ.z + LZ * 1.35], [TQ.x + LX * 1.35, 0.3, TQ.z + LZ * 1.35]], 0.06, M.pipe, { flanges: [0.08] });
  const ladraoJato = cyl(0.04, 0.25, new THREE.MeshStandardMaterial({ color: 0x7fc3ff, transparent: true, opacity: 0.75 }), 10); ladraoJato.position.set(TQ.x + LX * 1.35, 0.15, TQ.z + LZ * 1.35); ladraoJato.visible = false; scene.add(ladraoJato);
  const ladraoLabel = label('TRANSBORDANDO', new THREE.Vector3(TQ.x + LX * 1.5, 1.2, TQ.z + LZ * 1.5), 'small warn on');

  // ---------------------------------------------------------------- Motobomba B-01: sucção do reservatório, recalque para o topo do tanque
  const Y_SUC = 0.62, Z_SUC = -1.7, XP = -2.2, Y_DIS = 4.3, Z_DIS = -1.0;
  const sucPath = pipe([[-4.7, 0.5, Z_SUC], [XP, Y_SUC, Z_SUC], [XP, Y_SUC + 0.26, Z_SUC], [XP, 0.88, -1.22]], 0.16, M.pipe, { flanges: [0.1, 0.5, 0.9] });
  const sucFlow = flowOn(sucPath, 0.16, 0.5);
  const pumpG = new THREE.Group(); pumpG.position.set(XP, 0, 0);
  const plinth = box(1.5, 0.22, 3.0, M.concreteDark); plinth.position.set(0, 0.11, 0.35); pumpG.add(plinth);
  const skid = box(1.1, 0.14, 2.7, M.base); skid.position.set(0, 0.29, 0.35); pumpG.add(skid);
  const volute = cyl(0.46, 0.34, M.pump, 40); volute.rotation.x = Math.PI / 2; volute.position.set(0, 0.88, -0.75); pumpG.add(volute);
  const vfoot = box(0.5, 0.28, 0.3, M.pump); vfoot.position.set(0, 0.5, -0.75); pumpG.add(vfoot);
  const eye = cyl(0.17, 0.32, M.pump, 24); eye.rotation.x = Math.PI / 2; eye.position.set(0, 0.88, -1.06); pumpG.add(eye);
  const outlet = cyl(0.15, 0.4, M.pump, 24); outlet.position.set(0, 1.42, -0.75); pumpG.add(outlet);
  // eixo único: bomba e motor no mesmo centro (y = 0,88), como numa motobomba alinhada sobre base comum
  const YE = 0.88;
  // mancal (suporte de rolamentos) da bomba: corpo fundido azul com pé apoiado na base
  const brg = cyl(0.15, 0.42, M.pump, 24); brg.rotation.x = Math.PI / 2; brg.position.set(0, YE, -0.36); pumpG.add(brg);
  const brgFlange = cyl(0.2, 0.05, M.pump, 24); brgFlange.rotation.x = Math.PI / 2; brgFlange.position.set(0, YE, -0.57); pumpG.add(brgFlange);
  const brgFoot = box(0.34, YE - 0.36 - 0.12, 0.22, M.pump); brgFoot.position.set(0, 0.36 + (YE - 0.36 - 0.12) / 2, -0.32); pumpG.add(brgFoot);
  const shaft = cyl(0.035, 0.36, M.steel, 12); shaft.rotation.x = Math.PI / 2; shaft.position.set(0, YE, -0.02); pumpG.add(shaft);
  // acoplamento girando, coberto por protetor de acoplamento amarelo (chapa, aberto embaixo), como exige a NR-12
  const rotor = new THREE.Group(); rotor.position.set(0, YE, 0.12);
  const hub = cyl(0.11, 0.2, M.dark, 20); hub.rotation.x = Math.PI / 2; rotor.add(hub); rotor.add(box(0.025, 0.2, 0.2, M.steel)); pumpG.add(rotor);
  const guardMat = mat(0xf2c700, { roughness: 0.55 });
  const guardTop = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 24, 1, true, -Math.PI / 2, Math.PI), guardMat); guardTop.rotation.x = Math.PI / 2; guardTop.rotation.y = Math.PI; guardTop.position.set(0, YE, 0.12); guardTop.material.side = THREE.DoubleSide; pumpG.add(guardTop);
  [-0.2, 0.2].forEach((x) => { const side = box(0.012, YE - 0.36, 0.5, guardMat); side.position.set(x, 0.36 + (YE - 0.36) / 2, 0.12); pumpG.add(side); });
  const motor = cyl(0.42, 1.05, M.motor, 40); motor.rotation.x = Math.PI / 2; motor.position.set(0, YE, 0.98); pumpG.add(motor);
  const motorFlange = cyl(0.44, 0.05, M.motor, 40); motorFlange.rotation.x = Math.PI / 2; motorFlange.position.set(0, YE, 0.44); pumpG.add(motorFlange);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; if (Math.sin(a) < -0.7) continue; const fin = box(0.03, 0.07, 0.95, M.motor); fin.position.set(Math.cos(a) * 0.45, YE + Math.sin(a) * 0.45, 0.98); fin.rotation.z = a + Math.PI / 2; pumpG.add(fin); }
  const tbox = box(0.28, 0.18, 0.3, M.motor); tbox.position.set(0, YE + 0.5, 0.85); pumpG.add(tbox);
  const fanCover = cyl(0.4, 0.28, M.motor, 40); fanCover.rotation.x = Math.PI / 2; fanCover.position.set(0, YE, 1.62); pumpG.add(fanCover);
  const grille = cyl(0.33, 0.02, M.black, 40); grille.rotation.x = Math.PI / 2; grille.position.set(0, YE, 1.77); pumpG.add(grille);
  const fan = new THREE.Group(); fan.position.set(0, YE, 1.785);
  // ventilador radial (pás saindo do centro), visto pelas frestas da tampa defletora
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const b = box(0.05, 0.26, 0.01, M.steel); b.position.set(Math.sin(a) * 0.17, Math.cos(a) * 0.17, 0); b.rotation.z = -a; fan.add(b); }
  const fanHub = cyl(0.06, 0.03, M.steel, 16); fanHub.rotation.x = Math.PI / 2; fan.add(fanHub);
  pumpG.add(fan);
  // grade da tampa defletora: anéis concêntricos e raios fixos na frente do ventilador
  [0.1, 0.17, 0.24, 0.31].forEach((r) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 40), M.motor); ring.position.set(0, YE, 1.8); pumpG.add(ring); });
  for (let i = 0; i < 4; i++) { const raio = box(0.02, 0.62, 0.02, M.motor); raio.rotation.z = (i / 4) * Math.PI; raio.position.set(0, YE, 1.8); pumpG.add(raio); }
  [-0.3, 0.3].forEach((x) => { const pe = box(0.16, 0.12, 0.8, M.motor); pe.position.set(x, 0.42, 0.98); pumpG.add(pe); const p2 = box(0.1, 0.14, 0.12, M.motor); p2.position.set(x * 0.85, 0.52, 0.98); pumpG.add(p2); });
  add(pumpG);
  stripe(XP, 0.35, 1.9, 0.06); stripe(XP, 1.95, 1.9, 0.06); stripe(XP - 0.95, 1.15, 0.06, 1.66); stripe(XP + 0.95, 1.15, 0.06, 1.66);
  const pumpLabel = label('B-01', new THREE.Vector3(XP, 1.9, 1.75));
  const disPath = pipe([[XP, 1.62, -0.75], [XP, 2.05, -0.75], [XP, 2.05, Z_DIS], [XP, Y_DIS, Z_DIS], [TQ.x - 0.3, Y_DIS, Z_DIS], [TQ.x - 0.3, Y_DIS, TQ.z], [TQ.x - 0.3, 0.5 + TQ.h + 0.05, TQ.z]], 0.14, M.pipe, { flanges: [0.12, 0.3, 0.55, 0.8] });
  const disFlow = flowOn(disPath, 0.14, 0.7);
  const chk = box(0.34, 0.3, 0.42, M.dark); chk.position.set(XP, 2.05, -0.9); add(chk);

  // ---------------------------------------------------------------- Saída do tanque: HV-01 (válvula manual de consumo) e dreno do consumidor
  const outPath = pipe([[TQ.x + TQ.r - 0.05, 0.75, TQ.z], [TQ.x + 1.6, 0.75, TQ.z], [TQ.x + 1.6, 0.75, 0.6], [TQ.x + 1.6, 0.35, 0.6]], 0.12, M.pipe, { flanges: [0.15, 0.6] });
  const outFlow = flowOn(outPath, 0.12, 0.5);
  const hv = new THREE.Group(); hv.position.set(TQ.x + 1.6, 0.75, -0.6);
  hv.add(box(0.38, 0.32, 0.32, M.dark)); const bonnet = cyl(0.11, 0.28, M.dark, 20); bonnet.position.y = 0.28; hv.add(bonnet);
  const stem = cyl(0.025, 0.4, M.steel, 8); stem.position.y = 0.55; hv.add(stem);
  const wheel = new THREE.Group(); wheel.position.y = 0.76; const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 28), M.pipe); rim.rotation.x = Math.PI / 2; wheel.add(rim);
  for (let i = 0; i < 3; i++) { const sp = box(0.4, 0.02, 0.02, M.pipe); sp.rotation.y = i * Math.PI / 3; wheel.add(sp); } hv.add(wheel);
  const hvHit = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })); hvHit.position.y = 0.72; hvHit.userData = { kind: 'hv' }; hv.add(hvHit); interactive.push(hvHit);
  add(hv);
  const hvLabel = label('HV-01', new THREE.Vector3(TQ.x + 1.6, 2.1, -0.6), 'small');
  const drain = box(1.4, 0.03, 0.9, M.dark); drain.position.set(TQ.x + 1.6, 0.015, 1.0); add(drain);
  const jet = cyl(0.045, 1, new THREE.MeshStandardMaterial({ color: 0x7fc3ff, transparent: true, opacity: 0.7 }), 10); jet.position.set(TQ.x + 1.6, 0.2, 0.6); scene.add(jet);

  // ---------------------------------------------------------------- Quadro de comando (operável)
  function plateTex(lines, { w = 512, h = 144, bg = '#f6f6f1', fg = '#1b2125', size = 44, sub = 30, border = '#a5a99f' } = {}) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, w, h); c.strokeStyle = border; c.lineWidth = 5; c.strokeRect(2.5, 2.5, w - 5, h - 5);
    c.fillStyle = '#9a9e96'; [[18, h / 2], [w - 18, h / 2]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `600 ${size}px Arial, sans-serif`;
    c.fillText(lines[0], w / 2, lines[1] ? h * 0.38 : h / 2);
    if (lines[1]) { c.font = `${sub}px Arial, sans-serif`; c.fillStyle = '#5d666c'; c.fillText(lines[1], w / 2, h * 0.75); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  function plate(parent, lines, x, y, w = 0.42, h = 0.11, opts) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: plateTex(lines, opts), roughness: 0.7 })); m.position.set(x, y, 0.236); parent.add(m); return m; }
  // Coluna de comando em pé, 2,0 m, dispositivos na zona de operação (0,8 a 1,7 m) — altura de um operador de 1,75 m.
  // Botoeiras e sinaleiros de 22 mm em tamanho real; IHM de 10" (270 × 210 mm) no recorte da porta.
  const PNL = { x: 6.6, z: -4.55, w: 0.8, h: 2.0, d: 0.4 };
  const pnl = new THREE.Group(); pnl.position.set(PNL.x, 0, PNL.z);
  const cab = box(PNL.w, PNL.h - 0.1, PNL.d, M.panel); cab.position.y = 0.1 + (PNL.h - 0.1) / 2; pnl.add(cab);
  const doorEdge = box(PNL.w - 0.06, PNL.h - 0.16, 0.02, mat(0xdfe1db, { roughness: 0.6 })); doorEdge.position.set(0, 0.1 + (PNL.h - 0.1) / 2, PNL.d / 2 + 0.005); pnl.add(doorEdge);
  const plinthP = box(PNL.w, 0.1, PNL.d, M.dark); plinthP.position.y = 0.05; pnl.add(plinthP);
  const ZF = PNL.d / 2 + 0.016; // face da porta
  [[-0.36, 1.55], [-0.36, 0.75]].forEach(([x, y]) => { const h = box(0.03, 0.12, 0.03, M.dark); h.position.set(x, y, ZF + 0.01); pnl.add(h); });
  const dobr = (y) => { const d = box(0.02, 0.08, 0.03, M.dark); d.position.set(PNL.w / 2 - 0.02, y, ZF); pnl.add(d); }; dobr(0.5); dobr(1.1); dobr(1.7);
  function plateP(parent, lines, x, y, w = 0.22, h = 0.055, opts) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: plateTex(lines, opts), roughness: 0.7 })); m.position.set(x, y, ZF + 0.002); parent.add(m); return m; }
  plateP(pnl, ['ESTAÇÃO DE BOMBEAMENTO TQ-01 — PAINEL DE OPERAÇÃO'], 0, 1.9, 0.68, 0.05, { w: 1536, h: 110, bg: '#1b5e9e', fg: '#ffffff', size: 40, border: '#0f4075' });
  const lampMats = {}; const btns3d = {}; let knob3d = null; let mush3d = null;
  const LAMP_COL = { H1: 0x46e36d, H2: 0xffb81c, H3: 0xff3b2f };
  function lamp(x, y, name, lines) {
    const bez = cyl(0.016, 0.012, M.steel, 24); bez.rotation.x = Math.PI / 2; bez.position.set(x, y, ZF + 0.006); pnl.add(bez);
    const lensMat = new THREE.MeshStandardMaterial({ color: LAMP_COL[name], emissive: 0x000000, roughness: 0.25, transparent: true, opacity: 0.92 });
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.012, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lensMat); lens.rotation.x = Math.PI / 2; lens.position.set(x, y, ZF + 0.012); pnl.add(lens);
    lampMats[name] = lensMat; plateP(pnl, lines, x, y - 0.055);
  }
  function pushButton(x, y, name, color, lines, big = false) {
    const r = big ? 0.03 : 0.018;
    if (big) { const collar = cyl(0.045, 0.01, mat(0xf2c700, { roughness: 0.5 }), 32); collar.rotation.x = Math.PI / 2; collar.position.set(x, y, ZF + 0.004); pnl.add(collar); }
    const bez = cyl(r, 0.012, M.steel, 24); bez.rotation.x = Math.PI / 2; bez.position.set(x, y, ZF + 0.006); pnl.add(bez);
    const cap = cyl(big ? 0.026 : 0.013, big ? 0.028 : 0.014, mat(color, { roughness: 0.35 }), 24); cap.rotation.x = Math.PI / 2; cap.position.set(x, y, ZF + (big ? 0.026 : 0.019)); pnl.add(cap);
    plateP(pnl, lines, x, y - (big ? 0.085 : 0.055));
    const hit = new THREE.Mesh(new THREE.CircleGeometry(big ? 0.05 : 0.03, 16), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(x, y, ZF + 0.045); hit.userData = { kind: big ? 'cogumelo' : 'button', name }; pnl.add(hit); interactive.push(hit);
    cap.userData = { kind: big ? 'cogumelo' : 'button', name, z0: cap.position.z }; btns3d[name] = cap; if (big) mush3d = cap;
  }
  function selector(x, y, lines) {
    const bez = cyl(0.019, 0.012, M.steel, 24); bez.rotation.x = Math.PI / 2; bez.position.set(x, y, ZF + 0.006); pnl.add(bez);
    const knob = new THREE.Group(); knob.position.set(x, y, ZF + 0.014);
    const body = cyl(0.015, 0.014, M.black, 24); body.rotation.x = Math.PI / 2; knob.add(body);
    const bar = box(0.007, 0.026, 0.008, M.white); bar.position.z = 0.008; knob.add(bar);
    pnl.add(knob); knob3d = knob;
    const pos = plateP(pnl, ['Man     Auto'], x, y + 0.042, 0.11, 0.022, { w: 512, h: 100, bg: '#dfe1db', border: '#dfe1db', size: 44 }); pos.material.transparent = true;
    plateP(pnl, lines, x, y - 0.06);
    const hit = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(x, y, ZF + 0.03); hit.userData = { kind: 'selector' }; pnl.add(hit); interactive.push(hit);
  }
  // IHM de 10" no recorte da porta (textura ao vivo); clique abre a IHM na tela
  const ihmCv = document.createElement('canvas'); ihmCv.width = 800; ihmCv.height = 480;
  const ihmTx = new THREE.CanvasTexture(ihmCv); ihmTx.colorSpace = THREE.SRGBColorSpace;
  function drawIhm(st) {
    const c = ihmCv.getContext('2d');
    c.fillStyle = '#1c2125'; c.fillRect(0, 0, 800, 480);
    c.fillStyle = '#0f1d33'; c.fillRect(24, 56, 752, 390); c.strokeStyle = '#0a1424'; c.lineWidth = 4; c.strokeRect(24, 56, 752, 390);
    c.fillStyle = '#c9cfd4'; c.font = '600 20px Arial'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('ESTAÇÃO TQ-01 — OPERAÇÃO', 30, 30);
    c.fillStyle = st.con ? '#46e36d' : '#8fa0b3'; c.textAlign = 'right'; c.fillText(st.con ? '● CLP' : '● SEM CLP', 770, 30);
    c.fillStyle = '#8fb3e3'; c.font = '18px Arial'; c.textAlign = 'left'; c.fillText('NÍVEL DO TANQUE', 50, 90); c.fillText('AJUSTES DO OPERADOR', 420, 90);
    c.fillStyle = '#142a4a'; c.fillRect(50, 115, 90, 300); c.strokeStyle = '#8fb3e3'; c.lineWidth = 3; c.strokeRect(50, 115, 90, 300);
    const hN = st.nivel === null ? 0 : Math.max(0, Math.min(1, st.nivel / 3)); c.fillStyle = '#2b84d6'; c.fillRect(52, 115 + 298 - hN * 296, 86, hN * 296);
    c.strokeStyle = '#46e36d'; c.setLineDash([8, 6]); c.beginPath(); const ySp = 115 + 298 - Math.max(0, Math.min(1, st.sp / 3)) * 296; c.moveTo(44, ySp); c.lineTo(146, ySp); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#e0b140'; c.font = '14px Arial'; c.fillText('HH', 150, 115 + 298 - 0.933 * 296); c.fillText('LL', 150, 115 + 298 - 0.1 * 296);
    c.fillStyle = '#fff'; c.font = 'bold 64px Consolas, monospace'; c.fillText(st.nivel === null ? '—' : st.nivel.toFixed(2).replace('.', ','), 190, 230);
    c.fillStyle = '#c9cfd4'; c.font = '18px Arial'; c.fillText('metros', 192, 275);
    const campo = (y, lbl, sub, val, un) => { c.fillStyle = '#142a4a'; c.fillRect(420, y, 330, 86); c.strokeStyle = '#3d6bb0'; c.lineWidth = 3; c.strokeRect(420, y, 330, 86); c.fillStyle = '#e6e9ec'; c.font = '20px Arial'; c.textAlign = 'left'; c.fillText(lbl, 436, y + 32); c.fillStyle = '#8fa0b3'; c.font = '15px Arial'; c.fillText(sub, 436, y + 60); c.fillStyle = '#fff'; c.font = 'bold 40px Consolas, monospace'; c.textAlign = 'right'; c.fillText(val, 700, y + 44); c.fillStyle = '#c9cfd4'; c.font = '22px Arial'; c.fillText(un, 742, y + 46); };
    campo(115, 'Velocidade da bomba', 'modo manual', String(st.vel), '%'); campo(225, 'Setpoint de nível', 'modo automático', st.sp.toFixed(2).replace('.', ','), 'm');
    c.fillStyle = '#8fa0b3'; c.font = '15px Arial'; c.textAlign = 'left'; c.fillText('toque para digitar', 436, 350);
    ihmTx.needsUpdate = true;
  }
  drawIhm({ nivel: null, vel: 75, sp: 2, con: false });
  const IHM_Y = 1.62;
  const ihmFrame = box(0.29, 0.228, 0.02, mat(0x2b3134, { roughness: 0.5 })); ihmFrame.position.set(0, IHM_Y, ZF + 0.008); pnl.add(ihmFrame);
  const ihmPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.262, 0.197), new THREE.MeshBasicMaterial({ map: ihmTx })); ihmPlate.position.set(0, IHM_Y, ZF + 0.019); ihmPlate.userData = { kind: 'ihm' }; pnl.add(ihmPlate); interactive.push(ihmPlate);
  plateP(pnl, ['IHM 10" · operador'], 0, IHM_Y - 0.15, 0.2, 0.03, { w: 800, h: 120, size: 44, sub: 30 });
  lamp(-0.22, 1.33, 'H1', ['Em operação', 'H1']); lamp(0, 1.33, 'H2', ['Alarme', 'H2']); lamp(0.22, 1.33, 'H3', ['Falha', 'H3']);
  selector(-0.22, 1.1, ['Manual / automático', 'S4']);
  pushButton(0.2, 1.1, 'S0', 0xc8201b, ['Emergência', 'S0 · NF'], true);
  pushButton(-0.22, 0.86, 'S1', 0x2c8f48, ['Liga B-01', 'S1 · NA']); pushButton(0, 0.86, 'S2', 0xb8241f, ['Desliga B-01', 'S2 · NF']); pushButton(0.22, 0.86, 'S3', 0x1d5fbf, ['Reset', 'S3 · NA']);
  // manopla rotativa do disjuntor-motor Q1 (alimentação do CFW500) na porta, clicável
  const q1Base = box(0.11, 0.11, 0.012, mat(0xf2c700, { roughness: 0.5 })); q1Base.position.set(0, 0.6, ZF + 0.006); pnl.add(q1Base);
  const q1Knob = new THREE.Group(); q1Knob.position.set(0, 0.6, ZF + 0.02);
  const q1Hub = cyl(0.03, 0.02, mat(0xc8201b, { roughness: 0.4 }), 24); q1Hub.rotation.x = Math.PI / 2; q1Knob.add(q1Hub);
  const q1Bar = box(0.022, 0.1, 0.025, mat(0xc8201b, { roughness: 0.4 })); q1Bar.position.z = 0.012; q1Knob.add(q1Bar);
  pnl.add(q1Knob);
  plateP(pnl, ['0          I'], 0, 0.672, 0.12, 0.022, { w: 512, h: 100, bg: '#f2c700', border: '#f2c700', size: 56 });
  plateP(pnl, ['Disjuntor CFW500', 'Q1'], 0, 0.515);
  const q1Hit = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); q1Hit.position.set(0, 0.6, ZF + 0.05); q1Hit.userData = { kind: 'q1' }; pnl.add(q1Hit); interactive.push(q1Hit);
  // sirene/sinalizador no topo da coluna
  const sirBase = cyl(0.04, 0.06, M.dark, 20); sirBase.position.set(0.25, PNL.h + 0.03, 0); pnl.add(sirBase);
  const sirene = cyl(0.05, 0.1, mat(0xff3b2f, { roughness: 0.3, transparent: true, opacity: 0.85 }), 20); sirene.position.set(0.25, PNL.h + 0.11, 0); pnl.add(sirene);
  const sireneLens = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xff3b2f, emissive: 0x000000 })); sireneLens.position.set(0.25, PNL.h + 0.17, 0); pnl.add(sireneLens);
  const horn = cyl(0.035, 0.08, M.dark, 16, 0.02); horn.rotation.x = Math.PI / 2; horn.position.set(-0.2, PNL.h + 0.08, 0.05); pnl.add(horn);
  // prensa-cabos na base e eletrodutos até o campo (motor e LT-01)
  [-0.2, 0, 0.2].forEach((x) => { const g = cyl(0.02, 0.04, M.dark, 12); g.position.set(x, 0.0, PNL.d / 2 - 0.08); pnl.add(g); });
  add(pnl);
  const conduto1 = pipe([[PNL.x - 0.2, 0.02, PNL.z + 0.12], [PNL.x - 0.2, 0.02, -3.6], [XP + 0.9, 0.02, -3.6], [XP + 0.9, 0.02, 0.85], [XP + 0.9, 1.4, 0.85], [XP + 0.14, 1.4, 0.85]], 0.02, M.dark);
  const conduto2 = pipe([[PNL.x, 0.02, PNL.z + 0.12], [PNL.x, 0.02, -3.4], [TQ.x + 0.5, 0.02, -3.4], [TQ.x + 0.5, 0.02, TQ.z - 0.3], [TQ.x + 0.5, 0.5 + TQ.h + 0.3, TQ.z - 0.3], [TQ.x + 0.2, 0.5 + TQ.h + 0.3, TQ.z - 0.2]], 0.015, M.dark);
  const conduto3 = pipe([[PNL.x + 0.2, 0.02, PNL.z + 0.12], [PNL.x + 0.2, 0.02, -3.2], [TQ.x + 1.2, 0.02, -3.2], [TQ.x + 1.2, 0.02, TQ.z + 0.3], [TQ.x + 1.2, 0.8, TQ.z + 0.3]], 0.015, M.dark);
  const pnlLabel = label('EMERGÊNCIA', new THREE.Vector3(6.6, 2.4, -4.3), 'small warn on');

  // ---------------------------------------------------------------- Interação
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function pickAt(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(interactive, false);
    return hits.length ? hits[0] : null;
  }
  let downAt = null, held = null;
  const release = () => { if (held) { onAction?.({ tipo: 'btn', id: held, down: false }); held = null; } controls.enabled = true; };
  renderer.domElement.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
    const h = pickAt(e);
    if (h && h.object.userData.kind === 'button') { controls.enabled = false; held = h.object.userData.name; onAction?.({ tipo: 'btn', id: held, down: true }); }
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    const wasHeld = !!held; release();
    if (wasHeld || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const h = pickAt(e); if (!h) return;
    const u = h.object.userData;
    if (u.kind === 'cogumelo') onAction?.({ tipo: 'cogumelo' });
    else if (u.kind === 'selector') { const center = new THREE.Vector3(); h.object.getWorldPosition(center); onAction?.({ tipo: 'seletor', pos: h.point.x < center.x ? 'manual' : 'auto' }); }
    else if (u.kind === 'hv') onAction?.({ tipo: 'cons', valor: (S?.cons ?? 0.6) > 0.05 ? 0 : 0.6 });
    else if (u.kind === 'ihm') onAction?.({ tipo: 'ui', acao: 'ihm' });
    else if (u.kind === 'q1') onAction?.({ tipo: 'disjuntor' });
  });
  renderer.domElement.addEventListener('pointerleave', release);
  renderer.domElement.addEventListener('pointermove', (e) => { const h = pickAt(e); renderer.domElement.style.cursor = h ? 'pointer' : ''; });

  // ---------------------------------------------------------------- Estado e animação
  let S = null, rotAngle = 0, lastT = performance.now(), lastIhm = '';
  function update(s) {
    S = s;
    const hv = Math.max(0.02, Math.min(TQ.h, s.h)); lvl.scale.y = hv; lvl.position.y = Y0 + hv / 2;
    ledHH.material.emissive.set(s.di[7] ? 0xff3b2f : 0x000000); ledLL.material.emissive.set(s.di[8] ? 0xff3b2f : 0x000000);
    for (const [n, m] of Object.entries(lampMats)) { const on = s.quadro[n]; m.emissive.set(on ? LAMP_COL[n] : 0x000000); m.emissiveIntensity = on ? 1.4 : 0; }
    sireneLens.material.emissive.set(s.quadro.H4 && Math.floor(performance.now() / 250) % 2 ? 0xff3b2f : 0x000000);
    for (const [n, cap] of Object.entries(btns3d)) { if (n === 'S0') continue; cap.position.z = cap.userData.z0 - (s.quadro[n] ? 0.006 : 0); }
    if (mush3d) mush3d.position.z = mush3d.userData.z0 - (s.quadro.S0 ? 0.012 : 0);
    if (knob3d) knob3d.rotation.z = s.quadro.S4 === 'auto' ? -0.45 : 0.45;
    q1Knob.rotation.z = s.quadro.q1 ? -Math.PI / 2 : 0;   // vertical = 0 (desligado), horizontal = I (ligado)
    sucFlow.speed = s.qIn / 12; disFlow.speed = s.qIn / 12; outFlow.speed = s.qOut / 8;
    jet.visible = s.qOut > 0.3; const len = 0.35 * Math.min(1, s.qOut / 12) + 0.05; jet.scale.y = len * 2; jet.position.y = 0.35 - len;
    const m = s.sensores['LT-01'];
    tqLabel.sub.innerHTML = `${fmt(s.h, 2)} m · ${Math.round(s.h / 3 * 100)} %<br>LT-01 ${m.st === 'ok' ? `${fmt(m.sinal, 2)} mA · bruto ${m.raw}` : m.st === 'fioRompido' ? 'FIO ROMPIDO · 0 mA' : m.st}`;
    tqLabel.el.className = `p3d-tag big warn ${m.st !== 'ok' ? 'on' : ''}`;
    lshhLabel.sub.textContent = 'nível muito alto'; lshhLabel.o.visible = !!s.di[7];
    ladraoJato.visible = !!s.transbordo; ladraoLabel.sub.textContent = 'água saindo pelo ladrão'; ladraoLabel.o.visible = !!s.transbordo;
    lsllLabel.sub.textContent = 'nível muito baixo'; lsllLabel.o.visible = !!s.di[8];
    const inv = s.inv;
    pumpLabel.sub.textContent = !inv.power ? 'sem alimentação (Q1 desligado)' : inv.falha ? `FALHA ${inv.codFalha}` : `${fmt(inv.fHz, 1)} Hz · ${fmt(s.iMot, 1)} A · ${fmt(s.qIn, 1)} m³/h · ${inv.rodando ? 'rodando' : 'parada'}`;
    pumpLabel.el.className = `p3d-tag ${inv.rodando ? 'on' : ''}`;
    capLabel.sub.textContent = 'sucção da bomba';
    hvLabel.sub.textContent = `consumo ${Math.round(s.cons * 100)} % · ${fmt(s.qOut, 1)} m³/h`;
    pnlLabel.sub.textContent = 'cogumelo S0 acionado · DI1 do inversor cortada'; pnlLabel.o.visible = !!s.quadro.S0;
    const ih = s.ihm || {}; const ik = `${ih.nivel}|${ih.vel}|${ih.sp}|${s.comm && s.comm.clpConectado}`; if (ik !== lastIhm) { lastIhm = ik; drawIhm({ nivel: (s.comm && s.comm.clpConectado && typeof ih.nivel === 'number') ? ih.nivel : null, vel: ih.vel ?? 75, sp: ih.sp ?? 2, con: !!(s.comm && s.comm.clpConectado) }); }
  }
  let gHV = 0.6;
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (S) {
      const w = (S.inv.fHz / 60) * 2 * Math.PI * 4; // rotação visual (não a real) 
      rotAngle += w * dt; rotor.rotation.z = rotAngle; fan.rotation.z = rotAngle;
      // volante da HV-01 gira quando o consumo muda
      if (Math.abs(S.cons - gHV) > 0.001) { wheel.rotation.y += (S.cons - gHV) * 40; gHV = S.cons; }
      for (const fm of flowMarkers) animFlow(fm, dt);
    }
    if (camTarget) { camTarget.t = Math.min(1, camTarget.t + dt / 0.6); const k = 1 - Math.pow(1 - camTarget.t, 3); camera.position.lerp(camTarget.pos, k * 0.35); controls.target.lerp(camTarget.tgt, k * 0.35); if (camTarget.t >= 1) camTarget = null; }
    controls.update();
    renderer.render(scene, camera); labels.render(scene, camera);
  }
  function resize() { const w = host.clientWidth || 800, h = host.clientHeight || 440; renderer.setSize(w, h, false); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(host); resize(); loop();
  let labelsOn = true;
  function setLabels(v) { labelsOn = v; labels.domElement.style.display = v ? '' : 'none'; }
  return { update, setCamera, setLabels, resize };
}
