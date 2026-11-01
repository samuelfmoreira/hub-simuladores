/* Markdown simples para as aulas e os guias (funciona offline).
   Suporta: títulos, parágrafos, listas, tabelas, blocos de código, citações, regra,
   negrito, itálico, código, links e o bloco ":::widget nome" das aulas. */
(function () {
  'use strict';
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function inline(t) {
    const codigos = [];
    t = t.replace(/`([^`]+)`/g, (_, c) => { codigos.push(c); return `\u0000${codigos.length - 1}\u0000`; });
    t = esc(t)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) => {
        const seguro = /^(https?:|#|\/|mailto:)/.test(url) ? url : '#';
        const externo = /^https?:/.test(seguro) ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${seguro}"${externo}>${txt}</a>`;
      });
    return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codigos[+i])}</code>`);
  }

  const celulas = (linha) => linha.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

  function render(md) {
    const L = md.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < L.length) {
      const l = L[i];
      if (!l.trim()) { i++; continue; }

      let m;
      if ((m = l.match(/^:::widget\s+([\w-]+)/))) { out.push(`<div class="widget" data-widget="${m[1]}"></div>`); i++; continue; }
      if ((m = l.match(/^```(\w*)/))) {
        const bloco = []; i++;
        while (i < L.length && !L[i].startsWith('```')) bloco.push(L[i++]);
        i++;
        out.push(`<pre><code>${esc(bloco.join('\n'))}</code></pre>`);
        continue;
      }
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const n = m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
      if (/^(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (l.startsWith('>')) {
        const bloco = [];
        while (i < L.length && L[i].startsWith('>')) bloco.push(L[i++].replace(/^>\s?/, ''));
        const txt = bloco.join(' ');
        const nota = /^\*\*(Nota|Atenção|Dica|Cuidado)/.test(txt);
        out.push(`<blockquote${nota ? ' class="nota"' : ''}>${inline(txt)}</blockquote>`);
        continue;
      }
      if (l.trim().startsWith('|') && i + 1 < L.length && /^\s*\|?\s*:?-{2,}/.test(L[i + 1])) {
        const cab = celulas(l); i += 2;
        const linhas = [];
        while (i < L.length && L[i].trim().startsWith('|')) linhas.push(celulas(L[i++]));
        out.push(`<table><thead><tr>${cab.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
          linhas.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        continue;
      }
      if (/^\s*([-*]|\d+[.)])\s+/.test(l)) {
        const ordenada = /^\s*\d/.test(l);
        const itens = [];
        while (i < L.length && /^\s*([-*]|\d+[.)])\s+/.test(L[i])) {
          let item = L[i++].replace(/^\s*([-*]|\d+[.)])\s+/, '');
          while (i < L.length && /^\s{2,}\S/.test(L[i]) && !/^\s*([-*]|\d+[.)])\s+/.test(L[i])) item += ' ' + L[i++].trim();
          itens.push(`<li>${inline(item)}</li>`);
        }
        out.push(ordenada ? `<ol>${itens.join('')}</ol>` : `<ul>${itens.join('')}</ul>`);
        continue;
      }
      const par = [];
      while (i < L.length && L[i].trim() && !/^(#{1,4}\s|```|>|:::|\s*([-*]|\d+[.)])\s+|\s*\|)/.test(L[i]) && !/^(-{3,})\s*$/.test(L[i])) par.push(L[i++].trim());
      if (par.length) out.push(`<p>${inline(par.join(' '))}</p>`); else i++;
    }
    return out.join('\n');
  }

  window.MD = { render, esc };
})();
