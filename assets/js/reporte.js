// Reading version of the customer's report, made to be saved as a PDF from the browser (vector text, sharp at any zoom).
(function () {
  const C = window.RESALTA || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const li = arr => (arr || []).map(x => `<li>${esc(x)}</li>`).join("");
  const f1 = v => (typeof v === "number" ? v.toFixed(1) : "–");
  const fecha = d => new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const NIVEL = { alto: "Impacto alto", medio: "Impacto medio", bajo: "Impacto bajo" };
  const ESF = { bajo: "poco esfuerzo", medio: "esfuerzo medio", alto: "mucho esfuerzo" };
  const nivel = v => v == null ? "" : v < 4.5 ? "Por debajo del promedio" : v < 5.5 ? "En el promedio" : v < 6.5 ? "Arriba del promedio" : v < 7.5 ? "Atractivo" : v < 8.5 ? "Muy atractivo" : "Excepcional";
  function parsear(v) {
    if (typeof v !== "string") return v;
    const t = v.trim(); try { return JSON.parse(t); } catch (e) { return v; }
  }
  const fallo = t => { $("#docWait").hidden = true; const m = $("#docMsg"); m.textContent = t; m.className = "msg show err"; };

  (async () => {
    if (!window.supabase || !C.SUPABASE_URL) return fallo("No pudimos cargar tu reporte. Vuelve a intentarlo en un momento.");
    const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    const { data: { user } } = await sb.auth.getUser();
    const id = new URLSearchParams(location.search).get("pedido");
    if (!user) { location.replace("/cuenta?modo=entrar&next=" + encodeURIComponent(location.pathname + location.search)); return; }
    if (!id) return fallo("Falta el reporte que quieres ver. Ábrelo desde tu cuenta.");
    const [{ data: o }, { data: rep }] = await Promise.all([
      sb.from("orders").select("id,tier,answers,medidas,created_at,paid_at,status").eq("id", id).maybeSingle(),
      sb.from("reports").select("data").eq("order_id", id).maybeSingle(),
    ]);
    if (!o || !rep || !rep.data || !rep.data.resumen) return fallo("Tu reporte todavía no está listo. Vuelve a tu cuenta para verlo.");
    const r = {}; Object.keys(rep.data).forEach(k => { r[k] = parsear(rep.data[k]); });
    const firmar = k => sb.storage.from("fotos").createSignedUrl(`${user.id}/${o.id}/${k}.jpg`, 3600).then(x => x.data ? x.data.signedUrl : "").catch(() => "");
    const M = o.medidas || {}, pf = M.perfil;
    const { data: { session } } = await sb.auth.getSession();
    const proy = (tipo) => fetch(`${C.SUPABASE_URL}/functions/v1/proyeccion`, { method: "POST", headers: { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + (session ? session.access_token : "") }, body: JSON.stringify({ order_id: o.id, tipo }) })
      .then(x => x.ok ? x.json() : {}).then(j => j.url || "").catch(() => "");
    const [foto, fotoP, pSoft, pHard] = await Promise.all([firmar("frente"), pf ? firmar(pf.foto || "perfil_izq") : "", proy("soft"), o.tier === "hard" ? proy("hard") : ""]);
    const P = r.puntajes || {}, sexo = (o.answers || {}).sexo;
    const nombre = (((o.answers || {}).nombre) || (user.user_metadata && user.user_metadata.full_name) || "").split(" ")[0];
    const plan = (C.PLAN_NAMES || {})[o.tier] || "Análisis Resalta";

    const seccion = (titulo, cuerpo, sub, nueva) => cuerpo ? `<section class="doc-s${nueva ? " doc-nueva" : ""}"><h2>${titulo}</h2>${sub ? `<p class="doc-sub">${sub}</p>` : ""}${cuerpo}</section>` : "";
    const barra = v => `<span class="doc-bar-i"><b style="width:${Math.max(0, Math.min(100, v * 10))}%"></b></span>`;

    // ---- cover
    const pil = [["armonia", "Armonía"], ["angularidad", "Angularidad"], ["dimorfismo", "Dimorfismo"], ["rasgos", "Rasgos"]].filter(x => P[x[0]] != null);
    let h = `<header class="doc-cover">
      <div class="doc-brand"><img src="/assets/img/mark-ink.svg" alt=""><span>resalta</span></div>
      <p class="label">${esc(plan)} · ${esc(fecha(o.paid_at || o.created_at))}</p>
      <h1>${nombre ? `Protocolo de <span class="doc-muted">${esc(nombre)}</span>` : "Tu análisis facial"}</h1>
      <div class="doc-cover-g">
        <div class="doc-fotos">${foto ? `<figure><img src="${foto}" alt="Foto de frente"><figcaption>HOY</figcaption></figure>` : ""}${pSoft ? `<figure><img src="${pSoft}" alt="Tu proyección"><figcaption>PROYECCIÓN</figcaption></figure>` : fotoP ? `<figure><img src="${fotoP}" alt="Foto de perfil"><figcaption>PERFIL</figcaption></figure>` : ""}</div>
        <div>
          <p class="label">Calificación general</p>
          <p class="doc-score">${f1(P.general)}<span> / 10</span></p>
          <p class="doc-nivel">${esc(nivel(P.general))}. 5 es el promedio de la población.</p>
          <div class="doc-pils">${pil.map(([k, n]) => `<div><span>${n}</span>${barra(P[k])}<b>${f1(P[k])}</b></div>`).join("")}</div>
          ${r.arquetipo && r.arquetipo.nombre ? `<p class="label" style="margin-top:22px">Tu tipo de cara</p><p class="doc-arq"><b>${esc(r.arquetipo.nombre.charAt(0).toUpperCase() + r.arquetipo.nombre.slice(1))}.</b> ${esc(r.arquetipo.texto)}</p>` : ""}
        </div>
      </div>
      ${r.longevidad && r.longevidad.edad_visual ? `<div class="doc-edades"><div><span>Edad real</span><b>${esc((o.answers || {}).edad)}</b></div><div><span>Edad visual hoy</span><b>${esc(r.longevidad.edad_visual)}</b></div><div><span>Con tu plan</span><b>${esc(r.longevidad.edad_visual_meta)}</b></div></div>` : ""}
      <p class="doc-resumen">${esc(r.resumen)}</p>
    </header>`;

    if (pHard) h += seccion("Tu proyección con procedimientos", `<div class="doc-fotos doc-dos">${foto ? `<figure><img src="${foto}" alt="Hoy"><figcaption>HOY</figcaption></figure>` : ""}<figure><img src="${pHard}" alt="Hardmaxing"><figcaption>HARDMAXING</figcaption></figure></div>`, "Simulación ilustrativa de un resultado sutil. No es una promesa de resultado.");
    if (r.longevidad && r.longevidad.lectura) h += seccion("Edad visual", `<p>${esc(r.longevidad.lectura)}</p><ul>${li(r.longevidad.acciones)}</ul>`);
    h += seccion("Lo que tienes a favor", (r.fortalezas || []).map(f => `<div class="doc-item"><b>${esc(f.titulo)}</b><p>${esc(f.texto)}</p></div>`).join(""));
    h += seccion("Lo que más te conviene trabajar", (r.prioridades || []).map((p, i) => `<div class="doc-item"><b><span class="doc-n">${i + 1}</span>${esc(p.titulo)}</b><p>${esc(p.texto)}</p><p class="doc-tags">${esc(NIVEL[p.impacto] || p.impacto)} · ${esc(ESF[p.esfuerzo] || p.esfuerzo)}</p></div>`).join(""), "En orden de impacto.");

    // ---- plan
    h += seccion("Tu plan", (r.plan || []).map(f => `<div class="doc-fase"><p class="label">${esc(f.fase)}</p>${(f.pasos || []).map(p => `<div class="doc-item"><b>${esc(p.accion)}</b><p>${esc(p.porque)}</p></div>`).join("")}</div>`).join(""), "Empieza por la primera fase y no brinques pasos.");

    // ---- zones
    const zs = Object.fromEntries(((M.resumen || {}).zonas || []).map(z => [z.id, z]));
    h += seccion("Zona por zona", (r.zonas || []).map(z => {
      const s = zs[z.id];
      return `<div class="doc-zona"><div class="doc-zona-t"><b>${esc(s ? s.nombre : z.id)}</b>${s ? `<span>${f1(s.puntaje / 10)}</span>` : ""}</div><p>${esc(z.lectura)}</p><ul>${li(z.acciones)}</ul></div>`;
    }).join(""));
    const extra = [["Perfil", r.perfil], ["Sonrisa", r.sonrisa], ["Tres cuartos", r.tres_cuartos]].filter(x => x[1] && x[1].lectura);
    h += seccion("Otros ángulos", extra.map(([t, x]) => `<div class="doc-zona"><div class="doc-zona-t"><b>${t}</b></div><p>${esc(x.lectura)}</p><ul>${li(x.acciones)}</ul></div>`).join(""));

    // ---- style
    const piel = r.piel || {}, col = r.color || {}, cb = r.cabello_barba || {};
    const sw = arr => (arr || []).map(c => `<span class="doc-sw"><i style="background:${/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#ccc"}"></i>${esc(c.nombre)}</span>`).join("");
    h += seccion("Piel", piel.lectura ? `<p>${esc(piel.lectura)}</p><ul>${li(piel.acciones)}</ul>` : "");
    h += seccion("Tu color", col.lectura ? `<p>Subtono <b>${esc(col.subtono)}</b>${col.contraste ? `, contraste <b>${esc(col.contraste)}</b>` : ""}.</p><p>${esc(col.lectura)}</p><p class="label">Te favorecen</p><div class="doc-sws">${sw(col.paleta)}</div><p class="label">Mejor evitar</p><div class="doc-sws">${sw(col.evitar)}</div>` : "");
    h += seccion("Cabello, barba y cejas", `<div class="doc-cols"><div><p class="label">Cortes</p><ul>${li(cb.cortes)}</ul></div><div><p class="label">${sexo === "mujer" ? "Contorno" : "Barba"}</p><ul>${li(cb.barba)}</ul></div><div><p class="label">Cejas</p><ul>${li(cb.cejas)}</ul></div>${(cb.lentes || []).length ? `<div><p class="label">Lentes</p><ul>${li(cb.lentes)}</ul></div>` : ""}</div>`);

    // ---- traits
    const TIT = { angularidad: "Angularidad", dimorfismo: "Dimorfismo", rasgos: "Rasgos" };
    h += seccion("Rasgos evaluados", Object.keys(TIT).map(k => {
      const gs = (r.grupos || []).filter(g => g.pilar === k); if (!gs.length) return "";
      return `<h3>${TIT[k]} <span>${f1(P[k])} / 10</span></h3>${gs.map(g => `<div class="doc-grupo"><div class="doc-zona-t"><b>${esc(g.titulo)}</b><span>${f1(g.puntaje)}</span></div>${(g.items || []).map(x => `<div class="doc-row"><div class="doc-row-t"><span>${esc(x.nombre)}</span>${barra(x.puntaje)}<b>${f1(x.puntaje)}</b></div><p>${esc(x.nota)}</p></div>`).join("")}</div>`).join("")}`;
    }).join(""), "Cada rasgo calificado de 0 a 10, donde 5 es el promedio.", true);

    // ---- measurements
    const tabla = (lista, zonas) => (zonas || []).map(z => {
      const ms = (lista || []).filter(m => m.zona === z.id); if (!ms.length) return "";
      return `<h3>${esc(z.nombre)} <span>${f1(z.puntaje / 10)} / 10</span></h3><table class="doc-t"><thead><tr><th>Medida</th><th>Tu valor</th><th>Rango ideal</th><th>Puntaje</th></tr></thead><tbody>${ms.map(m => `<tr><td>${esc(m.nombre)}</td><td>${esc(m.valor)}${esc(m.unidad || "")}</td><td>${Array.isArray(m.rango) ? esc(m.rango.join(" a ")) + esc(m.unidad || "") : ""}</td><td>${f1(m.puntaje / 10)}</td></tr>`).join("")}</tbody></table>`;
    }).join("");
    const nMed = (M.medidas || []).length + (pf ? (pf.medidas || []).length : 0);
    h += seccion("Tus medidas de frente", tabla(M.medidas, (M.resumen || {}).zonas), `${nMed} medidas tomadas de tus fotos. Son estimaciones a partir de fotos de celular.`, true);
    if (pf) h += seccion("Tus medidas de perfil", tabla(pf.medidas, (pf.resumen || {}).zonas));

    if (o.tier === "hard" && (r.avanzado || []).length) {
      h += seccion("Procedimientos a considerar", r.avanzado.map(a => `<div class="doc-zona"><div class="doc-zona-t"><b>${esc(a.nombre)}</b></div><p>${esc(a.que_hace)}</p><p><b>Antes de decidir.</b> ${esc(a.considerar)}</p></div>`).join(""), "Información general para que llegues mejor preparado a una consulta. Cada caso lo debe evaluar un médico certificado.");
    }
    h += `<footer class="doc-foot"><p>Este análisis es información general sobre estética. Las medidas salen de fotos de celular y son estimaciones. Antes de cualquier tratamiento o procedimiento, consúltalo con un médico certificado.</p><p>resalta.co</p></footer>`;

    const doc = $("#doc"); doc.innerHTML = h; doc.hidden = false; $("#docWait").hidden = true;
    document.title = (nombre ? `Análisis facial de ${nombre}` : "Tu análisis facial") + " · Resalta";
    // print only once the photos are in, or they come out blank
    await Promise.all([...doc.querySelectorAll("img")].map(i => i.complete ? 0 : new Promise(res => { i.onload = i.onerror = res; })));
    const b = $("#docPdf"); b.disabled = false; b.onclick = () => window.print();
  })().catch(() => fallo("No pudimos cargar tu reporte. Vuelve a intentarlo en un momento."));
})();
