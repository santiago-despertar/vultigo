import time
"""Builds the static pages of resalta.co from partials. Run: python3 build.py"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"

HEAD = r"""<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="https://resalta.co/assets/img/og.png">
<meta property="og:url" content="https://resalta.co/{path}">
<link rel="canonical" href="https://resalta.co/{path}">
<meta name="theme-color" content="#6E7E8E">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css?v=__V__">
<script>try{{var _p=location.pathname;if(/\.html$/.test(_p))history.replaceState(null,"",((/\/index\.html$/.test(_p)?_p.slice(0,-10):_p.slice(0,-5))||"/")+location.search+location.hash)}}catch(e){{}}</script>
<script>try{{var _d=document.documentElement;if(document.fonts&&document.fonts.load){{_d.classList.add("fload");var _ok=function(){{_d.classList.remove("fload")}};Promise.all([document.fonts.load("300 40px Inter"),document.fonts.load("400 16px Inter"),document.fonts.load("600 16px Inter")]).then(_ok,_ok);setTimeout(_ok,900)}}}}catch(e){{}}</script>
<script>try{{if(localStorage.getItem("sb-jxluabbugwdonqchbaxm-auth-token"))document.documentElement.classList.add("authed")}}catch(e){{}}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-F5L2THEVH0"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag("js",new Date());gtag("config","G-F5L2THEVH0");</script>
<script>!function(f,b,e,v,n,t,s){{if(f.fbq)return;n=f.fbq=function(){{n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)}};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");fbq("init","3159447567559166");fbq("track","PageView");</script>
{extra_head}
</head>
<body data-page="{page}">
"""

HEADER = """<header class="site-header">
  <div class="wrap nav">
    <a class="brand" href="/" aria-label="Resalta, inicio"><img src="/assets/img/mark-ink.svg" alt=""><span>resalta</span></a>
    <nav class="nav-links" id="navLinks">
      <a href="/#como-funciona">Cómo funciona</a>
      <a href="/#por-que">Por qué Resalta</a>
      <a href="/calificacion">Calificación gratis</a>
      <a href="/#preguntas">Preguntas</a>
      <a href="/blog">Blog</a>
      <a href="/cuenta" class="menu-only">Entrar / Mi cuenta</a>
    </nav>
    <div class="nav-cta">
      <a class="btn btn-ghost" href="/cuenta" data-auth="out">Entrar</a>
      <a class="btn btn-ghost" href="/panel" data-auth="in">Mi cuenta</a>
      <a class="btn btn-primary" href="/analisis">Empieza tu plan</a>
      <button class="menu-btn" id="menuBtn" type="button" aria-label="Abrir menú" aria-controls="navLinks" aria-expanded="false"><span class="burger" aria-hidden="true"><i></i><i></i></span></button>
    </div>
  </div>
</header>
"""

FOOTER = """<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div style="max-width:320px">
        <a class="brand" href="/"><img src="/assets/img/mark-ink.svg" alt=""><span>resalta</span></a>
        <p class="hint" style="margin-top:14px">Análisis facial con método. Un plan claro para mejorar tu apariencia.</p>
      </div>
      <div>
        <p class="label" style="margin-bottom:10px">Resalta</p>
        <a href="/#como-funciona">Cómo funciona</a>
        <a href="/#precio">Planes</a>
        <a href="/#preguntas">Preguntas frecuentes</a>
        <a href="/blog">Blog</a>
        <a href="/cuenta">Entrar</a>
      </div>
      <div>
        <p class="label" style="margin-bottom:10px">Síguenos</p>
        <a href="https://www.instagram.com/resalta.co/" rel="noopener">Instagram</a>
        <a href="https://www.tiktok.com/@resalta.co" rel="noopener">TikTok</a>
        <a href="https://www.youtube.com/@resalta_co" rel="noopener">YouTube</a>
        <a href="https://www.facebook.com/resalta.co" rel="noopener">Facebook</a>
      </div>
      <div>
        <p class="label" style="margin-bottom:10px">Legal</p>
        <a href="/privacidad">Aviso de privacidad</a>
        <a href="/terminos">Términos y condiciones</a>
        <a href="mailto:contacto@resalta.co">contacto@resalta.co</a>
      </div>
    </div>
    <p class="copy">© <span id="year"></span> Resalta. Resalta no ofrece diagnósticos ni tratamientos médicos.</p>
  </div>
</footer>
"""

SCRIPTS = """<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script src="/assets/js/config.js?v=__V__"></script>
<script src="/assets/js/app.js?v=__V__"></script>
{extra_scripts}
</body>
</html>
"""

PAGES = [
    # file, title, description, extra scripts
    ("index.html", "Resalta · Análisis facial con método", "Medimos tu rostro de frente y de perfil, con más de 110 evaluaciones, y te damos un plan personalizado para mejorar tu apariencia.", ""),
    ("cuenta.html", "Entrar · Resalta", "Crea tu cuenta o entra a Resalta.", ""),
    ("analisis.html", "Tu análisis · Resalta", "Sube tus fotos y recibe tu análisis facial completo.", ""),
    ("panel.html", "Mi cuenta · Resalta", "Tus análisis y reportes.", ""),
    ("gracias.html", "Pago recibido · Resalta", "Recibimos tu pago.", ""),
    ("privacidad.html", "Aviso de privacidad · Resalta", "Aviso de privacidad integral de Resalta.", ""),
    ("terminos.html", "Términos y condiciones · Resalta", "Términos y condiciones de Resalta.", ""),
    ("calificacion.html", "Calificación facial gratis · Resalta", "Descubre tu puntaje de armonía facial del 0 al 100, gratis. Tu foto se analiza en tu dispositivo.", ""),
    ("reporte.html", "Tu reporte · Resalta", "Tu análisis facial para leer y descargar.", '<script src="/assets/js/reporte.js?v=__V__"></script>'),
    ("visor.html", "Tu cara, medida · Resalta", "Vista previa del visor de medidas de Resalta.", ""),
    ("404.html", "Página no encontrada · Resalta", "Esta página no existe.", ""),
    ("afiliados.html", "Programa de afiliados · Resalta", "Gana 30% por cada análisis de Resalta que recomiendes con tu link.", ""),
    ("blog.html", "Blog · Resalta", "Simetría, proporciones, mandíbula y procedimientos: lo que hay que saber de tu cara, explicado claro y con medidas.", ""),
]

# Blog posts are discovered from src/blog/*.html. Each starts with a one-line comment:
# <!--post {"titulo": ..., "descripcion": ..., "pilar": ..., "resumen": ..., "minutos": 6, "fecha": "YYYY-MM-DD", "imagen": "/assets/img/..."} -->
# They get their own page, a card on /blog (newest first) and a line in sitemap.xml.
import json, html as _html, re as _re
POSTS = []
for f in sorted((SRC / "blog").glob("*.html")):
    m = _re.match(r"<!--post (\{.*?\}) -->\n?", f.read_text(encoding="utf-8"), _re.S)
    if not m:
        continue
    meta = json.loads(m.group(1)); meta["slug"] = f.stem
    POSTS.append(meta)
POSTS.sort(key=lambda x: x["fecha"], reverse=True)
for meta in POSTS:
    PAGES.append((f"blog/{meta['slug']}.html", f"{meta['titulo']} · Resalta", meta["descripcion"], ""))
CARDS = "\n".join(
    f"""    <a class="blog-card" href="/blog/{p['slug']}">
      <span class="blog-img"><img src="{_html.escape(p.get('imagen') or '/assets/img/analysis-face.jpg')}" alt="" loading="lazy"></span>
      <span class="tag">{_html.escape(p['pilar'])}</span>
      <h2>{_html.escape(p['titulo'])}</h2>
      <p>{_html.escape(p['resumen'])}</p>
      <span class="blog-meta">{int(p.get('minutos') or 5)} min de lectura</span>
    </a>""" for p in POSTS)
_hoy = time.strftime("%Y-%m-%d")
_urls = [("", "1.0", _hoy), ("blog", "0.7", POSTS[0]["fecha"] if POSTS else _hoy)] + [(f"blog/{p['slug']}", "0.7", p["fecha"]) for p in POSTS] + [("calificacion", "0.9", _hoy), ("privacidad", "0.2", _hoy), ("terminos", "0.2", _hoy)]
(ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"  <url><loc>https://resalta.co/{u}</loc><lastmod>{d}</lastmod><priority>{pr}</priority></url>\n" for u, pr, d in _urls) + "</urlset>\n", encoding="utf-8")

# Runs before the page paints, so signed-out visitors go straight to sign-in (and signed-in ones skip it)
# instead of seeing the wrong page flash for a moment. Links coming back from Google or email are left alone.
_KEY = "sb-jxluabbugwdonqchbaxm-auth-token"
_GATE = '<script>(function(){{try{{var t=localStorage.getItem("' + _KEY + '"),back=/[?&#](code|access_token|error|type)=/.test(location.href);{body}}}catch(e){{}}}})()</script>'
GATES = {
    "analisis": _GATE.format(body='if(!t&&!back)location.replace("/cuenta?next=/analisis");'),
    "reporte": _GATE.format(body='if(!t&&!back)location.replace("/cuenta?modo=entrar&next="+encodeURIComponent(location.pathname+location.search));'),
    "panel": _GATE.format(body='if(!t&&!back)location.replace("/cuenta?modo=entrar&next=/panel");'),
    "cuenta": _GATE.format(body='if(t&&!back&&!/[?&]modo=nueva/.test(location.search)){var n=new URLSearchParams(location.search).get("next")||"/panel";if(!/^\\/(?!\\/)/.test(n))n="/panel";location.replace(n);}'),
}

for fname, title, desc, extra in PAGES:
    body = (SRC / fname).read_text(encoding="utf-8")
    body = _re.sub(r"^<!--post .*? -->\n?", "", body, flags=_re.S)
    if fname == "blog.html":
        body = body.replace("<!--POSTS-->", CARDS)
    page = fname.replace(".html", "").replace("/", "-")
    html = HEAD.format(title=title, desc=desc, path="" if fname == "index.html" else fname[:-5], page=page, extra_head=GATES.get(page, ""))
    html += HEADER + body + FOOTER + SCRIPTS.format(extra_scripts=extra)
    html = html.replace("__V__", str(int(time.time())))
    (ROOT / fname).write_text(html, encoding="utf-8")
    print("built", fname)
