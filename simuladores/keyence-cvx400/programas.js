/**
 * =====================================================================
 *  TIPOS DE PROGRAMA DO SIMULADOR CV-X
 * =====================================================================
 *  Cada programa da câmera é de um destes tipos. O tipo define:
 *   - as ferramentas (T100, T101...) que aparecem na tela;
 *   - a peça que fica na frente da câmera (e como ela é desenhada);
 *   - como a inspeção calcula o resultado de cada ferramenta;
 *   - o que é escrito na área de dados do usuário do assembly 100.
 *
 *  ETIQUETA  (Conf. 041 INSPECAO_ETIQUETA)
 *    Byte inicial (48)  QRCODE_MAIOR + QRCODE_MENOR_1..5, 1 caractere por INT32
 *
 *  FUROS     (Conf. 042 DISCO_FUROS)  — flange com furo central e furação
 *    Byte inicial +0   DIAMETRO_EXTERNO  DINT mm x 1000 (ou REAL em mm)
 *    Byte inicial +4   DIAMETRO_INTERNO  DINT mm x 1000 (ou REAL em mm)
 *    Byte inicial +8   QTD_FUROS         DINT
 *   Valores medidos fora da tolerância SÃO enviados (com a ferramenta em NG).
 *   Só vai zero quando a medição não existe (peça ausente ou fora de posição).
 *   O resultado de cada ferramenta vai nos bits do byte 4 (atribuição de saída).
 * =====================================================================
 */

"use strict";

const TAMANHO_ASSEMBLY = 1436;

function hash(t) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Divide o tempo de processamento entre as ferramentas (como a tela do CV-X mostra)
function temposFerramentas(ferramentas, tempo) {
  const partes = ferramentas.map((f) => 1 + (hash(f.id + f.nome) % 5));
  const soma = partes.reduce((a, b) => a + b, 0);
  return partes.map((p) => Math.round((tempo * 0.85 * p / soma) * 10) / 10);
}

// =====================================================================
// TIPO 1: VALIDAÇÃO DE ETIQUETA (6 QR codes)
// =====================================================================
const QR = [
  { nome: "QRCODE_MAIOR", tamanho: 54 },
  { nome: "QRCODE_MENOR_1", tamanho: 10 },
  { nome: "QRCODE_MENOR_2", tamanho: 10 },
  { nome: "QRCODE_MENOR_3", tamanho: 10 },
  { nome: "QRCODE_MENOR_4", tamanho: 10 },
  { nome: "QRCODE_MENOR_5", tamanho: 10 },
];

const codigoAleatorio = () => String(Math.floor(1e9 + Math.random() * 9e9)).slice(0, 10);
function embaralhar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function codigosDaMaior(peca) {
  const partes = ((peca && peca.maior) || "").split(",");
  return partes.length === 5 && partes.every((p) => /^\d{10}$/.test(p))
    ? partes : Array.from({ length: 5 }, codigoAleatorio);
}

