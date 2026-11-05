"""Desenha redes Ladder em SVG a partir de JSON (usado pelo gerador dos guias).

Formato:
{"t": "título", "s": [elementos em série], "c": ["variável da bobina", "comentário"]}
Elemento: ["NO", "var", "comentário"] | ["NC", "var", "comentário"] | ["P", [ramo, ramo, ...]]
Ramo = lista de elementos em série.
"""
import html

CW, CH = 112, 74      # largura/altura de um contato
COIL_W = 150

def size(el):
    if el[0] in ("NO", "NC"):
        return CW, CH
    if el[0] == "P":
        ws, hs = zip(*[series_size(b) for b in el[1]])
        return max(ws), sum(hs)
    raise ValueError(el)

def series_size(seq):
    if not seq:
        return 0, CH
    ws, hs = zip(*[size(e) for e in seq])
    return sum(ws), max(hs)

def esc(t):
    return html.escape(str(t))

def draw_contact(out, el, x, y):
    kind, var, com = el[0], el[1], el[2] if len(el) > 2 else ""
    cy = y + CH / 2
    out.append(f'<line x1="{x}" y1="{cy}" x2="{x+40}" y2="{cy}" class="lw"/>')
    out.append(f'<line x1="{x+40}" y1="{cy-13}" x2="{x+40}" y2="{cy+13}" class="ls"/>')
    out.append(f'<line x1="{x+72}" y1="{cy-13}" x2="{x+72}" y2="{cy+13}" class="ls"/>')
    if kind == "NC":
        out.append(f'<line x1="{x+36}" y1="{cy+12}" x2="{x+76}" y2="{cy-12}" class="ls"/>')
    out.append(f'<line x1="{x+72}" y1="{cy}" x2="{x+CW}" y2="{cy}" class="lw"/>')
    out.append(f'<text x="{x+56}" y="{cy-19}" class="lv">{esc(var)}</text>')
    if com:
        out.append(f'<text x="{x+56}" y="{cy+28}" class="lc">{esc(com)}</text>')

def draw_series(out, seq, x, y):
    """Desenha em série a partir de (x, y topo). Retorna largura usada."""
    cx = x
    for el in seq:
        w, h = size(el)
        if el[0] == "P":
            draw_par(out, el, cx, y)
        else:
            draw_contact(out, el, cx, y)
        cx += w
    return cx - x

def draw_par(out, el, x, y):
    W, _ = size(el)
    yy = y
    centers = []
    for br in el[1]:
        w, h = series_size(br)
        draw_series(out, br, x, yy)
        cy = yy + CH / 2
        if w < W:
            out.append(f'<line x1="{x+w}" y1="{cy}" x2="{x+W}" y2="{cy}" class="lw"/>')
        centers.append(cy)
        yy += h
    out.append(f'<line x1="{x}" y1="{centers[0]}" x2="{x}" y2="{centers[-1]}" class="lw"/>')
    out.append(f'<line x1="{x+W}" y1="{centers[0]}" x2="{x+W}" y2="{centers[-1]}" class="lw"/>')

def render(spec):
    seq = spec["s"]
    w, h = series_size(seq)
    total_w = 30 + w + COIL_W + 30
    total_h = h + 34
    out = []
    y0 = 30
    cy = y0 + CH / 2
    out.append(f'<text x="8" y="18" class="lt">{esc(spec.get("t", ""))}</text>')
    out.append(f'<line x1="20" y1="{y0-6}" x2="20" y2="{y0+h+4}" class="lr"/>')
    out.append(f'<line x1="{total_w-20}" y1="{y0-6}" x2="{total_w-20}" y2="{y0+h+4}" class="lr"/>')
    out.append(f'<line x1="20" y1="{cy}" x2="30" y2="{cy}" class="lw"/>')
    draw_series(out, seq, 30, y0)
    cx = 30 + w
    coil, ccom = spec["c"][0], spec["c"][1] if len(spec["c"]) > 1 else ""
    out.append(f'<line x1="{cx}" y1="{cy}" x2="{cx+50}" y2="{cy}" class="lw"/>')
    out.append(f'<path d="M{cx+58} {cy-14} q-9 14 0 28 M{cx+82} {cy-14} q9 14 0 28" class="ls" fill="none"/>')
    out.append(f'<line x1="{cx+90}" y1="{cy}" x2="{total_w-20}" y2="{cy}" class="lw"/>')
    out.append(f'<text x="{cx+70}" y="{cy-19}" class="lv">{esc(coil)}</text>')
    if ccom:
        out.append(f'<text x="{cx+70}" y="{cy+28}" class="lc">{esc(ccom)}</text>')
    body = "".join(out)
    return (f'<div class="ladder"><svg viewBox="0 0 {total_w} {total_h}" width="{total_w}" '
            f'role="img" aria-label="{esc(spec.get("t", "Rede ladder"))}">{body}</svg></div>')
