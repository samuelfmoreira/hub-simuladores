/* =============================================================================
 *  BANCADA DIDÁTICA 3D — SCA06 + ECO5 + servomotor + disco graduado
 *  Three.js r128 (global THREE). Unidades em metros.
 *
 *  Leiaute da bancada (vista frontal):
 *    painel traseiro (placa de montagem RAL 7035) com: disjuntor, SCA06 + ECO5,
 *    sinaleiro, switch industrial e CLP (scanner).  Na mesa: servomotor com o eixo
 *    voltado para o aluno, disco de alumínio Ø250 mm com escala fixa 0–360°,
 *    peso de desbalanceamento, cames e chaves de fim de curso, botoeiras.
 *
 *  Convenção: olhando o eixo do motor de frente, ângulo positivo = horário
 *  [PROG P00111]. Na tela isso é rotação negativa em torno de +Z.
 * ===========================================================================*/
(function (global) {
  'use strict';
  const T = global.THREE;

  // -------------------------------------------------------------- texturas utilitárias
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new T.CanvasTexture(c); t.anisotropy = 4; t.needsUpdate = true;
    t.userData = { canvas: c, ctx: g }; return t;
  }
  const mat = (color, o = {}) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.05 }, o));
  function box(w, h, d, m) { return new T.Mesh(new T.BoxGeometry(w, h, d), m); }
  function cyl(rt, rb, h, m, seg = 32) { return new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), m); }

  // -------------------------------------------------------------- display 7 segmentos
  const SEG = {
    '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
    'P': 'abefg', 'A': 'abcefg', 'F': 'aefg', 'E': 'adefg', 'S': 'acdfg', 't': 'defg', 'o': 'cde', 'b': 'cdefg', 'd': 'bcdeg', 'n': 'ceg', 'r': 'eg',
    '-': 'g', ' ': '', 'u': 'cde', 'H': 'bcefg', 'L': 'def', 'C': 'adef'
  };
  function drawSeven(g, x, y, w, h, ch, dp, on) {
    const segs = SEG[ch] || '';
    const t = w * 0.16, sk = w * 0.12;                // espessura e inclinação
    const P = (px, py) => [x + px + sk * (1 - py / h), y + py];
    const poly = (pts, lit) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = lit ? '#ff2a1a' : 'rgba(110,10,10,0.35)'; g.fill(); };
    const hz = (yy, lit) => poly([P(t * 0.6, yy), P(w - t * 0.6, yy), P(w - t * 1.1, yy + t / 2), P(w - t * 0.6, yy + t), P(t * 0.6, yy + t), P(t * 0.1, yy + t / 2)].map((p, i) => i === 2 || i === 5 ? p : p), lit);
    const vt = (xx, y0, y1, lit) => poly([P(xx + t / 2, y0), P(xx + t, y0 + t / 2), P(xx + t, y1 - t / 2), P(xx + t / 2, y1), P(xx, y1 - t / 2), P(xx, y0 + t / 2)], lit);
    const m = h / 2;
    hz(0, on && segs.includes('a')); hz(m - t / 2, on && segs.includes('g')); hz(h - t, on && segs.includes('d'));
    vt(w - t, t / 2, m, on && segs.includes('b')); vt(w - t, m, h - t / 2, on && segs.includes('c'));
    vt(0, t / 2, m, on && segs.includes('f')); vt(0, m, h - t / 2, on && segs.includes('e'));
    g.beginPath(); g.arc(x + w + t * 0.55, y + h - t / 2, t * 0.5, 0, Math.PI * 2); g.fillStyle = dp && on ? '#ff2a1a' : 'rgba(110,10,10,0.35)'; g.fill();
  }

  // ===========================================================================
  class Bench3D {
    constructor(container, opts = {}) {
      this.el = container; this.onAction = opts.onAction || (() => { });
      this.clickables = []; this.hover = null; this.angleShown = 0;
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
      this.renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
      this.renderer.outputEncoding = T.sRGBEncoding;
      this.renderer.shadowMap.enabled = !opts.lowPower;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      container.appendChild(this.renderer.domElement);
      this.scene = new T.Scene();
      this.scene.background = new T.Color(0x2b3238);
      this.scene.fog = new T.Fog(0x2b3238, 2.2, 5);
      this.camera = new T.PerspectiveCamera(38, 1, 0.01, 20);
      this.orbit = { target: new T.Vector3(0, 0.30, -0.05), r: 1.75, th: 0.18, ph: 1.28 };
      this.lights(); this.build();
      // reflexos do ambiente só nos metais (plásticos e pintura ficam com a iluminação direta)
      if (this.envMap) this.scene.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && m.isMeshStandardMaterial && m.metalness >= 0.4 && !m.envMap) { m.envMap = this.envMap; m.envMapIntensity = 0.9; m.needsUpdate = true; } }); });
      this.bindInput(); this.resize();
      global.addEventListener('resize', () => this.resize());
      this.tooltip = document.createElement('div'); this.tooltip.className = 'tip3d'; container.appendChild(this.tooltip);
      this.loop = this.loop.bind(this); requestAnimationFrame(this.loop);
    }

    lights() {
      // mapa de ambiente (reflexos realistas nos metais): "sala" com painéis de luz
      try {
        const pm = new T.PMREMGenerator(this.renderer), env = new T.Scene();
        env.background = new T.Color(0x4a5056);
        const panel = (w, h, pos, rot, c) => { const p = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide })); p.position.set(...pos); p.rotation.set(...rot); env.add(p); };
        panel(6, 2, [0, 4, 0], [Math.PI / 2, 0, 0], new T.Color(2.2, 2.2, 2.15));
        panel(3, 2, [-4, 1.5, 1], [0, Math.PI / 2, 0], new T.Color(1.6, 1.7, 1.9));
        panel(3, 2, [4, 1.2, -1], [0, -Math.PI / 2, 0], new T.Color(1.2, 1.2, 1.25));
        panel(8, 8, [0, -2, 0], [-Math.PI / 2, 0, 0], new T.Color(0.18, 0.19, 0.2));
        this.envMap = pm.fromScene(env, 0.04).texture; pm.dispose();
      } catch (e) { }
      this.scene.add(new T.HemisphereLight(0xdfe8ef, 0x3a3f44, 0.5));
      const k = new T.DirectionalLight(0xffffff, 0.85); k.position.set(1.2, 2.2, 1.6); k.castShadow = true;
      k.shadow.mapSize.set(1024, 1024); Object.assign(k.shadow.camera, { left: -1, right: 1, top: 1, bottom: -0.3, near: 0.5, far: 5 });
      this.scene.add(k);
      const f = new T.DirectionalLight(0xbcd2ff, 0.35); f.position.set(-1.5, 0.8, 1.2); this.scene.add(f);
    }

    // A bancada do motor é montada em coordenadas próprias (eixo em x = 0,10; base centrada em z = -0,085)
    // e depois girada ~29° para a esquerda, de modo que o servomotor fique à vista de quem está na frente.
    rigXf() {
      if (!this._rig) {
        let q = { x: 0.21, z: -0.02, th: 0.45 };
        try { const sv = JSON.parse(localStorage.getItem('sca06-rig') || 'null'); if (sv && isFinite(sv.x) && isFinite(sv.z) && isFinite(sv.th)) q = sv; } catch (_) { }
        this._rig = this.rigFrom(q);
      }
      return this._rig;
    }
    // Q = posição do centro da base na mesa; th = giro em torno do eixo vertical
    rigFrom(q) {
      const P = new T.Vector3(0.10, 0, -0.085), Q = new T.Vector3(q.x, 0, q.z);
      return { th: q.th, q, pos: Q.clone().sub(P.clone().applyAxisAngle(new T.Vector3(0, 1, 0), q.th)) };
    }
    setRig(q, save = true) {
      q = { x: Math.max(-0.53, Math.min(0.53, q.x)), z: Math.max(-0.04, Math.min(0.17, q.z)), th: Math.atan2(Math.sin(q.th), Math.cos(q.th)) };
      this._rig = this.rigFrom(q);
      if (this.rig) { this.rig.rotation.y = q.th; this.rig.position.copy(this._rig.pos); }
      this.updateMotorCables();
      if (save) { try { localStorage.setItem('sca06-rig', JSON.stringify(q)); } catch (_) { } }
    }
    rotateRig(deg) { const q = this.rigXf().q; this.setRig({ x: q.x, z: q.z, th: q.th + deg * Math.PI / 180 }); }
    resetRig() { try { localStorage.removeItem('sca06-rig'); } catch (_) { } this.setRig({ x: 0.21, z: -0.02, th: 0.45 }, false); }
    updateMotorCables() {
      (this.motorCables || []).forEach((c) => {
        const A = c.fixed[c.fixed.length - 1], loc = c.local.map(([x, y, z]) => this.rigPt(x, y, z));
        const B = loc[0], M = A.clone().lerp(B, 0.5); M.y = A.y;
        const pts = c.fixed.concat([M], loc);
        const g = new T.TubeGeometry(new T.CatmullRomCurve3(pts, false, 'centripetal'), c.seg, c.r, 10);
        if (c.mesh.geometry) c.mesh.geometry.dispose(); c.mesh.geometry = g;
      });
    }
    rigPt(x, y, z) { const r = this.rigXf(); return new T.Vector3(x, y, z).applyAxisAngle(new T.Vector3(0, 1, 0), r.th).add(r.pos); }

    addClick(obj, action, label) { obj.traverse(o => { if (o.isMesh) { o.userData.action = action; o.userData.label = label; this.clickables.push(o); } }); }

    // ------------------------------------------------------------------ construção
    build() {
      const S = this.scene;
      const alu = mat(0xb8bec4, { metalness: 0.65, roughness: 0.35 });
      const darkAlu = mat(0x6d747b, { metalness: 0.5, roughness: 0.45 });
      // mesa
      const top = box(1.5, 0.03, 0.7, mat(0x4d5359, { roughness: 0.8 })); top.position.set(0, -0.015, 0.05); top.receiveShadow = true; S.add(top);
      const edge = box(1.5, 0.012, 0.012, alu); edge.position.set(0, -0.006, 0.4); S.add(edge);
      // placa de montagem
      const plate = box(1.4, 0.72, 0.02, mat(0xd5d8d3, { roughness: 0.7 })); plate.position.set(0, 0.36, -0.27); plate.receiveShadow = true; S.add(plate);
      
      // canaleta
      this.buildDuctAndRails();

      this.buildDrive(); this.buildBreaker(); this.buildStack(); this.buildSwitchAndPlc(); this.buildCables();
      this.buildMotorAndDisc(); this.buildButtons();
    }

    // ------------------------------------------------------------------ canaleta e trilhos DIN
    buildDuctAndRails() {
      const S = this.scene;
      // Canaleta recortada 40 × 45 mm, cinza RAL 7030: fundo na placa, paredes superior e inferior
      // com dedos (os cabos saem pelos rasgos) e tampa frontal encaixada.
      const grey = new T.MeshStandardMaterial({ color: 0x86877f, roughness: 0.75, metalness: 0.0 });
      const L = 1.30, X0 = 0, Y0 = 0.685, ZB = -0.26, DZ = 0.045, HY = 0.04;
      const back = box(L, HY, 0.002, mat(0x3c3d3a, { roughness: 0.9 })); back.position.set(X0, Y0, ZB + 0.001); S.add(back);
      const pitch = 0.012, fw = 0.0068, n = Math.floor(L / pitch);
      const finger = new T.BoxGeometry(fw, 0.002, DZ - 0.006);
      const inst = new T.InstancedMesh(finger, grey, n * 2); const m4 = new T.Matrix4(); let k = 0;
      for (const y of [Y0 - HY / 2 + 0.001, Y0 + HY / 2 - 0.001]) for (let i = 0; i < n; i++) { m4.makeTranslation(X0 - L / 2 + pitch / 2 + i * pitch, y, ZB + 0.002 + (DZ - 0.006) / 2); inst.setMatrixAt(k++, m4); }
      inst.castShadow = true; S.add(inst);
      for (const y of [Y0 - HY / 2 + 0.001, Y0 + HY / 2 - 0.001]) { const root = box(L, 0.002, 0.006, grey); root.position.set(X0, y, ZB + 0.005); S.add(root); }
      // tampa: chapa frontal com as abas laterais que prendem nos dedos
      const lidMat = new T.MeshStandardMaterial({ color: 0x8b8c85, roughness: 0.7 });
      const lid = box(L + 0.004, HY - 0.004, 0.0022, lidMat); lid.position.set(X0, Y0, ZB + DZ); lid.castShadow = true; S.add(lid);
      
      const capTex = canvasTex(256, 32, (c, w, h) => { c.fillStyle = '#8b8c85'; c.fillRect(0, 0, w, h); c.fillStyle = '#3d3e3a'; c.font = 'bold 16px Arial'; c.fillText('CANALETA 40×45 · RAL 7030', 10, 22); });
      const lbl = new T.Mesh(new T.PlaneGeometry(0.11, 0.014), new T.MeshStandardMaterial({ map: capTex, roughness: 0.7 })); lbl.position.set(-0.40, Y0, ZB + DZ + 0.0012); S.add(lbl);

      // Trilho DIN TS35 × 7,5 mm (zincado, com rasgos de fixação), perfil "chapéu"
      const zinc = new T.MeshStandardMaterial({ color: 0xc7ccd0, metalness: 0.8, roughness: 0.35 });
      const slots = canvasTex(1024, 64, (c, w, h) => { c.fillStyle = '#c7ccd0'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a2d30'; for (let x = 20; x < w; x += 64) { c.beginPath(); c.roundRect ? c.roundRect(x, h * 0.3, 36, h * 0.4, h * 0.2) : c.rect(x, h * 0.3, 36, h * 0.4); c.fill(); } });
      const rail = (x0, x1, y) => {
        const sh = new T.Shape(); const P = [[-0.0175, 0.0075], [-0.0135, 0.0075], [-0.0135, 0.001], [0.0135, 0.001], [0.0135, 0.0075], [0.0175, 0.0075], [0.0175, 0.0065], [0.0145, 0.0065], [0.0145, 0], [-0.0145, 0], [-0.0145, 0.0065], [-0.0175, 0.0065]];
        P.forEach(([u, v], i) => i ? sh.lineTo(-v, u) : sh.moveTo(-v, u));
        const g = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false }), zinc);
        g.rotation.y = Math.PI / 2; g.position.set(x0, y, ZB + 0.010 - 0.010); S.add(g);
        const tex = slots.clone(); tex.needsUpdate = true; tex.wrapS = T.RepeatWrapping; tex.repeat.set((x1 - x0) / 0.25, 1);
        const web = new T.Mesh(new T.PlaneGeometry(x1 - x0, 0.026), new T.MeshStandardMaterial({ map: tex, metalness: 0.7, roughness: 0.4 })); web.position.set((x0 + x1) / 2, y, ZB + 0.0012); S.add(web);
        for (const sx of [x0 + 0.012, x1 - 0.012]) { const sc = cyl(0.0032, 0.0032, 0.002, mat(0x55595e, { metalness: 0.7 }), 12); sc.rotation.x = Math.PI / 2; sc.position.set(sx, y, ZB + 0.0022); S.add(sc); }
      };
      const stop = (x, y) => { const e = box(0.009, 0.045, 0.036, mat(0x7c8085, { roughness: 0.6 })); e.position.set(x, y, ZB + 0.0075 + 0.018); S.add(e); const sc = cyl(0.0022, 0.0022, 0.003, mat(0x2a2d31, { metalness: 0.6 }), 10); sc.rotation.x = Math.PI / 2; sc.position.set(x, y + 0.012, ZB + 0.044); S.add(sc); };
      // trilho do disjuntor + bornes de passagem
      rail(-0.67, -0.47, 0.55); stop(-0.6245, 0.55); stop(-0.495, 0.55);
      for (let i = 0; i < 7; i++) {
        const pe = i === 6, tb = new T.Group();
        const body = box(0.0062, 0.05, 0.034, mat(pe ? 0x3f9a4a : 0x8f9599, { roughness: 0.55 })); tb.add(body);
        if (pe) { const st = box(0.0063, 0.05, 0.012, mat(0xe3c51c)); st.position.z = 0.004; tb.add(st); }
        for (const sy of [-1, 1]) { const sc = cyl(0.0019, 0.0019, 0.002, mat(0x9ea3a8, { metalness: 0.8 }), 8); sc.rotation.x = Math.PI / 2; sc.position.set(0, sy * 0.016, 0.0172); tb.add(sc); }
        tb.position.set(-0.575 + i * 0.0064, 0.55, ZB + 0.0075 + 0.017); S.add(tb);
      }
      // trilho do switch e do CLP
      rail(0.05, 0.53, 0.47); stop(0.089, 0.47); stop(0.151, 0.47); stop(0.313, 0.47); stop(0.487, 0.47);
    }

    // ------------------------------------------------------------------ SCA06
    buildDrive() {
      // O frontal usa o MESMO desenho da vista 2D (drive2d.js) como textura; display, LEDs,
      // teclas, ECO5 e cabo são peças 3D por cima, nas mesmas coordenadas do desenho.
      const g = new T.Group(); this.drive = g;
      const S = 0.1 / 146;                                   // m por unidade do desenho (corpo = 146 un. = 100 mm)
      const W = 0.1, H = 398 * S, D = 0.2, FZ = D / 2;
      const P2 = (x, y) => [(x - 103) * S, (249 - y) * S];   // desenho (x, y) → local (X, Y)
      const svgTex = (vb, w, h, o = {}) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const t = new T.CanvasTexture(c); t.anisotropy = 8; t.encoding = T.sRGBEncoding;
        if (global.Drive2D) {
          const img = new Image();
          img.onload = () => { c.getContext('2d').drawImage(img, 0, 0, w, h); t.needsUpdate = true; };
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(global.Drive2D.svg(Object.assign({ viewBox: vb, still: true, width: w, height: h }, o)));
        }
        return t;
      };
      const navy = mat(0x1f3a6e, { roughness: 0.45, metalness: 0.15 });
      const body = box(W, H, D, navy); body.castShadow = true; g.add(body);
      // aletas do dissipador na lateral esquerda
      for (let i = 0; i < 11; i++) { const fin = box(0.014, H * 0.9, 0.003, mat(0x9aa3ab, { metalness: 0.6, roughness: 0.4 })); fin.position.set(-W / 2 - 0.007, 0, -D * 0.45 + i * 0.016); g.add(fin); }
      // frente: textura do desenho (recorte do corpo: x 30…176, y 50…448)
      const front = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshStandardMaterial({ map: svgTex('30 50 146 398', 584, 1592), roughness: 0.6 }));
      front.position.set(0, 0, FZ + 0.0006); g.add(front);
      // placa de montagem (atrás) e suporte inferior com aterramento
      const plate = box(150 * S, 512 * S, 0.003, mat(0xf3f4f6, { roughness: 0.6 })); const pc = P2(103, 284); plate.position.set(pc[0], pc[1], -D / 2 - 0.002); g.add(plate);
      const brk = new T.Mesh(new T.PlaneGeometry(150 * S, 92 * S), new T.MeshStandardMaterial({ map: svgTex('28 448 150 92', 600, 368), roughness: 0.6 }));
      const bc = P2(103, 494); brk.position.set(bc[0], bc[1], -D / 2 + 0.0002); g.add(brk);
      // tampa da potência (X9) no topo, com borne verde e advertência de superfície quente
      const top = new T.Mesh(new T.BoxGeometry(98 * S, 46 * S, 0.12), [mat(0xc8d4e6), mat(0xc8d4e6), mat(0xc8d4e6), mat(0xc8d4e6), new T.MeshStandardMaterial({ map: svgTex('46 4 98 46', 392, 184), roughness: 0.6 }), mat(0xc8d4e6)]);
      const tc = P2(95, 27); top.position.set(tc[0], tc[1], FZ - 0.06 + 0.0005); g.add(top);
      const hotT = new T.Mesh(new T.PlaneGeometry(22 * S, 22 * S), new T.MeshBasicMaterial({ map: svgTex('29 34 22 22', 128, 128), transparent: true }));
      const hc = P2(40, 45); hotT.position.set(hc[0], hc[1], FZ + 0.001); g.add(hotT);
      // conectores inferiores X5 (azul) e X4 (verde)
      const x5 = box(22 * S, 15 * S, 0.016, mat(0x26282c, { roughness: 0.5 })); const x5c = P2(75, 455.5); x5.position.set(x5c[0], x5c[1], FZ - 0.006); g.add(x5);
      const x4 = box(44 * S, 13 * S, 0.016, mat(0x26282c, { roughness: 0.5 })); const x4c = P2(126, 454.5); x4.position.set(x4c[0], x4c[1], FZ - 0.006); g.add(x4);
      const hotB = hotT.clone(); const hb = P2(44, 457); hotB.position.set(hb[0], hb[1], FZ - 0.004); g.add(hotB);

      // ---- módulo ECO5 no slot 2 (peça removível)  [ETH Figura 3.1 / PROG P00092]
      const eco = new T.Group(); this.eco = eco;
      const ecoFace = new T.Mesh(new T.BoxGeometry(106 * S, 98 * S, 0.012), [mat(0xe8eaee), mat(0xe8eaee), mat(0xe8eaee), mat(0xe8eaee), new T.MeshStandardMaterial({ map: svgTex('34 152 106 98', 424, 392), roughness: 0.55 }), mat(0xe8eaee)]);
      eco.add(ecoFace);
      const ec = P2(87, 201); this.ecoZ = FZ + 0.006; eco.position.set(ec[0], ec[1], this.ecoZ); g.add(eco);
      this.addClick(ecoFace, 'bench:accessorySeated', 'Acessório ECO5 no slot 2 (clique para desencaixar/encaixar)');
      const onEco = (x, y) => { const p = P2(x, y); return [p[0] - ec[0], p[1] - ec[1], 0.0065]; };
      this.linkLeds = []; this.ports = [];
      [63, 109].forEach((cx) => {
        const la = box(5 * S, 2.6 * S, 0.001, new T.MeshBasicMaterial({ color: 0x0c2a10 })); la.position.set(...onEco(cx - 13.5, 161.3));
        const lb = box(5 * S, 2.6 * S, 0.001, new T.MeshBasicMaterial({ color: 0x2a2008 })); lb.position.set(...onEco(cx + 11.5, 161.3));
        eco.add(la, lb); this.linkLeds.push([la, lb]);
        const hole = new T.Object3D(); hole.position.set(...onEco(cx, 174)); eco.add(hole); this.ports.push(hole);
      });
      this.nsLed = new T.Mesh(new T.CircleGeometry(2.6 * S, 16), new T.MeshBasicMaterial({ color: 0x222222 })); this.nsLed.position.set(...onEco(87, 198)); eco.add(this.nsLed);

      // ---- HMI: display, LEDs, teclas e Reset nas posições do desenho
      this.dispTex = canvasTex(512, 160, () => { });
      const disp = new T.Mesh(new T.PlaneGeometry(106 * S, 32 * S), new T.MeshBasicMaterial({ map: this.dispTex }));
      const dc = P2(87, 390); disp.position.set(dc[0], dc[1], FZ + 0.0012); g.add(disp);
      this.hmiLeds = {};
      [['usb', 252, 0xd8b100], ['power', 263, 0x23c552], ['fault', 277, 0xff2a1a]].forEach(([k, y, col]) => {
        const l = new T.Mesh(new T.CircleGeometry(3 * S, 14), new T.MeshBasicMaterial({ color: 0x4a4d55 })); const lp = P2(151, y);
        l.position.set(lp[0], lp[1], FZ + 0.0012); l.userData.on = col; g.add(l); this.hmiLeds[k] = l;
      });
      const reset = cyl(3.6 * S, 3.6 * S, 0.002, mat(0x111111)); reset.rotation.x = Math.PI / 2; const rp = P2(151, 291); reset.position.set(rp[0], rp[1], FZ + 0.001); g.add(reset);
      this.addClick(reset, 'hmi:reset', 'Tecla Reset (reinicializa o controle)');
      const glyphTex = (k) => canvasTex(128, 128, (c, w) => {
        c.fillStyle = '#3a6fc6'; c.beginPath(); c.arc(64, 64, 64, 0, 7); c.fill(); c.fillStyle = '#fff'; c.strokeStyle = '#fff';
        if (k === 'prog') { c.font = 'bold 76px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('P', 64, 68); }
        else { c.beginPath(); const tri = { up: [[30, 84], [64, 36], [98, 84]], down: [[30, 44], [64, 92], [98, 44]], shift: [[90, 30], [36, 64], [90, 98]] }[k]; tri.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.fill(); }
      });
      [['up', 150, 362], ['prog', 166.5, 362], ['down', 150, 386], ['shift', 166.5, 386]].forEach(([k, x, y]) => {
        const key = new T.Group(); const kp = P2(x, y);
        const rim = cyl(7.4 * S, 7.4 * S, 0.003, mat(0x1d3f7c)); rim.rotation.x = Math.PI / 2; key.add(rim);
        const cap = new T.Mesh(new T.CircleGeometry(6.9 * S, 32), new T.MeshStandardMaterial({ map: glyphTex(k), roughness: 0.45 })); cap.position.z = 0.0016; key.add(cap);
        key.position.set(kp[0], kp[1], FZ + 0.0015); g.add(key);
        this.addClick(key, 'hmi:' + k, { up: 'Tecla incrementa (▲)', down: 'Tecla decrementa (▼)', prog: 'Tecla PROG (P)', shift: 'Tecla SHIFT (◄)' }[k]);
        key.traverse(o => { if (o.isMesh) { o.userData.isKey = true; o.userData.keyGroup = key; } });
      });

      g.position.set(-0.43, 0.38, -0.26 + D / 2 + 0.002); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(g);
      g.updateMatrixWorld(true);
      this.cablePlugPos = this.ports[0].getWorldPosition(new T.Vector3());
    }

    buildBreaker() {
      const g = new T.Group();
      // disjuntor modular 2 polos (2 × 18 mm), perfil escalonado: base 90 mm e frente elevada de 45 mm
      const wm = mat(0xdedfdc, { roughness: 0.55 });
      const b = box(0.036, 0.088, 0.052, wm); b.position.z = -0.009; g.add(b);
      const front = box(0.036, 0.045, 0.018, wm); front.position.z = 0.026; g.add(front);
      for (const sy of [-1, 1]) { const term = box(0.034, 0.012, 0.003, mat(0x3a3c40)); term.position.set(0, sy * 0.034, 0.0175); g.add(term);
        for (const sx of [-0.009, 0.009]) { const sc = cyl(0.0028, 0.0028, 0.002, mat(0x9ea3a8, { metalness: 0.8 }), 10); sc.rotation.x = Math.PI / 2; sc.position.set(sx, sy * 0.034, 0.0195); g.add(sc); } }
      const lbl = new T.Mesh(new T.PlaneGeometry(0.03, 0.012), new T.MeshBasicMaterial({ map: canvasTex(160, 64, (c, w, h) => { c.fillStyle = '#dedfdc'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = 'bold 26px Arial'; c.textAlign = 'center'; c.fillText('C16', w / 2, 28); c.font = '18px Arial'; c.fillText('2P  230 V~', w / 2, 54); }) }));
      lbl.position.set(0, -0.016, 0.0352); g.add(lbl);
      this.breakerLever = box(0.03, 0.012, 0.012, mat(0x2c6cc4, { roughness: 0.4 })); this.breakerLever.position.set(0, 0.012, 0.04); g.add(this.breakerLever);
      const slot = box(0.032, 0.026, 0.001, mat(0x1d1e20)); slot.position.set(0, 0.006, 0.0352); g.add(slot);
      const win = box(0.008, 0.005, 0.001, mat(0xd23a2e)); win.position.set(0.011, -0.004, 0.0356); g.add(win); this.breakerFlag = win;
      g.position.set(-0.60, 0.55, -0.2165); this.scene.add(g);
      this.addClick(g, 'bench:power', 'Disjuntor de potência (Link DC)');
    }

    buildStack() {
      const g = new T.Group(); this.stack = {};
      const base = cyl(0.012, 0.012, 0.03, mat(0x333333)); g.add(base);
      [['green', 0x2e9e4f], ['amber', 0xe8a317], ['red', 0xd23a2e]].forEach(([k, col], i) => {
        const m = new T.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.55, emissive: col, emissiveIntensity: 0.05, roughness: 0.3 });
        const c = cyl(0.012, 0.012, 0.022, m); c.position.y = 0.028 + i * 0.024; g.add(c); this.stack[k] = m;
      });
      // torre luminosa no topo do painel, presa num suporte na borda superior da placa
      const foot = box(0.05, 0.004, 0.05, mat(0x5d6368, { metalness: 0.4 })); foot.position.y = -0.017; g.add(foot);
      g.position.set(0.56, 0.739, -0.26); this.scene.add(g);
    }

    buildSwitchAndPlc() {
      // switch industrial genérico 5 portas
      const sw = new T.Group();
      sw.add(box(0.05, 0.12, 0.09, mat(0x30353a)));
      this.swPortLeds = [];
      for (let i = 0; i < 5; i++) {
        const p = box(0.018, 0.014, 0.004, mat(0x111111)); p.position.set(0.0, 0.04 - i * 0.02, 0.046); sw.add(p);
        const l = box(0.004, 0.003, 0.002, new T.MeshBasicMaterial({ color: 0x0c2a10 })); l.position.set(0.014, 0.046 - i * 0.02, 0.047); sw.add(l); this.swPortLeds.push(l);
      }
      sw.position.set(0.12, 0.47, -0.21); this.scene.add(sw); this.switchPos = sw.position;
      // CLP genérico (scanner EtherNet/IP)
      const plc = new T.Group();
      plc.add(box(0.16, 0.11, 0.09, mat(0xc9ccd0)));
      const face = new T.Mesh(new T.PlaneGeometry(0.15, 0.1), new T.MeshBasicMaterial({ map: canvasTex(480, 320, (c, w, h) => {
        c.fillStyle = '#c9ccd0'; c.fillRect(0, 0, w, h); c.fillStyle = '#2f3438'; c.fillRect(0, 0, 150, h);
        c.fillStyle = '#e8eaec'; c.font = 'bold 30px Arial'; c.fillText('CLP', 30, 60); c.font = '20px Arial'; c.fillText('Scanner', 22, 96); c.fillText('EtherNet/IP', 14, 124);
        c.fillStyle = '#111'; c.font = '22px Arial'; for (let i = 0; i < 8; i++) { c.fillStyle = '#7a8086'; c.fillRect(180 + (i % 4) * 70, 40 + Math.floor(i / 4) * 120, 54, 90); }
      }) }));
      face.position.z = 0.0455; plc.add(face);
      this.plcLed = new T.Mesh(new T.CircleGeometry(0.004, 12), new T.MeshBasicMaterial({ color: 0x222222 })); this.plcLed.position.set(-0.058, -0.03, 0.046); plc.add(this.plcLed);
      plc.position.set(0.40, 0.47, -0.21); this.scene.add(plc);
      this.addClick(plc, 'tab:scanner', 'CLP / scanner (abre o painel do mestre)');
    }

    buildCables() {
      const tube = (pts, r, m, seg = 80) => { const t = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, false, 'centripetal'), seg, r, 10), m); t.castShadow = r > 0.004; this.scene.add(t); return t; };
      const V = (x, y, z) => new T.Vector3(x, y, z);
      // ---- canaleta superior (cinza, com rasgos), por onde passam os cabos de rede
      const slots = canvasTex(1024, 64, (c, w, h) => { c.fillStyle = '#9ea4a9'; c.fillRect(0, 0, w, h); c.fillStyle = '#5d6368'; for (let x = 4; x < w; x += 9) c.fillRect(x, 0, 4, h * 0.78); c.fillStyle = '#b4b9bd'; c.fillRect(0, h * 0.82, w, h * 0.18); });
      slots.wrapS = T.RepeatWrapping; slots.repeat.set(3, 1);
      // ---- cabos de rede: porta XA171 → canaleta → switch; CLP → canaleta → switch
      const blue = mat(0x2d7fd0, { roughness: 0.6 }); this.cableMat = blue;
      const p0 = this.cablePlugPos.clone().add(V(0, 0, 0.012));
      this.cable1 = tube([p0, p0.clone().add(V(0, 0, 0.035)), V(p0.x - 0.012, p0.y + 0.05, p0.z + 0.03), V(-0.474, 0.56, -0.03), V(-0.476, 0.60, -0.12), V(-0.47, 0.645, -0.225), V(-0.466, 0.668, -0.238), V(-0.465, 0.69, -0.242)], 0.0035, blue);
      this.cable1b = tube([V(0.098, 0.69, -0.242), V(0.099, 0.668, -0.238), V(0.10, 0.645, -0.225), V(0.112, 0.60, -0.14), V(0.12, 0.54, -0.122), V(0.12, 0.512, -0.13), V(0.12, 0.51, -0.158)], 0.0035, blue);
      const rjBoot = (pos) => { const b = box(0.014, 0.012, 0.022, new T.MeshStandardMaterial({ color: 0x7fb6ea, transparent: true, opacity: 0.9, roughness: 0.3 })); b.position.copy(pos); this.scene.add(b); };
      rjBoot(V(0.12, 0.51, -0.153));
      this.plug = box(0.018, 0.016, 0.03, new T.MeshStandardMaterial({ color: 0xb8d8f8, transparent: true, opacity: 0.85, roughness: 0.2 }));
      this.plug.position.copy(p0).add(V(0, 0, 0.012)); this.scene.add(this.plug);
      this.addClick(this.cable1, 'bench:cablePlugged', 'Cabo Ethernet na porta XA171 (clique para desconectar)');
      this.addClick(this.plug, 'bench:cablePlugged', 'Conector RJ45 em XA171 (clique para desconectar)');
      const loose = V(-0.505, 0.35, 0.012);
      this.cable1u = tube([V(-0.465, 0.69, -0.242), V(-0.466, 0.668, -0.238), V(-0.47, 0.645, -0.215), V(-0.476, 0.62, -0.16), V(-0.488, 0.58, -0.06), V(-0.50, 0.46, -0.01), V(-0.505, 0.38, 0.008), loose], 0.0035, blue, 50); this.cable1u.visible = false;
      this.plugLoose = box(0.018, 0.03, 0.016, new T.MeshStandardMaterial({ color: 0xb8d8f8, transparent: true, opacity: 0.85, roughness: 0.2 })); this.plugLoose.position.copy(loose).add(V(0, -0.016, 0)); this.plugLoose.visible = false; this.scene.add(this.plugLoose);
      this.addClick(this.cable1u, 'bench:cablePlugged', 'Cabo Ethernet desconectado (clique para reconectar em XA171)');
      this.addClick(this.plugLoose, 'bench:cablePlugged', 'Conector RJ45 solto (clique para reconectar em XA171)');
      const green = mat(0x2e9e4f, { roughness: 0.6 });
      tube([V(0.34, 0.44, -0.158), V(0.34, 0.44, -0.135), V(0.312, 0.465, -0.13), V(0.302, 0.56, -0.17), V(0.30, 0.64, -0.225), V(0.299, 0.668, -0.238), V(0.298, 0.69, -0.242)], 0.0035, green, 50);
      tube([V(0.142, 0.69, -0.242), V(0.143, 0.668, -0.238), V(0.144, 0.645, -0.225), V(0.146, 0.58, -0.135), V(0.135, 0.495, -0.124), V(0.12, 0.49, -0.13), V(0.12, 0.49, -0.158)], 0.0035, green, 50);
      rjBoot(V(0.12, 0.49, -0.153)); rjBoot(V(0.34, 0.44, -0.153));

      // ---- cabos do servomotor (cinza, como os cabos originais): resolver com DB9 em X2 e
      //      potência com terminais em X9; no motor, conectores circulares (ver buildMotorAndDisc)
      const grey = new T.MeshStandardMaterial({ color: 0x7e868c, roughness: 0.62, metalness: 0.05 });
      const metal = new T.MeshStandardMaterial({ color: 0xb9bec4, metalness: 0.9, roughness: 0.28 });
      const S = 0.1 / 146, DX = -0.43, DY = 0.38, FZ = -0.058;          // frente do drive em z = -0,058
      const P = (x, y) => [DX + (x - 103) * S, DY + (249 - y) * S];
      // DB9 macho com capa metálica e parafusos, encaixado em X2
      const [x2x, x2y] = P(158, 172);
      const hood = new T.Group();
      const hb = box(0.019, 0.036, 0.016, metal); hb.position.z = 0.008; hood.add(hb);
      const hs = box(0.022, 0.03, 0.003, metal); hs.position.z = 0.0015; hood.add(hs);
      for (const sy of [-1, 1]) { const sc = cyl(0.0022, 0.0022, 0.012, metal, 12); sc.rotation.x = Math.PI / 2; sc.position.set(0, sy * 0.0205, 0.009); hood.add(sc); const kn = cyl(0.0032, 0.0032, 0.004, metal, 14); kn.rotation.x = Math.PI / 2; kn.position.set(0, sy * 0.0205, 0.016); hood.add(kn); }
      const strain = cyl(0.0058, 0.0048, 0.012, grey, 16); strain.position.set(0, -0.022, 0.009); hood.add(strain);
      hood.position.set(x2x, x2y, FZ); this.scene.add(hood);
      const rsA = V(x2x, x2y - 0.028, FZ + 0.009);
      const sideX = DX + 0.062, sideZ = FZ - 0.03;                        // descida pela lateral direita do drive
      const route = (start, dz) => [start, start.clone().add(V(0.004, -0.008, 0.006)), V(x2x + 0.016, start.y - 0.014, FZ + 0.014), V(sideX - 0.004, start.y - 0.02, FZ + 0.0), V(sideX + 0.002, start.y - 0.07, sideZ + dz), V(sideX + 0.002, 0.16, sideZ + dz), V(sideX - 0.004, 0.04, sideZ + dz + 0.01), V(sideX + 0.04, 0.008, sideZ + dz + 0.02),
        V(-0.13, 0.007, -0.10 + dz), V(0.01, 0.007, -0.228 + dz)];
      this.motorCables = [];
      const rsFixed = route(rsA, 0).slice(0, -2);
      const rsMesh = new T.Mesh(undefined, grey); rsMesh.castShadow = true; this.scene.add(rsMesh);
      this.motorCables.push({ mesh: rsMesh, r: 0.0042, seg: 120, fixed: rsFixed, local: [[-0.12, 0.007, -0.32], [0.075, 0.007, -0.29], [0.075, 0.10, -0.285], [0.075, 0.26, -0.265], [0.076, 0.36, -0.21], [0.078, 0.355, -0.163], [0.078, 0.322, -0.161]] });
      // alimentação da potência (X9, borne preto no topo): L1, L2, L3 + PE, cabo preto subindo para a canaleta
      const wires = [[62, 0x1a1a1a], [74.5, 0x1a1a1a], [87, 0x1a1a1a], [99.5, 0x3aa14a]];
      const jx = DX + 0.046, jy = DY + 0.151;                             // capa sobe por cima do corpo, à direita da tampa X9
      const jacket0 = V(jx, jy, FZ + 0.004);
      wires.forEach(([wx, col], i) => {
        const [tx, ty] = P(wx, 36);
        const wm = col === 0x3aa14a ? new T.MeshStandardMaterial({ map: canvasTex(64, 16, (c, w, h) => { for (let x = 0; x < w; x += 16) { c.fillStyle = '#2f9a44'; c.fillRect(x, 0, 8, h); c.fillStyle = '#e3c51c'; c.fillRect(x + 8, 0, 8, h); } }), roughness: 0.5 }) : mat(col, { roughness: 0.5 });
        const ferr = cyl(0.0016, 0.0016, 0.008, metal, 10); ferr.rotation.x = Math.PI / 2; ferr.position.set(tx, ty, FZ + 0.004); this.scene.add(ferr);
        tube([V(tx, ty, FZ + 0.008), V(tx + 0.002, ty - 0.003, FZ + 0.016), V(DX + 0.032, jy - 0.002 + i * 0.0012, FZ + 0.014), jacket0.clone().add(V(-0.006, 0.002 - i * 0.0012, 0.002))], 0.0014, wm, 24);
      });
      const sleeve = cyl(0.0068, 0.0068, 0.012, mat(0x2a2a2a, { roughness: 0.5 }), 16); sleeve.rotation.z = Math.PI / 2; sleeve.position.copy(jacket0).add(V(0.002, 0, 0)); this.scene.add(sleeve);
      tube([jacket0.clone().add(V(0.008, 0, 0)), V(jx + 0.016, jy + 0.012, FZ - 0.01), V(jx + 0.014, 0.59, -0.12), V(jx + 0.01, 0.645, -0.225), V(jx + 0.009, 0.668, -0.238), V(jx + 0.008, 0.69, -0.242)], 0.0058, mat(0x26272a, { roughness: 0.6 }), 60);
      // cabo de potência do motor: sai do conector X8, embaixo do drive (Fig. 3.2 do manual)
      const x8 = new T.Group();
      const x8b = box(0.032, 0.014, 0.022, mat(0x26282c, { roughness: 0.5 })); x8.add(x8b);
      const x8p = box(0.03, 0.016, 0.02, mat(0x1b1c1f, { roughness: 0.55 })); x8p.position.y = -0.015; x8.add(x8p);
      for (const sx of [-1, 1]) { const sc = cyl(0.0018, 0.0018, 0.004, metal, 8); sc.position.set(sx * 0.012, -0.024, 0); x8.add(sc); }
      const x8s = cyl(0.0075, 0.0062, 0.014, mat(0x1b1c1f), 16); x8s.position.y = -0.03; x8.add(x8s);
      const X8 = V(DX + 0.018, DY - 0.1363 - 0.007, FZ - 0.11); x8.position.copy(X8); this.scene.add(x8);
      const pwMesh = new T.Mesh(undefined, grey); pwMesh.castShadow = true; this.scene.add(pwMesh);
      this.motorCables.push({ mesh: pwMesh, r: 0.0062, seg: 140,
        fixed: [X8.clone().add(V(0, -0.036, 0)), X8.clone().add(V(0, -0.06, 0.002)), V(X8.x + 0.01, 0.12, X8.z + 0.03), V(X8.x + 0.03, 0.03, X8.z + 0.06), V(X8.x + 0.06, 0.009, X8.z + 0.08)],
        local: [[-0.11, 0.009, -0.30], [0.125, 0.009, -0.29], [0.125, 0.10, -0.29], [0.125, 0.27, -0.26], [0.124, 0.37, -0.21], [0.122, 0.36, -0.163], [0.122, 0.322, -0.161]] });
      this.updateMotorCables();
      // braçadeiras prendendo os dois cabos na lateral do drive
      [0.30, 0.20].forEach((y) => { const c = new T.Mesh(new T.TorusGeometry(0.0068, 0.0013, 6, 20), mat(0x111111)); c.rotation.x = Math.PI / 2; c.position.set(sideX + 0.002, y, sideZ); this.scene.add(c); });
    }

    // ------------------------------------------------------------------ motor + disco
    buildMotorAndDisc() {
      // Montagem como numa bancada real: base de alumínio, cantoneira em L com o servomotor
      // flangeado (corpo do motor à vista, atrás da cantoneira), disco graduado no eixo e
      // ponteiro fixo no topo para leitura do ângulo.
      const AXIS_Y = 0.205, CX = 0.10, BZ = 0.006;                  // eixo; frente da cantoneira em z = 0,006
      const realScene = this.scene, rig = new T.Group(); this.scene = rig;   // tudo abaixo vai para o grupo da bancada
      const alu = (c = 0xc9cdd1, r = 0.38) => new T.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: r });
      const darkSteel = new T.MeshStandardMaterial({ color: 0x24272b, metalness: 0.7, roughness: 0.35 });
      const bolt = (parent, x, y, z, r = 0.0042, axis = 'z') => { const h = cyl(r, r, 0.0035, darkSteel, 16); const hx = cyl(r * .45, r * .45, 0.0037, mat(0x0d0e10), 6);
        if (axis === 'z') { h.rotation.x = hx.rotation.x = Math.PI / 2; } h.position.set(x, y, z); hx.position.set(x, y, z); parent.add(h, hx); };
      // ---- base (chapa de alumínio com pés de borracha)
      const base = box(0.30, 0.012, 0.32, alu(0xb3b8bd, 0.5)); base.position.set(CX, 0.010, -0.085); base.castShadow = base.receiveShadow = true; this.scene.add(base);
      for (const [x, z] of [[-.135, .06], [.135, .06], [-.135, -.23], [.135, -.23]]) { const f = cyl(0.01, 0.011, 0.004, mat(0x1a1a1a), 16); f.position.set(CX + x, 0.002, z); this.scene.add(f); bolt(this.scene, CX + x, 0.0165, z, 0.004, 'y'); }
      // ---- cantoneira em L (chapa vertical 160 × 260 × 12 mm) + reforços
      const brk = box(0.16, 0.26, 0.012, alu()); brk.position.set(CX, 0.016 + 0.13, BZ - 0.006); brk.castShadow = brk.receiveShadow = true; this.scene.add(brk);
      for (const sx of [-1, 1]) {
        const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(0.11, 0); sh.lineTo(0, 0.13); sh.lineTo(0, 0);
        const gus = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false }), alu(0xbfc3c8, 0.42));
        gus.rotation.y = Math.PI / 2; gus.position.set(CX + sx * 0.074 - 0.004, 0.016, BZ - 0.012); gus.castShadow = true; this.scene.add(gus);
      }
      for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; bolt(this.scene, CX + Math.cos(a) * 0.058, AXIS_Y + Math.sin(a) * 0.058, BZ + 0.0015); }
      const etq = new T.Mesh(new T.PlaneGeometry(0.11, 0.022), new T.MeshStandardMaterial({ map: canvasTex(512, 104, (c, w, h) => { c.fillStyle = '#1f3a6e'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 40px Arial'; c.textAlign = 'center'; c.fillText('EIXO 1 · SERVO', w / 2, 50); c.font = '26px Arial'; c.fillText('+ horário  ·  P0050 = ângulo', w / 2, 88); }), roughness: 0.5 }));
      etq.position.set(CX - 0.085, 0.0168, 0.058); etq.rotation.x = -Math.PI / 2; this.scene.add(etq);

      // ---- servomotor do SCA06 (foto de referência): flange quadrado preto, carcaça preta com
      //      ranhuras longitudinais, tampa traseira laranja e dois conectores circulares metálicos no topo
      const m = new T.Group(); this.motor = m;
      const black = new T.MeshStandardMaterial({ color: 0x17181a, roughness: 0.42, metalness: 0.25 });
      const rr = (w, r) => { const s = new T.Shape(), h = w / 2; s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r); s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h); s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r); s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h); return s; };
      const ext = (shape, d, mt, z, bev = 0.002) => { const g = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 10 }), mt); g.position.z = z; m.add(g); return g; };
      const fl = new T.Shape(); { const h = 0.059, c = 0.012; fl.moveTo(-h + c, -h); fl.lineTo(h - c, -h); fl.lineTo(h, -h + c); fl.lineTo(h, h - c); fl.lineTo(h - c, h); fl.lineTo(-h + c, h); fl.lineTo(-h, h - c); fl.lineTo(-h, -h + c); fl.lineTo(-h + c, -h); }
      ext(fl, 0.016, new T.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.4, metalness: 0.3 }), -0.021, 0.0012);           // flange quadrado chanfrado
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const sc = cyl(0.0042, 0.0042, 0.004, new T.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.7, roughness: 0.35 }), 16); sc.rotation.x = Math.PI / 2; sc.position.set(sx * 0.047, sy * 0.047, -0.0235); m.add(sc); }
      ext(rr(0.104, 0.009), 0.152, black, -0.175, 0.0015);                                                                           // carcaça
      const rib = new T.MeshStandardMaterial({ color: 0x0f1011, roughness: 0.5, metalness: 0.2 });
      [-0.041, -0.034, -0.027, 0.027, 0.034, 0.041].forEach((y) => { for (const sx of [-1, 1]) { const r = box(0.002, 0.003, 0.148, rib); r.position.set(sx * 0.0528, y, -0.099); m.add(r); } });
      [-0.041, -0.034, 0.034, 0.041].forEach((x) => { for (const sy of [-1, 1]) { const r = box(0.003, 0.002, 0.148, rib); r.position.set(x, sy * 0.0528, -0.099); m.add(r); } });
      const orange = new T.MeshStandardMaterial({ color: 0xe8661a, roughness: 0.45, metalness: 0.1 });
      ext(rr(0.110, 0.016), 0.028, orange, -0.209, 0.004);                                                                           // tampa traseira laranja
      const plateTex = canvasTex(400, 200, (c, w, h) => { c.fillStyle = '#2b2d30'; c.fillRect(0, 0, w, h); c.strokeStyle = '#8a8f95'; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8); c.fillStyle = '#d7dade'; c.font = 'bold 30px Arial'; c.fillText('SERVOMOTOR', 18, 42); c.font = '22px Arial'; c.fillText('In 8,5 A    nN 3000 rpm', 18, 82); c.fillText('kt 0,718 N·m/A', 18, 114); c.fillText('J 0,497 g·m²   IP65', 18, 146); c.fillText('Realim.: resolver', 18, 178); });
      const np = new T.Mesh(new T.PlaneGeometry(0.064, 0.032), new T.MeshStandardMaterial({ map: plateTex, metalness: 0.5, roughness: 0.35 }));
      np.position.set(0.0535, 0, -0.10); np.rotation.y = Math.PI / 2; m.add(np);
      // conectores circulares: receptáculo metálico com flange quadrado no motor + plugue preto do cabo
      const knurl = canvasTex(256, 32, (c, w, h) => { c.fillStyle = '#1b1c1e'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a3c40'; for (let x = 0; x < w; x += 6) c.fillRect(x, 0, 2, h); });
      knurl.wrapS = T.RepeatWrapping; knurl.repeat.set(2, 1);
      const steel = new T.MeshStandardMaterial({ color: 0x8e949a, metalness: 0.85, roughness: 0.3 });
      const conn = (x, z, r) => { const g = new T.Group();
        const bse = box(r * 2.4, 0.004, r * 2.4, steel); bse.position.y = 0.002; g.add(bse);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const sc = cyl(0.0012, 0.0012, 0.0015, mat(0x2a2c30), 8); sc.position.set(sx * r * 0.95, 0.0045, sz * r * 0.95); g.add(sc); }
        const rec = cyl(r * 1.02, r * 1.02, 0.012, steel, 28); rec.position.y = 0.010; g.add(rec);
        const nut = cyl(r * 1.2, r * 1.2, 0.014, new T.MeshStandardMaterial({ map: knurl, color: 0xffffff, metalness: 0.15, roughness: 0.55 }), 36); nut.position.y = 0.023; g.add(nut);
        const body = cyl(r * 1.06, r * 0.95, 0.016, new T.MeshStandardMaterial({ color: 0x1e1f21, metalness: 0.35, roughness: 0.4 }), 24); body.position.y = 0.038; g.add(body);
        const boot = cyl(r * 0.78, r * 0.62, 0.02, mat(0x18191b, { roughness: 0.7 }), 16); boot.position.y = 0.055; g.add(boot);
        g.position.set(x, 0.052, z); m.add(g); };
      conn(0.022, -0.155, 0.0125); conn(-0.022, -0.155, 0.0095);                                                                    // potência | resolver
      const shaft = cyl(0.007, 0.007, 0.034, new T.MeshStandardMaterial({ color: 0xdfe3e7, metalness: 0.95, roughness: 0.16 })); shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.012; m.add(shaft);
      m.position.set(CX, AXIS_Y, BZ - 0.012); m.traverse(o => { if (o.isMesh) o.castShadow = true; }); this.scene.add(m);
      this.addClick(m, 'tab:params', 'Servomotor do SCA06 (P0401 8,5 A · P0402 3000 rpm · P0417 kt 0,718)');
      // apoio traseiro do motor (berço)
      const cradle = box(0.09, AXIS_Y - 0.05 - 0.016, 0.03, alu(0xb9bdc2, 0.45)); cradle.position.set(CX, 0.016 + (AXIS_Y - 0.066) / 2, -0.16); cradle.castShadow = true; this.scene.add(cradle);
      const strap = new T.Mesh(new T.TorusGeometry(0.0525, 0.003, 6, 40, Math.PI), darkSteel); strap.position.set(CX, AXIS_Y, -0.16); this.scene.add(strap);
      // ---- ponteiro fixo (coluna lateral + braço sobre o disco, agulha vermelha às 12 h)
      const DZ = 0.032;                                                         // plano do disco (frente)
      const post = box(0.012, 0.36 - 0.016, 0.012, alu(0xb9bdc2, 0.4)); post.position.set(CX + 0.142, 0.016 + (0.36 - 0.016) / 2, DZ + 0.004); post.castShadow = true; this.scene.add(post);
      const arm = box(0.148, 0.012, 0.008, alu(0xc9cdd1, 0.35)); arm.position.set(CX + 0.071, 0.354, DZ + 0.010); arm.castShadow = true; this.scene.add(arm);
      const ns = new T.Shape(); ns.moveTo(-0.006, 0); ns.lineTo(0.006, 0); ns.lineTo(0.0009, -0.0275); ns.lineTo(0, -0.0305); ns.lineTo(-0.0009, -0.0275); ns.lineTo(-0.006, 0);
      const needle = new T.Mesh(new T.ExtrudeGeometry(ns, { depth: 0.0016, bevelEnabled: false }), new T.MeshStandardMaterial({ color: 0xc0261d, metalness: 0.35, roughness: 0.35 }));
      needle.position.set(CX, 0.352, DZ + 0.0062); needle.castShadow = true; this.scene.add(needle);
      bolt(this.scene, CX, 0.354, DZ + 0.0145, 0.003); bolt(this.scene, CX + 0.142, 0.354, DZ + 0.0145, 0.003);

      // ---- arco-alvo das missões (pintado no disco, gira com ele)
      this.targetArc = new T.Mesh(new T.RingGeometry(0.1185, 0.1238, 48, 1, 0, 0.1), new T.MeshBasicMaterial({ color: 0x1fae4a, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }));
      this.targetArc.position.z = 0.0051; this.targetArc.renderOrder = 3; this.targetArc.visible = false;

      // ---- disco usinado e graduado: Ø250 × 4 mm, 5 furos de alívio, escala gravada (leitura no ponteiro fixo)
      const disc = new T.Group(); this.disc = disc;
      const sh = new T.Shape(); sh.absarc(0, 0, 0.125, 0, Math.PI * 2, false);
      const holes = [];
      for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + (i + 0.5) * (2 * Math.PI / 5); holes.push([Math.cos(a) * 0.058, Math.sin(a) * 0.058]); }
      holes.forEach(([x, y]) => { const hp = new T.Path(); hp.absarc(x, y, 0.017, 0, Math.PI * 2, true); sh.holes.push(hp); });
      const bore = new T.Path(); bore.absarc(0, 0, 0.0072, 0, Math.PI * 2, true); sh.holes.push(bore);
      // Escala: o disco gira no sentido horário com ângulo +θ; para o ponteiro fixo ler θ, os números
      // crescem no sentido anti-horário sobre o disco (como num transferidor rotativo).
      const discCanvasDraw = (c, w) => {
        const R = w / 2, px = w / 0.25; c.save(); c.translate(R, R);
        const g = c.createRadialGradient(-R * .35, -R * .35, 10, 0, 0, R * 1.05); g.addColorStop(0, '#e3e6e9'); g.addColorStop(1, '#a9afb5');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
        for (let r = 6; r < R; r += 1.4) { c.strokeStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '30,35,40'},${(Math.random() * .07).toFixed(3)})`; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke(); }
        c.strokeStyle = 'rgba(30,35,40,.5)'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, R - 3, 0, 7); c.stroke();
        c.strokeStyle = '#15181b'; c.fillStyle = '#15181b';
        const P = (ang, r) => [-Math.sin(ang) * r * px, -Math.cos(ang) * r * px];   // valor v no ângulo anti-horário v a partir do topo
        for (let d = 0; d < 360; d++) {
          const ang = d * Math.PI / 180, L = d % 10 === 0 ? 0.016 : d % 5 === 0 ? 0.011 : 0.007;
          c.lineWidth = d % 10 === 0 ? 4 : d % 5 === 0 ? 3 : 1.8;
          const [x0, y0] = P(ang, 0.1205), [x1, y1] = P(ang, 0.1205 - L); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
        }
        c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 0.1205 * px, 0, 7); c.stroke();
        c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let d = 0; d < 360; d += 10) {
          const big = d % 30 === 0; c.font = `${big ? 'bold' : '600'} ${Math.round((big ? 0.0105 : 0.0068) * px)}px Arial`;
          const [x, y] = P(d * Math.PI / 180, big ? 0.0935 : 0.097); c.save(); c.translate(x, y); c.rotate(-d * Math.PI / 180); c.fillText(String(d), 0, 0); c.restore();
        }
        c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, 0.083 * px, 0, 7); c.stroke();
        c.font = `600 ${Math.round(0.0058 * px)}px Arial`;
        c.save(); c.rotate(Math.PI); c.fillText('Al 6061 · Ø250 × 4 mm', 0, -0.035 * px); c.restore();
        c.font = `600 ${Math.round(0.005 * px)}px Arial`; c.fillText('SCA06 · EtherNet/IP', 0, -0.0765 * px);
        c.restore();
      };
      const discTex = canvasTex(2048, 2048, discCanvasDraw);
      discTex.repeat.set(1 / 0.25, 1 / 0.25); discTex.offset.set(0.5, 0.5); discTex.anisotropy = 8;
      const geo = new T.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 72 });
      const discMesh = new T.Mesh(geo, [new T.MeshStandardMaterial({ map: discTex, metalness: 0.8, roughness: 0.36 }), new T.MeshStandardMaterial({ color: 0xd4d8dc, metalness: 0.95, roughness: 0.22 })]);
      disc.add(discMesh); disc.add(this.targetArc);
      // cubo de fixação (atrás) + tampa com 4 parafusos (frente)
      const hubB = cyl(0.023, 0.023, 0.018, alu(0xa9aeb4, 0.3), 40); hubB.rotation.x = Math.PI / 2; hubB.position.z = -0.009; disc.add(hubB);
      const hubF = cyl(0.019, 0.019, 0.005, alu(0xb9bdc2, 0.28), 40); hubF.rotation.x = Math.PI / 2; hubF.position.z = 0.0071; disc.add(hubF);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const b2 = cyl(0.0028, 0.0028, 0.003, darkSteel, 12); b2.rotation.x = Math.PI / 2; b2.position.set(Math.cos(a) * 0.0125, Math.sin(a) * 0.0125, 0.0105); disc.add(b2); }
      // peso de desbalanceamento: latão Ø30, preso com porca a 98 mm do centro, no 180°
      this.weight = new T.Group();
      this.weightMat = new T.MeshStandardMaterial({ color: 0xb8913c, metalness: 0.9, roughness: 0.28, transparent: true });
      const wcyl = cyl(0.015, 0.015, 0.02, this.weightMat, 40); wcyl.rotation.x = Math.PI / 2; wcyl.position.z = 0.0145; this.weight.add(wcyl);
      const wchamf = cyl(0.0135, 0.015, 0.0015, this.weightMat, 40); wchamf.rotation.x = Math.PI / 2; wchamf.position.z = 0.0252; this.weight.add(wchamf);
      const nut = cyl(0.0075, 0.0075, 0.005, new T.MeshStandardMaterial({ color: 0x8e959c, metalness: 0.9, roughness: 0.3, transparent: true }), 6); nut.rotation.x = Math.PI / 2; nut.position.z = 0.0285; this.weight.add(nut); this.nutMat = nut.material;
      this.weight.position.set(0, -0.098, 0); disc.add(this.weight);
      this.addClick(this.weight, 'bench:weight', 'Peso de desbalanceamento 300 g (clique para retirar/colocar)');
      // came de fim de curso na borda (no 0° do disco)
      this.cam = box(0.018, 0.013, 0.009, new T.MeshStandardMaterial({ color: 0xd99a16, metalness: 0.4, roughness: 0.4 })); this.cam.position.set(0, 0.1305, 0.002); disc.add(this.cam);
      // borrão de movimento: média radial do disco (aparece quando gira rápido)
      const blurTex = canvasTex(512, 512, (c, w) => {
        const tmp = document.createElement('canvas'); tmp.width = tmp.height = w; const t = tmp.getContext('2d');
        discCanvasDraw(t, w); const px = w / 0.25;
        t.globalCompositeOperation = 'destination-out'; holes.forEach(([x, y]) => { t.beginPath(); t.arc(w / 2 + x * px, w / 2 - y * px, 0.017 * px, 0, 7); t.fill(); });
        t.globalCompositeOperation = 'source-over';
        t.fillStyle = '#b8913c'; t.beginPath(); t.arc(w / 2, w / 2 + 0.098 * px, 0.015 * px, 0, 7); t.fill();
        const src = t.getImageData(0, 0, w, w).data, out = c.createImageData(w, w), R = w / 2, prof = [];
        for (let r = 0; r < R; r++) { const s = [0, 0, 0, 0]; const n = Math.max(24, Math.round(2 * Math.PI * r)); for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; const x = Math.round(R + Math.cos(a) * r), y = Math.round(R + Math.sin(a) * r); const k = (Math.min(w - 1, y) * w + Math.min(w - 1, x)) * 4; s[0] += src[k]; s[1] += src[k + 1]; s[2] += src[k + 2]; s[3] += src[k + 3]; } prof.push(s.map(v => v / n)); }
        for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const r = Math.hypot(x - R, y - R); if (r >= R - 1) continue; const p = prof[Math.floor(r)], k = (y * w + x) * 4; out.data[k] = p[0]; out.data[k + 1] = p[1]; out.data[k + 2] = p[2]; out.data[k + 3] = p[3]; }
        c.putImageData(out, 0, 0);
      });
      this.blurMat = new T.MeshBasicMaterial({ map: blurTex, transparent: true, opacity: 0, depthWrite: false });
      const blur = new T.Mesh(new T.CircleGeometry(0.1255, 72), this.blurMat); blur.position.z = 0.0058; blur.renderOrder = 2; disc.add(blur); this.blur = blur;
      this.pointerMat = { opacity: 1 };
      disc.position.set(CX, AXIS_Y, DZ - 0.0046); disc.traverse(o => { if (o.isMesh && o !== blur) o.castShadow = true; }); this.scene.add(disc);
      this.addClick(discMesh, 'tab:scanner', 'Disco graduado Ø250 mm (leia o ângulo no ponteiro vermelho)');

      // ---- chaves de fim de curso com rolete, presas na base, em ±170°
      this.limits = [];
      [170, -170].forEach((deg, i) => {
        const g = new T.Group();
        const bodyS = box(0.018, 0.03, 0.022, new T.MeshStandardMaterial({ color: 0x2b2e32, roughness: 0.5 })); g.add(bodyS);
        const head = box(0.012, 0.006, 0.014, mat(0x8d9399, { metalness: 0.7 })); head.position.y = 0.018; g.add(head);
        const lever = new T.Group(); const arm = box(0.0035, 0.02, 0.003, new T.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 0.8, roughness: 0.3 })); arm.position.y = 0.01; lever.add(arm);
        const roll = cyl(0.0042, 0.0042, 0.006, mat(0x1a1a1a)); roll.rotation.x = Math.PI / 2; roll.position.y = 0.02; lever.add(roll);
        lever.position.set(0, 0.02, 0); g.add(lever);
        const a = deg * Math.PI / 180, R = 0.18;
        g.position.set(CX + Math.sin(a) * R, AXIS_Y + Math.cos(a) * R, DZ - 0.0026); g.rotation.z = -a + Math.PI;
        this.scene.add(g); this.limits.push({ g, lever, deg });
        this.addClick(g, 'bench:cams', `Chave de fim de curso ${i === 0 ? 'horário (DI2)' : 'anti-horário (DI3)'}: clique para montar ou retirar as cames`);
      });
      const lb = box(0.08, 0.012, 0.03, alu(0xb9bdc2, 0.45)); lb.position.set(CX, 0.022, DZ - 0.0026); this.scene.add(lb);
      this.scene = realScene; const rx = this.rigXf(); rig.rotation.y = rx.th; rig.position.copy(rx.pos); realScene.add(rig); this.rig = rig;
      this.axisY = AXIS_Y;
    }

    buildButtons() {
      const g = new T.Group();
      const boxB = box(0.24, 0.07, 0.08, mat(0xe4c21c, { roughness: 0.5 })); boxB.position.y = 0.035; g.add(boxB);
      // emergência (STO)
      this.estop = new T.Group();
      const collar = cyl(0.02, 0.02, 0.01, mat(0xf2d300)); this.estop.add(collar);
      this.mush = cyl(0.024, 0.02, 0.018, mat(0xd23a2e, { roughness: 0.4 })); this.mush.position.y = 0.016; this.estop.add(this.mush);
      this.estop.position.set(-0.07, 0.075, 0); g.add(this.estop);
      this.addClick(this.estop, 'bench:sto', 'Emergência → STO (Safe Torque Off) — clique para acionar/liberar');
      // botoeira STOP (DI1), com retenção
      this.stopBtn = cyl(0.014, 0.014, 0.016, new T.MeshStandardMaterial({ color: 0x1f3a6e, emissive: 0x1f3a6e, emissiveIntensity: 0.0, roughness: 0.4 })); this.stopBtn.position.set(0.04, 0.078, 0); g.add(this.stopBtn);
      this.addClick(this.stopBtn, 'bench:stopButton', 'Botoeira STOP com retenção → DI1 (função STOP)');
      const lbl = new T.Mesh(new T.PlaneGeometry(0.22, 0.03), new T.MeshBasicMaterial({ map: canvasTex(440, 60, (c, w, h) => { c.fillStyle = '#e4c21c'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'bold 22px Arial'; c.fillText('EMERGÊNCIA (STO)', 18, 38); c.fillText('STOP · DI1', 280, 38); }) }));
      lbl.position.set(0, 0.035, 0.0405); g.add(lbl);
      g.position.set(-0.44, 0, 0.22); g.rotation.y = 0.25; this.scene.add(g);
      // cabo de comando da botoeira até o X1 do drive (entradas STO e DI1)
      const gland = cyl(0.007, 0.008, 0.012, mat(0x2a2b2e), 16); gland.rotation.x = Math.PI / 2; gland.position.set(0.07, 0.035, -0.046); g.add(gland);
      g.updateMatrixWorld(true);
      const V = (x, y, z) => new T.Vector3(x, y, z), gw = g.localToWorld(V(0.07, 0.035, -0.054));
      const S2 = 0.1 / 146, DX = -0.43, DY = 0.38, FZ = -0.058;
      const x1 = V(DX + (153.5 - 103) * S2, DY + (249 - 105) * S2, FZ);
      const plug = new T.Group();
      plug.add(box(0.012, 0.044, 0.014, mat(0x1f2023, { roughness: 0.5 })));
      for (let i = 0; i < 6; i++) { const sc = cyl(0.0016, 0.0016, 0.002, mat(0x9ea3a8, { metalness: 0.8 }), 8); sc.rotation.x = Math.PI / 2; sc.position.set(-0.002, 0.018 - i * 0.0072, 0.0075); plug.add(sc); }
      plug.position.set(x1.x, x1.y, FZ + 0.007); this.scene.add(plug);
      const ctl = [V(x1.x + 0.006, x1.y, FZ + 0.008), V(x1.x + 0.016, x1.y - 0.004, FZ + 0.006), V(DX + 0.056, x1.y - 0.02, FZ - 0.012), V(DX + 0.058, 0.30, FZ - 0.05), V(DX + 0.057, 0.10, FZ - 0.05), V(DX + 0.05, 0.02, FZ - 0.01),
        V(DX + 0.03, 0.005, 0.06), gw.clone().add(V(0.02, -0.03, -0.05)), gw.clone().add(V(0.002, -0.004, -0.012)), gw];
      const ctlMesh = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(ctl, false, 'centripetal'), 120, 0.0034, 8), mat(0x3a3d41, { roughness: 0.6 }));
      ctlMesh.castShadow = true; this.scene.add(ctlMesh);
      this.addClick(ctlMesh, 'tab:params', 'Cabo de comando: emergência → STO e botão STOP → DI1 (conector X1)');
      this.addClick(plug, 'tab:params', 'X1 — I/Os: STO e DI1 (P0300 = 2 STOP) vindos da botoeira');
    }

    // ------------------------------------------------------------------ atualização
    update(v) {
      this.v = v;
      // display da HMI
      this.drawDisplay(v.hmi.cells, v.t);
      for (const [k, l] of Object.entries(this.hmiLeds)) l.material.color.setHex(v.hmi.leds[k] ? l.userData.on : 0x4a4d55);
      // LEDs de rede
      const blink = (Math.floor(performance.now() / 250) % 2) === 0, fast = (Math.floor(performance.now() / 70) % 2) === 0;
      const ns = v.ns; let nsCol = 0x222222;
      if (ns === 'green') nsCol = 0x22ff44; else if (ns === 'green-blink') nsCol = blink ? 0x22ff44 : 0x222222; else if (ns === 'red') nsCol = 0xff2211; else if (ns === 'red-blink') nsCol = blink ? 0xff2211 : 0x222222;
      this.nsLed.material.color.setHex(nsCol);
      const lk = (st) => st === 'on' ? 0x22ff44 : st === 'blink' ? (fast ? 0x22ff44 : 0x0c2a10) : 0x0c2a10;
      this.linkLeds[0][0].material.color.setHex(lk(v.link1)); this.linkLeds[0][1].material.color.setHex(v.link1 !== 'off' ? 0xffb000 : 0x2a2008); this.linkLeds[1][1].material.color.setHex(0x2a2008);
      this.linkLeds[1][0].material.color.setHex(lk(v.link2));
      this.swPortLeds[0].material.color.setHex(v.bench.cablePlugged ? lk(v.link1 === 'off' ? 'on' : v.link1) : 0x0c2a10);
      this.swPortLeds[1].material.color.setHex(lk(fast ? 'blink' : 'on'));
      this.plcLed.material.color.setHex(v.ioConnected ? (v.ioRun ? 0x22ff44 : 0xffb000) : 0x444444);
      // cabo / acessório
      // cabo desconectado: o cabo fica pendurado da canaleta, com o RJ45 solto
      const pl = v.bench.cablePlugged;
      this.cable1.visible = pl; this.cable1u.visible = this.plugLoose.visible = !pl; this.plug.visible = pl;
      this.eco.position.z = this.ecoZ + (v.bench.accessorySeated ? 0 : 0.03); this.plug.position.z = this.cablePlugPos.z + 0.024 + (v.bench.accessorySeated ? 0 : 0.03);
      this.cable1.position.z = v.bench.accessorySeated ? 0 : 0.03;
      // disjuntor
      this.breakerLever.position.y = v.bench.power ? 0.012 : -0.008; this.breakerFlag.material.color.setHex(v.bench.power ? 0xd23a2e : 0x2e9e4f);
      // botões
      this.mush.position.y = v.bench.sto ? 0.008 : 0.016;
      this.stopBtn.position.y = v.bench.stopButton ? 0.072 : 0.078; this.stopBtn.material.emissiveIntensity = v.bench.stopButton ? 0.9 : 0;
      // sinaleiro: verde habilitado, âmbar alarme/STOP, vermelho falha
      this.stack.green.emissiveIntensity = v.enabled ? 1.4 : 0.05; this.stack.green.opacity = v.enabled ? 0.95 : 0.5;
      const amb = v.alarm || v.stop || v.sto; this.stack.amber.emissiveIntensity = amb ? (blink ? 1.4 : 0.3) : 0.05; this.stack.amber.opacity = amb ? 0.95 : 0.5;
      this.stack.red.emissiveIntensity = v.fault ? 1.4 : 0.05; this.stack.red.opacity = v.fault ? 0.95 : 0.5;
      // peso, cames, fins de curso
      this.weight.visible = v.bench.weight; this.cam.visible = v.bench.cams;
      this.limits.forEach((l, i) => { const act = v.fc && (i === 0 ? v.di[1] : v.di[2]); l.lever.rotation.z = act ? (i === 0 ? -0.5 : 0.5) : 0; l.g.visible = true; });
      this.targetAngle = v.angle; this.targetRpm = v.rpm * (v.angleSign || 1); this.tUpdate = performance.now();
    }
    setTarget(deg, tol) {
      if (deg == null) { this.targetArc.visible = false; return; }
      const span = Math.max(0.02, tol * 2 * Math.PI / 180);
      this.targetArc.geometry.dispose();
      // o arco é pintado no disco: valor v fica a v° anti-horário do topo (90° + v a partir de +X)
      this.targetArc.geometry = new T.RingGeometry(0.1165, 0.1242, 32, 1, (90 + deg - tol) * Math.PI / 180, span);
      this.targetArc.visible = true;
    }

    drawDisplay(cells, t) {
      const key = JSON.stringify(cells) + (Math.floor(performance.now() / 300) % 2);
      if (key === this.lastDisp) return; this.lastDisp = key;
      const g = this.dispTex.userData.ctx, W = 512, H = 160;
      g.fillStyle = '#2a0a08'; g.fillRect(0, 0, W, H);
      const blinkOn = Math.floor(performance.now() / 300) % 2 === 0;
      const cw = 60, gap = 20, x0 = 22;
      cells.forEach((c, i) => drawSeven(g, x0 + i * (cw + gap), 26, cw, 108, c.ch, c.dp, !(c.blink && !blinkOn)));
      this.dispTex.needsUpdate = true;
    }

    // ------------------------------------------------------------------ câmera / entrada
    view(name) {
      const V = {
        geral: { target: [0, 0.30, -0.05], r: 1.75, th: 0.18, ph: 1.28 },
        drive: { target: [-0.43, 0.37, -0.06], r: 0.55, th: 0.08, ph: 1.50 },
        disco: { target: this.rigPt(0.10, 0.20, 0.03).toArray(), r: 0.62, th: this.rigXf().th, ph: 1.45 },
        motor: { target: this.rigPt(0.10, 0.19, -0.09).toArray(), r: 0.72, th: this.rigXf().th + 1.05, ph: 1.22 },
        rede: { target: [-0.1, 0.52, -0.12], r: 0.95, th: 0.05, ph: 1.35 },
      }[name]; if (!V) return;
      this.anim = { from: { ...this.orbit, target: this.orbit.target.clone() }, to: { target: new T.Vector3(...V.target), r: V.r, th: V.th, ph: V.ph }, t0: performance.now() };
    }
    bindInput() {
      const el = this.renderer.domElement; const ptrs = new Map(); let lastDist = 0, moved = 0;
      el.style.touchAction = 'none'; el.tabIndex = 0; el.style.outline = 'none';
      const ray = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), hitP = new T.Vector3();
      const floorPt = (e) => { const r = el.getBoundingClientRect(); ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera); return ray.ray.intersectPlane(plane, hitP) ? hitP.clone() : null; };
      this.rigHit = (e) => { const r = el.getBoundingClientRect(); ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera); return this.rig && ray.intersectObject(this.rig, true)[0]; };
      let drag = null;   // arrastar a bancada do motor sobre a mesa
      el.addEventListener('pointerdown', (e) => {
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button }); moved = 0; el.setPointerCapture(e.pointerId);
        drag = null;
        if (ptrs.size === 1 && e.button === 0 && !e.shiftKey && this.rigHit(e)) { const f = floorPt(e); const q = this.rigXf().q; if (f) drag = { off: new T.Vector3(q.x - f.x, 0, q.z - f.z), on: false }; }
      });
      el.addEventListener('pointermove', (e) => {
        const p = ptrs.get(e.pointerId);
        if (!p) { this.pick(e, false); return; }
        const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy);
        if (ptrs.size === 1 && drag) {
          if (moved > 6) { drag.on = true; const f = floorPt(e); if (f) { const q = this.rigXf().q; this.setRig({ x: f.x + drag.off.x, z: f.z + drag.off.z, th: q.th }, false); } el.style.cursor = 'grabbing'; this.tooltip.style.opacity = 0; }
          p.x = e.clientX; p.y = e.clientY; this.anim = null; return;
        }
        if (ptrs.size === 1) {
          if (p.b === 2 || e.shiftKey) { const s = this.orbit.r * 0.0012; const right = new T.Vector3().setFromMatrixColumn(this.camera.matrix, 0); const up = new T.Vector3().setFromMatrixColumn(this.camera.matrix, 1); this.orbit.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s); }
          else { this.orbit.th -= dx * 0.005; this.orbit.ph = Math.max(0.35, Math.min(1.62, this.orbit.ph - dy * 0.005)); }
        } else if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (lastDist) this.orbit.r = Math.max(0.25, Math.min(3, this.orbit.r * lastDist / d)); lastDist = d;
        }
        p.x = e.clientX; p.y = e.clientY; this.anim = null;
      });
      const up = (e) => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); lastDist = 0;
        if (drag && drag.on) { this.setRig(this.rigXf().q, true); drag = null; return; }
        drag = null; if (p && moved < 6 && ptrs.size === 0) this.pick(e, true); };
      el.addEventListener('keydown', (e) => { if (e.key === 'q' || e.key === 'Q') this.rotateRig(15); if (e.key === 'e' || e.key === 'E') this.rotateRig(-15); });
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      el.addEventListener('wheel', (e) => { e.preventDefault(); this.orbit.r = Math.max(0.25, Math.min(3, this.orbit.r * (1 + Math.sign(e.deltaY) * 0.08))); this.anim = null; }, { passive: false });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('pointerleave', () => { this.tooltip.style.opacity = 0; });
    }
    pick(e, click) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const m = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new T.Raycaster(); ray.setFromCamera(m, this.camera);
      const hit = ray.intersectObjects(this.clickables, false)[0];
      const o = hit && hit.object;
      const onRig = !click && this.rigHit && this.rigHit(e);
      this.renderer.domElement.style.cursor = onRig ? 'move' : o ? 'pointer' : 'grab';
      if ((o || onRig) && e.pointerType !== 'touch') { this.tooltip.textContent = (o ? o.userData.label : 'Bancada do motor') + (onRig ? ' · arraste para mover na mesa' : ''); this.tooltip.style.opacity = 1; this.tooltip.style.left = (e.clientX - r.left + 14) + 'px'; this.tooltip.style.top = (e.clientY - r.top + 14) + 'px'; }
      else this.tooltip.style.opacity = 0;
      if (click && o) { this.onAction(o.userData.action, o); const kg = o.userData.keyGroup; if (kg) { const z0 = kg.position.z; kg.position.z = z0 - 0.0012; setTimeout(() => kg.position.z = z0, 120); } }
    }
    resize() {
      const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
      this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
    loop() {
      requestAnimationFrame(this.loop);
      if (this.anim) {
        const k = Math.min(1, (performance.now() - this.anim.t0) / 700), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, A = this.anim.from, B = this.anim.to;
        this.orbit.target.lerpVectors(A.target, B.target, e); this.orbit.r = A.r + (B.r - A.r) * e; this.orbit.th = A.th + (B.th - A.th) * e; this.orbit.ph = A.ph + (B.ph - A.ph) * e;
        if (k >= 1) this.anim = null;
      }
      const o = this.orbit;
      this.camera.position.set(o.target.x + o.r * Math.sin(o.ph) * Math.sin(o.th), o.target.y + o.r * Math.cos(o.ph), o.target.z + o.r * Math.sin(o.ph) * Math.cos(o.th));
      this.camera.lookAt(o.target);
      if (this.targetAngle != null) {
        // dados chegam a ~30 Hz: extrapola com a velocidade física e corrige suavemente
        const now = performance.now(), dtF = Math.min(0.1, (now - (this.tFrame || now)) / 1000); this.tFrame = now;
        const w = (this.targetRpm || 0) * 6;                                   // °/s
        const goal = this.targetAngle + w * (now - this.tUpdate) / 1000;
        this.angleShown += w * dtF;
        let d = goal - this.angleShown; d = ((d % 360) + 540) % 360 - 180;
        this.angleShown += Math.abs(d) > 90 ? d : d * 0.25;
        this.disc.rotation.z = -this.angleShown * Math.PI / 180;
        // borrão de movimento proporcional à velocidade (o olho/câmera não acompanha acima de ~60 rpm)
        const k = Math.min(1, Math.max(0, (Math.abs(this.targetRpm || 0) - 45) / 160));
        this.blurMat.opacity = k; this.weightMat.opacity = this.nutMat.opacity = 1 - k; this.weightMat.depthWrite = this.nutMat.depthWrite = k < 0.5;
      }
      this.renderer.render(this.scene, this.camera);
    }
  }

  global.Bench3D = Bench3D; global.drawSeven = drawSeven;
})(typeof window !== 'undefined' ? window : this);
