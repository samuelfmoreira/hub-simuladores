/* Ilustrações dos dispositivos (SVG, desenho genérico de cada tipo de equipamento).
   Uso: Icones.svg('inversor', '#2C6CB0')  ->  string <svg>
   Na ficha do simulador: "icone": "inversor" | "servo" | "visao" | "processo" | "modbus" | "clp" | "ihm" | "robo" | "sensor" | "generico"
   ou "icone": "arquivo.svg" (desenho próprio, na pasta do simulador). */
(function () {
  'use strict';
  const C = {
    chapa: '#EEF0EC', chapa2: '#DDE1DC', contorno: '#8E979A', escuro: '#2B3134', preto: '#161B1E',
    lcd: '#A9DDB8', lcdTxt: '#1B3D29', verde: '#3BB54A', vermelho: '#D9473B', ambar: '#F0A92A', aco: '#7C8689', aco2: '#5E676B',
  };
  const sombra = (cx, cy, rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="4" fill="#000" opacity=".16"/>`;
  const furos = (x, y, n, passo, w = 3, h = 9) => Array.from({ length: n }, (_, i) => `<rect x="${x + i * passo}" y="${y}" width="${w}" height="${h}" rx="1.2" fill="${C.aco2}" opacity=".55"/>`).join('');


  // ---------------------------------------------------------------- mini motor isométrico (caixas e cilindros)
  const K = 0.866;
  function isoFab(esc, ox, oy) {
    const P = (x, y, z) => [ox + (x - y) * K * esc, oy + (x + y) * 0.5 * esc - z * esc];
    const pts = (l) => l.map(([x, y, z]) => P(x, y, z).map((n) => n.toFixed(1)).join(',')).join(' ');
    const sombreia = (hex, f) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f)))); return `rgb(${c.join(',')})`; };
    return {
      P,
      caixa(x, y, z, dx, dy, dz, cor, extra = '') {
        return `<polygon points="${pts([[x, y + dy, z], [x + dx, y + dy, z], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]])}" fill="${sombreia(cor, 0.78)}" ${extra}/>` +
          `<polygon points="${pts([[x + dx, y, z], [x + dx, y + dy, z], [x + dx, y + dy, z + dz], [x + dx, y, z + dz]])}" fill="${sombreia(cor, 0.6)}" ${extra}/>` +
          `<polygon points="${pts([[x, y, z + dz], [x + dx, y, z + dz], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]])}" fill="${cor}" ${extra}/>`;
      },
      cilindro(x, y, z, r, h, cor) {
        const [bx, by] = P(x, y, z); const [tx, ty] = P(x, y, z + h);
        const rx = r * 1.2247 * esc; const ry = r * 0.7071 * esc;
        return `<path d="M${(bx - rx).toFixed(1)} ${by.toFixed(1)} A${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 0 ${(bx + rx).toFixed(1)} ${by.toFixed(1)} L${(tx + rx).toFixed(1)} ${ty.toFixed(1)} L${(tx - rx).toFixed(1)} ${ty.toFixed(1)} Z" fill="${sombreia(cor, 0.72)}"/>` +
          `<ellipse cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${cor}"/>`;
      },
      linha(a, b, cor, w) { const [x1, y1] = P(...a); const [x2, y2] = P(...b); return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${cor}" stroke-width="${w}" stroke-linecap="round"/>`; },
      poli(l, cor, extra = '') { return `<polygon points="${pts(l)}" fill="${cor}" ${extra}/>`; },
    };
  }

  function processoIso(cor) {
    const g = isoFab(10, 45, 40);
    const o = [];
    // sombra no piso
    o.push(g.poli([[-1.6, -0.6, 0], [10.6, -0.6, 0], [10.6, 2.6, 0], [-1.6, 2.6, 0]], '#000', 'opacity=".10"'));
    // sinaleiro (fundo)
    o.push(g.caixa(4.9, -1.2, 0, 0.2, 0.2, 2.6, '#7C8689'));
    o.push(g.cilindro(5.0, -1.1, 2.6, 0.22, 0.32, '#3BB54A'), g.cilindro(5.0, -1.1, 2.92, 0.22, 0.32, '#F0A92A'), g.cilindro(5.0, -1.1, 3.24, 0.22, 0.32, '#D9473B'));
    // pernas de trás
    for (const x of [0.2, 4.6, 9.0]) o.push(g.caixa(x, 0.05, 0, 0.18, 0.18, 1.1, '#6B7477'));
    // caixa NG (vermelha), atrás da esteira
    o.push(g.caixa(6.0, -1.7, 0, 1.3, 1.0, 0.7, '#C8382E'));
    // alimentador (cilindro) no início
    o.push(g.caixa(-1.2, 0.4, 0, 0.15, 0.15, 1.9, '#6B7477'));
    o.push(g.cilindro(-0.8, 0.8, 1.6, 0.85, 0.9, '#B9C3C7'));
    // pernas da frente
    for (const x of [0.2, 4.6, 9.0]) o.push(g.caixa(x, 1.45, 0, 0.18, 0.18, 1.1, '#6B7477'));
    // corpo da esteira e lona
    o.push(g.caixa(0, 0, 1.1, 9.4, 1.6, 0.32, '#9AA4A7'));
    o.push(g.poli([[0.1, 0.18, 1.43], [9.3, 0.18, 1.43], [9.3, 1.42, 1.43], [0.1, 1.42, 1.43]], '#2B3134'));
    for (let x = 0.6; x < 9.3; x += 0.75) o.push(g.linha([x, 0.2, 1.435], [x, 1.4, 1.435], '#394146', 0.5));
    // peças na esteira
    for (const x of [1.6, 3.4, 7.2]) { o.push(g.caixa(x, 0.45, 1.43, 0.7, 0.7, 0.5, '#C99A5B')); }
    o.push(g.poli([[3.55, 0.6, 1.93], [3.95, 0.6, 1.93], [3.95, 1.0, 1.93], [3.55, 1.0, 1.93]], '#FFFFFF', 'opacity=".9"'));
    // pórtico da câmera
    o.push(g.caixa(4.3, -0.35, 1.1, 0.16, 0.16, 2.2, '#7C8689'));
    o.push(g.caixa(4.3, -0.35, 3.3, 0.16, 2.3, 0.16, '#7C8689'));
    o.push(g.poli([[4.38, 0.8, 3.2], [3.7, 0.2, 1.45], [5.1, 1.4, 1.45]], '#8FD8FF', 'opacity=".28"'));
    o.push(g.caixa(4.15, 0.6, 3.0, 0.45, 0.45, 0.32, '#2B3134'));
    // cilindro de rejeito (lado da frente)
    o.push(g.caixa(6.3, 1.65, 1.15, 0.35, 0.5, 0.35, '#2D6CB8'));
    // robô no fim da esteira (laranja, como na cena do simulador)
    const R = '#E8731C';
    o.push(g.cilindro(9.9, 2.4, 0, 0.55, 0.3, '#2B3134'));
    o.push(g.cilindro(9.9, 2.4, 0.3, 0.42, 0.6, R));
    const ombro = [9.9, 2.4, 0.95]; const cotovelo = [10.1, 1.6, 2.65]; const punho = [8.5, 1.55, 2.25];
    o.push(g.linha(ombro, cotovelo, '#B4520F', 7.2), g.linha(ombro, cotovelo, R, 5.6));
    o.push(g.linha(cotovelo, punho, '#B4520F', 5.8), g.linha(cotovelo, punho, R, 4.4));
    const [cx, cy] = g.P(...ombro); const [ex, ey] = g.P(...cotovelo); const [px, py] = g.P(...punho);
    o.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.4" fill="#2B3134"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.1" fill="#2B3134"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.4" fill="#2B3134"/>`);
    o.push(g.linha(punho, [8.5, 1.55, 1.85], '#7C8689', 2.4));
    o.push(g.linha([8.3, 1.55, 1.85], [8.3, 1.55, 1.6], '#5E676B', 1.6), g.linha([8.7, 1.55, 1.85], [8.7, 1.55, 1.6], '#5E676B', 1.6));
    // caixa OK (verde) na frente do robô
    o.push(g.caixa(8.3, 2.3, 0, 1.3, 1.0, 0.7, '#2F8A57'));
    return o.join('');
  }

  const D = {
    // ---------------------------------------------------------------- inversor de frequência
    inversor: (cor) => `
      ${sombra(80, 113, 40)}
      <rect x="47" y="10" width="66" height="100" rx="5" fill="${C.aco2}"/>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="44" y="${20 + i * 17}" width="5" height="10" rx="1.5" fill="${C.aco}"/><rect x="111" y="${20 + i * 17}" width="5" height="10" rx="1.5" fill="${C.aco}"/>`).join('')}
      <rect x="51" y="7" width="58" height="101" rx="6" fill="${C.chapa}" stroke="${C.contorno}"/>
      ${furos(58, 11, 8, 6, 3, 6)}
      <rect x="57" y="22" width="46" height="44" rx="4" fill="${C.escuro}"/>
      <rect x="61" y="26" width="38" height="15" rx="2" fill="${C.lcd}"/>
      <text x="64" y="37.5" font-family="ui-monospace,Consolas,monospace" font-size="10" font-weight="700" fill="${C.lcdTxt}">60.0</text>
      <text x="89" y="37.5" font-family="Barlow,sans-serif" font-size="6" fill="${C.lcdTxt}">Hz</text>
      <circle cx="66" cy="50" r="4" fill="${C.verde}"/><circle cx="94" cy="50" r="4" fill="${C.vermelho}"/>
      <path d="M77 52 l3-5 l3 5z M77 55 l3 5 l3-5z" fill="#C9CFCB"/>
      <rect x="62" y="58" width="9" height="4" rx="1" fill="#59636A"/><rect x="75.5" y="58" width="9" height="4" rx="1" fill="#59636A"/><rect x="89" y="58" width="9" height="4" rx="1" fill="#59636A"/>
      <rect x="51" y="70" width="58" height="4" fill="${cor}"/>
      <rect x="56" y="78" width="48" height="25" rx="2.5" fill="${C.chapa2}" stroke="${C.contorno}" stroke-width=".8"/>
      ${furos(61, 83, 7, 6, 3, 13)}
      <rect x="58" y="106" width="8" height="5" rx="1" fill="${C.escuro}"/><rect x="76" y="106" width="8" height="5" rx="1" fill="${C.escuro}"/><rect x="94" y="106" width="8" height="5" rx="1" fill="${C.escuro}"/>`,

    // ---------------------------------------------------------------- servoconversor + servomotor
    servo: (cor) => `
      ${sombra(80, 113, 62)}
      <path d="M52 92 C 62 104, 74 100, 86 92" stroke="${C.preto}" stroke-width="3.5" fill="none"/>
      <rect x="20" y="8" width="38" height="100" rx="5" fill="${C.chapa}" stroke="${C.contorno}"/>
      <rect x="20" y="8" width="38" height="5" rx="2" fill="${cor}"/>
      <rect x="25" y="18" width="28" height="13" rx="2" fill="${C.preto}"/>
      <text x="28" y="28.5" font-family="ui-monospace,Consolas,monospace" font-size="9" font-weight="700" fill="#FF5A4A">1500</text>
      <circle cx="29" cy="37" r="2" fill="${C.verde}"/><circle cx="36" cy="37" r="2" fill="${C.ambar}"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="26" y="${44 + i * 13}" width="26" height="10" rx="1.5" fill="${C.escuro}"/>${[0, 1, 2, 3].map((k) => `<rect x="${29 + k * 5.5}" y="${47 + i * 13}" width="3" height="4" fill="#9AA3A6"/>`).join('')}`).join('')}
      <rect x="84" y="62" width="14" height="38" rx="3" fill="${C.escuro}"/>
      <rect x="96" y="60" width="38" height="42" rx="3" fill="#3A4246"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${99 + i * 6}" y="60" width="2.5" height="42" fill="#4A5357"/>`).join('')}
      <rect x="132" y="56" width="8" height="50" rx="2" fill="${C.aco}"/>
      <rect x="140" y="77" width="14" height="8" rx="1.5" fill="#B7BFC1"/>
      <rect x="86" y="54" width="10" height="8" rx="1.5" fill="${C.preto}"/>`,

    // ---------------------------------------------------------------- sistema de visão (controlador + câmera, desenho original)
    visao: (cor, u) => `
      <defs>
        <linearGradient id="vf${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#454C51"/><stop offset="1" stop-color="#25292C"/></linearGradient>
        <linearGradient id="vt${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5A6267"/><stop offset="1" stop-color="#3B4246"/></linearGradient>
        <linearGradient id="cb${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E6E9EA"/><stop offset="1" stop-color="#AEB5B8"/></linearGradient>
        <radialGradient id="ln${u}" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#5DA9D6"/><stop offset=".45" stop-color="#1D4C6E"/><stop offset="1" stop-color="#081521"/></radialGradient>
      </defs>
      ${sombra(92, 112, 62)}
      <path d="M40 66 C 40 92, 58 98, 70 98" stroke="${C.preto}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M54 30 L60 24 L150 24 L144 30 Z" fill="url(#vt${u})"/>
      <path d="M144 30 L150 24 L150 100 L144 106 Z" fill="#1C2023"/>
      <rect x="54" y="30" width="90" height="76" rx="2.5" fill="url(#vf${u})"/>
      <rect x="54" y="30" width="90" height="3" fill="${cor}"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="${60 + i * 6.6}" y="37" width="3.6" height="7" rx="1" fill="#15191B"/>`).join('')}
      <rect x="60" y="50" width="40" height="22" rx="2" fill="#0F1416" stroke="#59636A" stroke-width=".8"/>
      <rect x="63" y="53" width="34" height="16" rx="1" fill="#16323F"/>
      <text x="66" y="64" font-family="Barlow,sans-serif" font-size="8" font-weight="700" fill="#66E08A">OK</text>
      <rect x="80" y="57" width="3" height="9" fill="#5FB3D9"/><rect x="85" y="59" width="3" height="7" fill="#5FB3D9"/><rect x="90" y="55" width="3" height="11" fill="#5FB3D9"/>
      ${[['PWR', C.verde], ['RUN', C.verde], ['ERR', '#5B2420']].map(([t, c], i) => `<circle cx="${108 + i * 12}" cy="54" r="2.4" fill="${c}"/><text x="${104 + i * 12}" y="62" font-family="Barlow,sans-serif" font-size="4" fill="#AEB6B8">${t}</text>`).join('')}
      <rect x="104" y="66" width="34" height="9" rx="1.5" fill="#2E8B3E"/>
      ${Array.from({ length: 8 }, (_, i) => `<rect x="${105.5 + i * 4.1}" y="67.5" width="2.6" height="6" rx=".6" fill="#1B5E27"/>`).join('')}
      <rect x="60" y="82" width="9" height="6" rx="1" fill="#0E1112" stroke="#6B757A" stroke-width=".7"/><rect x="72" y="82" width="9" height="6" rx="1" fill="#0E1112" stroke="#6B757A" stroke-width=".7"/>
      <rect x="84" y="80" width="11" height="10" rx="1" fill="#0E1112" stroke="#6B757A" stroke-width=".7"/><rect x="87" y="86" width="5" height="3" fill="#C9A227"/>
      ${[0, 1].map((i) => `<circle cx="${108 + i * 14}" cy="86" r="5" fill="#9CA4A7" stroke="#5E676B"/><circle cx="${108 + i * 14}" cy="86" r="2.5" fill="#22272A"/>`).join('')}
      ${[['USB', 64.5], ['USB', 76.5], ['LAN', 89.5], ['CAM 1', 108], ['CAM 2', 122]].map(([t, x]) => `<text x="${x}" y="99" text-anchor="middle" font-family="Barlow,sans-serif" font-size="4.2" fill="#8E979A">${t}</text>`).join('')}
      <circle cx="140" cy="99" r="1.5" fill="#6B757A"/>
      <rect x="27" y="56" width="10" height="44" rx="2" fill="#7C8689"/>
      <rect x="16" y="102" width="34" height="6" rx="2" fill="#5E676B"/>
      <path d="M14 28 L20 22 L50 22 L44 28 Z" fill="#F2F4F4"/>
      <path d="M44 28 L50 22 L50 54 L44 60 Z" fill="#8D9599"/>
      <rect x="14" y="28" width="30" height="32" rx="2.5" fill="url(#cb${u})"/>
      ${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<circle cx="${29 + Math.cos(a) * 12}" cy="${44 + Math.sin(a) * 12}" r="1.5" fill="#FFFBE6" stroke="#D9D2A6" stroke-width=".4"/>`; }).join('')}
      <circle cx="29" cy="44" r="9.5" fill="#1A1F22"/><circle cx="29" cy="44" r="7" fill="url(#ln${u})"/><circle cx="29" cy="44" r="2.6" fill="#03080C"/>
      <ellipse cx="26.5" cy="41" rx="2.4" ry="1.5" fill="#fff" opacity=".75"/>
      <rect x="14" y="28" width="30" height="2.5" fill="${cor}"/>`,

    // ---------------------------------------------------------------- máquina / processo (cena isométrica)
    processo: (cor) => processoIso(cor),

    // ---------------------------------------------------------------- remoto de I/O IP67 (bloco com conectores M12, desenho original)
    'remoto-io': (cor, u) => {
      const m12 = (cx, cy, r, anel = '#B8BFC2', codif = false) => `
        <circle cx="${cx}" cy="${cy}" r="${r + 1.6}" fill="#15191B"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rn${u})" stroke="${anel}" stroke-width="1.1"/>
        <circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="#0D1012"/>
        ${[0, 1, 2, 3].map((k) => { const a = Math.PI / 4 + (k * Math.PI) / 2; return `<circle cx="${(cx + Math.cos(a) * r * 0.36).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.36).toFixed(1)}" r=".75" fill="#C9A227"/>`; }).join('')}
        <circle cx="${cx}" cy="${cy}" r=".75" fill="#C9A227"/>${codif ? `<rect x="${cx - 1}" y="${cy - r * 0.62 - 1}" width="2" height="2.2" fill="${anel}"/>` : ''}`;
      const portas = [];
      for (let i = 0; i < 4; i++) {
        const y = 33 + i * 15.5;
        portas.push(m12(68, y, 5.2), m12(92, y, 5.2));
        portas.push(`<circle cx="77.5" cy="${y - 4}" r="1.2" fill="${i === 2 ? C.ambar : C.verde}"/><circle cx="82.5" cy="${y - 4}" r="1.2" fill="${C.verde}"/>`);
      }
      return `
      <defs>
        <linearGradient id="rf${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3B4247"/><stop offset=".5" stop-color="#2E3438"/><stop offset="1" stop-color="#262B2E"/></linearGradient>
        <radialGradient id="rn${u}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#E9EDEE"/><stop offset="1" stop-color="#8A9396"/></radialGradient>
      </defs>
      ${sombra(84, 113, 34)}
      <path d="M92 33 C 112 33, 116 46, 132 50" stroke="#4A5257" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M92 64 C 112 64, 118 76, 132 80" stroke="#4A5257" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <rect x="130" y="44" width="16" height="11" rx="3" fill="#7C8689"/><rect x="144" y="46" width="5" height="7" rx="1.5" fill="${cor}"/><circle cx="136" cy="49.5" r="1.4" fill="${C.ambar}"/>
      <rect x="130" y="74" width="16" height="11" rx="3" fill="#7C8689"/><rect x="144" y="76" width="5" height="7" rx="1.5" fill="${cor}"/><circle cx="136" cy="79.5" r="1.4" fill="${C.verde}"/>
      <path d="M104 8 L108 5 L108 106 L104 110 Z" fill="#1A1E20"/>
      <path d="M56 8 L60 5 L108 5 L104 8 Z" fill="#4C545A"/>
      <rect x="56" y="8" width="48" height="102" rx="3" fill="url(#rf${u})"/>
      ${m12(80, 17, 6, '#C9CED0')}
      <circle cx="68" cy="13" r="1.3" fill="${C.verde}"/><circle cx="92" cy="13" r="1.3" fill="${C.verde}"/>
      <line x1="80" y1="25" x2="80" y2="88" stroke="#1C2124" stroke-width="1"/>
      ${portas.join('')}
      <rect x="60" y="88" width="40" height="5" rx="1" fill="${cor}"/>
      ${m12(68, 100, 4.6, '#3FA7B0', true)}${m12(92, 100, 4.6, '#3FA7B0', true)}
      <circle cx="80" cy="97" r="1.2" fill="${C.verde}"/><circle cx="80" cy="102" r="1.2" fill="#5B2420"/>`;
    },

    // ---------------------------------------------------------------- dispositivo Modbus genérico
    modbus: (cor) => `
      ${sombra(80, 112, 46)}
      <rect x="36" y="22" width="88" height="86" rx="7" fill="${C.chapa}" stroke="${C.contorno}"/>
      <rect x="36" y="22" width="88" height="12" rx="6" fill="${cor}"/><rect x="36" y="29" width="88" height="5" fill="${cor}"/>
      <rect x="46" y="44" width="68" height="24" rx="3" fill="${C.escuro}"/>
      <text x="52" y="60" font-family="ui-monospace,Consolas,monospace" font-size="10" font-weight="700" fill="${C.lcd}">40001</text>
      <rect x="54" y="78" width="26" height="22" rx="2" fill="${C.escuro}"/><rect x="58" y="82" width="18" height="10" fill="#9AA3A6"/><rect x="63" y="92" width="8" height="4" fill="#9AA3A6"/>
      <circle cx="94" cy="82" r="3" fill="${C.verde}"/><circle cx="104" cy="82" r="3" fill="${C.ambar}"/><circle cx="94" cy="94" r="3" fill="${C.verde}"/><circle cx="104" cy="94" r="3" fill="#9AA3A6"/>
      <path d="M67 108 L67 116" stroke="#2D7FB8" stroke-width="4"/>`,

    // ---------------------------------------------------------------- CLP (CPU + módulos)
    clp: (cor) => `
      ${sombra(80, 112, 64)}
      <rect x="18" y="16" width="44" height="90" rx="4" fill="${C.escuro}"/>
      <rect x="18" y="16" width="44" height="6" rx="3" fill="${cor}"/>
      <rect x="25" y="30" width="30" height="14" rx="2" fill="${C.lcd}"/>
      <circle cx="28" cy="52" r="2.2" fill="${C.verde}"/><circle cx="36" cy="52" r="2.2" fill="${C.verde}"/><circle cx="44" cy="52" r="2.2" fill="${C.ambar}"/>
      <rect x="26" y="62" width="14" height="12" rx="1.5" fill="#9AA3A6"/><rect x="26" y="80" width="14" height="12" rx="1.5" fill="#9AA3A6"/>
      ${[0, 1, 2].map((i) => `<rect x="${64 + i * 26}" y="16" width="24" height="90" rx="3" fill="${C.chapa}" stroke="${C.contorno}"/>${Array.from({ length: 8 }, (_, k) => `<circle cx="${71 + i * 26}" cy="${28 + k * 9}" r="1.8" fill="${k % 3 === 0 ? C.verde : '#B9C0BE'}"/><rect x="${76 + i * 26}" y="${26 + k * 9}" width="8" height="4" rx="1" fill="#C3C9C6"/>`).join('')}`).join('')}`,

    // ---------------------------------------------------------------- IHM
    ihm: (cor) => `
      ${sombra(80, 112, 56)}
      <rect x="24" y="14" width="112" height="86" rx="7" fill="${C.escuro}"/>
      <rect x="32" y="22" width="96" height="64" rx="2" fill="#E8F1F6"/>
      <rect x="32" y="22" width="96" height="10" fill="${cor}"/>
      <rect x="40" y="40" width="34" height="16" rx="2" fill="${C.verde}"/><rect x="40" y="62" width="34" height="16" rx="2" fill="${C.vermelho}"/>
      <rect x="84" y="62" width="6" height="16" fill="#2D7FB8"/><rect x="94" y="52" width="6" height="26" fill="#2D7FB8"/><rect x="104" y="44" width="6" height="34" fill="#2D7FB8"/><rect x="114" y="56" width="6" height="22" fill="#2D7FB8"/>
      <rect x="66" y="100" width="28" height="9" fill="${C.aco2}"/>`,

    // ---------------------------------------------------------------- robô articulado
    robo: (cor) => `
      ${sombra(78, 112, 40)}
      <rect x="52" y="96" width="52" height="12" rx="3" fill="${C.escuro}"/>
      <rect x="64" y="80" width="28" height="18" rx="4" fill="${cor}"/>
      <path d="M78 84 L60 46" stroke="${cor}" stroke-width="14" stroke-linecap="round"/>
      <circle cx="78" cy="84" r="8" fill="${C.escuro}"/><circle cx="60" cy="46" r="8" fill="${C.escuro}"/>
      <path d="M60 46 L108 30" stroke="${cor}" stroke-width="11" stroke-linecap="round"/>
      <circle cx="108" cy="30" r="6" fill="${C.escuro}"/>
      <rect x="112" y="24" width="10" height="12" rx="2" fill="${C.aco}"/>
      <path d="M122 25 l10 -3 M122 35 l10 3" stroke="${C.aco2}" stroke-width="4" stroke-linecap="round"/>`,

    // ---------------------------------------------------------------- sensor indutivo / fotoelétrico
    sensor: (cor) => `
      ${sombra(80, 110, 54)}
      <path d="M40 58 C 30 58, 26 80, 14 96" stroke="${C.preto}" stroke-width="4" fill="none"/>
      <rect x="40" y="46" width="70" height="24" rx="4" fill="${C.aco}"/>
      ${Array.from({ length: 11 }, (_, i) => `<rect x="${44 + i * 6}" y="46" width="2" height="24" fill="${C.aco2}" opacity=".6"/>`).join('')}
      <rect x="56" y="43" width="8" height="30" rx="2" fill="${C.aco2}"/><rect x="88" y="43" width="8" height="30" rx="2" fill="${C.aco2}"/>
      <rect x="110" y="48" width="18" height="20" rx="4" fill="${cor}"/>
      <rect x="32" y="50" width="10" height="16" rx="2" fill="${C.escuro}"/><circle cx="37" cy="58" r="2.3" fill="${C.ambar}"/>
      <path d="M132 50 q8 8 0 16 M138 46 q12 12 0 24" stroke="${cor}" stroke-width="2" fill="none" opacity=".7"/>`,

    // ---------------------------------------------------------------- genérico
    generico: (cor) => `
      ${sombra(80, 112, 48)}
      <rect x="34" y="18" width="92" height="90" rx="8" fill="${C.chapa}" stroke="${C.contorno}"/>
      <rect x="34" y="18" width="92" height="8" rx="4" fill="${cor}"/>
      <circle cx="80" cy="62" r="20" fill="none" stroke="${C.aco}" stroke-width="7" stroke-dasharray="7 5"/>
      <circle cx="80" cy="62" r="9" fill="${C.escuro}"/>`,
  };

  const NOMES = { 'remoto-io': 'Remoto de I/O (IP67)', inversor: 'Inversor', servo: 'Servomotor', visao: 'Visão (controlador + câmera)', processo: 'Processo', modbus: 'Modbus', clp: 'CLP', ihm: 'IHM', robo: 'Robô', sensor: 'Sensor', generico: 'Genérico' };

  let seq = 0;
  function svg(tipo, cor = '#2C6CB0', rotulo = '') {
    const f = D[tipo] || D.generico;
    return `<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${rotulo || NOMES[tipo] || 'Dispositivo'}">${f(cor, `i${++seq}`)}</svg>`;
  }

  window.Icones = { svg, lista: Object.keys(D), nomes: NOMES };
})();