const ETIQUETA = {
  tipo: "etiqueta",
  descricao: "Validação de etiqueta (6 QR codes)",
  ferramentas: [
    { id: "T100", nome: "Leitor de Código 2D", tipo: "codigo", qr: 0, rotulo: "QR maior" },
    { id: "T101", nome: "Leitor de Código 2D", tipo: "codigo", qr: 1, rotulo: "QR menor 1" },
    { id: "T102", nome: "Leitor de Código 2D", tipo: "codigo", qr: 2, rotulo: "QR menor 2" },
    { id: "T103", nome: "Leitor de Código 2D", tipo: "codigo", qr: 3, rotulo: "QR menor 3" },
    { id: "T104", nome: "Leitor de Código 2D", tipo: "codigo", qr: 4, rotulo: "QR menor 4" },
    { id: "T105", nome: "Leitor de Código 2D", tipo: "codigo", qr: 5, rotulo: "QR menor 5" },
    { id: "T106", nome: "Pos de padrão de perf", tipo: "posicao", rotulo: "Posição" },
  ],
  nomesFalha: ["T100 QR maior", "T101 QR menor 1", "T102 QR menor 2", "T103 QR menor 3",
    "T104 QR menor 4", "T105 QR menor 5", "T106 Posição"],

  configPadrao() {
    return {
      offsetDados: 48,
      tempoInspecaoMs: 300,
      falhaZera: true,
      saidas: [
        { byte: 4, bit: 0, item: "STATUS", tempo: "NG" },
        { byte: 4, bit: 1, item: "STATUS", tempo: "OK" },
        { byte: 4, bit: 2, item: "T100", tempo: "NG" },
        { byte: 4, bit: 3, item: "T101", tempo: "NG" },
        { byte: 4, bit: 4, item: "T102", tempo: "NG" },
        { byte: 4, bit: 5, item: "T103", tempo: "NG" },
        // 0004:bit6 fica livre: no EDS da Keyence o "Tool Judge Value6" aponta para o
        // parâmetro errado (Command Result) e o CODESYS não o mapeia como BOOL.
        { byte: 4, bit: 7, item: "T105", tempo: "NG" },
        { byte: 5, bit: 0, item: "T104", tempo: "NG" },     // Tool Judge Value8
      ],
    };
  },

  pecaPadrao() {
    return ETIQUETA.cenarios.nova.gerar();
  },

  falhasPadrao() {
    return [false, false, false, false, false, false, false];
  },

  cenarios: {
    nova: {
      rotulo: "Nova etiqueta (aprova)",
      gerar() {
        const c = Array.from({ length: 5 }, codigoAleatorio);
        return { maior: c.join(","), menores: [...c], descricao: "Nova etiqueta com códigos corretos" };
      },
    },
    ordem: {
      rotulo: "Ordem trocada (aprova)",
      gerar(peca) {
        const c = codigosDaMaior(peca);
        let m = embaralhar(c);
        while (m.join() === c.join()) m = embaralhar(c);
        return { maior: c.join(","), menores: m, descricao: "Peças em ordem trocada (deve aprovar)" };
      },
    },
    divergente: {
      rotulo: "Código divergente",
      gerar(peca) {
        const c = codigosDaMaior(peca);
        const m = [...c];
        const j = Math.floor(Math.random() * 5);
        const k = Math.floor(Math.random() * 10);
        const d = String((Number(m[j][k]) + 1 + Math.floor(Math.random() * 8)) % 10);
        m[j] = m[j].slice(0, k) + d + m[j].slice(k + 1);
        return { maior: c.join(","), menores: m, descricao: `Peça ${j + 1} com 1 dígito diferente` };
      },
    },
    repetido: {
      rotulo: "Código repetido",
      gerar(peca) {
        const c = codigosDaMaior(peca);
        const m = [...c];
        const a = Math.floor(Math.random() * 5);
        let b = Math.floor(Math.random() * 5);
        while (b === a) b = Math.floor(Math.random() * 5);
        m[b] = m[a];
        return { maior: c.join(","), menores: m, descricao: `Peça ${b + 1} repete o código da peça ${a + 1}` };
      },
    },
  },

  normalizarPeca(dados, atual) {
    const p = { ...atual };
    if (typeof dados.maior === "string") p.maior = dados.maior.slice(0, 54);
    if (Array.isArray(dados.menores)) p.menores = [0, 1, 2, 3, 4].map((j) => String(dados.menores[j] ?? "").slice(0, 10));
    return { maior: p.maior, menores: p.menores };
  },

  executar({ peca, falhas, tempo }) {
    const textos = [peca.maior, ...peca.menores];
    const falhaPosicao = falhas[6];
    const tempos = temposFerramentas(ETIQUETA.ferramentas, tempo);
    return ETIQUETA.ferramentas.map((f, k) => {
      if (f.tipo === "posicao") {
        const h = hash(peca.maior);
        return {
          id: f.id, nome: f.nome, tipo: f.tipo, ok: !falhaPosicao, tempoMs: tempos[k],
          correlacao: falhaPosicao ? 20 + (h % 25) : 92 + (h % 8),
          x: falhaPosicao ? null : 511 + ((h >> 3) % 40) / 10,
          y: falhaPosicao ? null : 640 + ((h >> 7) % 40) / 10,
          angulo: falhaPosicao ? null : ((h >> 11) % 30) / 10 - 1.5,
        };
      }
      const falhou = falhas[f.qr] || falhaPosicao;
      const texto = textos[f.qr] || "";
      const h = hash(texto + f.id);
      return {
        id: f.id, nome: f.nome, tipo: f.tipo, qr: f.qr, ok: !falhou, tempoMs: tempos[k],
        dados: falhou ? null : texto,
        taxaErro: falhou ? null : 6 + (h % 24),
        resolucao: falhou ? null : Math.round((1.9 + (h % 70) / 100) * 1000) / 1000,
      };
    });
  },

  // 1 caractere por INT32 little endian (valor no 1º byte)
  escreverDados(entrada, { resultados, peca, config }) {
    const textos = [peca.maior, ...peca.menores];
    let pos = config.offsetDados;
    QR.forEach((qr, i) => {
      const falhou = !resultados[i].ok;
      for (let k = 0; k < qr.tamanho; k++) {
        const o = pos + k * 4;
        if (o + 4 > TAMANHO_ASSEMBLY) continue;
        if (falhou) {
          if (config.falhaZera) entrada.fill(0, o, o + 4);
        } else {
          const c = textos[i].charCodeAt(k);
          entrada.fill(0, o, o + 4);
          entrada.writeUInt8(Number.isNaN(c) ? 0 : c & 0xff, o);
        }
      }
      pos += qr.tamanho * 4;
    });
  },

  mapa(config) {
    let pos = config.offsetDados;
    return QR.map((q, i) => {
      const ini = pos;
      pos += q.tamanho * 4;
      return { nome: q.nome, tamanho: q.tamanho, byteInicial: ini, byteFinal: pos - 1,
        tipoDado: "INT32 por caractere", ferramenta: `T10${i}`, porCaractere: true };
    });
  },

  resumoNg(resultados) {
    return resultados.filter((r) => !r.ok).map((r) => r.id).join(", ");
  },
};

