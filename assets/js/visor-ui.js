// Draws the measurement viewer: the photo with the lines of one measurement on top, the score card,
// the zone tabs and the explanation. Works from saved measurements, so it never loads the engine.
import { ZONAS } from "/assets/js/zonas.js?v=15";

const $ = (s) => document.querySelector(s);
const ESTADO = { dentro: ["En rango", "ready"], cerca: ["Cerca del rango", "paid"], fuera: ["Fuera del rango", ""] };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (m) => m.valor + (m.unidad || "");
// where the value sits on a track whose middle half is the reference range
const barra = (m) => { const [lo, hi] = m.rango, span = hi - lo || 1; return Math.max(3, Math.min(97, ((m.valor - (lo - span)) / (3 * span)) * 100)); };
const say = (el, t, type) => { el.textContent = t; el.className = "msg show " + type; };

let data = null, src = "", Z = ZONAS, zona = ZONAS[0][0], view = null, fila = null, casa = null;

// On phones the explanation opens right under the measurement you tapped; on a wide screen it stays in its card.
const movil = matchMedia("(max-width:900px)");
function colocarDetalle() {
  const d = $("#vDetail"); if (!d) return;
  if (!casa) { casa = document.createComment("detalle"); d.before(casa); }
  if (movil.matches && fila) {
    if (fila.nextElementSibling !== d) fila.after(d);
    // keep the tapped measurement visible below the pinned photo
    const cara = $(".visor-face"); if (!cara) return;
    const tope = cara.getBoundingClientRect().bottom + 8;
    const r = fila.getBoundingClientRect();
    if (r.top < tope) scrollBy({ top: r.top - tope, behavior: "smooth" });
  }
  else if (d.previousSibling !== casa) casa.after(d);
}
movil.addEventListener("change", colocarDetalle);

// data: what the engine returned (or the same shape read back from the order). src: the photo URL.
export function montar(d, imgSrc, opciones = {}) {
  data = d; src = imgSrc; Z = d.zonas || ZONAS; zona = Z[0][0]; fila = null; colocarDetalle();

  // Zoom the stage to the face: a 4:5 frame around the landmarks, kept inside the photo.
  const c = data.caja, fw = c.x1 - c.x0, fh = c.y1 - c.y0;
  let vh = Math.min(data.alto, fh * (data.tipo === "perfil" || data.mira ? 1.25 : 1.75)), vw = vh * 0.8;
  if (vw > data.ancho) { vw = data.ancho; vh = Math.min(data.alto, vw / 0.8); }
  if (vw < fw * 1.25) { vw = Math.min(data.ancho, fw * 1.25); vh = Math.min(data.alto, vw / 0.8); }
  const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2 - fh * 0.06;
  const vx = Math.max(0, Math.min(data.ancho - vw, cx - vw / 2)), vy = Math.max(0, Math.min(data.alto - vh, cy - vh / 2));
  view = { x: vx, y: vy, w: vw, h: vh };
  $("#vSvg").setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  $("#vStage").style.aspectRatio = vw + " / " + vh;

  const warn = $("#vWarn");
  if (warn) { if ((data.avisos || []).length) say(warn, data.avisos.join(" "), "info"); else warn.className = "msg"; }

  const score = $("#vScore"); if (score) score.textContent = (data.resumen.general / 10).toFixed(1);
  $("#vZones").innerHTML = data.resumen.zonas.map(z =>
    `<button type="button" class="visor-zone" data-zona="${z.id}"><span>${esc(z.nombre)}</span><i><b style="width:${z.puntaje}%"></b></i><em class="mono">${(z.puntaje / 10).toFixed(1)}</em></button>`).join("");
  $("#vZones").querySelectorAll("button").forEach(b => b.addEventListener("click", () => setZona(b.dataset.zona, true)));

  $("#vTabs").innerHTML = Z.map(([id, n]) => `<button type="button" data-zona="${id}">${esc(n)}</button>`).join("");
  $("#vTabs").querySelectorAll("button").forEach(b => b.addEventListener("click", () => setZona(b.dataset.zona)));

  setZona(zona);
  if (opciones.scroll !== false) scrollTo({ top: 0, behavior: "smooth" });
}

function setZona(id, scroll) {
  zona = id;
  // The detail card may be sitting inside the list; park it back in its slot before the list is rebuilt.
  fila = null; colocarDetalle();
  $("#vTabs").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.zona === id));
  $("#vZones").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.zona === id));
  const ms = data.medidas.filter(m => m.zona === id);
  $("#vList").innerHTML = ms.map(m => {
    const [txt, cls] = ESTADO[m.estado];
    return `<button type="button" class="visor-row" data-id="${m.id}"><span>${esc(m.nombre)}<small class="mono">${fmt(m)}</small></span><span class="visor-row-r"><i class="visor-bar"><b class="${cls || "out"}" style="left:${barra(m)}%"></b></i><b class="mono">${(m.puntaje / 10).toFixed(1)}</b></span></button>`;
  }).join("");
  $("#vList").querySelectorAll("button").forEach(b => b.addEventListener("click", () => setMedida(b.dataset.id)));
  if (ms.length) setMedida(ms[0].id);
  if (scroll) $("#vTabs").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setMedida(id) {
  const m = data.medidas.find(x => x.id === id); if (!m) return;
  $("#vList").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.id === id));
  fila = $(`#vList button[data-id="${id}"]`);
  draw(m);
  const [lo, hi] = m.rango, [txt, cls] = ESTADO[m.estado];
  // range bar: the reference range sits in the middle half of the track
  const span = hi - lo || 1, min = lo - span, max = hi + span;
  const pos = Math.max(2, Math.min(98, ((m.valor - min) / (max - min)) * 100));
  const now = $("#vNow"); if (now) now.innerHTML = `<b>${esc(m.nombre)}</b><i class="mono">${fmt(m)}</i>`;
  const d = $("#vDetail"); d.hidden = false;
  d.innerHTML = `
    <div class="visor-detail-top"><p class="label">${esc((Z.find(z => z[0] === m.zona) || ["", ""])[1])}</p><span class="status ${cls}">${txt}</span></div>
    <h2 class="visor-detail-h">${esc(m.nombre)}</h2>
    <p class="mono visor-detail-v">${fmt(m)}<span> · referencia ${lo}${m.unidad || ""} a ${hi}${m.unidad || ""}</span></p>
    <div class="visor-range" aria-hidden="true"><i></i><b style="left:${pos}%"></b></div>
    <p class="hint"><b>Qué mide.</b> ${esc(m.que)}</p>
    <p class="hint" style="margin-top:8px"><b>Qué significa.</b> ${esc(m.significa)}</p>`;
  colocarDetalle();
}

function draw(m) {
  const svg = $("#vSvg"), w = view.w / 220; // stroke scales with the zoomed frame
  const seen = new Set(); let dots = "";
  const lines = (m.lineas || []).map(([a, b]) => {
    [a, b].forEach(p => { const k = p.x.toFixed(1) + "," + p.y.toFixed(1); if (!seen.has(k)) { seen.add(k); dots += `<circle cx="${p.x}" cy="${p.y}" r="${w * 1.7}"/>`; } });
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }).join("");
  svg.innerHTML = `<image href="${esc(src)}" x="0" y="0" width="${data.ancho}" height="${data.alto}"/><g class="halo" stroke-width="${w * 2.4}">${lines}</g><g class="line" stroke-width="${w}">${lines}</g><g class="dot">${dots}</g>`;
}
