// Interactive measurement viewer: photo with the measurement lines on top and a list of measurements.
import { analizar, ZONAS } from "/assets/js/medidas.js?v=5";

const $ = (s) => document.querySelector(s);
const file = $("#vFile"), go = $("#vGo"), msgEl = $("#vMsg");
const ESTADO = { dentro: ["En rango", "ready"], cerca: ["Cerca del rango", "paid"], fuera: ["Fuera del rango", ""] };
let img = null, data = null, zona = ZONAS[0][0], activa = null, view = null;

function say(el, t, type = "err") { el.textContent = t; el.className = "msg show " + type; }
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (m) => m.valor + (m.unidad || "");

async function loadImage(src) {
  const el = new Image(); el.crossOrigin = "anonymous"; el.src = src;
  await el.decode(); return el;
}

file.addEventListener("change", async () => {
  msgEl.className = "msg";
  const f = file.files[0]; if (!f) return;
  if (!/^image\//.test(f.type)) return say(msgEl, "Ese archivo no es una imagen.");
  const url = URL.createObjectURL(f);
  img = await loadImage(url);
  const slot = $("#vDrop");
  let p = slot.querySelector("img"); if (!p) { p = document.createElement("img"); slot.prepend(p); }
  p.src = url; slot.classList.add("done");
  go.disabled = false;
});

go.addEventListener("click", () => run());
$("#vAgain").addEventListener("click", () => { $("#vResult").hidden = true; $("#vStart").hidden = false; scrollTo({ top: 0, behavior: "smooth" }); });

async function run() {
  if (!img) return;
  go.disabled = true; go.textContent = "Midiendo…"; msgEl.className = "msg";
  try {
    data = await analizar(img);
    render();
  } catch (e) {
    const t = { sin_cara: "No encontramos una cara en la foto. Prueba con una foto de frente y con buena luz.",
      varias_caras: "Hay más de una persona en la foto. Usa una donde salgas solo tú.",
      sin_iris: "No pudimos ubicar bien tus ojos. Prueba sin lentes y con más luz." }[e.message];
    say(msgEl, t || "No pudimos medir esta foto. Inténtalo de nuevo en un momento.");
  }
  go.disabled = false; go.textContent = "Medir mi cara";
}

function render() {
  $("#vStart").hidden = true; $("#vResult").hidden = false;
  // Zoom the stage to the face: a 4:5 frame around the landmarks, kept inside the photo.
  const c = data.caja, fw = c.x1 - c.x0, fh = c.y1 - c.y0;
  let vh = Math.min(data.alto, fh * 1.75), vw = vh * 0.8;
  if (vw > data.ancho) { vw = data.ancho; vh = Math.min(data.alto, vw / 0.8); }
  if (vw < fw * 1.25) { vw = Math.min(data.ancho, fw * 1.25); vh = Math.min(data.alto, vw / 0.8); }
  const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2 - fh * 0.06;
  const vx = Math.max(0, Math.min(data.ancho - vw, cx - vw / 2)), vy = Math.max(0, Math.min(data.alto - vh, cy - vh / 2));
  view = { x: vx, y: vy, w: vw, h: vh };
  const svg = $("#vSvg");
  svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  $("#vStage").style.aspectRatio = vw + " / " + vh;

  const warn = $("#vWarn");
  if (data.avisos.length) say(warn, data.avisos.join(" "), "info"); else warn.className = "msg";

  $("#vScore").textContent = data.resumen.general;
  $("#vZones").innerHTML = data.resumen.zonas.map(z =>
    `<button type="button" class="visor-zone" data-zona="${z.id}"><span>${esc(z.nombre)}</span><i><b style="width:${z.puntaje}%"></b></i><em class="mono">${z.puntaje}</em></button>`).join("");
  $("#vZones").querySelectorAll("button").forEach(b => b.addEventListener("click", () => setZona(b.dataset.zona, true)));

  $("#vTabs").innerHTML = ZONAS.map(([id, n]) => `<button type="button" data-zona="${id}">${esc(n)}</button>`).join("");
  $("#vTabs").querySelectorAll("button").forEach(b => b.addEventListener("click", () => setZona(b.dataset.zona)));

  setZona(zona);
  scrollTo({ top: 0, behavior: "smooth" });
}

function setZona(id, scroll) {
  zona = id;
  $("#vTabs").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.zona === id));
  $("#vZones").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.zona === id));
  const ms = data.medidas.filter(m => m.zona === id);
  $("#vList").innerHTML = ms.map(m => {
    const [txt, cls] = ESTADO[m.estado];
    return `<button type="button" class="visor-row" data-id="${m.id}"><span>${esc(m.nombre)}</span><span class="visor-row-r"><b class="mono">${fmt(m)}</b><span class="status ${cls}">${txt}</span></span></button>`;
  }).join("");
  $("#vList").querySelectorAll("button").forEach(b => b.addEventListener("click", () => setMedida(b.dataset.id)));
  setMedida(ms[0].id);
  if (scroll) $("#vTabs").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setMedida(id) {
  activa = data.medidas.find(m => m.id === id);
  $("#vList").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.id === id));
  draw(activa);
  const m = activa, [lo, hi] = m.rango, [txt, cls] = ESTADO[m.estado];
  // range bar: the reference range sits in the middle half of the track
  const span = hi - lo || 1, min = lo - span, max = hi + span;
  const pos = Math.max(2, Math.min(98, ((m.valor - min) / (max - min)) * 100));
  const d = $("#vDetail"); d.hidden = false;
  d.innerHTML = `
    <div class="visor-detail-top"><p class="label">${esc(ZONAS.find(z => z[0] === m.zona)[1])}</p><span class="status ${cls}">${txt}</span></div>
    <h2 class="visor-detail-h">${esc(m.nombre)}</h2>
    <p class="mono visor-detail-v">${fmt(m)}<span> · referencia ${lo}${m.unidad || ""} a ${hi}${m.unidad || ""}</span></p>
    <div class="visor-range" aria-hidden="true"><i></i><b style="left:${pos}%"></b></div>
    <p class="hint"><b>Qué mide.</b> ${esc(m.que)}</p>
    <p class="hint" style="margin-top:8px"><b>Qué significa.</b> ${esc(m.significa)}</p>`;
}

function draw(m) {
  const svg = $("#vSvg"), w = view.w / 220; // stroke scales with the zoomed frame
  const seen = new Set(); let dots = "";
  const lines = m.lineas.map(([a, b]) => {
    [a, b].forEach(p => { const k = p.x.toFixed(1) + "," + p.y.toFixed(1); if (!seen.has(k)) { seen.add(k); dots += `<circle cx="${p.x}" cy="${p.y}" r="${w * 1.7}"/>`; } });
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }).join("");
  svg.innerHTML = `<image href="${img.src}" x="0" y="0" width="${data.ancho}" height="${data.alto}"/><g class="halo" stroke-width="${w * 2.4}">${lines}</g><g class="line" stroke-width="${w}">${lines}</g><g class="dot">${dots}</g>`;
}

// Lets the page be opened with a sample photo: /visor.html?foto=/assets/img/...
const sample = new URLSearchParams(location.search).get("foto");
if (sample && /^\/assets\/img\//.test(sample)) loadImage(sample).then(i => { img = i; run(); }).catch(() => {});
