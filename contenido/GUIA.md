# Guía para escribir un artículo del blog de Resalta

Resalta (resalta.co) hace análisis facial estético para hispanohablantes de todo el mundo. El blog atrae tráfico de Google y lo lleva a la calificación gratis (/calificacion) y al análisis completo.

## De dónde sale el tema
`contenido/calendario.json`: una lista ordenada de lo más fácil a lo más difícil de posicionar, con una `fecha` por artículo (uno al día).
Los artículos se escriben por adelantado. Toma los siguientes con `"estado": "pendiente"` en orden, escríbelos y cambia su `estado` a `"escrito"`.
La `fecha` del artículo es la del calendario, no la de hoy. Cada mañana un proceso automático de GitHub (`.github/workflows/publicar-blog.yml`) vuelve a construir el sitio y publica los artículos cuya fecha ya llegó. Un artículo con fecha futura no aparece en el sitio hasta su día.

## Archivo
- Un archivo nuevo: `src/blog/<slug>.html`, con el `slug` del calendario.
- Copia la estructura de `src/blog/simetria-facial.html` y reutiliza sus clases tal cual (post, post-hero, post-back, tag, post-lead, post-meta, post-fig, post-toc, post-body, post-cta, faq, post-nota, final-cta post-final). No inventes estilos nuevos.
- Primera línea, obligatoria, en una sola línea:
  `<!--post {"titulo": "...", "descripcion": "...", "pilar": "...", "resumen": "...", "minutos": 6, "fecha": "YYYY-MM-DD", "imagen": "/assets/img/analysis-face.jpg"} -->`
  - titulo: el título del calendario (puedes pulirlo, que incluya la palabra clave).
  - descripcion: meta description de 140 a 160 caracteres con la palabra clave.
  - pilar: el del calendario.
  - resumen: 1 o 2 frases para la tarjeta del blog.
  - fecha: la del calendario para ese artículo (formato YYYY-MM-DD).
  - imagen: una imagen que ya exista en /assets/img (analysis-face.jpg, analysis-face-w.jpg, hero/m1.jpg, hero/w1.jpg, thumbs/perfil.jpg, thumbs/angulos.jpg, etc.).
- `build.py` lo convierte en página, lo agrega a /blog y a sitemap.xml solo. No toques build.py.

## Cómo escribir
- Español neutro de Latinoamérica, de tú. Natural, como lo explicaría alguien que sabe del tema. Nada que suene a IA: sin "en el mundo actual", "es importante destacar", "sumérgete", "en conclusión", listas de tres adjetivos ni frases de relleno.
- Nunca uses rayas largas (—). Usa comas, puntos o paréntesis.
- 1,200 a 1,800 palabras. Párrafos cortos. 5 a 7 secciones con `<h2 id="...">` y un índice (`post-toc`) que las enlace.
- Responde la intención de búsqueda en el primer párrafo (`post-lead`).
- Datos concretos y correctos: medidas, ángulos, rangos, tiempos de recuperación, precios aproximados en MXN cuando aplique (di que varían). Investiga en la web antes de escribir y no inventes cifras ni estudios.
- Cuando hables de medidas (ángulos, proporciones, tercios), conéctalo con lo que mide Resalta.
- Un `post-cta` a mitad del artículo hacia `/calificacion?utm_source=blog&utm_medium=articulo&utm_campaign=<slug>` y el bloque `final-cta post-final` al final con `utm_medium=final`. Ajusta el texto del CTA al tema.
- 3 a 5 preguntas frecuentes reales en `<details>`.
- 2 o 3 enlaces internos a otros artículos del mismo pilar que ya estén escritos o publicados y cuya fecha sea ANTERIOR a la de este artículo (así el enlace ya existe cuando este se publique).
- Temas médicos o de procedimientos: informativo, sin prometer resultados, y termina con el `post-nota` que dice que no sustituye la valoración de un médico.
- Opcional: una figura SVG sencilla como en el artículo de simetría (líneas y puntos sobre /assets/img/analysis-face.jpg) cuando ayude a explicar una medida.

## Antes de publicar
- `python3 build.py` corre sin errores. Para revisar cómo se ve un artículo con fecha futura, cambia su fecha temporalmente a hoy, construye, revisa y regrésala.
- Revisa que no haya rayas largas: `grep -c "—" src/blog/<slug>.html` debe dar 0.
- Abre la página generada en móvil y escritorio y revisa que se vea bien.
