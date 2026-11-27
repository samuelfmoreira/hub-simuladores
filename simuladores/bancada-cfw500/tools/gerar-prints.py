#!/usr/bin/env python3
"""Gera as figuras do GUIA.md a partir do próprio simulador (Playwright + Chromium). Uso: python3 tools/gerar-prints.py [parte do nome ...]
Sobe o servidor numa porta livre, monta cada situação pela API da tela (SIM.banc / SIM.cena) e salva em guia/*.png."""
import os, socket, subprocess, sys, time, signal
from playwright.sync_api import sync_playwright
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORTA = 3991
srv = subprocess.Popen(['node', 'server.js'], cwd=RAIZ, env=dict(os.environ, SIM_HTTP_PORT=str(PORTA), HUB='1'), start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
for _ in range(50):
    try: socket.create_connection(('127.0.0.1', PORTA), 0.2).close(); break
    except OSError: time.sleep(0.1)
LIGA = "const b=SIM.banc,e=(ms)=>new Promise(r=>setTimeout(r,ms)); const liga=async()=>{b.acao('Q1',{fechado:true}); b.acao('X1',{ligada:true}); while(!(b.inv.vivo&&b.inv.boot<=0)) await e(150);}; const rem=()=>{ if(b.inv.loc){b.inv.hmi.tecla('locrem',true); b.inv.hmi.tecla('locrem',false);} };"
SO = sys.argv[1:]
def cena(pg, js, nome, espera=1600, alvo='#cena3d canvas'):
    if SO and not any(x in nome for x in SO): return
    pg.goto(f'http://127.0.0.1:{PORTA}/?hubRestaurar=1'); pg.wait_for_timeout(1800)
    pg.evaluate("(async()=>{" + LIGA + js + "})()"); pg.wait_for_timeout(espera)
    caixa = pg.locator(alvo).first.bounding_box(); pg.screenshot(path=os.path.join(RAIZ, 'guia', nome), clip=caixa, timeout=120000); print('ok', nome, flush=True)   # recorte da página: não espera a cena 3D "parar"
try:
    with sync_playwright() as p:
        nav = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        pg = nav.new_page(viewport={'width': 1500, 'height': 900})
        cena(pg, "b.montagem('pot'); SIM.cena.sincFios(); await liga(); rem(); b.acao('RP1',{pos:0.6}); b.acao('K1',{on:true}); await e(4000);", 'tela-geral.png', alvo='body')
        cena(pg, "b.montagem('forca'); SIM.cena.sincFios(); SIM.cena.vista('inversor'); await liga(); await e(500);", 'inversor.png', 2200)
        cena(pg, "SIM.cena.vista('bornes');", 'bornes.png', 2200)
        cena(pg, "SIM.cena.vista('comando');", 'comando.png', 2200)
        cena(pg, "b.montagem('forca'); SIM.cena.sincFios(); SIM.cena.vista('motor');", 'motor.png', 2200)
        cena(pg, "b.montagem('pot'); SIM.cena.sincFios(); await liga(); b.acao('RP1',{pos:0.507}); b.acao('P1',{modo:2,pv:'A1.c6',pc:'A1.c4'}); SIM.cena.vista('multimetro');", 'multimetro.png', 2500)
        for m in ['forca', 'dois_fios', 'pot', 'tres_fios', 'multispeed', 'sinalizacao', 'falha_ext', 'gerador', 'contatora']:
            cena(pg, f"const r=b.montagem('{m}'); if (r.novos) SIM.cena.reconstruir(); else SIM.cena.sincFios();", f'montagem-{m}.png', 900)
        cena(pg, "b.montagem('pot'); SIM.cena.sincFios(); await liga(); rem(); b.acao('RP1',{pos:0.6}); b.acao('K1',{on:true}); document.querySelector('[data-aba=inversor]').click(); await e(4500);", 'aba-inversor.png', 500, alvo='.lado')
        cena(pg, "b.montagem('pot'); SIM.cena.sincFios(); await liga(); b.acao('RP1',{pos:0.507}); b.acao('P1',{modo:2,pv:'A1.c6',pc:'A1.c4'}); document.querySelector('[data-aba=medicoes]').click();", 'aba-medicoes.png', 900, alvo='.lado')
        cena(pg, "b.montagem('forca'); SIM.cena.sincFios(); await liga(); document.querySelector('[data-aba=parametros]').click(); document.querySelector('#pGrupo').value='I/O'; document.querySelector('#pGrupo').dispatchEvent(new Event('change'));", 'aba-parametros.png', 700, alvo='.lado')
        cena(pg, "document.querySelector('[data-aba=bancada]').click();", 'aba-bancada.png', 500, alvo='.lado')
        cena(pg, "b.montagem('forca'); b.addFio('X1.L1','A1.c1','vermelho'); SIM.cena.sincFios(); b.acao('Q1',{fechado:true}); b.acao('X1',{ligada:true});", 'erro-ligacao.png', 1200, alvo='body')
        cena(pg, "b.montagem('pot'); SIM.cena.sincFios(); await e(700); document.querySelector('#chSessao').click();", 'sessoes.png', 600, alvo='body')
        cena(pg, "b.montagem('pot'); const f=b.fios.find(x=>x.a==='A1.U'); f.pinos=[{t:0.5,x:0.44,y:1.46,z:0.08}]; const g=b.fios.find(x=>x.a==='A1.c8'); g.pinos=[{t:0.45,x:-0.2,y:1.2,z:0.06}]; SIM.cena.reconstruir();", 'fio-maleavel.png', 1500)
        cena(pg, "b.montagem('forca'); SIM.cena.sincFios(); await liga(); b.inv.hmi.tecla('i',true); b.inv.hmi.tecla('i',false); b.inv.P[121]=30; while(Math.abs(b.inv.fS)<29.9) await e(200); b.acao('P2',{a1:'A1.U',b1:'A1.V'}); b.acao('P2',SIM.autoOsc(b)); SIM.cena.vista('osciloscopio'); await e(2500);", 'osciloscopio.png', 800)
        cena(pg, "b.montagem('forca'); SIM.cena.sincFios(); await liga(); b.inv.hmi.tecla('i',true); b.inv.hmi.tecla('i',false); b.inv.P[121]=30; while(Math.abs(b.inv.fS)<29.9) await e(200); b.acao('P2',{a1:'A1.U',b1:'A1.V',a2:'X1.L1',b2:'X1.L2',filtro:true}); b.acao('P2',SIM.autoOsc(b)); document.querySelector('[data-aba=medicoes]').click(); await e(600); document.querySelector('#oscTela').scrollIntoView();", 'aba-osciloscopio.png', 900, alvo='.lado')
        cena(pg, "const r=b.montagem('contatora'); SIM.cena.reconstruir(); b.acao('Q1',{fechado:true}); b.acao('X1',{ligada:true}); await e(1500); b.acao('S1',{ap:true}); await e(300); b.acao('S1',{ap:false}); await e(2500); const k=b.comp('KM1'); SIM.cena.seleciona(null); SIM.cena.vista('comando');", 'contatora-perto.png', 1500, alvo='body')
        cena(pg, "SIM.campo.abrir('demo','cheia'); await e(300); document.querySelector('#campo [data-pre]:nth-of-type(2)').click(); await e(4500);", 'campo-girante.png', 600, alvo='body')
        cena(pg, "const m=b.montagem('forca'); if(m.novos) SIM.cena.reconstruir(); else SIM.cena.sincFios(); await liga(); b.inv.hmi.tecla('i',true); b.inv.hmi.tecla('i',false); b.inv.P[121]=40; b.motor.carga=1; while(Math.abs(b.inv.fS)<39.9) await e(200); SIM.campo.abrir('banc','popup'); await e(2500);", 'campo-popup.png', 600, alvo='body')
        cena(pg, "b.montagem('forca'); SIM.cena.sincFios(); SIM.cena.vista('caixa');", 'fechamento.png', 2600)
        nav.close()
finally:
    os.killpg(srv.pid, signal.SIGTERM)
