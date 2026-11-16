"""Gera public/guia.html a partir de docs/guia.md.  Uso: python tools/gerar-guia.py  (pip install markdown)"""
import html, json, re
from pathlib import Path
import markdown
from markdown.extensions.toc import slugify_unicode

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
TITLE = "Guia passo a passo"
md = markdown.Markdown(extensions=["tables", "sane_lists", "toc", "fenced_code"], extension_configs={"toc": {"slugify": slugify_unicode, "toc_depth": "2"}})
text = (ROOT / "docs" / "guia.md").read_text(encoding="utf-8")
body = md.convert(text)
body = body.replace("<table>", '<div class="tw"><table>').replace("</table>", "</table></div>")
body = re.sub(r'<a href="(https?://[^"]+)"', r'<a href="\1" target="_blank" rel="noopener"', body)
toc_html = "\n".join(f'<li><a href="#{t["id"]}">{html.escape(html.unescape(t["name"]))}</a></li>' for t in md.toc_tokens)
page = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{TITLE} — Estação de bombeamento TQ-01</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="css/guia.css">
</head>
<body>
<header class="g-top">
  <div class="g-brand">
    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 4h20v4H6zM8 8h16v16a8 8 0 0 1-16 0z"/></svg>
    <div><h1>{TITLE}</h1><p>Estação de bombeamento TQ-01 · CODESYS / Altus XP325 · Modbus TCP, OPC UA, OPC DA · versão {VERSION}</p></div>
  </div>
  <div class="g-actions">
    <a href="diagrama.html">Diagrama de ligação</a>
    <button type="button" onclick="window.print()">Imprimir ou salvar PDF</button>
    <a href="/" class="primary">Abrir o simulador</a>
  </div>
</header>
<div class="g-layout">
  <nav class="g-toc" aria-label="Sumário"><h2>Sumário</h2><ol>
{toc_html}
  </ol></nav>
  <main class="g-body">
{body}
    <p class="g-end"><a href="#top" onclick="window.scrollTo(0,0);return false">Voltar ao início</a></p>
  </main>
</div>
<script>
(function () {{
  var links = Array.prototype.slice.call(document.querySelectorAll('.g-toc a')); var map = {{}};
  links.forEach(function (a) {{ map[a.getAttribute('href').slice(1)] = a; }});
  if (!('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (entries) {{ entries.forEach(function (e) {{ if (e.isIntersecting && map[e.target.id]) {{ links.forEach(function (l) {{ l.removeAttribute('aria-current'); }}); map[e.target.id].setAttribute('aria-current', 'true'); }} }}); }}, {{ rootMargin: '0px 0px -70% 0px' }});
  document.querySelectorAll('.g-body h2[id]').forEach(function (h) {{ io.observe(h); }});
}})();
</script>
</body>
</html>
"""
(ROOT / "public" / "guia.html").write_text(page, encoding="utf-8")
# figuras do guia: a pasta guia/ da raiz é copiada para public/guia/ (mesmo caminho relativo do markdown)
import shutil
dst = ROOT / "public" / "guia"; dst.mkdir(exist_ok=True)
for f in (ROOT / "guia").iterdir():
    if f.is_file(): shutil.copy(f, dst / f.name)
shutil.copy(ROOT / "docs" / "guia.md", ROOT / "GUIA.md")
print(f"Gerado public/guia.html ({len(page)//1024} KB, {len(md.toc_tokens)} seções)")
