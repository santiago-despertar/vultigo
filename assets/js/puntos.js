// Landmark editor: shows the points the measurements are built from on the customer's photo,
// lets them drag any point that landed in the wrong place, and measures again live.
// Front: the key points of the 478-point face model. Profile: the named points of the silhouette.
import { analizar, medir, resumen } from "/assets/js/medidas.js?v=19";
import { analizarPerfil, medirPuntos, ZONAS_PERFIL } from "/assets/js/perfil.js?v=20";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const arm = (ms) => ms.length ? 10 * Math.pow(ms.reduce((t, m) => t + m.puntaje, 0) / ms.length / 100, 2.2) : 0;

// front points worth checking by hand, with a name the customer understands
const CLAVE = [
  [468, "Pupila"], [473, "Pupila"], [33, "Esquina del ojo"], [133, "Esquina del ojo"], [362, "Esquina del ojo"], [263, "Esquina del ojo"],
  [159, "Párpado"], [145, "Párpado"], [386, "Párpado"], [374, "Párpado"],
  [70, "Cola de la ceja"], [105, "Arco de la ceja"], [107, "Inicio de la ceja"], [300, "Cola de la ceja"], [334, "Arco de la ceja"], [336, "Inicio de la ceja"],
  [10, "Frente"], [9, "Entrecejo"], [168, "Puente de la nariz"], [193, "Puente de la nariz"], [417, "Puente de la nariz"],
  [129, "Ala de la nariz"], [358, "Ala de la nariz"], [1, "Punta de la nariz"], [2, "Base de la nariz"],
  [0, "Centro del labio superior"], [37, "Pico del labio"], [267, "Pico del labio"], [13, "Labios"], [14, "Labios"], [17, "Labio inferior"],
  [61, "Comisura"], [291, "Comisura"], [234, "Pómulo"], [454, "Pómulo"], [116, "Pómulo"], [345, "Pómulo"],
  [172, "Ángulo de la mandíbula"], [397, "Ángulo de la mandíbula"], [58, "Mandíbula"], [288, "Mandíbula"],
  [148, "Mentón"], [377, "Mentón"], [152, "Punta del mentón"]
];
const NOMBRES_PERFIL = {
  Tr: "Inicio del cabello", G: "Frente (glabela)", N: "Entrecejo (nasion)", Prn: "Punta de la nariz", Cm: "Columela", Sn: "Base de la nariz",
  Ls: "Labio superior", Sto: "Unión de los labios", Li: "Labio inferior", B: "Hueco bajo el labio", Pog: "Mentón", Me: "Punta del mentón",
  C: "Ángulo del cuello", Ne: "Cuello"
};

let estado = null;

