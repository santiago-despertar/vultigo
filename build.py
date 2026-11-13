import time
"""Builds the static pages of resalta.co from partials. Run: python3 build.py"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"

HEAD = """<!doctype html>
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
<script>try{{if(localStorage.getItem("sb-jxluabbugwdonqchbaxm-auth-token"))document.documentElement.classList.add("authed")}}catch(e){{}}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-F5L2THEVH0"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag("js",new Date());gtag("config","G-F5L2THEVH0");</script>
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
      <a href="/calificacion.html">Calificación gratis</a>
      <a href="/#preguntas">Preguntas</a>
      <a href="/blog.html">Blog</a>
      <a href="/cuenta.html" class="menu-only">Entrar / Mi cuenta</a>
    </nav>
    <div class="nav-cta">
      <a class="btn btn-ghost" href="/cuenta.html" data-auth="out">Entrar</a>
      <a class="btn btn-ghost" href="/panel.html" data-auth="in">Mi cuenta</a>
      <a class="btn btn-primary" href="/analisis.html">Empieza tu plan</a>
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
        <a href="/blog.html">Blog</a>
        <a href="/cuenta.html">Entrar</a>
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
        <a href="/privacidad.html">Aviso de privacidad</a>
        <a href="/terminos.html">Términos y condiciones</a>
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
    ("blog.html", "Blog · Resalta", "Simetría, proporciones, mandíbula y procedimientos: lo que hay que saber de tu cara, explicado claro y con medidas.", ""),
    ("blog/simetria-facial.html", "Simetría facial: qué es, cómo se mide y cuánto importa · Resalta", "Qué es la simetría facial, cómo se mide en una foto, qué la afecta y cuánto importa realmente para verte bien.", ""),
]

# Runs before the page paints, so signed-out visitors go straight to sign-in (and signed-in ones skip it)
# instead of seeing the wrong page flash for a moment. Links coming back from Google or email are left alone.
_KEY = "sb-jxluabbugwdonqchbaxm-auth-token"
_GATE = '<script>(function(){{try{{var t=localStorage.getItem("' + _KEY + '"),back=/[?&#](code|access_token|error|type)=/.test(location.href);{body}}}catch(e){{}}}})()</script>'
GATES = {
    "analisis": _GATE.format(body='if(!t&&!back)location.replace("/cuenta.html?next=/analisis.html");'),
    "reporte": _GATE.format(body='if(!t&&!back)location.replace("/cuenta.html?modo=entrar&next="+encodeURIComponent(location.pathname+location.search));'),
    "panel": _GATE.format(body='if(!t&&!back)location.replace("/cuenta.html?modo=entrar&next=/panel.html");'),
    "cuenta": _GATE.format(body='if(t&&!back&&!/[?&]modo=nueva/.test(location.search)){var n=new URLSearchParams(location.search).get("next")||"/panel.html";if(!/^\\/(?!\\/)/.test(n))n="/panel.html";location.replace(n);}'),
}

for fname, title, desc, extra in PAGES:
    body = (SRC / fname).read_text(encoding="utf-8")
    page = fname.replace(".html", "").replace("/", "-")
    html = HEAD.format(title=title, desc=desc, path="" if fname == "index.html" else fname, page=page, extra_head=GATES.get(page, ""))
    html += HEADER + body + FOOTER + SCRIPTS.format(extra_scripts=extra)
    html = html.replace("__V__", str(int(time.time())))
    (ROOT / fname).write_text(html, encoding="utf-8")
    print("built", fname)