// =====================================================================
// TIPO 2: DISCO COM FUROS (flange)
// =====================================================================
/*
 * Peça: flange de aço com furo central e uma furação de 6 furos Ø10 mm
 * no diâmetro primitivo de 60 mm. Nominal: Ø externo 80,000 mm e
 * Ø do furo central (interno) 40,000 mm.
 *
 * Ferramentas:
 *   T100 Pos de padrão de perf  localiza a peça; se NG, as outras não medem
 *   T101 Diâmetro                Ø externo do disco
 *   T102 Diâmetro                Ø interno (furo central)
 *   T103 Contagem de blob        quantidade de furos da furação
 */
const FUROS_NOMINAL = 6;

const FUROS = {
  tipo: "furos",
  descricao: "Disco com furos: diâmetros e contagem de furos",
  ferramentas: [
    { id: "T100", nome: "Pos de padrão de perf", tipo: "posicao", rotulo: "Posição" },
    { id: "T101", nome: "Diâmetro", tipo: "diametro", alvo: "ext", rotulo: "Ø externo" },
    { id: "T102", nome: "Diâmetro", tipo: "diametro", alvo: "int", rotulo: "Ø interno" },
    { id: "T103", nome: "Contagem de blob", tipo: "contagem", rotulo: "Qtd. de furos" },
  ],
  nomesFalha: [],

  configPadrao() {
    return {
      offsetDados: 48,
      tempoInspecaoMs: 250,
      falhaZera: true,
      formato: "DINT",                 // "DINT" = mm x 1000 | "REAL" = mm
      limites: {
        ext: { min: 79.8, max: 80.2 },
        int: { min: 39.85, max: 40.15 },
        furos: { min: 6, max: 6 },
      },
      saidas: [
        { byte: 4, bit: 0, item: "STATUS", tempo: "NG" },
        { byte: 4, bit: 1, item: "STATUS", tempo: "OK" },
        { byte: 4, bit: 2, item: "T100", tempo: "NG" },
        { byte: 4, bit: 3, item: "T101", tempo: "NG" },
        { byte: 4, bit: 4, item: "T102", tempo: "NG" },
        { byte: 4, bit: 5, item: "T103", tempo: "NG" },
      ],
    };
  },

  pecaPadrao() {
    return { presente: true, foraPosicao: false, diamExt: 80, diamInt: 40, furos: FUROS_NOMINAL, ruido: 0.008 };
  },

  falhasPadrao() {
    return [];
  },

  cenarios: {
    boa: {
      rotulo: "Peça boa (aprova)",
      gerar() {
        return { ...FUROS.pecaPadrao(), descricao: "Peça boa, dentro das tolerâncias" };
      },
    },
    faltaFuro: {
      rotulo: "Falta 1 furo",
      gerar() {
        return { ...FUROS.pecaPadrao(), furos: FUROS_NOMINAL - 1, descricao: "Peça com 5 furos (falta 1)" };
      },
    },
    extFora: {
      rotulo: "Ø externo fora",
      gerar() {
        return { ...FUROS.pecaPadrao(), diamExt: 80.45, descricao: "Ø externo 80,45 mm (máx. 80,20)" };
      },
    },
    intFora: {
      rotulo: "Ø interno fora",
      gerar() {
        return { ...FUROS.pecaPadrao(), diamInt: 39.7, descricao: "Ø interno 39,70 mm (mín. 39,85)" };
      },
    },
    foraPosicao: {
      rotulo: "Fora de posição",
      gerar() {
        return { ...FUROS.pecaPadrao(), foraPosicao: true, descricao: "Peça fora da posição de inspeção" };
      },
    },
    ausente: {
      rotulo: "Sem peça",
      gerar() {
        return { ...FUROS.pecaPadrao(), presente: false, descricao: "Nenhuma peça na frente da câmera" };
      },
    },
  },

  normalizarPeca(d, atual) {
    const p = { ...atual };
    const num = (v, min, max) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
    if (num(d.diamExt, 10, 200) !== null) p.diamExt = Math.round(d.diamExt * 1000) / 1000;
    if (num(d.diamInt, 5, 150) !== null) p.diamInt = Math.round(d.diamInt * 1000) / 1000;
    if (Number.isInteger(d.furos) && d.furos >= 0 && d.furos <= 12) p.furos = d.furos;
    if (num(d.ruido, 0, 0.5) !== null) p.ruido = d.ruido;
    if (typeof d.presente === "boolean") p.presente = d.presente;
    if (typeof d.foraPosicao === "boolean") p.foraPosicao = d.foraPosicao;
    // Ø interno não pode passar o externo
    if (p.diamInt >= p.diamExt - 4) p.diamInt = Math.round((p.diamExt - 4) * 1000) / 1000;
    return {
      presente: p.presente, foraPosicao: p.foraPosicao, diamExt: p.diamExt,
      diamInt: p.diamInt, furos: p.furos, ruido: p.ruido,
    };
  },

  executar({ peca, config, tempo }) {
    const tempos = temposFerramentas(FUROS.ferramentas, tempo);
    const L = config.limites;
    const localizada = peca.presente && !peca.foraPosicao;
    const ruido = () => (Math.random() * 2 - 1) * (peca.ruido || 0);
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const h = hash(String(peca.diamExt) + peca.diamInt + peca.furos);

    return FUROS.ferramentas.map((f, k) => {
      const base = { id: f.id, nome: f.nome, tipo: f.tipo, tempoMs: tempos[k] };
      if (f.tipo === "posicao") {
        return {
          ...base, ok: localizada,
          correlacao: !peca.presente ? 0 : peca.foraPosicao ? 31 + (h % 20) : 93 + (h % 6),
          x: localizada ? r3(320 + Math.random() * 0.6 - 0.3) : null,
          y: localizada ? r3(240 + Math.random() * 0.6 - 0.3) : null,
          angulo: localizada ? Math.round((Math.random() * 1.2 - 0.6) * 100) / 100 : null,
        };
      }
      if (!localizada) return { ...base, ok: false, valor: null, limites: L[f.alvo || "furos"] };
      if (f.tipo === "diametro") {
        const nominal = f.alvo === "ext" ? peca.diamExt : peca.diamInt;
        const valor = r3(nominal + ruido());
        const lim = L[f.alvo];
        return {
          ...base, valor, limites: lim, ok: valor >= lim.min && valor <= lim.max,
          centroX: r3(320 + Math.random() * 0.2 - 0.1), centroY: r3(240 + Math.random() * 0.2 - 0.1),
        };
      }
      // Contagem de blob (furos)
      const valor = peca.furos;
      return {
        ...base, valor, limites: L.furos, ok: valor >= L.furos.min && valor <= L.furos.max,
        areaMedia: valor ? Math.round(1256 + (h % 30) - 15) : 0,
      };
    });
  },

  escreverDados(entrada, { resultados, config }) {
    const o = config.offsetDados;
    const escrever = (pos, r, inteiro) => {
      if (pos + 4 > TAMANHO_ASSEMBLY) return;
      if (r.valor === null || r.valor === undefined) {
        if (config.falhaZera) entrada.fill(0, pos, pos + 4);
        return;                            // "manter": fica o valor anterior
      }
      if (inteiro) entrada.writeInt32LE(r.valor, pos);
      else if (config.formato === "REAL") entrada.writeFloatLE(r.valor, pos);
      else entrada.writeInt32LE(Math.round(r.valor * 1000), pos);
    };
    const r = (id) => resultados.find((x) => x.id === id);
    escrever(o, r("T101"), false);
    escrever(o + 4, r("T102"), false);
    escrever(o + 8, r("T103"), true);
  },

  mapa(config) {
    const o = config.offsetDados;
    const fmt = config.formato === "REAL" ? "REAL (mm)" : "DINT (mm x 1000)";
    return [
      { nome: "DIAMETRO_EXTERNO", byteInicial: o, byteFinal: o + 3, tipoDado: fmt, ferramenta: "T101" },
      { nome: "DIAMETRO_INTERNO", byteInicial: o + 4, byteFinal: o + 7, tipoDado: fmt, ferramenta: "T102" },
      { nome: "QTD_FUROS", byteInicial: o + 8, byteFinal: o + 11, tipoDado: "DINT", ferramenta: "T103" },
    ];
  },

  resumoNg(resultados) {
    return resultados.filter((r) => !r.ok).map((r) => {
      if (r.valor === null || r.valor === undefined) return `${r.id} sem medição`;
      if (r.tipo === "diametro") return `${r.id} Ø ${r.valor.toFixed(3)}`;
      if (r.tipo === "contagem") return `${r.id} ${r.valor} furos`;
      return r.id;
    }).join(", ");
  },

  validarLimites(d, atual) {
    const L = JSON.parse(JSON.stringify(atual));
    for (const k of ["ext", "int"]) {
      if (!d[k]) continue;
      const min = Number(d[k].min);
      const max = Number(d[k].max);
      if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min && max < 1000) {
        L[k] = { min: Math.round(min * 1000) / 1000, max: Math.round(max * 1000) / 1000 };
      }
    }
    if (d.furos) {
      const min = Number(d.furos.min);
      const max = Number(d.furos.max);
      if (Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= min && max <= 99) L.furos = { min, max };
    }
    return L;
  },
};

const TIPOS = { etiqueta: ETIQUETA, furos: FUROS };

module.exports = { TIPOS, TAMANHO_ASSEMBLY, hash };