// opts: { vista: "frente"|"perfil", img: HTMLImageElement, sexo }. Resolves with the new analysis, or null if cancelled.
export function editarPuntos(opts) {
  return new Promise(async (resolver) => {
    const { vista, img, sexo } = opts;
    const d = document.createElement("div");
    d.className = "pe"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true");
    d.innerHTML = `<div class="pe-box"><div class="pe-top"><div><p class="fq-k">Ajustar puntos · ${vista === "perfil" ? "Perfil" : "Frente"}</p>
      <p class="pe-h">Arrastra cualquier punto que no esté en su lugar</p></div><button type="button" class="fq-x" aria-label="Cerrar">×</button></div>
      <div class="pe-stage"><div class="pe-load"><div class="rep-spin" aria-hidden="true"></div><span>Buscando los puntos de tu cara…</span></div></div>
      <div class="pe-bar"><div class="pe-now"><span class="pe-sel">Toca un punto para ver cuál es</span><span class="pe-score"></span></div>
      <div class="pe-acc"><button type="button" class="btn btn-ghost pe-reset">Restablecer</button><button type="button" class="btn btn-primary pe-ok" disabled>Guardar y recalcular</button></div></div></div>`;
    document.body.appendChild(d); document.documentElement.classList.add("fq-abierto");
    requestAnimationFrame(() => d.classList.add("on"));
    const salir = (v) => { d.classList.remove("on"); document.documentElement.classList.remove("fq-abierto"); setTimeout(() => d.remove(), 200); document.removeEventListener("keydown", tecla); resolver(v); };
    const tecla = (e) => { if (e.key === "Escape") salir(null); };
    document.addEventListener("keydown", tecla);
    d.querySelector(".fq-x").onclick = () => salir(null);

    let r;
    try { r = vista === "perfil" ? await analizarPerfil(img, sexo) : await analizar(img, sexo); }
    catch (e) { d.querySelector(".pe-load").innerHTML = "<span>No pudimos encontrar los puntos en esta foto.</span>"; return; }

    const orig = vista === "perfil" ? JSON.parse(JSON.stringify(r.puntos)) : r.puntos.map(p => ({ ...p }));
    estado = { vista, r, sexo, img, pts: vista === "perfil" ? JSON.parse(JSON.stringify(r.puntos)) : r.puntos.map(p => ({ ...p })), base: arm(r.medidas), cambios: 0 };
    const lista = vista === "perfil" ? Object.keys(estado.pts).filter(k => estado.pts[k]).map(k => [k, NOMBRES_PERFIL[k] || k]) : CLAVE;

    const c = r.caja, w = c.x1 - c.x0, h = c.y1 - c.y0, lado = Math.max(w, h) * 1.3;
    const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2, vx = cx - lado / 2, vy = cy - lado / 2, rad = lado / 110;
    const stage = d.querySelector(".pe-stage");
    stage.innerHTML = `<svg class="pe-svg" viewBox="${vx} ${vy} ${lado} ${lado}" role="img" aria-label="Tu foto con los puntos de medición">
      <rect x="${vx}" y="${vy}" width="${lado}" height="${lado}" fill="#0E1114"/><image href="${esc(img.src)}" width="${r.ancho}" height="${r.alto}"/>
      <g class="pe-lin" stroke-width="${rad * 0.35}"></g><g class="pe-pts"></g></svg>`;
    const svg = stage.querySelector("svg"), gp = svg.querySelector(".pe-pts"), gl = svg.querySelector(".pe-lin");
    const get = (k) => estado.pts[k];
    const sel = d.querySelector(".pe-sel"), score = d.querySelector(".pe-score"), ok = d.querySelector(".pe-ok");

    const dibujar = () => {
      gp.innerHTML = lista.map(([k, n]) => { const p = get(k); return p ? `<g class="pe-p" data-k="${k}" tabindex="0" aria-label="${esc(n)}"><circle class="pe-hit" cx="${p.x}" cy="${p.y}" r="${rad * 3.2}"/><circle class="pe-dot" cx="${p.x}" cy="${p.y}" r="${rad}" stroke-width="${rad * 0.45}"/></g>` : ""; }).join("");
    };
    const medirAhora = () => {
      let ms;
      if (vista === "perfil") ms = medirPuntos(estado.pts, r.d, sexo);
      else ms = medir(estado.pts, sexo);
      estado.medidas = ms;
      const a = arm(ms), dlt = a - estado.base;
      score.innerHTML = `Armonía de ${vista === "perfil" ? "perfil" : "frente"} <b>${a.toFixed(1)}</b>${Math.abs(dlt) >= 0.05 ? ` <em class="${dlt > 0 ? "fq-ok" : "fq-bad"}">${dlt > 0 ? "+" : "−"}${Math.abs(dlt).toFixed(1)}</em>` : ""}`;
    };
    // guide lines through a few points so a misplaced one stands out
    const guias = () => {
      const L = vista === "perfil" ? [["G", "N"], ["N", "Prn"], ["Prn", "Sn"], ["Sn", "Ls"], ["Ls", "Li"], ["Li", "B"], ["B", "Pog"], ["Pog", "Me"], ["Me", "C"]]
        : [[468, 473], [33, 133], [362, 263], [70, 105], [105, 107], [300, 334], [334, 336], [129, 358], [61, 291], [172, 58], [58, 148], [148, 152], [152, 377], [377, 288], [288, 397]];
      gl.innerHTML = L.map(([a, b]) => { const p = get(a), q = get(b); return p && q ? `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>` : ""; }).join("");
    };
    dibujar(); guias(); medirAhora();

    // dragging
    const aSvg = (e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
    let arrastre = null;
    svg.addEventListener("pointerdown", (e) => {
      const g = e.target.closest(".pe-p"); if (!g) return;
      e.preventDefault(); const k = vista === "perfil" ? g.dataset.k : +g.dataset.k;
      arrastre = { k, id: e.pointerId }; svg.setPointerCapture(e.pointerId);
      gp.querySelectorAll(".pe-p").forEach(x => x.classList.toggle("on", x === g));
      sel.textContent = (lista.find(([kk]) => String(kk) === String(k)) || [, ""])[1];
    });
    svg.addEventListener("pointermove", (e) => {
      if (!arrastre || e.pointerId !== arrastre.id) return;
      const p = aSvg(e), q = get(arrastre.k); q.x = p.x; q.y = p.y;
      const g = gp.querySelector(`.pe-p[data-k="${arrastre.k}"]`);
      g.querySelectorAll("circle").forEach(cc => { cc.setAttribute("cx", p.x); cc.setAttribute("cy", p.y); });
      guias(); medirAhora(); estado.cambios++; ok.disabled = false;
    });
    const soltar = () => { arrastre = null; };
    svg.addEventListener("pointerup", soltar); svg.addEventListener("pointercancel", soltar);

    d.querySelector(".pe-reset").onclick = () => {
      estado.pts = vista === "perfil" ? JSON.parse(JSON.stringify(orig)) : orig.map(p => ({ ...p }));
      dibujar(); guias(); medirAhora(); ok.disabled = true; sel.textContent = "Toca un punto para ver cuál es";
    };
    ok.onclick = () => {
      const ms = estado.medidas;
      let out;
      if (vista === "perfil") {
        const zonas = ZONAS_PERFIL.map(([id, nombre]) => { const xs = ms.filter(x => x.zona === id); return { id, nombre, puntaje: xs.length ? Math.round(xs.reduce((t, x) => t + x.puntaje, 0) / xs.length) : null }; }).filter(z => z.puntaje !== null);
        out = { ...r, puntos: estado.pts, medidas: ms, resumen: { zonas, general: Math.round(zonas.reduce((t, z) => t + z.puntaje, 0) / zonas.length) } };
      } else {
        out = { ...r, puntos: estado.pts, medidas: ms, resumen: resumen(ms) };
      }
      salir(out);
    };
  });
}
