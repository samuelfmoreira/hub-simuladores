/* Bancada CFW500 - cena 3D (three.js r160, global THREE). Unidades em metros, dispositivos em tamanho real.
 * Painel vertical na altura do operador (componentes entre 1,1 m e 1,75 m do piso); motor e multímetro sobre a mesa. */
(function (g) {
  'use strict';
  const SIM = g.SIM = g.SIM || {};
  const MESA_Y = 0.80, CORES = { preto: 0x1b1b1d, vermelho: 0xc62828, azul: 0x1e56b0, verde: 0x2e8b3d, amarelo: 0xe0b400, cinza: 0x8a9096, branco: 0xe9e9e9, laranja: 0xe06a10 };
  const LIM = { painel: [-0.9, 0.9, 0.05, 0.99], mesa: [-0.98, 0.98, 0.10, 0.70] };

  SIM.criaCena = function (el, banc, cb) {
    const T = THREE, V3 = T.Vector3, TIPOS = SIM.TIPOS;
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(g.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement); const dom = renderer.domElement; dom.style.touchAction = 'none'; dom.style.display = 'block';
    const scene = new T.Scene(); scene.background = new T.Color(0xe9ece8); scene.fog = new T.Fog(0xe9ece8, 7, 16);
    const cam = new T.PerspectiveCamera(42, 1, 0.02, 40);
    scene.add(new T.HemisphereLight(0xffffff, 0x9aa0a6, 2.1));
    const sol = new T.DirectionalLight(0xffffff, 2.3); sol.position.set(1.6, 3.6, 3.2); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -2, right: 2, top: 2.4, bottom: -0.4, near: 0.5, far: 9 }); sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.01; scene.add(sol);
    const luz2 = new T.DirectionalLight(0xdfe8ff, 0.7); luz2.position.set(-2.5, 2.2, 2.5); scene.add(luz2);

    // ---------------------------------------------------------------- utilidades de modelagem
    const mats = {};
    const mat = (cor, o) => { const k = cor + JSON.stringify(o || {}); return mats[k] || (mats[k] = new T.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.6, metalness: 0.05 }, o))); };
    const aco = mat(0xb9bec4, { metalness: 0.75, roughness: 0.35 }), preto = mat(0x1d1f22, { roughness: 0.5 }), invis = new T.MeshBasicMaterial({ visible: false });
    const som = (m, c = true, r = true) => { m.castShadow = c; m.receiveShadow = r; return m; };
    const caixa = (w, h, d, m) => som(new T.Mesh(new T.BoxGeometry(w, h, d), m));
    const cil = (r, h, m, seg = 28, r2) => som(new T.Mesh(new T.CylinderGeometry(r2 === undefined ? r : r2, r, h, seg), m));
    const cz = (r, h, m, seg, r2) => { const c = cil(r, h, m, seg, r2); c.rotation.x = Math.PI / 2; return c; };     // cilindro com o eixo para a frente (z)
    const poe = (pai, filho, x = 0, y = 0, z = 0) => { filho.position.set(x, y, z); pai.add(filho); return filho; };
    const tela = (wpx, hpx) => { const c = document.createElement('canvas'); c.width = wpx; c.height = hpx; const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return { c, x: c.getContext('2d'), t }; };
    /** textura desenhada em milímetros, origem no centro, y para cima invertido (canvas) */
    const placaTex = (wmm, hmm, des, esc = 3) => { const k = tela(Math.round(wmm * esc), Math.round(hmm * esc)); k.x.scale(esc, esc); k.x.translate(wmm / 2, hmm / 2); k.x.textBaseline = 'middle'; k.x.textAlign = 'center'; des(k.x); k.t.needsUpdate = true; return k.t; };
    const txt = (x, s, px, cx, cy, cor = '#1c2530', peso = 700) => { x.font = `${peso} ${px}px Arial, Helvetica, sans-serif`; x.fillStyle = cor; x.fillText(s, cx, cy); };
    const plano = (w, h, tex, o) => new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial(Object.assign({ map: tex, roughness: 0.55 }, o)));

    // ---------------------------------------------------------------- sala, mesa e painel
    const chao = som(new T.Mesh(new T.PlaneGeometry(30, 30), mat(0xb7bcbf, { roughness: 0.9 })), false); chao.rotation.x = -Math.PI / 2; scene.add(chao);
    const parede = som(new T.Mesh(new T.PlaneGeometry(30, 6), mat(0xdfe3e0, { roughness: 1 })), false); parede.position.set(0, 3, -0.9); scene.add(parede);
    const mesa = new T.Group(); scene.add(mesa);
    poe(mesa, caixa(2.1, 0.04, 0.86, mat(0xd8d0bf, { roughness: 0.75 })), 0, MESA_Y - 0.02, 0.36);
    poe(mesa, caixa(2.1, 0.012, 0.012, mat(0x3a4046)), 0, MESA_Y - 0.006, 0.79);
    for (const x of [-0.99, 0.99]) for (const z of [-0.02, 0.74]) poe(mesa, caixa(0.05, MESA_Y - 0.04, 0.05, mat(0x3a4046, { metalness: 0.4 })), x, (MESA_Y - 0.04) / 2, z);
    poe(mesa, caixa(1.98, 0.05, 0.03, mat(0x3a4046, { metalness: 0.4 })), 0, 0.2, -0.02); poe(mesa, caixa(1.98, 0.05, 0.03, mat(0x3a4046, { metalness: 0.4 })), 0, 0.2, 0.74);
    const furos = tela(256, 256); furos.x.fillStyle = '#44525f'; furos.x.fillRect(0, 0, 256, 256); furos.x.fillStyle = '#2e3944';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { furos.x.beginPath(); furos.x.roundRect(i * 32 + 9, j * 32 + 13, 14, 6, 3); furos.x.fill(); }
    furos.t.wrapS = furos.t.wrapT = T.RepeatWrapping; furos.t.repeat.set(18, 10); furos.t.needsUpdate = true;
    const quadro = som(new T.Mesh(new T.BoxGeometry(1.86, 1.02, 0.02), [preto, preto, preto, preto, new T.MeshStandardMaterial({ map: furos.t, roughness: 0.8 }), preto])); quadro.position.set(0, MESA_Y + 0.53, -0.012); scene.add(quadro);
    const perfil = mat(0xc9ced3, { metalness: 0.7, roughness: 0.4 });
    for (const x of [-0.95, 0.95]) poe(scene, caixa(0.045, 1.1, 0.045, perfil), x, MESA_Y + 0.53, -0.012);
    for (const y of [0.0, 1.06]) poe(scene, caixa(1.945, 0.045, 0.045, perfil), 0, MESA_Y + y, -0.012);
    const faixa = placaTex(600, 60, (x) => { x.fillStyle = '#1f5fb4'; x.fillRect(-300, -30, 600, 60); txt(x, 'BANCADA DIDÁTICA · INVERSOR DE FREQUÊNCIA CFW500', 19, 0, 1, '#ffffff'); });
    poe(scene, plano(0.9, 0.09, faixa), 0, MESA_Y + 1.14, 0.012).castShadow = false; poe(scene, caixa(0.94, 0.11, 0.02, perfil), 0, MESA_Y + 1.14, 0);

    // ---------------------------------------------------------------- componentes
    const gComp = new T.Group(), gFios = new T.Group(), gPontas = new T.Group(); scene.add(gComp, gFios, gPontas);
    let vistas = {}, termos = {}, alvos = [], fiosV = {};
    const CURTO = { rede: 'Alimentação 3~ 220 V', disj: 'Disjuntor 3P', cfw: 'Inversor CFW500 + plug-in CFW500-IOS', bot: 'Pulsador', chave: 'Seletora', emerg: 'Emergência', pot: 'Pot. 5 kΩ', sinal: '24 Vcc', gerador: 'Gerador V / mA' };
    const corT = (c) => mat(CORES[c] || CORES.preto, { roughness: 0.45 });
    function borne(gr, ref, t, x, y, z, normal) {
      const eixo = normal.y ? cil : cz;
      const anel = eixo(0.0088, 0.011, corT(t.cor)); const furo = eixo(0.0043, 0.0115, mat(0x0c0c0d)); const metal = eixo(0.0052, 0.0105, mat(0xd8c27a, { metalness: 0.9, roughness: 0.3 }));
      for (const m of [anel, metal, furo]) { poe(gr, m, x, y, z); if (normal.y) m.position.y += 0.0055; else m.position.z += 0.0055; }
      const hit = new T.Mesh(new T.SphereGeometry(0.0155, 10, 8), invis); poe(gr, hit, x + normal.x * 0.008, y + normal.y * 0.008, z + normal.z * 0.008);
      hit.userData = { kind: 'term', ref, normal }; alvos.push(hit); termos[ref] = hit;
    }
    function baseModulo(c, des) {
      const d = TIPOS[c.tipo], w = d.w / 1000, h = d.h / 1000;
      const tex = placaTex(d.w, d.h, (x) => {
        x.fillStyle = '#eceee9'; x.beginPath(); x.roundRect(-d.w / 2, -d.h / 2, d.w, d.h, 5); x.fill(); x.strokeStyle = '#8f979d'; x.lineWidth = 1.2; x.stroke();
        x.fillStyle = '#26313c'; x.fillRect(-d.w / 2, -d.h / 2, d.w, 17); x.textAlign = 'left'; txt(x, c.id, 12, -d.w / 2 + 5, -d.h / 2 + 9, '#fff');
        x.textAlign = 'right'; txt(x, CURTO[c.tipo], 7.5, d.w / 2 - 5, -d.h / 2 + 9, '#c9d3dc', 400); x.textAlign = 'center';
        if (des) des(x, d);
        for (const t of d.term) { const m = t.nome.split(' '); if (m.length > 1 && /^\d+$/.test(m[0])) { txt(x, m[0], 9, t.x, -t.y - 23.5, '#1c2530'); txt(x, m.slice(1).join(' '), 5.8, t.x, -t.y - 14.5, '#2a3743', 700); } else txt(x, t.nome, 9, t.x, -t.y - 15, '#1c2530'); }
      });
      const lado = mat(0xc9ccc8), m = som(new T.Mesh(new T.BoxGeometry(w, h, 0.012), [lado, lado, lado, lado, new T.MeshStandardMaterial({ map: tex, roughness: 0.62 }), lado]));
      m.position.z = 0.006; m.userData = { kind: 'corpo', id: c.id }; alvos.push(m);
      const gr = new T.Group(); gr.add(m);
      for (const t of d.term) borne(gr, c.id + '.' + t.id, t, t.x / 1000, t.y / 1000, 0.012, new V3(0, 0, 1));
      return gr;
    }
    const ctl = (m, id, tipo, extra) => { m.userData = Object.assign({ kind: 'ctl', id, tipo }, extra); alvos.push(m); return m; };
    const simbContato = (x, xa, xb, y, nf) => { x.strokeStyle = '#1c2530'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(xa + 9, y); x.lineTo(xa + 14, y); x.moveTo(xb - 9, y); x.lineTo(xb - 14, y); x.moveTo(xa + 14, y); x.lineTo(xb - 14, nf ? y - 2 : y - 7); if (nf) { x.moveTo(xb - 14, y); x.lineTo(xb - 14, y - 5); } x.stroke(); };
    const desContatos = (x, d) => { const a = d.term[0], b = d.term[2]; simbContato(x, a.x, -a.x, -a.y, false); simbContato(x, b.x, -b.x, -b.y, true); txt(x, 'NA', 6, 0, -a.y + 9, '#1e56b0'); txt(x, 'NF', 6, 0, -b.y + 9, '#c62828'); };
    const aro = (gr, y, r = 0.0155) => poe(gr, cz(r, 0.006, aco), 0, y, 0.015);

    const FAB = {
      rede(c) {
        const gr = baseModulo(c, (x) => {
          txt(x, '3~ 220 V  60 Hz', 11, 0, -86, '#c62828'); txt(x, 'CHAVE GERAL COM PROTEÇÃO', 6.5, 30, -62, '#3a4753');
          x.fillStyle = '#f3c300'; x.beginPath(); x.roundRect(-8, -52, 76, 76, 6); x.fill(); txt(x, '0', 12, -1, -40); txt(x, 'I', 12, 60, -14);
          ['L1', 'L2', 'L3'].forEach((l, i) => txt(x, l, 7, -92, -52 + i * 26 + 12, '#3a4753')); txt(x, 'DESARMADO', 5.5, -76, 36, '#c62828');
        });
        const leds = [0, 1, 2].map((i) => poe(gr, cz(0.007, 0.008, new T.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0xffd9a0, emissiveIntensity: 0 })), -0.076, 0.052 - i * 0.026, 0.016));
        const ledT = poe(gr, cz(0.006, 0.008, new T.MeshStandardMaterial({ color: 0x8a2a2a, emissive: 0xff2a1a, emissiveIntensity: 0 })), -0.098, -0.036, 0.016);
        const man = new T.Group(); poe(gr, man, 0.03, 0.014, 0.012); man.add(poe(man, cz(0.024, 0.012, mat(0xb71c1c)), 0, 0, 0.006)); ctl(poe(man, caixa(0.017, 0.064, 0.022, mat(0xc62828, { roughness: 0.4 })), 0, 0, 0.022), c.id, 'geral');
        return { gr, upd: (s) => { const on = s.ligada && !s.desarmada; man.rotation.z = on ? -Math.PI / 4 : Math.PI / 4; leds.forEach((l) => { l.material.emissiveIntensity = on ? 2.2 : 0; }); ledT.material.emissiveIntensity = s.desarmada ? (Math.floor(perfNow() / 300) % 2 ? 3 : 0.3) : 0; } };
      },
      disj(c) {
        const gr = baseModulo(c, (x) => { txt(x, 'C10 · 3P', 7, 0, 52, '#3a4753'); x.strokeStyle = '#59646e'; x.lineWidth = 1; for (const px of [-40, 0, 40]) { x.beginPath(); x.moveTo(px, -66); x.lineTo(px, -46); x.moveTo(px, 66); x.lineTo(px, 46); x.stroke(); } });
        poe(gr, caixa(0.054, 0.086, 0.066, mat(0xf2f2ee, { roughness: 0.4 })), 0, 0, 0.045); poe(gr, caixa(0.056, 0.03, 0.01, mat(0xdcdcd6)), 0, 0, 0.08);
        const alav = ctl(poe(gr, caixa(0.046, 0.013, 0.022, mat(0x24292f)), 0, 0, 0.09), c.id, 'alav'); const ind = poe(gr, caixa(0.012, 0.006, 0.002, new T.MeshStandardMaterial({ color: 0x2e8b3d })), 0, -0.024, 0.079);
        return { gr, upd: (s) => { alav.position.y = s.fechado ? 0.011 : -0.011; alav.rotation.x = s.fechado ? -0.35 : 0.35; ind.material.color.setHex(s.fechado ? 0xc62828 : 0x2e8b3d); } };
      },
      cfw(c) {
        const gr = baseModulo(c, (x) => {
          x.strokeStyle = '#59646e'; x.lineWidth = 1.1; x.setLineDash([3, 2]);
          for (const px of [-135, -100, -65, -30, 30, 65, 100, 135]) { x.beginPath(); x.moveTo(px, -191); x.lineTo(px, -178); x.lineTo(px * 0.2, -150); x.stroke(); }
          x.setLineDash([]); for (const [t, px] of [['ENTRADA DA REDE 200-240 V', -84], ['SAÍDA PARA O MOTOR', 84]]) { x.fillStyle = '#eceee9'; x.fillRect(px - 52, -187, 104, 10); txt(x, t, 6.2, px, -182, '#3a4753'); }
          x.fillStyle = '#dfe3dd'; x.fillRect(-158, 108, 316, 134); x.strokeStyle = '#8f979d'; x.strokeRect(-158, 108, 316, 134); txt(x, 'BORNES DE CONTROLE · PLUG-IN CFW500-IOS', 7, 0, 115, '#3a4753');
          txt(x, 'DIs em NPN (fábrica): ativas quando ligadas ao GND', 5.6, 0, 235, '#59646e', 400);
        });
        // ---- corpo do CFW500 mecânica A (75 x 189 x 150 mm), desenhado como o produto: carcaça cinza-azulada clara, aba de
        // fixação com furos tipo fechadura, grade de ventilação, HMI com moldura azul-marinho, LCD verde-amarelado e teclas redondas
        const corpo = new T.Group(); poe(gr, corpo, 0, 0.045, 0.012);
        const C = { corpo: '#c9d3e5', cl: '#dfe6f1', esc: '#aab6cc', mar: '#1d2b5c', tecla: '#cfd4dc', tinta: '#4f596b' };
        const rr = (x, a, b, w, h, r) => { x.beginPath(); x.roundRect(a, b, w, h, r); x.fill(); };
        const fundo = placaTex(66, 189, (x) => {                    // chapa traseira: abas de fixação em cima e embaixo
          x.fillStyle = '#c4cee0'; x.fillRect(-33, -94.5, 66, 189); x.fillStyle = '#b3bfd3'; x.fillRect(-33, -83.5, 66, 1.5);
          for (const px of [-22, 22]) { x.fillStyle = '#6f7b8f'; rr(x, px - 3.4, -92, 6.8, 7.2, 3.4); x.fillRect(px - 1.3, -88, 2.6, 4.6); x.fillStyle = '#f2f4f1'; rr(x, px - 2.9, -91.5, 5.8, 6.2, 2.9); x.fillRect(px - 1, -87.5, 2, 3.8); }
          x.fillStyle = '#d7deea'; rr(x, -9, -93.5, 18, 9, 1); x.fillStyle = '#f6f7f9'; x.fillRect(-6.5, -92.2, 13, 2); x.fillStyle = '#9eabc2'; x.fillRect(-3, -87.6, 6, 0.9);
          for (const px of [-13.5, -4.5, 4.5, 13.5]) { x.fillStyle = '#7f8ba0'; x.beginPath(); x.arc(px, 89, 2.4, 0, 7); x.fill(); x.fillStyle = '#f3f5f2'; x.beginPath(); x.arc(px, 89.3, 2, 0, 7); x.fill(); }
        }, 5);
        const lf = mat(0xb9c4d8, { roughness: 0.6 }); poe(corpo, som(new T.Mesh(new T.BoxGeometry(0.066, 0.189, 0.008), [lf, lf, lf, lf, new T.MeshStandardMaterial({ map: fundo, roughness: 0.6 }), lf])), 0, 0, 0.004);
        const frente = placaTex(75, 165, (x) => {
          const gd = x.createLinearGradient(-37.5, 0, 37.5, 0); gd.addColorStop(0, C.esc); gd.addColorStop(0.05, C.corpo); gd.addColorStop(0.95, C.corpo); gd.addColorStop(1, C.esc);
          x.fillStyle = gd; x.fillRect(-37.5, -82.5, 75, 165); x.fillStyle = C.cl; x.fillRect(-37.5, -82.5, 75, 1.2);
          for (let i = 0; i < 13; i++) { x.fillStyle = '#4b5568'; x.fillRect(-34 + i * 5.3, -80, 4, 6.5); x.fillStyle = '#2c3443'; x.fillRect(-34 + i * 5.3, -80, 4, 1.6); }     // grade de ventilação
          x.fillStyle = '#e7ecf4'; rr(x, -34.3, -69.2, 68.6, 92, 5); x.fillStyle = C.mar; rr(x, -33.5, -68.5, 67, 90.5, 4.5);                                              // moldura da HMI
          x.strokeStyle = '#b8c3d6'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(-37.5, 27.5); x.quadraticCurveTo(0, 23.5, 37.5, 27.5); x.stroke();                           // tampa frontal
          x.strokeStyle = C.tinta; x.lineWidth = 0.7; x.strokeRect(-30.5, 33.2, 14.5, 7); txt(x, 'WEG', 5.6, -23.2, 36.9, C.tinta, 800);
          x.textAlign = 'left'; x.font = '400 9px Arial, Helvetica, sans-serif'; x.fillStyle = C.tinta; let cx = -12.5; for (const ch of 'CFW500') { x.fillText(ch, cx, 37); cx += x.measureText(ch).width + 1.25; }
          x.font = '400 2.3px Arial, Helvetica, sans-serif'; cx = 0.5; for (const ch of 'VECTOR INVERTER') { x.fillText(ch, cx, 43.6); cx += x.measureText(ch).width + 0.75; }
          x.strokeStyle = '#6c7686'; x.lineWidth = 0.75; x.lineJoin = 'round'; x.beginPath(); x.moveTo(-24.5, 52.5); x.lineTo(-18.6, 63); x.lineTo(-30.4, 63); x.closePath(); x.stroke();
          x.fillStyle = '#6c7686'; x.beginPath(); x.moveTo(-23.8, 55.6); x.lineTo(-26.1, 59.2); x.lineTo(-24.3, 59.2); x.lineTo(-25.2, 62); x.lineTo(-22.7, 58.2); x.lineTo(-24.5, 58.2); x.closePath(); x.fill();
          ['Remova a tampa frontal somente 10 min', 'após desenergizar o equipamento.', 'Leia o manual de instruções.'].forEach((l, k) => { x.font = '400 2.1px Arial, Helvetica, sans-serif'; x.fillText(l, -15, 53.4 + k * 2.8); });
          x.font = '700 2.1px Arial, Helvetica, sans-serif'; x.fillText('ATENÇÃO · WARNING · ATENCIÓN', -15, 62.4); x.textAlign = 'center';
        }, 6);
        const lado = mat(0xb4bfd3, { roughness: 0.55 }), topo = mat(0xc9d3e5, { roughness: 0.55 });
        poe(corpo, som(new T.Mesh(new T.BoxGeometry(0.075, 0.165, 0.142), [lado, lado, topo, lado, new T.MeshStandardMaterial({ map: frente, roughness: 0.5 }), lado])), 0, 0, 0.079);
        for (let i = 0; i < 9; i++) poe(corpo, caixa(0.0765, 0.0022, 0.09, mat(0x8f9bb1)), 0, 0.066 - i * 0.0052, 0.07).castShadow = false;          // frestas laterais
        const ZF = 0.150;                                                                                                                              // face da frente
        // LCD (60 x 37 mm) e teclado (60 x 37 mm) dentro da moldura
        const lcd = tela(486, 300), mLcd = poe(corpo, new T.Mesh(new T.PlaneGeometry(0.060, 0.037), new T.MeshBasicMaterial({ map: lcd.t, toneMapped: false })), 0, 0.0455, ZF + 0.0008);
        ctl(mLcd, c.id, 'lcd');
        const tecl = placaTex(60, 37, (x) => {
          x.fillStyle = C.mar; x.fillRect(-30, -18.5, 60, 37); x.fillStyle = C.tecla; x.beginPath(); x.moveTo(-30, -16.5); x.quadraticCurveTo(-30, -18.5, -28, -18.5); x.lineTo(28, -18.5); x.quadraticCurveTo(30, -18.5, 30, -16.5);
          x.lineTo(30, 4); x.bezierCurveTo(30, 16, 14, 18.5, 0, 18.5); x.bezierCurveTo(-14, 18.5, -30, 16, -30, 4); x.closePath(); x.fill();
        }, 8);
        poe(corpo, new T.Mesh(new T.PlaneGeometry(0.060, 0.037), new T.MeshStandardMaterial({ map: tecl, roughness: 0.6 })), 0, 0.0045, ZF + 0.0008);
        const GIRO_TAMPA = Math.PI / 2;                              // a tampa do cilindro deitado nasce com a figura girada
        const tk = {}, KY = 0.0045 + 0.0185;                         // y do topo do teclado; posições em mm a partir do canto superior esquerdo, como no produto
        const pk = (mx, my) => [(mx - 30) / 1000, KY - my / 1000];
        const rot2 = (w, h, cor, des) => new T.MeshStandardMaterial({ map: placaTex(w, h, (x) => { x.fillStyle = cor; x.fillRect(-w / 2, -h / 2, w, h); des(x); }, 12), roughness: 0.45 });
        const tecla = (nome, m, mx, my, z) => { const [px, py] = pk(mx, my); poe(corpo, m, px, py, ZF + z); m.userData.z0 = ZF + z; tk[nome] = ctl(m, c.id, 'tecla', { tecla: nome }); };
        const retang = (nome, mx, l1, l2) => { const l = mat(0xb3bac5), m = new T.Mesh(new T.BoxGeometry(0.0162, 0.010, 0.0022), [l, l, l, l, rot2(16.2, 10, '#b9c0ca', (x) => { txt(x, l1, 3.3, 0, -1.7, '#eef0f3', 800); txt(x, l2, 3.3, 0, 2.1, '#eef0f3', 800); }), l]); tecla(nome, m, mx, 7.2, 0.002); };
        retang('esc', 10.5, 'BACK', 'ESC'); retang('enter', 49.5, 'MENU', 'ENTER');
        const disco = (r, cor, des) => { const l = mat(parseInt(cor.slice(1), 16), { roughness: 0.4 }), cima = rot2(r * 2000, r * 2000, cor, des), m = new T.Mesh(new T.CylinderGeometry(r, r, 0.0024, 36), [l, cima, l]); cima.map.center.set(0.5, 0.5); cima.map.rotation = GIRO_TAMPA; m.rotation.x = Math.PI / 2; return m; };
        const aroT = (mx, my, r) => { const [px, py] = pk(mx, my); poe(corpo, cz(r + 0.0009, 0.0008, mat(0xeef0f4), 36), px, py, ZF + 0.0013); };
        // setas: um disco com ▲ e ▼; cada metade é uma tecla
        { const [px, py] = pk(30, 11.3); poe(corpo, cz(0.0102, 0.0012, mat(0xe4e7ec), 40), px, py, ZF + 0.0015);
          const d = disco(0.0086, '#c5cad3', (x) => { x.fillStyle = '#e4e7ec'; x.fillRect(-7.4, -0.9, 14.8, 1.8); x.fillStyle = '#f4f5f7'; x.beginPath(); x.moveTo(0, -6.2); x.lineTo(3.2, -2.6); x.lineTo(-3.2, -2.6); x.closePath(); x.fill(); x.beginPath(); x.moveTo(0, 6.2); x.lineTo(3.2, 2.6); x.lineTo(-3.2, 2.6); x.closePath(); x.fill(); });
          poe(corpo, d, px, py, ZF + 0.0026);
          for (const [nome, dy] of [['up', 0.0045], ['down', -0.0045]]) { const h = new T.Mesh(new T.BoxGeometry(0.017, 0.0085, 0.002), invis); poe(corpo, h, px, py + dy, ZF + 0.004); h.userData.z0 = ZF + 0.004; tk[nome] = ctl(h, c.id, 'tecla', { tecla: nome }); } }
        const redonda = (nome, mx, my, r, cor, des) => { aroT(mx, my, r); tecla(nome, disco(r, cor, des), mx, my, 0.0026); };
        redonda('giro', 7.5, 20.0, 0.0045, C.mar, (x) => { x.strokeStyle = '#fff'; x.lineWidth = 0.9; x.beginPath(); x.arc(0, 0, 2.3, -0.9, 3.9); x.stroke(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0.4, -3.3); x.lineTo(3.1, -1.9); x.lineTo(0.9, -0.3); x.closePath(); x.fill(); });
        redonda('locrem', 18.9, 27.8, 0.0045, C.mar, (x) => { txt(x, 'LOC', 2.6, 0, -1.3, '#fff', 800); txt(x, 'REM', 2.6, 0, 1.7, '#fff', 800); });
        redonda('jog', 30.3, 30.4, 0.0045, C.mar, (x) => { txt(x, 'JOG', 3, 0, 0.2, '#fff', 800); });
        redonda('o', 41.25, 27.9, 0.00495, '#d62a2c', (x) => { x.strokeStyle = '#fff'; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, 2.7, 0, 7); x.stroke(); });
        redonda('i', 52.0, 19.75, 0.00495, '#23a548', (x) => { x.fillStyle = '#fff'; x.fillRect(-0.55, -2.8, 1.1, 5.6); });
        let ult = '';
        return { gr, lcd, tk, upd: () => {
          const d = banc.inv.hmi.display(), chave = JSON.stringify(d) + (d.menuPisca || d.giroPisca ? Math.floor(perfNow() / 150) : '');
          if (chave !== ult) { ult = chave; SIM.desenhaHMI(lcd.x, 486, 300, d); lcd.t.needsUpdate = true; }
        } };
      },
      bot(c) {
        const cor = c.cor || 'verde', gr = baseModulo(c, (x, d) => { desContatos(x, d); txt(x, cor === 'verde' ? 'LIGA' : cor === 'vermelho' ? 'DESLIGA' : 'PULSO', 6.5, 0, -72, '#3a4753'); });
        aro(gr, 0.04); const cap = ctl(poe(gr, cz(0.0115, 0.012, mat(CORES[cor], { roughness: 0.35 })), 0, 0.04, 0.024), c.id, 'btn');
        return { gr, upd: (s) => { cap.position.z = s.ap ? 0.019 : 0.024; } };
      },
      chave(c) {
        const gr = baseModulo(c, (x, d) => { desContatos(x, d); txt(x, '0', 10, -24, -62); txt(x, '1', 10, 24, -62); });
        aro(gr, 0.04); const kn = new T.Group(); poe(gr, kn, 0, 0.04, 0.018); kn.add(cz(0.0125, 0.012, preto)); ctl(poe(kn, caixa(0.007, 0.034, 0.012, mat(0x2b2e33)), 0, 0.004, 0.008), c.id, 'sel'); poe(kn, caixa(0.002, 0.014, 0.0125, mat(0xf2f2f2)), 0, 0.012, 0.0082);
        ctl(kn.children[0], c.id, 'sel');
        return { gr, upd: (s) => { kn.rotation.z += ((s.on ? -0.7 : 0.7) - kn.rotation.z) * 0.4; } };
      },
      emerg(c) {
        const gr = baseModulo(c, (x, d) => { desContatos(x, d); x.fillStyle = '#f3c300'; x.beginPath(); x.arc(0, -40, 34, 0, 7); x.fill(); x.save(); x.translate(0, -40); for (let i = 0; i < 3; i++) { x.rotate(Math.PI * 2 / 3); txt(x, 'EMERGÊNCIA', 5.2, 0, -28, '#111'); } x.restore(); });
        aro(gr, 0.04, 0.017); const cog = new T.Group(); poe(gr, cog, 0, 0.04, 0.02); ctl(poe(cog, cz(0.02, 0.014, mat(0xc81e1e, { roughness: 0.35 }), 28, 0.016), 0, 0, 0.012), c.id, 'emerg'); ctl(poe(cog, cz(0.012, 0.012, mat(0xb01818)), 0, 0, 0), c.id, 'emerg');
        return { gr, upd: (s) => { cog.position.z += ((s.ap ? 0.012 : 0.02) - cog.position.z) * 0.5; } };
      },
      pot(c) {
        const gr = baseModulo(c, (x) => { x.strokeStyle = '#1c2530'; x.lineWidth = 1; for (let i = 0; i <= 10; i++) { const a = (-150 + i * 30) * Math.PI / 180, s = Math.sin(a), co = -Math.cos(a); x.beginPath(); x.moveTo(s * 26, -35 + co * 26); x.lineTo(s * 30, -35 + co * 30); x.stroke(); txt(x, String(i), 6.5, s * 37, -35 + co * 37, '#1c2530'); } txt(x, '5 kΩ LIN', 6, 0, 22, '#3a4753'); });
        const kn = new T.Group(); poe(gr, kn, 0, 0.035, 0.012); ctl(poe(kn, cz(0.019, 0.018, preto, 32, 0.016), 0, 0, 0.009), c.id, 'pot'); poe(kn, caixa(0.003, 0.016, 0.019, mat(0xf2f2f2)), 0, 0.009, 0.0092); poe(kn, cz(0.021, 0.004, mat(0x33373c)), 0, 0, 0.002);
        return { gr, upd: (s) => { kn.rotation.z = (150 - s.pos * 300) * Math.PI / 180; } };
      },
      sinal(c) {
        const cor = c.cor || 'verde', gr = baseModulo(c, (x) => { txt(x, 'LED', 6.5, 0, -8, '#3a4753'); });
        aro(gr, 0.03); const m = new T.MeshStandardMaterial({ color: CORES[cor], emissive: CORES[cor], emissiveIntensity: 0, roughness: 0.25, transparent: true, opacity: 0.92 });
        poe(gr, cz(0.0118, 0.012, m), 0, 0.03, 0.022); const dom2 = som(new T.Mesh(new T.SphereGeometry(0.0118, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m)); dom2.rotation.x = Math.PI / 2; poe(gr, dom2, 0, 0.03, 0.028);
        const luz = new T.PointLight(CORES[cor], 0, 0.5); poe(gr, luz, 0, 0.03, 0.06);
        return { gr, upd: (s) => { const b = s.brilho || 0; m.emissiveIntensity = b * 2.6; m.color.setHex(CORES[cor]).multiplyScalar(0.45 + 0.55 * b); luz.intensity = b * 0.35; } };
      },
      gerador(c) {
        const gr = baseModulo(c, (x) => { txt(x, 'AJUSTE', 6, -30, 0, '#3a4753'); txt(x, 'V / mA', 6, 34, 0, '#3a4753'); });
        poe(gr, caixa(0.092, 0.046, 0.006, mat(0x2a2d31)), 0, 0.048, 0.015); const lcd = tela(160, 70); poe(gr, new T.Mesh(new T.PlaneGeometry(0.082, 0.036), new T.MeshBasicMaterial({ map: lcd.t, toneMapped: false })), 0, 0.048, 0.0185);
        const kn = new T.Group(); poe(gr, kn, -0.03, -0.022, 0.012); ctl(poe(kn, cz(0.014, 0.016, preto, 24, 0.012), 0, 0, 0.008), c.id, 'gerknob'); poe(kn, caixa(0.0025, 0.011, 0.017, mat(0xf2f2f2)), 0, 0.007, 0.0085);
        ctl(poe(gr, caixa(0.022, 0.014, 0.01, mat(0x1e56b0, { roughness: 0.4 })), 0.034, -0.022, 0.017), c.id, 'germodo');
        let ult = '';
        return { gr, upd: (s) => { const k = s.modo + s.valor.toFixed(2); if (k !== ult) { ult = k; SIM.desenhaGerador(lcd.x, 160, 70, s); lcd.t.needsUpdate = true; } kn.rotation.z = -s.valor / (s.modo === 'V' ? 10 : 20) * 4.7; } };
      },
      motor(c) {
        const gr = new T.Group(), azul = mat(0x1f5fb4, { roughness: 0.5, metalness: 0.15 }), d = TIPOS.motor, cy = 0.112;
        const base = poe(gr, caixa(0.47, 0.014, 0.25, mat(0x4a5057, { metalness: 0.5, roughness: 0.5 })), 0, 0.007, 0); base.userData = { kind: 'corpo', id: c.id }; alvos.push(base);
        const eixoX = (m) => { m.rotation.z = Math.PI / 2; return m; };
        const corpo = poe(gr, eixoX(cil(0.072, 0.2, azul, 40)), -0.06, cy, 0); corpo.userData = { kind: 'corpo', id: c.id }; alvos.push(corpo);
        for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2; if (Math.abs(Math.cos(a)) > 0.93 && Math.cos(a) > 0) continue; const f = poe(gr, caixa(0.18, 0.011, 0.0035, azul), -0.06, cy + Math.cos(a) * 0.075, Math.sin(a) * 0.075); f.rotation.x = a; }
        poe(gr, eixoX(cil(0.076, 0.022, azul, 40)), 0.048, cy, 0); poe(gr, eixoX(cil(0.076, 0.016, azul, 40)), -0.165, cy, 0);
        poe(gr, eixoX(cil(0.078, 0.07, azul, 40)), -0.205, cy, 0); poe(gr, eixoX(cil(0.066, 0.004, mat(0x16191c), 40)), -0.2415, cy, 0);
        for (const x of [-0.14, 0.02]) poe(gr, caixa(0.03, 0.045, 0.19, azul), x, 0.036, 0);
        // caixa de ligação com os bornes no topo
        const cl = poe(gr, caixa(0.13, 0.05, 0.085, azul), -0.06, cy + 0.092, 0);
        const tampa = placaTex(130, 85, (x) => { x.fillStyle = '#e9ebe6'; x.beginPath(); x.roundRect(-63, -40, 126, 80, 4); x.fill(); txt(x, c.id + ' · LIGAÇÃO Δ 220 V', 7.5, 0, -30, '#1c2530'); for (const t of d.term) txt(x, t.nome, 9, t.x, 26, '#1c2530'); });
        const tp = poe(gr, plano(0.13, 0.085, tampa), -0.06, cy + 0.1175, 0); tp.rotation.x = -Math.PI / 2; tp.userData = { kind: 'corpo', id: c.id }; alvos.push(tp); cl.userData = tp.userData; alvos.push(cl);
        for (const t of d.term) borne(gr, c.id + '.' + t.id, t, -0.06 + t.x / 1000, cy + 0.117, 0, new V3(0, 1, 0));
        const pl = placaTex(70, 44, (x) => { x.fillStyle = '#cfd3d6'; x.fillRect(-35, -22, 70, 44); txt(x, 'weg  W22 IR3 Premium', 5, 0, -16, '#111'); const P = SIM.PLACA; x.textAlign = 'left';
          [`3~  ${P.kw} kW (${P.cv} cv)  ${P.polos} polos`, `Δ ${P.v} V  ${String(P.i).replace('.', ',')} A`, `Y ${P.vY} V  ${String(P.iY).replace('.', ',')} A`, `${P.rpm} rpm   ${P.hz} Hz`, `cos φ ${P.cos.toFixed(2).replace('.', ',')}  η ${String(P.rend).replace('.', ',')} %  FS ${String(P.fs).replace('.', ',')}`].forEach((l, i) => txt(x, l, 4.6, -32, -8 + i * 6.6, '#111', 700)); }, 6);
        poe(gr, plano(0.07, 0.044, pl, { metalness: 0.5, roughness: 0.4 }), -0.06, cy - 0.005, 0.0735).castShadow = false;
        // eixo, acoplamento e disco de freio (giram)
        const rot = new T.Group(); poe(gr, rot, 0, cy, 0);
        poe(rot, eixoX(cil(0.011, 0.16, aco, 20)), 0.13, 0, 0); poe(rot, eixoX(cil(0.024, 0.04, mat(0xd0621a, { roughness: 0.5 }), 24)), 0.098, 0, 0);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; poe(rot, caixa(0.042, 0.008, 0.008, mat(0x26292d)), 0.098, Math.cos(a) * 0.022, Math.sin(a) * 0.022); }
        const dt2 = tela(256, 256); const X = dt2.x; X.fillStyle = '#c3c8cc'; X.fillRect(0, 0, 256, 256); X.translate(128, 128); X.fillStyle = '#23262a'; X.beginPath(); X.moveTo(0, 0); X.arc(0, 0, 128, -0.35, 0.35); X.fill(); X.fillStyle = '#f3c300'; X.beginPath(); X.moveTo(0, 0); X.arc(0, 0, 128, Math.PI - 0.12, Math.PI + 0.12); X.fill();
        X.fillStyle = '#8b9197'; for (let i = 0; i < 6; i++) { X.beginPath(); X.arc(Math.cos(i * 1.047 + 0.5) * 80, Math.sin(i * 1.047 + 0.5) * 80, 12, 0, 7); X.fill(); } X.fillStyle = '#7b8187'; X.beginPath(); X.arc(0, 0, 26, 0, 7); X.fill(); dt2.t.needsUpdate = true;
        const face = new T.MeshStandardMaterial({ map: dt2.t, metalness: 0.5, roughness: 0.4 }), disco = som(new T.Mesh(new T.CylinderGeometry(0.082, 0.082, 0.012, 48), [aco, face, face])); eixoX(disco); poe(rot, disco, 0.155, 0, 0);
        const vol = som(new T.Mesh(new T.CylinderGeometry(0.095, 0.095, 0.034, 48), [mat(0x565c63, { metalness: 0.7, roughness: 0.35 }), face, face])); eixoX(vol); poe(rot, vol, 0.185, 0, 0);
        // freio (pinça) e mancal
        poe(gr, caixa(0.04, 0.045, 0.05, mat(0x8a1f1f)), 0.155, cy + 0.07, 0); poe(gr, caixa(0.02, cy + 0.02, 0.05, mat(0x4a5057, { metalness: 0.5 })), 0.215, (cy + 0.02) / 2, 0); poe(gr, caixa(0.016, cy + 0.05, 0.016, mat(0x4a5057, { metalness: 0.5 })), 0.155, (cy + 0.05) / 2 + 0.055, -0.06).visible = false;
        return { gr, rot, upd: () => { rot.rotation.x = -banc.motor.ang / 6; vol.visible = banc.motor.volante; } };
      },
      multi(c) {
        const gr = new T.Group(), inc = new T.Group(); poe(gr, inc, 0, 0.012, 0); inc.rotation.x = -1.0;
        const face = placaTex(95, 190, (x) => {
          x.fillStyle = '#f0a81c'; x.beginPath(); x.roundRect(-47, -95, 94, 190, 8); x.fill(); x.fillStyle = '#2b2e33'; x.beginPath(); x.roundRect(-41, -89, 82, 178, 6); x.fill();
          txt(x, 'MULTÍMETRO DIGITAL', 5, 0, -84, '#f0a81c'); const R = 31; SIM.MODOS_MULTI.forEach((m, i) => { const a = (-90 + (i - 2) * 42) * Math.PI / 180; txt(x, m, m.length > 2 ? 6 : 8, Math.cos(a) * R * 1.02, 12 + Math.sin(a) * R, m === 'OFF' ? '#ff8a80' : '#ffffff'); });
          txt(x, 'COM', 6, -22, 80, '#fff'); txt(x, 'VΩ', 6, 22, 80, '#ff8a80'); txt(x, 'CAT III 600 V', 4.5, 0, 88, '#9aa3ab', 400);
        });
        const l = mat(0xe79b12, { roughness: 0.5 }), corpo = som(new T.Mesh(new T.BoxGeometry(0.095, 0.19, 0.036), [l, l, l, l, new T.MeshStandardMaterial({ map: face, roughness: 0.55 }), l])); poe(inc, corpo, 0, 0.095, 0.0); corpo.userData = { kind: 'corpo', id: c.id }; alvos.push(corpo);
        poe(gr, caixa(0.07, 0.008, 0.1, mat(0x2b2e33)), 0, 0.004, -0.085);
        const lcd = tela(200, 90); const ml = poe(inc, new T.Mesh(new T.PlaneGeometry(0.066, 0.03), new T.MeshBasicMaterial({ map: lcd.t, toneMapped: false })), 0, 0.152, 0.0185);
        const kn = new T.Group(); poe(inc, kn, 0, 0.083, 0.018); ctl(poe(kn, cz(0.019, 0.01, mat(0x3a3e44), 28), 0, 0, 0.005), c.id, 'mmknob'); ctl(poe(kn, caixa(0.008, 0.036, 0.008, mat(0x1d1f22)), 0, 0, 0.012), c.id, 'mmknob'); poe(kn, caixa(0.003, 0.012, 0.0085, mat(0xffffff)), 0, 0.012, 0.0122);
        const jv = poe(inc, cz(0.0055, 0.004, mat(0xc62828)), 0.022, 0.026, 0.019), jc = poe(inc, cz(0.0055, 0.004, mat(0x111111)), -0.022, 0.026, 0.019);
        let ult = '';
        return { gr, jv, jc, upd: (s) => { const L = banc.leitura, k = JSON.stringify(L); if (k !== ult) { ult = k; SIM.desenhaMulti(lcd.x, 200, 90, L); lcd.t.needsUpdate = true; } kn.rotation.z = -(s.modo - 2) * 42 * Math.PI / 180; } };
      },
    };
    const perfNow = () => (g.performance ? performance.now() : Date.now());

    function posiciona(c) {
      const v = vistas[c.id]; if (!v) return;
      if (TIPOS[c.tipo].plano === 'painel') v.gr.position.set(c.x, MESA_Y + c.y, 0); else v.gr.position.set(c.x, MESA_Y, c.y);
      v.gr.updateMatrixWorld(true);
    }
    function reconstruir() {
      gComp.clear(); gFios.clear(); vistas = {}; termos = {}; alvos = alvos.filter((a) => a.userData.kind === 'ponta'); fiosV = {};
      for (const c of banc.comps) { const v = FAB[c.tipo](c); vistas[c.id] = v; gComp.add(v.gr); posiciona(c); }
      for (const f of banc.fios) fazFio(f);
      sel = null; pend = null; marcaSel();
    }

    // ---------------------------------------------------------------- fios (cabos banana) e pontas do multímetro
    const posT = (ref) => { const m = termos[ref]; if (!m) return null; const p = new V3(); m.getWorldPosition(p); const n = m.userData.normal; return { p: p.addScaledVector(n, -0.004), n }; };
    // ---- cabo maleável: cada fio é uma corrente de nós com gravidade (integração de Verlet). Ele pende entre os plugues,
    // deita na mesa, encosta no painel e contorna o inversor, o disjuntor e o motor. Arrastar um ponto do fio leva o cabo
    // junto; ao soltar, o ponto fica preso numa presilha, que pode ser movida de novo ou retirada.
    const RC = 0.0026, FOLGA = (d, fr) => d * 1.10 + 0.03 * fr, GRAV = 9.8 / (120 * 120);
    let caixas = [];
    function atualizaCaixas() {                                  // volumes que o cabo não atravessa
      caixas = [];
      for (const c of banc.comps) {
        const y = MESA_Y + c.y;
        if (c.tipo === 'cfw') caixas.push({ x0: c.x - 0.041, x1: c.x + 0.041, y0: y + 0.045 - 0.086, y1: y + 0.045 + 0.086, z0: -1, z1: 0.166, modo: 'frente' });
        else if (c.tipo === 'disj') caixas.push({ x0: c.x - 0.03, x1: c.x + 0.03, y0: y - 0.046, y1: y + 0.046, z0: -1, z1: 0.095, modo: 'frente' });
        else if (c.tipo === 'motor') caixas.push({ x0: c.x - 0.245, x1: c.x + 0.235, y0: MESA_Y, y1: MESA_Y + 0.205, z0: c.y - 0.092, z1: c.y + 0.092, modo: 'volta' });
      }
    }
    function colide(p) {
      if (p.z < 0.016 + RC && p.y > MESA_Y && p.y < MESA_Y + 1.07 && Math.abs(p.x) < 0.96) p.z = 0.016 + RC;                   // placas dos módulos no painel
      for (const b of caixas) if (p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1 && p.z > b.z0 && p.z < b.z1 + RC) {
        if (b.modo === 'frente') p.z = b.z1 + RC;
        else { const dc = b.y1 + RC - p.y, df = b.z1 + RC - p.z, dt = p.z - (b.z0 - RC); if (dc <= df && dc <= dt) p.y = b.y1 + RC; else if (df <= dt) p.z = b.z1 + RC; else p.z = b.z0 - RC; }
      }
      if (p.y < MESA_Y + RC && p.z > -0.06 && p.z < 0.79 && Math.abs(p.x) < 1.05) { p.y = MESA_Y + RC; return true; }           // tampo da mesa
      return false;
    }
    const pino = (m) => cil(0.0056, 0.03, m, 12);
    const poePino = (c, p, n) => { c.position.copy(p).addScaledVector(n, 0.017); c.quaternion.setFromUnitVectors(new V3(0, 1, 0), n); };
    /** pontas(): { a, na, b, nb } em coordenadas do mundo (ou null); fixos(): Map índice do nó -> posição (presilhas e nó arrastado) */
    function criaCorda(raio, material, pontas, fixos) {
      const c = { raio, pontas, fixos: fixos || (() => new Map()), nos: [], ant: [], seg: [], n: 0, acordada: 0, mesh: som(new T.Mesh(new T.BufferGeometry(), material), true, false) };
      const e = pontas(); if (!e) return c;
      const a1 = e.a.clone().addScaledVector(e.na, 0.034), b1 = e.b.clone().addScaledVector(e.nb, 0.034), d = a1.distanceTo(b1);
      c.n = Math.max(10, Math.min(40, Math.round(FOLGA(d, 1) / 0.028)));
      for (let k = 0; k < c.n; k++) { const t = k / (c.n - 1), q = a1.clone().lerp(b1, t); q.y -= Math.sin(Math.PI * t) * d * 0.2; q.z += Math.sin(Math.PI * t) * 0.04; c.nos.push(q); c.ant.push(q.clone()); }
      return c;
    }
    function passoCorda(c) {
      const e = c.pontas(); if (!e || !c.n) return null; const N = c.n, fx = c.fixos();
      fx.set(0, e.a.clone().addScaledVector(e.na, 0.034)); fx.set(N - 1, e.b.clone().addScaledVector(e.nb, 0.034));
      const ks = [...fx.keys()].sort((x, y) => x - y);
      for (const k of ks) { c.nos[k].copy(fx.get(k)); c.ant[k].copy(fx.get(k)); }
      for (let m = 0; m + 1 < ks.length; m++) { const j = ks[m], k = ks[m + 1], l = FOLGA(fx.get(j).distanceTo(fx.get(k)), (k - j) / (N - 1)) / (k - j); for (let q = j; q < k; q++) c.seg[q] = l; }   // folga de 10 % em cada trecho
      for (let sub = 0; sub < 2; sub++) {
        for (let k = 0; k < N; k++) if (!fx.has(k)) { const p = c.nos[k], a = c.ant[k], vx = (p.x - a.x) * 0.93, vy = (p.y - a.y) * 0.93, vz = (p.z - a.z) * 0.93; a.copy(p); p.x += vx; p.y += vy - GRAV; p.z += vz; }
        for (let it = 0; it < 10; it++) {
          for (let k = 0; k + 1 < N; k++) {
            const p = c.nos[k], q = c.nos[k + 1], dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, dif = (l - c.seg[k]) / l, fp = fx.has(k), fq = fx.has(k + 1);
            if (fp && fq) continue; const wp = fp ? 0 : fq ? 1 : 0.5, wq = fq ? 0 : fp ? 1 : 0.5;
            p.x += dx * dif * wp; p.y += dy * dif * wp; p.z += dz * dif * wp; q.x -= dx * dif * wq; q.y -= dy * dif * wq; q.z -= dz * dif * wq;
          }
          for (let k = 0; k < N; k++) if (!fx.has(k) && colide(c.nos[k])) { const p = c.nos[k], a = c.ant[k]; a.x += (p.x - a.x) * 0.35; a.z += (p.z - a.z) * 0.35; }       // atrito no tampo da mesa
        }
      }
      return e;
    }
    function desenhaCorda(c, e) { const cv = new T.CatmullRomCurve3([e.a, ...c.nos, e.b], false, 'centripetal'); c.mesh.geometry.dispose(); c.mesh.geometry = new T.TubeGeometry(cv, c.n * 2, c.raio, 6, false); c.curva = cv; }
    function assenta(c, passos) { atualizaCaixas(); let e = null; for (let k = 0; k < passos; k++) e = passoCorda(c); if (e) desenhaCorda(c, e); }
    const nosPresos = (f, c, extra) => { const m = new Map(); for (const pn of f.pinos || []) m.set(Math.max(2, Math.min(c.n - 3, Math.round(pn.t * (c.n - 1)))), new V3(pn.x, pn.y, pn.z)); if (extra) m.set(extra.k, extra.p); return m; };
    function fazFio(f) {
      const a = posT(f.a), b = posT(f.b); if (!a || !b) return;
      const m = mat(CORES[f.cor] || CORES.azul, { roughness: 0.5 }), old = fiosV[f.id]; if (old) tiraFio(f.id);
      const v = { gr: new T.Group(), arrasto: null, presilhas: [] };
      v.corda = criaCorda(RC, m, () => { const A = posT(f.a), B = posT(f.b); return A && B ? { a: A.p, na: A.n, b: B.p, nb: B.n } : null; }, () => nosPresos(f, v.corda, v.arrasto));
      v.tubo = v.corda.mesh; v.pa = pino(m); v.pb = pino(m); poePino(v.pa, a.p, a.n); poePino(v.pb, b.p, b.n);
      v.pick = new T.Mesh(new T.BufferGeometry(), invis); v.pick.userData = { kind: 'fio', id: f.id };              // alvo mais gordo: o fio tem 5 mm, o dedo não
      v.gr.add(v.tubo, v.pick, v.pa, v.pb); gFios.add(v.gr); fiosV[f.id] = v;
      assenta(v.corda, 150); fazPick(v); fazPresilhas(f);
    }
    function fazPick(v) { if (!v.corda.curva) return; v.pick.geometry.dispose(); v.pick.geometry = new T.TubeGeometry(v.corda.curva, v.corda.n, 0.008, 5, false); }
    function fazPresilhas(f) {
      const v = fiosV[f.id]; if (!v) return; for (const m of v.presilhas) { v.gr.remove(m); alvos.splice(alvos.indexOf(m.children[0]), 1); } v.presilhas = [];
      (f.pinos || []).forEach((pn, i) => {
        const g2 = new T.Group(); g2.position.set(pn.x, pn.y, pn.z); const hit = new T.Mesh(new T.SphereGeometry(0.013, 10, 8), invis); hit.userData = { kind: 'pino', fio: f.id, i };
        g2.add(hit, som(new T.Mesh(new T.SphereGeometry(0.0062, 14, 10), mat(0x2b3138, { roughness: 0.35, metalness: 0.3 }))), som(new T.Mesh(new T.TorusGeometry(0.0062, 0.0016, 8, 18), mat(0xf2f2f2))));
        v.gr.add(g2); alvos.push(hit); v.presilhas.push(g2);
      });
    }
    function tiraFio(id) { const v = fiosV[id]; if (!v) return; for (const m of v.presilhas) alvos.splice(alvos.indexOf(m.children[0]), 1); gFios.remove(v.gr); v.tubo.geometry.dispose(); v.pick.geometry.dispose(); delete fiosV[id]; }
    function sincFios() {       // depois de mudar a lista de fios fora da cena (montagem pronta, limpar...)
      for (const id in fiosV) if (!banc.fios.some((f) => f.id === +id)) tiraFio(id);
      for (const f of banc.fios) if (!fiosV[f.id]) fazFio(f);
      if (sel && sel.fio && !fiosV[sel.fio]) sel = null; marcaSel();
    }
    const acorda = (id, quadros = 150) => { const v = fiosV[id]; if (v) v.corda.acordada = Math.max(v.corda.acordada, quadros); };
    const refazFiosDe = (id) => { for (const f of banc.fios) if (f.a.startsWith(id + '.') || f.b.startsWith(id + '.')) acorda(f.id); };
    function animaFios() {
      let algum = false; for (const id in fiosV) if (fiosV[id].corda.acordada > 0) algum = true; for (const k in pontas) if (pontas[k].corda && pontas[k].corda.acordada > 0) algum = true;
      if (!algum) return; atualizaCaixas();
      for (const id in fiosV) {
        const v = fiosV[id], c = v.corda; if (c.acordada <= 0) continue;
        const e = passoCorda(c); if (!e) continue; desenhaCorda(c, e); poePino(v.pa, e.a, e.na); poePino(v.pb, e.b, e.nb);
        if (--c.acordada <= 0) fazPick(v);
      }
      for (const k in pontas) { const c = pontas[k].corda; if (c && c.acordada > 0) { const e = passoCorda(c); if (e) desenhaCorda(c, e); c.acordada--; } }
    }
    const pontas = {};
    for (const [k, cor] of [['pv', 0xc62828], ['pc', 0x18181a]]) {
      const gr = new T.Group(), m = mat(cor, { roughness: 0.45 });
      poe(gr, cz(0.0011, 0.022, aco, 8), 0, 0, 0.011); poe(gr, cz(0.0042, 0.03, m, 12, 0.002), 0, 0, 0.037); poe(gr, cz(0.0062, 0.085, m, 14), 0, 0, 0.094); poe(gr, cz(0.0085, 0.004, m, 14), 0, 0, 0.054);
      const hit = new T.Mesh(new T.CylinderGeometry(0.014, 0.014, 0.13, 8), invis); hit.rotation.x = Math.PI / 2; hit.position.z = 0.075; hit.userData = { kind: 'ponta', k }; gr.add(hit); alvos.push(hit);
      gPontas.add(gr); pontas[k] = { gr, livre: null, m, corda: null, ext: null };
    }
    function atualizaPontas() {
      const mm = banc.porTipo('multi'), v = mm && vistas[mm.id]; gPontas.visible = !!v; if (!v) return;
      for (const k of ['pv', 'pc']) {
        const p = pontas[k], ref = mm.st[k], t = ref && posT(ref), lado = k === 'pv' ? 1 : -1;
        if (p.livre) { p.gr.position.copy(p.livre.p); p.gr.quaternion.setFromUnitVectors(new V3(0, 0, 1), p.livre.n); }
        else if (t) { const n = t.n.clone().add(new V3(lado * 0.32, t.n.y ? 0 : 0.18, t.n.y ? 0.3 : 0)).normalize(); p.gr.position.copy(t.p).addScaledVector(t.n, 0.006); p.gr.quaternion.setFromUnitVectors(new V3(0, 0, 1), n); }
        else { p.gr.position.set(mm.x + 0.085 + (k === 'pv' ? 0.03 : 0), MESA_Y + 0.008, mm.y - 0.05); p.gr.quaternion.setFromUnitVectors(new V3(0, 0, 1), new V3(0, 0, 1)); }
        p.gr.updateMatrixWorld(true);
        const j = new V3(); v[k === 'pv' ? 'jv' : 'jc'].getWorldPosition(j); const fim = new V3(0, 0, 0.137).applyMatrix4(p.gr.matrixWorld), dir = new V3(0, 0, 1).transformDirection(p.gr.matrixWorld);
        const chave = j.toArray().concat(fim.toArray(), dir.toArray()).map((x) => x.toFixed(3)).join();
        p.ext = { a: j, na: new V3(0, -0.35, 0.94).normalize(), b: fim, nb: dir };
        if (!p.corda) { p.corda = criaCorda(0.0022, p.m, () => p.ext); gPontas.add(p.corda.mesh); assenta(p.corda, 150); }
        if (chave !== p.chave) { p.chave = chave; p.corda.acordada = 150; }
      }
    }

    // ---------------------------------------------------------------- câmera (órbita própria: arrastar o fundo gira, botão direito/dois dedos desloca, roda aproxima)
    const camS = { alvo: new V3(-0.05, 1.27, 0.12), r: 2.5, az: 0, el: 0.17 }, camD = { alvo: camS.alvo.clone(), r: camS.r, az: camS.az, el: camS.el };
    const VISTAS = { geral: () => [new V3(-0.05, 1.27, 0.12), 2.5, 0, 0.17], inversor: () => { const c = banc.porTipo('cfw'); return [new V3(c.x, MESA_Y + c.y + 0.05, 0.1), 0.75, 0, 0.05]; },
      bornes: () => { const c = banc.porTipo('cfw'); return [new V3(c.x, MESA_Y + c.y - 0.18, 0.02), 0.5, 0, 0.12]; }, comando: () => [new V3(0.12, MESA_Y + 0.57, 0.02), 1.25, 0, 0.06],
      motor: () => { const c = banc.porTipo('motor'); return [new V3(c.x, MESA_Y + 0.12, c.y), 0.95, 0.35, 0.42]; }, multimetro: () => { const c = banc.porTipo('multi'); return [new V3(c.x, MESA_Y + 0.1, c.y), 0.55, 0, 0.75]; } };
    function vista(n) { const v = VISTAS[n] && VISTAS[n](); if (!v) return; camD.alvo.copy(v[0]); camD.r = v[1]; camD.az = v[2]; camD.el = v[3]; }
    function aplicaCam(k) {
      camS.alvo.lerp(camD.alvo, k); camS.r += (camD.r - camS.r) * k; camS.az += (camD.az - camS.az) * k; camS.el += (camD.el - camS.el) * k;
      const ce = Math.cos(camS.el); cam.position.set(camS.alvo.x + camS.r * ce * Math.sin(camS.az), camS.alvo.y + camS.r * Math.sin(camS.el), camS.alvo.z + camS.r * ce * Math.cos(camS.az)); cam.lookAt(camS.alvo);
    }
    function redimensiona() { const w = el.clientWidth || 800, h = el.clientHeight || 600; renderer.setSize(w, h, false); dom.style.width = w + 'px'; dom.style.height = h + 'px'; cam.aspect = w / h; cam.fov = w / h < 1 ? 58 : 42; cam.updateProjectionMatrix(); }
    const ro = new ResizeObserver(redimensiona); ro.observe(el); redimensiona();

    // ---------------------------------------------------------------- interação
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    let sel = null, pend = null, armada = null, corFio = 'auto', hover = null;
    const destaque = new T.Mesh(new T.TorusGeometry(0.0125, 0.0022, 8, 24), new T.MeshBasicMaterial({ color: 0xffd400 })); destaque.visible = false; scene.add(destaque);
    const marcaIni = new T.Mesh(new T.TorusGeometry(0.0125, 0.0026, 8, 24), new T.MeshBasicMaterial({ color: 0x18c964 })); marcaIni.visible = false; scene.add(marcaIni);
    const elastico = new T.Line(new T.BufferGeometry().setFromPoints([new V3(), new V3()]), new T.LineBasicMaterial({ color: 0x18c964 })); elastico.visible = false; elastico.frustumCulled = false; scene.add(elastico);
    const anelEm = (m, ref) => { const t = posT(ref); if (!t) { m.visible = false; return; } m.visible = true; m.position.copy(t.p).addScaledVector(t.n, 0.014); m.quaternion.setFromUnitVectors(new V3(0, 0, 1), t.n); };
    function raio(ev) { const r = dom.getBoundingClientRect(); ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); }
    function pega(ev, filtro) {
      raio(ev); const hits = ray.intersectObjects(alvos.concat(Object.values(fiosV).map((f) => f.pick)), false).filter((h) => !filtro || filtro(h.object.userData));
      if (!hits.length) return null;
      // um fio passando na frente não esconde o borne, a ponta nem o botão que está atrás dele
      const pr = (u) => (u.kind === 'ponta' ? 0 : u.kind === 'pino' ? 0.5 : u.kind === 'term' ? 1 : u.kind === 'ctl' ? 2 : 4), solidos = hits.filter((h) => h.object.userData.kind !== 'fio');
      const cand = solidos.length ? solidos.filter((h) => h.distance < solidos[0].distance + 0.03).sort((a, b) => pr(a.object.userData) - pr(b.object.userData))[0] : null;
      if (cand && pr(cand.object.userData) < 4) {
        const u = cand.object.userData, c = new V3();
        if (u.kind === 'term' && hits[0].object.userData.kind === 'fio' && ray.ray.distanceToPoint(cand.object.getWorldPosition(c)) > 0.0095) return hits[0];   // fora do miolo do borne: vale o fio
        return cand;
      }
      return hits[0].object.userData.kind === 'fio' ? hits[0] : cand;
    }
    const noPlano = (normal, pt) => { const out = new V3(); return ray.ray.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(normal, pt), out) ? out : null; };
    function marcaSel() {
      for (const id in fiosV) { const f = banc.fios.find((x) => x.id === +id); if (f) fiosV[id].tubo.material = sel && sel.fio === +id ? selMat : mat(CORES[f.cor] || CORES.azul, { roughness: 0.5 }); }
      cb.selecao && cb.selecao(sel);
    }
    const selMat = new T.MeshStandardMaterial({ color: 0xffd400, emissive: 0xffa000, emissiveIntensity: 0.9 });
    const corAuto = (a, b) => { const ia = banc.infoTerm(a), ib = banc.infoTerm(b), ca = ia.term.cor, cbb = ib.term.cor; if (ca === 'verde' || cbb === 'verde') return 'verde'; for (const c of ['vermelho', 'amarelo']) if (ca === c || cbb === c) return c; return ca === 'preto' && cbb === 'preto' ? 'preto' : 'azul'; };
    function ligar(a, b) {
      const f = banc.addFio(a, b, corFio === 'auto' ? corAuto(a, b) : corFio);
      if (f) { fazFio(f); cb.toast && cb.toast(`Fio ${f.a.replace('.', ':')} → ${f.b.replace('.', ':')}`); } else if (a !== b) cb.toast && cb.toast('Esses dois bornes já estão ligados por um fio.');
    }
    function removerSel() { if (!sel || !sel.fio) return; banc.removerFio(sel.fio); sel = null; sincFios(); }
    function cancela() { pend = null; armada = null; marcaIni.visible = false; elastico.visible = false; dom.style.cursor = ''; cb.modo && cb.modo(''); }

    const pts = new Map(); let gesto = null, pinch = 0;
    function acionar(u, baixo, ev) {
      const c = banc.comp(u.id); if (!c) return;
      if (u.tipo === 'btn') banc.acao(c.id, { ap: baixo });
      else if (u.tipo === 'tecla') { banc.inv.hmi.tecla(u.tecla, baixo); const k = vistas[c.id].tk[u.tecla]; k.position.z = k.userData.z0 - (baixo ? 0.0011 : 0); }
      else if (!baixo) {
        if (u.tipo === 'geral') { banc.acao(c.id, { ligada: !(c.st.ligada && !c.st.desarmada) }); cb.toast && cb.toast(c.st.ligada ? 'Chave geral LIGADA' : 'Chave geral desligada'); }
        else if (u.tipo === 'alav') banc.acao(c.id, { fechado: !c.st.fechado });
        else if (u.tipo === 'sel') banc.acao(c.id, { on: !c.st.on });
        else if (u.tipo === 'emerg') { banc.acao(c.id, { ap: !c.st.ap }); cb.toast && cb.toast(c.st.ap ? 'Emergência ACIONADA (clique de novo para destravar)' : 'Emergência destravada'); }
        else if (u.tipo === 'mmknob') banc.acao(c.id, { modo: (c.st.modo + (ev && (ev.button === 2 || ev.shiftKey) ? 4 : 1)) % 5 });
        else if (u.tipo === 'germodo') banc.acao(c.id, { modo: c.st.modo === 'V' ? 'mA' : 'V', valor: c.st.modo === 'V' ? 4 : 0 });
        else if (u.tipo === 'lcd') cb.abreHMI && cb.abreHMI();
      }
    }
    function giraBotao(u, delta) {
      const c = banc.comp(u.id); if (!c) return;
      if (u.tipo === 'pot') banc.acao(c.id, { pos: Math.max(0, Math.min(1, c.st.pos + delta)) });
      else if (u.tipo === 'gerknob') { const mx = c.st.modo === 'V' ? 10 : 24, casas = c.st.modo === 'V' ? 2 : 1; banc.acao(c.id, { valor: +Math.max(0, Math.min(mx, c.st.valor + delta * mx)).toFixed(casas) }); }
    }
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (ev) => {
      dom.setPointerCapture(ev.pointerId); pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) { if (gesto && gesto.fim) gesto.fim(true); gesto = { tipo: 'pinch' }; const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); return; }
      const h = pega(ev), u = h && h.object.userData; gesto = { tipo: '', x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, moveu: false, botao: ev.button, u, h };
      if (ev.button === 2) { gesto.tipo = u && (u.kind === 'ctl' && u.tipo === 'mmknob') ? 'ctl' : 'pan'; return; }
      if (!u) { gesto.tipo = ev.shiftKey ? 'pan' : 'orbita'; return; }
      if (u.kind === 'ponta') { gesto.tipo = 'ponta'; }
      else if (u.kind === 'term') { gesto.tipo = 'term'; }
      else if (u.kind === 'ctl') { gesto.tipo = 'ctl'; if (u.tipo === 'btn' || u.tipo === 'tecla') { acionar(u, true); gesto.fim = () => acionar(u, false); } }
      else if (u.kind === 'fio') gesto.tipo = 'fio';
      else if (u.kind === 'pino') gesto.tipo = 'pino';
      else if (u.kind === 'corpo') { const c = banc.comp(u.id), painel = TIPOS[c.tipo].plano === 'painel'; const p = noPlano(painel ? new V3(0, 0, 1) : new V3(0, 1, 0), h.point); gesto.tipo = 'corpo'; gesto.c = c; gesto.painel = painel; gesto.pt = h.point.clone(); gesto.dx = c.x - p.x; gesto.dy = c.y - (painel ? p.y - MESA_Y : p.z); }
    });
    dom.addEventListener('pointermove', (ev) => {
      const p = pts.get(ev.pointerId); if (p) { p.x = ev.clientX; p.y = ev.clientY; }
      if (gesto && gesto.tipo === 'pinch' && pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) camD.r = Math.max(0.3, Math.min(6, camD.r * pinch / d)); pinch = d; return; }
      if (!gesto || !p) {                                         // só passando o mouse: destaque e dica do borne
        if (ev.pointerType !== 'mouse') return; const h = pega(ev), u = h && h.object.userData;
        if (u && u.kind === 'term') { anelEm(destaque, u.ref); const i = banc.infoTerm(u.ref); cb.dica && cb.dica(`${i.comp.id} · ${i.term.nome}${i.term.desc ? ' — ' + i.term.desc : ''}`, ev.clientX, ev.clientY); dom.style.cursor = 'crosshair'; }
        else { destaque.visible = false; cb.dica && cb.dica(u && u.kind === 'fio' && !pend && !armada ? 'Fio: arraste para puxar e prender · clique para selecionar · duplo clique remove' : u && u.kind === 'pino' ? 'Presilha: arraste para mudar · duplo clique solta o fio' : '', ev.clientX, ev.clientY); dom.style.cursor = u ? (u.kind === 'corpo' || u.kind === 'fio' || u.kind === 'pino' ? 'grab' : 'pointer') : pend || armada ? 'crosshair' : ''; }
        if (pend) { raio(ev); const t = posT(pend), q = noPlano(new V3(0, 0, 1), new V3(0, 0, 0.05)) || t.p; elastico.geometry.setFromPoints([t.p.clone().addScaledVector(t.n, 0.02), u && u.kind === 'term' ? posT(u.ref).p : q]); elastico.visible = true; }
        return;
      }
      const dx = ev.clientX - gesto.x, dy = ev.clientY - gesto.y; gesto.x = ev.clientX; gesto.y = ev.clientY;
      if (!gesto.moveu && Math.hypot(ev.clientX - gesto.x0, ev.clientY - gesto.y0) < (ev.pointerType === 'mouse' ? 4 : 9)) return;
      gesto.moveu = true;
      if (gesto.tipo === 'orbita') { camD.az = Math.max(-1.35, Math.min(1.35, camD.az - dx * 0.005)); camD.el = Math.max(-0.12, Math.min(1.45, camD.el + dy * 0.005)); }
      else if (gesto.tipo === 'pan') { const k = camD.r * 0.0011, dir = new V3(Math.cos(camS.az), 0, -Math.sin(camS.az)); camD.alvo.addScaledVector(dir, -dx * k); camD.alvo.y = Math.max(0.3, Math.min(2.4, camD.alvo.y + dy * k)); }
      else if (gesto.tipo === 'corpo') {
        raio(ev); const c = gesto.c, q = noPlano(gesto.painel ? new V3(0, 0, 1) : new V3(0, 1, 0), gesto.pt); if (!q) return;
        const L = LIM[gesto.painel ? 'painel' : 'mesa'], d = TIPOS[c.tipo], mw = gesto.painel ? d.w / 2000 : 0.05, mh = gesto.painel ? d.h / 2000 : 0;
        c.x = Math.max(L[0] + mw, Math.min(L[1] - mw, q.x + gesto.dx)); c.y = Math.max(L[2] + mh, Math.min(L[3] - mh, (gesto.painel ? q.y - MESA_Y : q.z) + gesto.dy));
        posiciona(c); refazFiosDe(c.id); dom.style.cursor = 'grabbing';
      } else if (gesto.tipo === 'fio' || gesto.tipo === 'pino') {          // puxando o cabo: o nó mais próximo acompanha o ponteiro
        const id = gesto.tipo === 'fio' ? gesto.u.id : gesto.u.fio, v = fiosV[id], f = banc.fios.find((x) => x.id === id); if (!v || !f) return;
        if (!v.arrasto) {
          let k = 0; if (gesto.tipo === 'pino') { k = Math.max(2, Math.min(v.corda.n - 3, Math.round(f.pinos[gesto.u.i].t * (v.corda.n - 1)))); f.pinos.splice(gesto.u.i, 1); fazPresilhas(f); }
          else { let dm = 1e9; v.corda.nos.forEach((q, n) => { const d2 = q.distanceToSquared(gesto.h.point); if (d2 < dm) { dm = d2; k = n; } }); k = Math.max(2, Math.min(v.corda.n - 3, k)); f.pinos = (f.pinos || []).filter((pn) => Math.abs(Math.round(pn.t * (v.corda.n - 1)) - k) > 1); fazPresilhas(f); }
          v.arrasto = { k, p: v.corda.nos[k].clone() }; gesto.fioId = id; cancela(); sel = null; marcaSel();
        }
        raio(ev); const q = noPlano(cam.getWorldDirection(new V3()), v.corda.nos[v.arrasto.k]); if (q) { atualizaCaixas(); colide(q); v.arrasto.p.copy(q); }
        acorda(id, 200); dom.style.cursor = 'grabbing';
      } else if (gesto.tipo === 'ctl' && (gesto.u.tipo === 'pot' || gesto.u.tipo === 'gerknob')) giraBotao(gesto.u, (dx - dy) / 260);
      else if (gesto.tipo === 'term') {                           // arrastando de um borne: fio elástico até o outro borne
        if (!pend) { pend = gesto.u.ref; anelEm(marcaIni, pend); }
        const h = pega(ev, (u) => u.kind === 'term'), t = posT(pend); raio(ev); const q = noPlano(new V3(0, 0, 1), new V3(0, 0, 0.05)) || t.p;
        gesto.sobre = h ? h.object.userData.ref : null; if (h) anelEm(destaque, gesto.sobre); else destaque.visible = false;
        elastico.geometry.setFromPoints([t.p.clone().addScaledVector(t.n, 0.02), h ? posT(gesto.sobre).p : q]); elastico.visible = true;
      } else if (gesto.tipo === 'ponta') {
        const h = pega(ev, (u) => u.kind === 'term'), k = gesto.u.k; raio(ev);
        if (h) { const t = posT(h.object.userData.ref); gesto.sobre = h.object.userData.ref; pontas[k].livre = { p: t.p.clone().addScaledVector(t.n, 0.006), n: t.n.clone().add(new V3(k === 'pv' ? 0.32 : -0.32, t.n.y ? 0 : 0.18, t.n.y ? 0.3 : 0)).normalize() }; anelEm(destaque, gesto.sobre); }
        else { gesto.sobre = null; destaque.visible = false; const q = noPlano(new V3(0, 0, 1), new V3(0, 0, 0.07)); let pp = q && q.y > MESA_Y + 0.05 && Math.abs(q.x) < 1.3 ? q : noPlano(new V3(0, 1, 0), new V3(0, MESA_Y + 0.03, 0)); if (pp) pontas[k].livre = { p: pp, n: new V3(0.2, 0.25, 1).normalize() }; }
      }
    });
    function solta(ev, cancelado) {
      pts.delete(ev.pointerId); try { dom.releasePointerCapture(ev.pointerId); } catch (_) { /* já solto */ }
      const gg = gesto; if (!gg) return; if (gg.tipo === 'pinch') { if (pts.size < 2) gesto = null; return; } gesto = null;
      if (gg.fim) gg.fim();
      const u = gg.u;
      if (gg.fioId !== undefined) {                               // soltou o cabo: o ponto fica preso numa presilha
        const v = fiosV[gg.fioId], f = banc.fios.find((x) => x.id === gg.fioId); dom.style.cursor = '';
        if (v && f && v.arrasto) { const a = v.arrasto; v.arrasto = null; if (!cancelado) { f.pinos = (f.pinos || []).concat([{ t: a.k / (v.corda.n - 1), x: +a.p.x.toFixed(4), y: +a.p.y.toFixed(4), z: +a.p.z.toFixed(4) }]).sort((x, y) => x.t - y.t); fazPresilhas(f); if (!dicaPresilha) { dicaPresilha = true; cb.toast && cb.toast('O fio ficou preso neste ponto. Arraste a presilha para mudar; duplo clique ou botão direito nela solta o fio.'); } } acorda(gg.fioId, 200); cb.mudou && cb.mudou(); }
        return;
      }
      if (gg.tipo === 'pino' && !gg.moveu) { if (gg.botao === 2) soltaPresilha(u); return; }
      if (gg.tipo === 'corpo' && gg.moveu) { cb.mudou && cb.mudou(); dom.style.cursor = ''; return; }
      if (gg.tipo === 'ponta') {
        const k = gg.u.k, mm = banc.porTipo('multi'); pontas[k].livre = null; destaque.visible = false;
        if (gg.moveu) { banc.acao(mm.id, { [k]: gg.sobre || null }); if (gg.sobre) cb.toast && cb.toast(`Ponta ${k === 'pv' ? 'vermelha' : 'preta'} em ${gg.sobre.replace('.', ':')}`); }
        else { armada = k; pend = null; marcaIni.visible = false; elastico.visible = false; cb.modo && cb.modo(`Ponta ${k === 'pv' ? 'vermelha' : 'preta'}: toque no borne que quer medir (Esc cancela)`); }
        return;
      }
      if (gg.tipo === 'term') {
        elastico.visible = false; destaque.visible = false;
        if (gg.moveu) { if (gg.sobre && gg.sobre !== pend) ligar(pend, gg.sobre); cancela(); return; }
        if (armada) { banc.acao(banc.porTipo('multi').id, { [armada]: u.ref }); cb.toast && cb.toast(`Ponta ${armada === 'pv' ? 'vermelha' : 'preta'} em ${u.ref.replace('.', ':')}`); cancela(); return; }
        if (pend && pend !== u.ref) { ligar(pend, u.ref); cancela(); return; }
        if (pend === u.ref) { cancela(); return; }
        pend = u.ref; anelEm(marcaIni, pend); sel = null; marcaSel(); cb.modo && cb.modo(`Fio saindo de ${pend.replace('.', ':')}: toque no borne de destino (Esc cancela)`); return;
      }
      if (cancelado) return;
      if (gg.tipo === 'ctl' && !gg.moveu) { acionar(u, false, ev); return; }
      if (gg.tipo === 'fio' && !gg.moveu) { if (gg.botao === 2) { banc.removerFio(u.id); sel = null; sincFios(); } else { sel = { fio: u.id }; marcaSel(); } return; }
      if (gg.tipo === 'corpo' && !gg.moveu) { cb.info && cb.info(u.id, gg.botao === 2 || ev.pointerType !== 'mouse'); return; }
      if ((gg.tipo === 'orbita' || gg.tipo === 'pan') && !gg.moveu) { if (gg.botao === 2 && u && u.kind === 'pino') { soltaPresilha(u); return; } if (gg.botao === 2 && u && u.kind === 'corpo') { cb.info && cb.info(u.id, true); return; } if (gg.botao === 2 && u && u.kind === 'fio') { banc.removerFio(u.id); sel = null; sincFios(); return; } if (pend || armada) cancela(); if (sel) { sel = null; marcaSel(); } }
    }
    dom.addEventListener('pointerup', (e) => solta(e, false)); dom.addEventListener('pointercancel', (e) => solta(e, true));
    let dicaPresilha = false;
    function soltaPresilha(u) { const f = banc.fios.find((x) => x.id === u.fio); if (!f || !f.pinos) return; f.pinos.splice(u.i, 1); fazPresilhas(f); acorda(f.id, 200); cb.mudou && cb.mudou(); }
    dom.addEventListener('dblclick', (ev) => { const hp = pega(ev, (u) => u.kind === 'pino'); if (hp) return soltaPresilha(hp.object.userData); const h = pega(ev, (u) => u.kind === 'fio'); if (h) { banc.removerFio(h.object.userData.id); sel = null; sincFios(); } });
    dom.addEventListener('wheel', (ev) => {
      ev.preventDefault(); const h = pega(ev), u = h && h.object.userData;
      if (u && u.kind === 'ctl' && (u.tipo === 'pot' || u.tipo === 'gerknob')) return giraBotao(u, (ev.deltaY < 0 ? 1 : -1) * (ev.shiftKey ? 0.002 : 0.02));
      if (u && u.kind === 'ctl' && u.tipo === 'mmknob') { const c = banc.comp(u.id); return banc.acao(c.id, { modo: Math.max(0, Math.min(4, c.st.modo + (ev.deltaY > 0 ? 1 : -1))) }); }
      camD.r = Math.max(0.3, Math.min(6, camD.r * (ev.deltaY > 0 ? 1.12 : 0.89)));
    }, { passive: false });
    const tecladoH = (ev) => { if (/INPUT|SELECT|TEXTAREA/.test((ev.target.tagName || ''))) return; if (ev.key === 'Escape') cancela(); else if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel) { removerSel(); ev.preventDefault(); } };
    g.addEventListener('keydown', tecladoH);

    reconstruir(); vista('geral'); camS.alvo.copy(camD.alvo); camS.r = camD.r; camS.az = camD.az; camS.el = camD.el;
    return {
      reconstruir, sincFios, vista, removerSel, cancela, renderer, dom,
      set corFio(v) { corFio = v; }, get corFio() { return corFio; }, get selecao() { return sel; },
      quadro(dt) {
        for (const c of banc.comps) { const v = vistas[c.id]; if (v && v.upd) v.upd(c.st); }
        atualizaPontas(); animaFios(); aplicaCam(Math.min(1, dt * 7)); renderer.render(scene, cam);
      },
      /** posição na tela de um ponto do mundo (para rótulos HTML) */
      /** posição de um borne ou do meio de um fio na janela (usado pelos testes automáticos) */
      telaRef(ref) { const t = posT(ref); if (!t) return null; const v = t.p.clone().addScaledVector(t.n, 0.012).project(cam), r = dom.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
      telaFio(id, t = 0.5) { const f = fiosV[id]; if (!f || !f.corda.curva) return null; const v = f.corda.curva.getPoint(t).project(cam), r = dom.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
      tela(x, y, z) { const v = new V3(x, y, z).project(cam), r = dom.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height, visivel: v.z < 1 }; },
      fim() { ro.disconnect(); g.removeEventListener('keydown', tecladoH); renderer.dispose(); },
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
