/* Bancada CFW500 - tela "Campo girante": corte do motor de indução de 4 polos com o campo do estator girando na
 * velocidade síncrona, o rotor girando um pouco mais devagar (escorregamento) e as correntes induzidas nas barras.
 * Fonte dos dados: o motor da bancada (ao vivo) ou um motor de demonstração com frequência e carga em controles.
 * A animação é em câmera lenta, mas campo e rotor são desacelerados pelo MESMO fator: a diferença entre eles é exata. */
(function (g) {
  'use strict';
  const SIM = g.SIM = g.SIM || {};
  SIM.criaCampo = function (raiz, banc) {
    const $ = (s) => raiz.querySelector(s), K = SIM.MOTOR_K, PL = SIM.PLACA, P2 = PL.polos / 2;
    const br = (v, d = 1) => (isFinite(v) ? Number(v).toFixed(d).replace('.', ',') : '—'), lim = (v, a, b) => Math.max(a, Math.min(b, v));
    const est = { aberto: false, popup: false, vis: '3d', fonte: 'demo', ref: 'estator', lento: 60, thF: 0, thR: 0, f: 60, carga: 100, vf: true, travado: false, sentido: 1, tTxt: 0 };
    const md = new SIM.Motor(); md.carga = 1;
    const cv = $('#cgMotor'), cx = cv.getContext('2d'), co = $('#cgOndas'), cxo = co.getContext('2d');
    const COR = { U: '#ff5a5f', V: '#f5c542', W: '#4f9dff', N: '#ff5a5f', S: '#4f9dff' };
    const TH0 = Math.PI / 3;                                      // eixo magnético da fase U (60° mecânicos), definido pela posição das ranhuras

    /** Estado atual: alimentação e rotor, do motor da bancada ou do motor de demonstração. */
    function le() {
      if (est.fonte === 'demo') {
        const v = est.f <= 0.05 ? 0 : est.vf ? Math.min(220, (0.03 + 0.97 * est.f / 60) * 220) : 220;
        return { f: est.f, v, seq: est.sentido, fases: est.f > 0.05 ? 3 : 0, m: md, origem: 'Motor de demonstração (controles ao lado)' };
      }
      const al = banc.alim, inv = banc.inv;
      if (al.via === 'inv') return { f: Math.abs(inv.sai.f), v: inv.sai.v * al.kv, seq: al.seq * (inv.sai.f < 0 ? -1 : 1), fases: inv.sai.pwm && !inv.sai.cc ? al.fases : 0, m: banc.motor, origem: `Motor da bancada, pelo inversor (${inv.loc ? 'LOCAL' : 'REMOTO'})${al.lig ? ' · fechado em ' + (al.lig === 'Y' ? 'estrela' : 'triângulo') : ''} · tensão por enrolamento` };
      if (al.via === 'rede') return { f: 60, v: al.v, seq: al.seq, fases: al.fases, m: banc.motor, origem: 'Motor da bancada, direto na rede' };
      return { f: 0, v: 0, seq: 1, fases: 0, m: banc.motor, origem: 'Motor da bancada, sem alimentação' };
    }
    /** Grandezas do memorial, com sinal no sentido do campo. */
    function contas(e) {
      const m = e.m, tem = e.fases >= 2 && e.f > 0.05, ns = 120 * e.f / PL.polos, n = m.rpm * e.seq, frRel = m.hzRotor * e.seq;
      const s = tem ? (e.f - frRel) / e.f : NaN, f2 = tem ? e.f - frRel : 0, x = f2 / K.FK, phi = tem ? m.phi : 0, T = tem ? m.torque * e.seq : 0;
      return { tem, ns, n, s, f2, x, phi, T, dn: ns - n, i: tem ? m.i : 0, vf: e.f > 0.05 ? e.v / e.f : 0, e };
    }

    // ---------------------------------------------------------------- desenho do corte do motor
    function desenha2d(c) {
      const dpr = Math.min(g.devicePixelRatio || 1, 2), lado = Math.round(cv.clientWidth * dpr); if (!lado) return;
      if (cv.width !== lado) { cv.width = lado; cv.height = lado; }
      const S = lado, X = cx; X.setTransform(1, 0, 0, 1, 0, 0); X.fillStyle = '#0d1216'; X.fillRect(0, 0, S, S); X.translate(S / 2, S / 2);
      const giro = est.ref === 'rotor' ? -est.thR : est.ref === 'campo' ? -est.thF : 0; X.rotate(giro);
      const R = S * 0.47, rs = S * 0.335, rr = S * 0.288, e = c.e, thE = P2 * est.thF, amp = c.tem ? lim(c.i / PL.i, 0.35, 1.4) : 0;
      // estator: coroa de aço com 24 ranhuras (2 por polo e por fase), na ordem U+ W− V+ U− W+ V−
      X.fillStyle = '#39424b'; X.beginPath(); X.arc(0, 0, R, 0, 2 * Math.PI); X.arc(0, 0, rs, 2 * Math.PI, 0, true); X.fill();
      X.strokeStyle = '#59646e'; X.lineWidth = S * 0.004; X.beginPath(); X.arc(0, 0, R, 0, 7); X.stroke();
      const FAIXA = [['U', 1], ['W', -1], ['V', 1], ['U', -1], ['W', 1], ['V', -1]], iF = { U: Math.cos(thE), V: Math.cos(thE - 2.0944), W: Math.cos(thE + 2.0944) };
      for (let k = 0; k < 24; k++) {
        const a = (k + 0.5) * Math.PI / 12, [fase, sn] = FAIXA[Math.floor(k / 2) % 6], i = iF[fase] * sn * amp, px = Math.cos(a) * S * 0.385, py = Math.sin(a) * S * 0.385, r0 = S * 0.026;
        X.fillStyle = '#1a2026'; X.beginPath(); X.arc(px, py, r0, 0, 7); X.fill();
        X.globalAlpha = 0.25 + 0.75 * Math.min(1, Math.abs(i)); X.fillStyle = COR[fase]; X.beginPath(); X.arc(px, py, r0 * 0.82, 0, 7); X.fill(); X.globalAlpha = 1;
        if (Math.abs(i) > 0.12) { X.strokeStyle = X.fillStyle = '#0d1216'; X.lineWidth = S * 0.005;
          if (i > 0) { X.beginPath(); X.arc(px, py, r0 * 0.24, 0, 7); X.fill(); } else { const d = r0 * 0.42; X.beginPath(); X.moveTo(px - d, py - d); X.lineTo(px + d, py + d); X.moveTo(px + d, py - d); X.lineTo(px - d, py + d); X.stroke(); } }
      }
      // entreferro: indução B(θ) = Φ·cos(p/2·(θ − θ0) − θe): vermelho = polo norte, azul = polo sul
      const B = (a) => (c.tem ? c.phi * Math.cos(P2 * (a - TH0) - thE) : 0);
      for (let k = 0; k < 96; k++) {
        const a0 = k * Math.PI / 48, b = B(a0 + Math.PI / 96); X.globalAlpha = Math.min(1, Math.abs(b)) * 0.9; X.fillStyle = b > 0 ? COR.N : COR.S;
        X.beginPath(); X.arc(0, 0, rs, a0, a0 + Math.PI / 48 + 0.004); X.arc(0, 0, rr, a0 + Math.PI / 48 + 0.004, a0, true); X.closePath(); X.fill();
      }
      X.globalAlpha = 1;
      if (c.tem) for (let k = 0; k < PL.polos; k++) {             // setas do fluxo e letras dos polos, girando com o campo
        const a = TH0 + est.thF + k * Math.PI / P2, norte = k % 2 === 0, cor = norte ? COR.N : COR.S, r0 = norte ? rr - S * 0.02 : rs + S * 0.02, r1 = norte ? rs + S * 0.02 : rr - S * 0.02;
        X.strokeStyle = X.fillStyle = '#ffffff'; X.lineWidth = S * 0.006; X.beginPath(); X.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); X.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); X.stroke();
        const pa = Math.cos(a) * r1, pb = Math.sin(a) * r1, d = (norte ? 1 : -1) * S * 0.018; X.beginPath(); X.moveTo(pa, pb); X.lineTo(pa - Math.cos(a) * d - Math.sin(a) * d * 0.6, pb - Math.sin(a) * d + Math.cos(a) * d * 0.6); X.lineTo(pa - Math.cos(a) * d + Math.sin(a) * d * 0.6, pb - Math.sin(a) * d - Math.cos(a) * d * 0.6); X.closePath(); X.fill();
        X.save(); X.translate(Math.cos(a) * S * 0.44, Math.sin(a) * S * 0.44); X.rotate(-giro); X.fillStyle = cor; X.font = `800 ${S * 0.05}px Arial, sans-serif`; X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillText(norte ? 'N' : 'S', 0, 0); X.restore();
      }
      // rotor: núcleo, 22 barras da gaiola com a corrente induzida, marca branca e eixo
      X.save(); X.rotate(est.thR);
      X.fillStyle = '#6b7580'; X.beginPath(); X.arc(0, 0, rr - S * 0.004, 0, 7); X.fill(); X.fillStyle = '#56606a'; X.beginPath(); X.arc(0, 0, rr * 0.62, 0, 7); X.fill();
      const gx = c.x / Math.sqrt(1 + c.x * c.x), atx = Math.atan(c.x);
      for (let k = 0; k < 22; k++) {
        const al = k * 2 * Math.PI / 22, mundo = al + est.thR, ib = c.tem ? gx * c.phi * Math.cos(P2 * (mundo - TH0) - thE + atx) : 0, px = Math.cos(al) * rr * 0.88, py = Math.sin(al) * rr * 0.88, r0 = S * 0.017;
        X.fillStyle = '#2a3138'; X.beginPath(); X.arc(px, py, r0, 0, 7); X.fill();
        X.globalAlpha = Math.min(1, Math.abs(ib) * 3.2); X.fillStyle = ib > 0 ? '#ff9f43' : '#35d0ff'; X.beginPath(); X.arc(px, py, r0 * 0.86, 0, 7); X.fill(); X.globalAlpha = 1;
      }
      X.fillStyle = '#f2f2f2'; X.fillRect(rr * 0.2, -S * 0.006, rr * 0.5, S * 0.012); X.fillStyle = '#c9ced3'; X.beginPath(); X.arc(0, 0, S * 0.045, 0, 7); X.fill(); X.fillStyle = '#39424b'; X.fillRect(-S * 0.008, -S * 0.052, S * 0.016, S * 0.02);
      X.restore();
      // seta do conjugado no centro e legendas fixas na tela
      X.rotate(-giro);
      if (c.tem && Math.abs(c.T) > 0.05) { const sn = Math.sign(c.T) * e.seq, r0 = S * 0.11, a1 = -Math.PI / 2 + sn * lim(Math.abs(c.T) / K.TN, 0.15, 2.2) * 0.9; X.strokeStyle = X.fillStyle = '#7dffb0'; X.lineWidth = S * 0.008; X.beginPath(); X.arc(0, 0, r0, -Math.PI / 2, a1, sn < 0); X.stroke();
        const px = Math.cos(a1) * r0, py = Math.sin(a1) * r0, tx = -Math.sin(a1) * sn, ty = Math.cos(a1) * sn, d = S * 0.022; X.beginPath(); X.moveTo(px + tx * d, py + ty * d); X.lineTo(px + Math.cos(a1) * d * 0.6, py + Math.sin(a1) * d * 0.6); X.lineTo(px - Math.cos(a1) * d * 0.6, py - Math.sin(a1) * d * 0.6); X.closePath(); X.fill(); }
      X.fillStyle = '#9fb0c0'; X.font = `600 ${S * 0.024}px Arial, sans-serif`; X.textAlign = 'left'; X.textBaseline = 'top';
      X.fillText(est.ref === 'estator' ? 'Visto do estator (parado)' : est.ref === 'campo' ? 'Visto de cima do campo: o rotor escorrega para trás' : 'Visto de cima do rotor: o campo passa devagar (f2)', -S / 2 + S * 0.02, -S / 2 + S * 0.02);
      X.textAlign = 'right'; X.fillText(`câmera lenta 1/${est.lento}`, S / 2 - S * 0.02, -S / 2 + S * 0.02);
      if (!c.tem) { X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillStyle = '#ffd98a'; X.font = `700 ${S * 0.03}px Arial, sans-serif`; X.fillText('Estator sem alimentação: não há campo girante', 0, S * 0.455); }
    }

    // ---------------------------------------------------------------- o mesmo corte em 3D (three.js): estator com um setor
    // recortado para ver o entreferro e o rotor por dentro; ângulos no sentido horário visto de frente (por isso o sinal −)
    let v3 = null, v3falhou = false;
    function cria3d() {
      const T = g.THREE, cv3 = $('#cgMotor3d'); if (!T || !cv3) return null;
      let rd; try { rd = new T.WebGLRenderer({ canvas: cv3, antialias: true }); } catch (e) { return null; }
      rd.setPixelRatio(Math.min(g.devicePixelRatio || 1, 2)); rd.outputColorSpace = T.SRGBColorSpace;
      const sc = new T.Scene(); sc.background = new T.Color(0x0d1216); const cam = new T.PerspectiveCamera(34, 1, 0.1, 60);
      sc.add(new T.HemisphereLight(0xffffff, 0x3a4450, 1.9)); const dl = new T.DirectionalLight(0xffffff, 2.4); dl.position.set(2.5, 3, 4); sc.add(dl); const d2 = new T.DirectionalLight(0xbfd4ff, 0.8); d2.position.set(-3, 1, 2); sc.add(d2);
      const raizG = new T.Group(), gF = new T.Group(), gR = new T.Group(); sc.add(raizG); raizG.add(gF, gR);
      const L = 0.9, Z = L / 2, pos = (a, r, z = 0) => new T.Vector3(r * Math.cos(a), -r * Math.sin(a), z), eixoZ = (geo) => { geo.rotateX(Math.PI / 2); return geo; };
      const std = (cor, o) => new T.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.6, metalness: 0.25 }, o));
      // estator: coroa de aço com 75° recortados (em cima, à direita)
      const A0 = 12 * Math.PI / 180, A1 = 78 * Math.PI / 180, forma = new T.Shape(); forma.absarc(0, 0, 1.0, A1, A0 + 2 * Math.PI, false); forma.absarc(0, 0, 0.70, A0 + 2 * Math.PI, A1, true); forma.closePath();
      const gEst = new T.ExtrudeGeometry(forma, { depth: L, bevelEnabled: false, curveSegments: 72 }); gEst.translate(0, 0, -Z); raizG.add(new T.Mesh(gEst, std(0x46515c, { roughness: 0.75 })));
      const gCone = new T.ConeGeometry(0.046, 0.12, 16), gConeB = new T.ConeGeometry(0.062, 0.16, 16), gHaste = new T.CylinderGeometry(0.016, 0.016, 0.15, 10), gHasteB = new T.CylinderGeometry(0.026, 0.026, 0.16, 10),      // seta = haste + ponta
      matConeC = new T.MeshBasicMaterial({ color: 0xffc400 }), matBordaC = new T.MeshBasicMaterial({ color: 0x0d1216, side: T.BackSide });
      const FAIXA = [['U', 1], ['W', -1], ['V', 1], ['U', -1], ['W', 1], ['V', -1]], bob = [];
      for (let k = 0; k < 24; k++) {
        const a = (k + 0.5) * Math.PI / 12, mat = (((-a) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), [fase, sn] = FAIXA[Math.floor(k / 2) % 6];
        if (mat > A0 - 0.06 && mat < A1 + 0.06) { bob.push(null); continue; }                           // ranhura que caiu no recorte
        const m = std(COR[fase], { emissive: COR[fase], emissiveIntensity: 0.2, roughness: 0.45 }), fio = new T.Mesh(eixoZ(new T.CylinderGeometry(0.052, 0.052, L + 0.1, 14)), m); fio.position.copy(pos(a, 0.81)); raizG.add(fio);
        // seta da corrente na ranhura: triângulo (cone) âmbar com contorno escuro, na frente do condutor. Aponta para fora quando a corrente sai e para dentro quando entra
        const seta = new T.Group(); for (const [geo, mt, y] of [[gHaste, matConeC, -0.06], [gHasteB, matBordaC, -0.06], [gConeB, matBordaC, 0.07], [gCone, matConeC, 0.07]]) { const q = new T.Mesh(geo, mt); q.position.y = y; seta.add(q); } seta.position.copy(pos(a, 0.81, Z + 0.19)); raizG.add(seta); bob.push({ fase, sn, m, seta });
      }
      // entreferro: faixa cilíndrica e anel da frente com cor por vértice (vermelho = N, azul = S)
      const faixaB = (geo) => { const n = geo.attributes.position.count, cor = new T.BufferAttribute(new Float32Array(n * 3), 3), ang = new Float32Array(n); for (let i = 0; i < n; i++) ang[i] = -Math.atan2(geo.attributes.position.getY(i), geo.attributes.position.getX(i)); geo.setAttribute('color', cor);
        const m = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, side: T.DoubleSide, depthWrite: false })); raizG.add(m); return { cor, ang, n }; };
      const fx1 = faixaB(eixoZ(new T.CylinderGeometry(0.652, 0.652, L, 120, 1, true))), anel = new T.RingGeometry(0.612, 0.692, 120, 1); anel.translate(0, 0, Z + 0.004); const fx2 = faixaB(anel);
      // campo: laços de fluxo na face da frente (saem do rotor no polo N, voltam no S, fecham pela coroa) e letras dos polos
      const matLaco = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), letras = [], setas = [];
      const tri = (c, l) => { const f = new T.Shape(); f.moveTo(0, c * 0.6); f.lineTo(l / 2, -c * 0.4); f.lineTo(-l / 2, -c * 0.4); f.closePath(); return new T.ShapeGeometry(f); };
      const gSeta = tri(0.105, 0.1), gSetaB = tri(0.155, 0.15), matSeta = new T.MeshBasicMaterial({ color: 0xffc400, side: T.DoubleSide }), matBorda = new T.MeshBasicMaterial({ color: 0x0d1216, side: T.DoubleSide });   // âmbar com contorno escuro: aparece sobre o branco do laço, de frente ou de lado
      for (let k = 0; k < 4; k++) {
        const norte = k % 2 === 0, aN = TH0 + (norte ? k : k + 1) * Math.PI / 2, aS = TH0 + (norte ? k + 1 : k) * Math.PI / 2, d = (aS > aN ? 1 : -1) * 0.2, pts = [], zf = Z + 0.03;
        const arco = (r, de, ate) => { for (let i = 1; i < 7; i++) pts.push(pos(de + (ate - de) * i / 7, r, zf)); };
        pts.push(pos(aN + d, 0.36, zf), pos(aN + d, 0.62, zf), pos(aN + d, 0.9, zf)); arco(0.9, aN + d, aS - d); pts.push(pos(aS - d, 0.9, zf), pos(aS - d, 0.62, zf), pos(aS - d, 0.36, zf)); arco(0.36, aS - d, aN + d);
        gF.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, true, 'catmullrom', 0.25), 90, 0.013, 6, true), matLaco));
        const am = (aN + aS) / 2, sg2 = aS > aN ? 1 : -1, tang = (a) => new T.Vector3(-Math.sin(a), -Math.cos(a), 0);
        for (const [p0, dir] of [[pos(aN + d, 0.652, zf), pos(aN + d, 1)], [pos(aS - d, 0.652, zf), pos(aS - d, 1).multiplyScalar(-1)], [pos(am, 0.9, zf), tang(am).multiplyScalar(sg2)], [pos(am, 0.36, zf), tang(am).multiplyScalar(-sg2)]]) {
          const rot = Math.atan2(dir.y, dir.x) - Math.PI / 2;
          for (const [geo, m, dz] of [[gSetaB, matBorda, 0.008], [gSeta, matSeta, 0.014]]) { const t = new T.Mesh(geo, m); t.position.set(p0.x, p0.y, zf + dz); t.rotation.z = rot; t.renderOrder = 4; gF.add(t); setas.push(t); }
        }
        const cvL = document.createElement('canvas'); cvL.width = cvL.height = 96; const xl = cvL.getContext('2d'); xl.fillStyle = norte ? COR.N : COR.S; xl.font = '800 78px Arial, sans-serif'; xl.textAlign = 'center'; xl.textBaseline = 'middle'; xl.fillText(norte ? 'N' : 'S', 48, 52);
        const tx = new T.CanvasTexture(cvL); tx.colorSpace = T.SRGBColorSpace; const sp = new T.Sprite(new T.SpriteMaterial({ map: tx, depthTest: false, transparent: true })); sp.scale.set(0.22, 0.22, 1); sp.position.copy(pos(TH0 + k * Math.PI / 2, 1.13, Z + 0.05)); sp.renderOrder = 5; gF.add(sp); letras.push(sp);
      }
      // rotor: núcleo, 22 barras da gaiola, anéis de curto, marca branca e eixo
      gR.add(new T.Mesh(eixoZ(new T.CylinderGeometry(0.60, 0.60, L, 64)), std(0x7c8791, { metalness: 0.45 })));
      const barras = []; for (let k = 0; k < 22; k++) { const m = std(0x2a3138, { emissive: 0x000000, roughness: 0.4 }), b = new T.Mesh(eixoZ(new T.CylinderGeometry(0.032, 0.032, L + 0.07, 10)), m); b.position.copy(pos(k * 2 * Math.PI / 22, 0.582)); gR.add(b); barras.push(m); }
      for (const z of [Z + 0.045, -Z - 0.045]) { const a = new T.Mesh(new T.TorusGeometry(0.56, 0.04, 10, 56), std(0xb87333, { metalness: 0.6, roughness: 0.35 })); a.position.z = z; gR.add(a); }
      const marca = new T.Mesh(new T.BoxGeometry(0.3, 0.035, 0.012), new T.MeshBasicMaterial({ color: 0xf2f2f2 })); marca.position.set(0.3, 0, Z + 0.007); gR.add(marca);
      gR.add(new T.Mesh(eixoZ(new T.CylinderGeometry(0.11, 0.11, L + 0.9, 28)), std(0xc9ced3, { metalness: 0.7, roughness: 0.3 }))); const chav = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.3), std(0x39424b)); chav.position.set(0, 0.11, Z + 0.3); gR.add(chav);
      // seta do conjugado, na frente do rotor
      const matT = new T.MeshBasicMaterial({ color: 0x7dffb0 }), gT = new T.Group(); gT.position.z = Z + 0.09; raizG.add(gT); let tAnt = 99;
      const fazT = (t) => { while (gT.children.length) { const o = gT.children.pop(); o.geometry.dispose(); } if (Math.abs(t) < 0.02) return; const arc = lim(Math.abs(t), 0.12, 2.2) * 0.95, sn = Math.sign(t);
        const tor = new T.Mesh(new T.TorusGeometry(0.27, 0.016, 8, 40, arc), matT); tor.rotation.z = sn > 0 ? Math.PI / 2 - arc : Math.PI / 2; gT.add(tor);
        const af = sn > 0 ? Math.PI / 2 - arc : Math.PI / 2 + arc, c = new T.Mesh(new T.ConeGeometry(0.045, 0.11, 12), matT); c.position.set(0.27 * Math.cos(af), 0.27 * Math.sin(af), 0); c.rotation.z = af + (sn > 0 ? Math.PI : 0); gT.add(c); };
      // câmera: arrastar gira, roda aproxima, duplo clique volta
      const cm = { az: 0.62, el: 0.36, d: 4.3 }; let arr = null;
      cv3.addEventListener('pointerdown', (e) => { arr = { x: e.clientX, y: e.clientY }; cv3.setPointerCapture(e.pointerId); });
      cv3.addEventListener('pointermove', (e) => { if (!arr) return; cm.az = lim(cm.az - (e.clientX - arr.x) * 0.008, -1.5, 1.5); cm.el = lim(cm.el + (e.clientY - arr.y) * 0.008, -1.2, 1.3); arr = { x: e.clientX, y: e.clientY }; est.vis = '3d'; sinc(); });
      const solta = () => { arr = null; }; cv3.addEventListener('pointerup', solta); cv3.addEventListener('pointercancel', solta);
      cv3.addEventListener('wheel', (e) => { e.preventDefault(); cm.d = lim(cm.d * (e.deltaY > 0 ? 1.1 : 0.9), 2.4, 9); }, { passive: false });
      cv3.addEventListener('dblclick', () => { cm.az = 0.62; cm.el = 0.36; cm.d = 4.3; });
      const N = new T.Color(COR.N), Sx = new T.Color(COR.S), esc = new T.Color(0x10161b), tmp = new T.Color();
      return {
        cm,
        desenha(c) {
          const w = cv3.clientWidth, h = cv3.clientHeight; if (!w || !h) return; if (rd.domElement.width !== Math.round(w * rd.getPixelRatio()) || rd.domElement.height !== Math.round(h * rd.getPixelRatio())) { rd.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
          if (est.vis === 'frente') { cm.az += (0.3 - cm.az) * 0.2; cm.el += (0.2 - cm.el) * 0.2; cm.d += (4.8 - cm.d) * 0.2; }
          const ce = Math.cos(cm.el); cam.position.set(cm.d * Math.sin(cm.az) * ce, cm.d * Math.sin(cm.el), cm.d * Math.cos(cm.az) * ce); cam.lookAt(0, 0, 0);
          const giro = est.ref === 'rotor' ? -est.thR : est.ref === 'campo' ? -est.thF : 0, thE = P2 * est.thF, amp = c.tem ? lim(c.i / PL.i, 0.35, 1.4) : 0;
          raizG.rotation.z = -giro; gF.rotation.z = -est.thF; gR.rotation.z = -est.thR; gF.visible = c.tem; matLaco.opacity = c.tem ? lim(c.phi, 0.25, 1) * 0.9 : 0;
          const iF = { U: Math.cos(thE), V: Math.cos(thE - 2.0944), W: Math.cos(thE + 2.0944) };
          for (const b of bob) { if (!b) continue; const i = iF[b.fase] * b.sn * amp; b.m.emissiveIntensity = 0.08 + 0.9 * Math.min(1, Math.abs(i)); b.seta.visible = Math.abs(i) > 0.12; b.seta.rotation.x = i > 0 ? Math.PI / 2 : -Math.PI / 2; const k = 0.55 + 0.45 * Math.min(1, Math.abs(i)); b.seta.scale.set(k, k, k); }
          for (const fx of [fx1, fx2]) { for (let i = 0; i < fx.n; i++) { const B = c.tem ? c.phi * Math.cos(P2 * (fx.ang[i] - TH0) - thE) : 0; tmp.copy(esc).lerp(B > 0 ? N : Sx, Math.min(1, Math.abs(B))); fx.cor.setXYZ(i, tmp.r, tmp.g, tmp.b); } fx.cor.needsUpdate = true; }
          const gx = c.x / Math.sqrt(1 + c.x * c.x), atx = Math.atan(c.x);
          barras.forEach((m, k) => { const ib = c.tem ? gx * c.phi * Math.cos(P2 * (k * 2 * Math.PI / 22 + est.thR - TH0) - thE + atx) : 0, v = Math.min(1, Math.abs(ib) * 3.2); m.emissive.setHex(ib > 0 ? 0xff9f43 : 0x35d0ff); m.emissiveIntensity = v * 1.6; });
          for (const sp of letras) sp.material.rotation = 0;
          const tq = c.tem ? c.T / K.TN * c.e.seq : 0; if (Math.abs(tq - tAnt) > 0.04) { tAnt = tq; fazT(tq); } gT.rotation.z = 0;
          rd.render(sc, cam);
        },
        pixel() { const gl = rd.getContext(), px = new Uint8Array(4); gl.readPixels(Math.floor(rd.domElement.width / 2), Math.floor(rd.domElement.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return Array.from(px); },
      };
    }
    function desenha(c) {
      const usa3d = est.vis !== '2d' && !v3falhou; if (usa3d && !v3) { v3 = cria3d(); if (!v3) { v3falhou = true; est.vis = '2d'; sinc(); } }
      $('#cgMotor3d').hidden = !(usa3d && v3); cv.hidden = usa3d && !!v3;
      if (usa3d && v3) v3.desenha(c); else desenha2d(c);
      const txt = (est.ref === 'estator' ? 'Visto do estator (parado)' : est.ref === 'campo' ? 'Visto de cima do campo: o rotor escorrega para trás' : 'Visto de cima do rotor: o campo passa devagar (f2)') + ` · câmera lenta 1/${est.lento}` + (c.tem ? '' : ' · estator sem alimentação: não há campo girante');
      const so = $('#cgSobre'); if (so.textContent !== txt) so.textContent = txt; so.hidden = !(usa3d && v3);
    }

    // ---------------------------------------------------------------- ondas: correntes do estator (f) e de uma barra do rotor (f2)
    function ondas(c) {
      const dpr = Math.min(g.devicePixelRatio || 1, 2), W = Math.round(co.clientWidth * dpr), H = Math.round(co.clientHeight * dpr); if (!W) return;
      if (co.width !== W || co.height !== H) { co.width = W; co.height = H; }
      const X = cxo; X.fillStyle = '#0d1216'; X.fillRect(0, 0, W, H); const mw = W / 2, px = dpr;
      const painel = (x0, titulo, curvas, cursor, rodape) => {
        const w = mw - 14 * px, y0 = H * 0.5, a = H * 0.3; X.strokeStyle = '#24303a'; X.lineWidth = px; X.strokeRect(x0 + 0.5, 0.5, w, H - 1); X.beginPath(); X.moveTo(x0, y0); X.lineTo(x0 + w, y0); X.stroke();
        for (const [cor, fn] of curvas) { X.strokeStyle = cor; X.lineWidth = 1.6 * px; X.beginPath(); for (let k = 0; k <= 120; k++) { const t = k / 120 * 2 * Math.PI, y = y0 - fn(t) * a; if (k) X.lineTo(x0 + k / 120 * w, y); else X.moveTo(x0, y); } X.stroke(); }
        const xc = x0 + ((cursor % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * w; X.strokeStyle = '#ffffff'; X.lineWidth = px; X.beginPath(); X.moveTo(xc, 4 * px); X.lineTo(xc, H - 4 * px); X.stroke();
        X.fillStyle = '#e6ebf0'; X.font = `600 ${11 * px}px Arial, sans-serif`; X.textBaseline = 'top'; X.textAlign = 'left'; X.fillText(titulo, x0 + 6 * px, 5 * px); X.fillStyle = '#9fb0c0'; X.textBaseline = 'bottom'; X.fillText(rodape, x0 + 6 * px, H - 4 * px);
      };
      const A = c.tem ? lim(c.i / PL.i, 0.3, 1) : 0, thE = P2 * est.thF, gx = c.tem ? lim(Math.abs(c.x) / Math.sqrt(1 + c.x * c.x) * 3.2, 0, 1) : 0, thS = P2 * (est.thF - est.thR);
      painel(0, 'Correntes do estator: U, V, W', [[COR.U, (t) => A * Math.cos(t)], [COR.V, (t) => A * Math.cos(t - 2.0944)], [COR.W, (t) => A * Math.cos(t + 2.0944)]], thE, c.tem ? `f = ${br(c.e.f)} Hz · um ciclo = ${br(1000 / c.e.f, 1)} ms` : 'sem alimentação');
      painel(mw + 7 * px, 'Corrente induzida em uma barra do rotor', [['#ff9f43', (t) => gx * Math.cos(t)]], thS, c.tem ? (Math.abs(c.f2) > 0.005 ? `f2 = s·f = ${br(Math.abs(c.f2), 2)} Hz · um ciclo = ${br(1000 / Math.abs(c.f2), 0)} ms` : 'f2 = 0: sem corrente induzida, sem conjugado') : 'sem alimentação');
    }

    // ---------------------------------------------------------------- números e memorial de cálculo
    function textos(c) {
      const e = c.e, pc = (v) => br(v * 100, 2) + ' %', cartao = (rot, val, un, cor) => `<div class="cg-n"><span>${rot}</span><b style="color:${cor || '#fff'}">${val}</b><small>${un}</small></div>`;
      $('#cgOrigem').textContent = e.origem;
      $('#cgNum').innerHTML = cartao('Campo (síncrona)', c.tem ? br(c.ns, 0) : '—', 'rpm', '#ff8f93') + cartao('Rotor', br(c.n, 0), 'rpm', '#f2f2f2') + cartao('Escorregamento', c.tem ? br(c.s * 100, 2) : '—', `% · ${c.tem ? br(c.dn, 0) : '—'} rpm`, '#ffd98a') +
        cartao('Frequência no estator', c.tem ? br(e.f) : '—', 'Hz', '#ff8f93') + cartao('Frequência no rotor (f2)', c.tem ? br(Math.abs(c.f2), 2) : '—', 'Hz', '#ffb26b') + cartao('Conjugado', c.tem ? br(c.T / K.TN * 100, 0) : '—', `% · ${c.tem ? br(c.T, 2) : '—'} N·m`, '#7dffb0');
      let aviso = '';
      if (c.tem && c.s < -0.002) aviso = 'Escorregamento negativo: o rotor está mais rápido que o campo. O motor vira gerador e devolve energia (no inversor, o link DC sobe).';
      else if (c.tem && c.s > 0.5) aviso = 'Escorregamento muito alto: a frequência no rotor é quase a da rede, a corrente é de partida e o motor aquece. Com inversor isso não acontece: a frequência sobe aos poucos e o escorregamento fica pequeno.';
      else if (c.tem && c.phi > 1.15) aviso = `Fluxo em ${br(c.phi * 100, 0)} %: tensão demais para essa frequência (V/f alto). O ferro satura e a corrente de magnetização dispara.`;
      else if (c.tem && c.phi < 0.8 && e.f > 62) aviso = `Acima de 60 Hz a tensão já está no máximo: V/f cai, o fluxo fica em ${br(c.phi * 100, 0)} % (enfraquecimento de campo) e o conjugado disponível diminui.`;
      else if (c.tem && c.phi < 0.8) aviso = `Fluxo em ${br(c.phi * 100, 0)} %: em baixa frequência a queda de tensão na resistência do estator pesa. É para isso que serve o boost de torque (P0136).`;
      $('#cgAviso').hidden = !aviso; $('#cgAviso').textContent = aviso;
      const L = [], ln = (titulo, formula, conta, res) => L.push(`<tr><td><b>${titulo}</b><span>${formula}</span></td><td>${conta}</td><td><b>${res}</b></td></tr>`);
      if (!c.tem) { $('#cgMem').innerHTML = '<tr><td colspan="3">Alimente o estator para ver as contas: ligue o motor na bancada ou use a demonstração.</td></tr>'; return; }
      const sn = (120 * PL.hz / PL.polos - PL.rpm) / (120 * PL.hz / PL.polos), ws = 2 * Math.PI * c.ns / 60, w = 2 * Math.PI * c.n / 60, pg = c.T * ws, peixo = c.T * w, a = Math.abs(c.T) / (2 * K.TMAX);
      ln('1. Velocidade síncrona (do campo)', 'ns = 120 × f ÷ p', `120 × ${br(e.f)} ÷ ${PL.polos}`, `${br(c.ns, 0)} rpm`);
      ln('2. Escorregamento', 's = (ns − n) ÷ ns', `(${br(c.ns, 0)} − ${br(c.n, 0)}) ÷ ${br(c.ns, 0)}`, `${pc(c.s)} · ${br(c.dn, 0)} rpm`);
      ln('3. Frequência das correntes do rotor', 'f2 = s × f', `${br(c.s, 4)} × ${br(e.f)}`, `${br(c.f2, 2)} Hz`);
      ln('4. Relação V/f e fluxo', 'V/f ; Φ = E/f ÷ (En/fn)', `${br(e.v, 0)} V no enrolamento ÷ ${br(e.f)} Hz = ${br(c.vf, 2)} V/Hz (nominal ${br(PL.v / PL.hz, 2)})`, `fluxo ${br(c.phi * 100, 0)} %`);
      ln('5. Conjugado nominal (placa)', 'Tn = P ÷ ω', `${PL.kw * 1000} W ÷ (2π × ${PL.rpm} ÷ 60)`, `${br(K.TN, 2)} N·m`);
      ln('6. Conjugado desenvolvido (Kloss)', 'T = 2·Tmáx·Φ²·x ÷ (1 + x²), x = f2 ÷ fk', `Tmáx = ${br(K.TMAX, 1)} N·m · fk = ${br(K.FK, 2)} Hz · x = ${br(c.x, 3)}${Math.abs(c.x) > 0.5 ? ` · fator de partida ${br(1 + K.BP * c.x * c.x / (K.CP + c.x * c.x), 2)}` : ''}`, `${br(c.T, 2)} N·m · ${br(c.T / K.TN * 100, 0)} %`);
      ln('7. Potência que atravessa o entreferro', 'Pg = T × ωs', `${br(c.T, 2)} × ${br(ws, 1)} rad/s`, `${br(pg, 0)} W`);
      ln('8. Perdas no rotor (viram calor)', 'Pj2 = s × Pg', `${br(c.s, 4)} × ${br(pg, 0)}`, `${br(c.s * pg, 0)} W`);
      ln('9. Potência mecânica no eixo', 'P = T × ω = (1 − s) × Pg', `${br(c.T, 2)} × ${br(w, 1)} rad/s`, `${br(peixo, 0)} W`);
      ln('10. Corrente do estator', 'I = √(Im² + Ir²)', `magnetização ${br(K.IM0 * c.phi, 2)} A · carga ${br(Math.sqrt(Math.max(0, c.i * c.i - (K.IM0 * c.phi) ** 2)), 2)} A`, `${br(c.i, 2)} A (placa ${br(PL.i, 2)})`);
      $('#cgMem').innerHTML = L.join('');
      // mesmo conjugado em outras frequências, com V/f constante: o escorregamento em rpm quase não muda
      let h = '';
      if (a < 0.499 && Math.abs(c.T) > 0.05) { const xx = (1 - Math.sqrt(1 - 4 * a * a)) / (2 * a), f2 = xx * K.FK;
        h = '<tr><td>Frequência</td>' + [60, 45, 30, 15, 5].map((f) => `<td>${f} Hz</td>`).join('') + '</tr><tr><td>Campo (ns)</td>' + [60, 45, 30, 15, 5].map((f) => `<td>${30 * f} rpm</td>`).join('') + '</tr><tr><td>Rotor (n)</td>' + [60, 45, 30, 15, 5].map((f) => `<td>${br(Math.max(0, (f - f2) * 30), 0)} rpm</td>`).join('') +
          '</tr><tr><td>Escorregamento</td>' + [60, 45, 30, 15, 5].map((f) => `<td>${f2 < f ? br(f2 / f * 100, 1) + ' %' : 'não gira'}</td>`).join('') + `</tr><tr><td>ns − n</td><td colspan="5">${br(f2 * 30, 0)} rpm em todas (f2 = ${br(f2, 2)} Hz): com o mesmo conjugado e o mesmo fluxo, o rotor fica sempre a mesma distância atrás do campo</td></tr>`; }
      $('#cgTab').innerHTML = h || '<tr><td>Aplique carga para ver a comparação entre frequências.</td></tr>';
      $('#cgPlaca').textContent = `Placa: ${PL.kw} kW, ${PL.polos} polos, ${PL.v} V, ${String(PL.i).replace('.', ',')} A, ${PL.rpm} rpm a ${PL.hz} Hz → escorregamento nominal ${pc(sn)} (${120 * PL.hz / PL.polos - PL.rpm} rpm, f2 = ${br(sn * PL.hz, 2)} Hz).`;
    }

    // ---------------------------------------------------------------- controles
    const sinc = () => {
      raiz.querySelectorAll('[data-fonte]').forEach((b) => b.classList.toggle('ativa', b.dataset.fonte === est.fonte)); raiz.querySelectorAll('[data-ref]').forEach((b) => b.classList.toggle('ativa', b.dataset.ref === est.ref));
      raiz.querySelectorAll('[data-lento]').forEach((b) => b.classList.toggle('ativa', +b.dataset.lento === est.lento)); $('#cgDemo').hidden = est.fonte !== 'demo';
      raiz.querySelectorAll('[data-vis]').forEach((b) => b.classList.toggle('ativa', b.dataset.vis === est.vis)); raiz.classList.toggle('popup', est.popup); $('#cgPopup').textContent = est.popup ? 'Tela cheia' : 'Janela flutuante'; $('#cgFechar').textContent = est.popup ? '×' : 'Voltar à bancada'; $('#cgFechar').title = 'Fechar';
      $('#cgF').value = est.f; $('#cgFv').textContent = br(est.f) + ' Hz'; $('#cgC').value = est.carga; $('#cgCv').textContent = est.carga + ' %'; $('#cgVf').checked = est.vf; $('#cgTrava').checked = est.travado; $('#cgSent').textContent = est.sentido > 0 ? 'Sentido: horário' : 'Sentido: anti-horário';
    };
    raiz.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.fonte) est.fonte = d.fonte; else if (d.ref) est.ref = d.ref; else if (d.lento) est.lento = +d.lento; else if (d.vis) { est.vis = d.vis; if (d.vis === '3d' && v3) Object.assign(v3.cm, { az: 0.62, el: 0.36, d: 4.3 }); }
      else if (b.id === 'cgPopup') { est.popup = !est.popup; if (!est.popup) { raiz.style.left = raiz.style.top = raiz.style.width = raiz.style.height = ''; } }
      else if (d.pre) { const [f, cg, tr] = d.pre.split(',').map(Number); est.fonte = 'demo'; est.f = f; est.carga = cg; est.travado = !!tr; est.vf = true; }
      else if (b.id === 'cgSent') est.sentido = -est.sentido; else if (b.id === 'cgFechar') return api.fechar(); else return;
      sinc();
    });
    $('#cgF').oninput = (e) => { est.f = +e.target.value; sinc(); }; $('#cgC').oninput = (e) => { est.carga = +e.target.value; sinc(); };
    $('#cgVf').onchange = (e) => { est.vf = e.target.checked; }; $('#cgTrava').onchange = (e) => { est.travado = e.target.checked; };

    { let mv = null; const topo = raiz.querySelector('.cg-topo');
      topo.addEventListener('pointerdown', (e) => { if (!est.popup || e.target.closest('button')) return; const r = raiz.getBoundingClientRect(); mv = { dx: e.clientX - r.left, dy: e.clientY - r.top }; topo.setPointerCapture(e.pointerId); });
      topo.addEventListener('pointermove', (e) => { if (!mv) return; const r = raiz.getBoundingClientRect(); raiz.style.left = lim(e.clientX - mv.dx, 4 - r.width + 80, g.innerWidth - 80) + 'px'; raiz.style.top = lim(e.clientY - mv.dy, 0, g.innerHeight - 40) + 'px'; raiz.style.right = 'auto'; });
      const fim = () => { mv = null; }; topo.addEventListener('pointerup', fim); topo.addEventListener('pointercancel', fim); }
    const api = {
      get aberto() { return est.aberto; },
      get popup() { return est.aberto && est.popup; },
      /** modo: 'popup' (janela flutuante sobre a bancada) ou 'cheia' (tela à parte) */
      abrir(fonte, modo) { if (fonte) est.fonte = fonte; if (modo) est.popup = modo === 'popup'; if (!est.popup) raiz.style.left = raiz.style.top = raiz.style.width = raiz.style.height = ''; est.aberto = true; raiz.hidden = false; sinc(); est.tTxt = 1; },
      pixel3d: () => (v3 ? v3.pixel() : null),
      fechar() { est.aberto = false; raiz.hidden = true; },
      /** chamado a cada quadro pela tela principal enquanto a janela está aberta */
      quadro(dt) {
        if (!est.aberto) return;
        if (est.fonte === 'demo') { md.carga = est.carga / 100; md.travado = est.travado; const e0 = le(); let t = Math.min(dt, 0.1); while (t > 1e-6) { const h = Math.min(0.002, t); md.passo(h, { f: e0.f, v: e0.v, seq: e0.seq, fases: e0.fases, cc: 0 }); t -= h; } }
        const c = contas(le());
        if (c.tem) est.thF += c.e.seq * (2 * Math.PI * c.e.f / P2) * dt / est.lento;
        est.thR += c.e.m.w * dt / est.lento;
        desenha(c); ondas(c); est.tTxt += dt; if (est.tTxt >= 0.2) { est.tTxt = 0; textos(c); }
      },
      estado: () => Object.assign({}, est), contas: () => contas(le()),
    };
    return api;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
