"""Builds the static pages of vultigo.com from partials. Run: python3 build.py"""
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
<meta property="og:image" content="https://vultigo.com/assets/img/og.png">
<meta property="og:url" content="https://vultigo.com/{path}">
<meta name="theme-color" content="#6E7E8E">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css">
{extra_head}
</head>
<body data-page="{page}">
"""

HEADER = """<header class="site-header">
  <div class="wrap nav">
    <a class="brand" href="/" aria-label="Vultigo, inicio"><img src="/assets/img/mark-ink.svg" alt=""><span>vultigo</span></a>
    <nav class="nav-links" id="navLinks">
      <a href="/#como-funciona">Cómo funciona</a>
      <a href="/#que-medimos">Qué medimos</a>
      <a href="/#precio">Precio</a>
      <a href="/calificacion.html">Calificación gratis</a>
      <a href="/#preguntas">Preguntas</a>
    </nav>
    <div class="nav-cta">
      <a class="btn btn-ghost" href="/cuenta.html" data-auth="out">Entrar</a>
      <a class="btn btn-ghost" href="/panel.html" data-auth="in" hidden>Mi cuenta</a>
      <a class="btn btn-primary" href="/analisis.html">Empieza tu plan</a>
      <button class="menu-btn" aria-label="Abrir menú" onclick="document.getElementById('navLinks').classList.toggle('open')">
        <svg width="22" height="22" viewBox="0 0 22 22" stroke="currentColor" stroke-width="1.6"><path d="M3 7h16M3 15h16"/></svg>
      </button>
    </div>
  </div>
</header>
"""

FOOTER = """<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div style="max-width:320px">
        <a class="brand" href="/"><img src="/assets/img/mark-ink.svg" alt=""><span>vultigo</span></a>
        <p class="hint" style="margin-top:14px">Análisis facial con método. Un plan claro para mejorar tu apariencia, sin cirugía.</p>
      </div>
      <div>
        <p class="label" style="margin-bottom:10px">Vultigo</p>
        <a href="/#como-funciona">Cómo funciona</a>
        <a href="/#precio">Precio</a>
        <a href="/#preguntas">Preguntas frecuentes</a>
        <a href="/cuenta.html">Entrar</a>
      </div>
      <div>
        <p class="label" style="margin-bottom:10px">Síguenos</p>
        <a href="https://www.instagram.com/vultigo.oficial/" rel="noopener">Instagram</a>
        <a href="https://www.tiktok.com/@vultigo" rel="noopener">TikTok</a>
        <a href="https://www.youtube.com/@vultigo" rel="noopener">YouTube</a>
        <a href="https://www.facebook.com/profile.php?id=61596617694439" rel="noopener">Facebook</a>
      </div>
      <div>
        <p class="label" style="margin-bottom:10px">Legal</p>
        <a href="/privacidad.html">Aviso de privacidad</a>
        <a href="/terminos.html">Términos y condiciones</a>
        <a href="mailto:hola@vultigo.com">hola@vultigo.com</a>
      </div>
    </div>
    <p class="copy">© <span id="year"></span> Vultigo. Vultigo no ofrece diagnósticos ni tratamientos médicos.</p>
  </div>
</footer>
"""

SCRIPTS = """<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script src="/assets/js/config.js"></script>
<script src="/assets/js/app.js"></script>
{extra_scripts}
</body>
</html>
"""

PAGES = [
    # file, title, description, extra scripts
    ("index.html", "Vultigo · Análisis facial con método", "Medimos tu rostro con más de 120 puntos de referencia y te damos un plan personalizado para mejorar tu apariencia, sin cirugía.", ""),
    ("cuenta.html", "Entrar · Vultigo", "Crea tu cuenta o entra a Vultigo.", ""),
    ("analisis.html", "Tu análisis · Vultigo", "Sube tus fotos y recibe tu análisis facial completo.", ""),
    ("panel.html", "Mi cuenta · Vultigo", "Tus análisis y reportes.", ""),
    ("gracias.html", "Pago recibido · Vultigo", "Recibimos tu pago.", ""),
    ("privacidad.html", "Aviso de privacidad · Vultigo", "Aviso de privacidad integral de Vultigo.", ""),
    ("terminos.html", "Términos y condiciones · Vultigo", "Términos y condiciones de Vultigo.", ""),
    ("calificacion.html", "Calificación facial gratis · Vultigo", "Descubre tu puntaje de armonía facial del 0 al 100, gratis. Tu foto se analiza en tu dispositivo.", ""),
    ("404.html", "Página no encontrada · Vultigo", "Esta página no existe.", ""),
]

for fname, title, desc, extra in PAGES:
    body = (SRC / fname).read_text(encoding="utf-8")
    page = fname.replace(".html", "")
    html = HEAD.format(title=title, desc=desc, path="" if fname == "index.html" else fname, page=page, extra_head="")
    html += HEADER + body + FOOTER + SCRIPTS.format(extra_scripts=extra)
    (ROOT / fname).write_text(html, encoding="utf-8")
    print("built", fname)
