"""Gera public/guia.html a partir de docs/guia.md.

Uso (na pasta do projeto):  python tools/gerar-guia.py
Requer: pip install markdown
"""
import html
import json
import re
from pathlib import Path

import markdown
from markdown.extensions.toc import slugify_unicode

import sys
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from ladder import render as render_ladder  # noqa: E402
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]

DOCS = [
    # fonte, saída, título, link do outro guia
    ("guia.md", "guia.html", "Guia passo a passo", ("guia-programacao.html", "Programar o CLP")),
    ("guia-programacao.md", "guia-programacao.html", "Programar o CLP e configurar o campo", ("guia.html", "Guia do simulador")),
]

def build(src_name, out_name, TITLE, other):
  SRC = ROOT / "docs" / src_name
  OUT = ROOT / "public" / out_name
  md = markdown.Markdown(
    extensions=["tables", "sane_lists", "toc", "fenced_code"],
    extension_configs={"toc": {"slugify": slugify_unicode, "toc_depth": "2"}},
  )
  text = SRC.read_text(encoding="utf-8")
  # blocos ```ladder {json}``` viram figuras SVG
  text = re.sub(r"```ladder\n(.*?)\n```", lambda m: render_ladder(json.loads(m.group(1))), text, flags=re.S)
  body = md.convert(text)
  toc = [(t["id"], t["name"]) for t in md.toc_tokens]

  # Tabelas com rolagem própria; links externos em nova guia
  body = body.replace("<table>", '<div class="tw"><table>').replace("</table>", "</table></div>")
  body = re.sub(r'<a href="(https?://[^"]+)"', r'<a href="\1" target="_blank" rel="noopener"', body)

  def short(name: str) -> str:
      return html.unescape(name)

  toc_html = "\n".join(
      f'<li><a href="#{i}">{html.escape(short(n))}</a></li>' for i, n in toc
  )

  page = f"""<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{TITLE} — Simulador Sistema de Incêndio</title>
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="css/guia.css">
  </head>
  <body>
  <header class="g-top">
    <div class="g-brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3c3.5 6 8 8 8 15a8 8 0 0 1-16 0c0-3.5 2-6 3.5-8 1 3.5 2.5 4.5 4.5 4.5-1-4.5-1-8 0-11.5z"/></svg>
      <div>
        <h1>{TITLE}</h1>
        <p>Simulador Sistema de Incêndio · Modbus TCP · versão {VERSION}</p>
      </div>
    </div>
    <div class="g-actions">
      <a href="{other[0]}">{other[1]}</a>
    <button type="button" onclick="window.print()">Imprimir ou salvar PDF</button>
      <a href="/" class="primary">Abrir o simulador</a>
    </div>
  </header>
  <div class="g-layout">
    <nav class="g-toc" aria-label="Sumário">
      <h2>Sumário</h2>
      <ol>
  {toc_html}
      </ol>
    </nav>
    <main class="g-body">
  {body}
      <p class="g-end"><a href="#top" onclick="window.scrollTo(0,0);return false">Voltar ao início</a></p>
    </main>
  </div>
  <script>
  // Destaca no sumário a seção que está na tela
  (function () {{
    var links = Array.prototype.slice.call(document.querySelectorAll('.g-toc a'));
    var map = {{}};
    links.forEach(function (a) {{ map[a.getAttribute('href').slice(1)] = a; }});
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {{
      entries.forEach(function (e) {{
        if (e.isIntersecting && map[e.target.id]) {{
          links.forEach(function (l) {{ l.removeAttribute('aria-current'); }});
          map[e.target.id].setAttribute('aria-current', 'true');
        }}
      }});
    }}, {{ rootMargin: '0px 0px -70% 0px' }});
    document.querySelectorAll('.g-body h2[id]').forEach(function (h) {{ io.observe(h); }});
  }})();
  </script>
  </body>
  </html>
  """
  OUT.write_text(page, encoding="utf-8")
  print(f"Gerado {OUT.relative_to(ROOT)} ({len(page)//1024} KB, {len(toc)} seções)")


for d in DOCS:
    build(*d)
