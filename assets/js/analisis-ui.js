// The measurement explorer in the panel: every measurement from the front and the profile, grouped by area,
// each with its range bar and score, and a detail view that draws the measurement on the face
// (lines, angle arcs with degrees, the value) next to the range it is compared with.
// Works from saved measurements, so it never loads the face engine.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const GRUPOS = [
  ["proporciones", "Proporciones"], ["ojos", "Ojos y cejas"], ["nariz", "Nariz"], ["boca", "Labios y boca"],
  ["mandibula", "Mandíbula y mentón"], ["cuello", "Cuello"], ["simetria", "Simetría"]
];
// profile zones folded into the same areas as the front ones
const DE_PERFIL = { nariz: "nariz", labios: "boca", menton: "mandibula", cuello: "cuello", proporciones: "proporciones" };
const s10 = (p) => (p / 10);
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const tono = (v10) => v10 >= 7.5 ? "fq-ok" : v10 >= 5 ? "fq-mid" : "fq-bad";
const fmt = (m) => m.valor + (m.unidad || "");
const CHEV = '<svg class="fq-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let S = null; // state for the mounted explorer

// Harmony from the measurement scores, the same curve the report uses: 10 * (mean/100)^2.2
const armoniaDe = (ps) => ps.length ? 10 * Math.pow(ps.reduce((t, x) => t + x, 0) / ps.length / 100, 2.2) : 0;
// how much each measurement adds to or takes from the harmony score, and what it would add at its ideal
function impactos(todas) {
  const ps = todas.map(m => m.puntaje), base = armoniaDe(ps);
  todas.forEach((m, i) => {
    const sin = ps.filter((_, j) => j !== i);
    m.aporte = base - armoniaDe(sin);
    m.gana = armoniaDe(ps.map((x, j) => j === i ? 100 : x)) - base;
  });
}
// 5 is the average; the curve is steep at the top (about 7 is the top 6%, 8 the top 0.5%)
function percentil(v) {
  const z = (v - 5) / 1.2, t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const c = z > 0 ? 1 - p : p;
  return Math.max(1, Math.min(99.9, c * 100));
}
const pctTxt = (v) => { const p = percentil(v); return p >= 99 ? p.toFixed(1) : Math.round(p); };
const sgn = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2);

// where the value sits on a track: the reference range is the middle third
function pos(m) {
  const [lo, hi] = m.rango, span = (hi - lo) || Math.abs(hi) || 1;
  return Math.max(3, Math.min(97, ((m.valor - (lo - span)) / (3 * span)) * 100));
}
function escala(m) {
  const [lo, hi] = m.rango, span = (hi - lo) || Math.abs(hi) || 1;
  const dec = Math.max(0, ...[lo, hi].map(v => (String(v).split(".")[1] || "").length));
  const r = (v) => Number(v.toFixed(Math.min(3, dec)));
  return [r(lo - span), lo, hi, r(hi + span)];
}

export function montarAnalisis(root, opts) {
  const { frente, perfil, armonia, nivel } = opts;
  const todas = [];
  const meter = (vista, v) => {
    if (!v || !v.data) return;
    v.data.medidas.forEach(m => todas.push({ ...m, vista, grupo: vista === "perfil" ? (DE_PERFIL[m.zona] || "proporciones") : m.zona }));
  };
  meter("frente", frente); meter("perfil", perfil);
  impactos(todas);
  S = { root, frente, perfil, todas, filtro: "todas", lista: [], abierta: null, abiertos: new Set(GRUPOS.map(g => g[0])) };

  // same strict curve as the report, so the front and profile chips agree with the total
  const deVista = (k) => { const ps = todas.filter(m => m.vista === k).map(m => m.puntaje); return ps.length ? armoniaDe(ps) : null; };
  const gF = frente ? deVista("frente") : null, gP = perfil ? deVista("perfil") : null;
  const total = armonia != null ? armonia : armoniaDe(todas.map(m => m.puntaje));
  const mini = (v, k) => v && v.src ? `<button type="button" class="fq-foto" data-v="${k}" aria-label="Ver solo ${k}">${fotoSvg(v.data, v.src)}<span>${k === "frente" ? "Frente" : "Perfil"}</span></button>` : "";
  root.innerHTML = `
    <div class="fq">
      <div class="fq-hero">
        <div class="fq-fotos">${mini(frente, "frente")}${mini(perfil, "perfil")}</div>
        <div class="fq-total">
          <p class="fq-k">Armonía</p>
          <p class="fq-big">${f1(total)}</p>
          ${nivel ? `<p class="fq-nivel">${esc(nivel(total))}</p>` : ""}
          <p class="fq-pct">Mejor que el ${pctTxt(total)}% de las personas</p>
          <div class="fq-chips">
            ${gF != null ? `<span>Frente <b class="${tono(gF)}">${f1(gF)}</b></span>` : ""}
            ${gP != null ? `<span>Perfil <b class="${tono(gP)}">${f1(gP)}</b></span>` : ""}
            <span>${todas.length} medidas</span>
          </div>
        </div>
      </div>
      ${balance(todas)}
      <div class="fq-seg" role="tablist">
        <button type="button" data-f="todas" class="on">Todas</button>
        ${frente ? '<button type="button" data-f="frente">Frente</button>' : ""}
        ${perfil ? '<button type="button" data-f="perfil">Perfil</button>' : ""}
      </div>
      <div class="fq-grupos"></div>
    </div>`;
  root.querySelectorAll(".fq-seg button").forEach(b => b.onclick = () => filtrar(b.dataset.f));
  root.querySelectorAll(".fq-bal [data-k]").forEach(b => b.onclick = () => { if (S.filtro !== "todas") filtrar("todas"); abrir(b.dataset.k); });
  root.querySelectorAll(".fq-foto").forEach(b => b.onclick = () => filtrar(b.dataset.v));
  filtrar("todas");
}

function filtrar(f) {
  S.filtro = f;
  S.root.querySelectorAll(".fq-seg button").forEach(b => b.classList.toggle("on", b.dataset.f === f));
  const ms = S.todas.filter(m => f === "todas" || m.vista === f);
  S.lista = [];
  const html = GRUPOS.map(([id, nombre]) => {
    const g = ms.filter(m => m.grupo === id).sort((a, b) => a.puntaje - b.puntaje);
    if (!g.length) return "";
    g.forEach(m => S.lista.push(m));
    const prom = s10(g.reduce((t, m) => t + m.puntaje, 0) / g.length);
    const abierto = S.abiertos.has(id);
    return `<section class="fq-g${abierto ? " open" : ""}" data-g="${id}">
      <button type="button" class="fq-g-h" aria-expanded="${abierto}"><span>${esc(nombre)} <em>${g.length}</em></span><b class="${tono(prom)}">${f1(prom)}</b>${CHEV}</button>
      <div class="fq-g-b">${g.map(fila).join("")}</div>
    </section>`;
  }).join("");
  const box = S.root.querySelector(".fq-grupos");
  box.innerHTML = html;
  box.querySelectorAll(".fq-g-h").forEach(h => h.onclick = () => {
    const sec = h.parentElement, id = sec.dataset.g, ab = !sec.classList.contains("open");
    sec.classList.toggle("open", ab); h.setAttribute("aria-expanded", ab);
    if (ab) S.abiertos.add(id); else S.abiertos.delete(id);
  });
  box.querySelectorAll(".fq-row").forEach(r => r.onclick = () => abrir(r.dataset.k));
}

const clave = (m) => m.vista + ":" + m.id;
// strengths and flaws, ranked by how much they move the score
function balance(todas) {
  const suma = todas.filter(m => m.aporte > 0).sort((a, b) => b.aporte - a.aporte).slice(0, 5);
  const resta = todas.filter(m => m.aporte < 0).sort((a, b) => a.aporte - b.aporte).slice(0, 5);
  const item = (m, cls) => `<button type="button" class="fq-bal-i" data-k="${clave(m)}"><span>${esc(m.nombre)}<em class="mono">${esc(fmt(m))}</em></span><b class="${cls}">${sgn(m.aporte)}</b></button>`;
  if (!suma.length && !resta.length) return "";
  return `<div class="fq-bal">
    <div><p class="fq-k">Lo que más te suma</p>${suma.map(m => item(m, "fq-ok")).join("") || '<p class="fq-vacio">Nada por ahora</p>'}</div>
    <div><p class="fq-k">Lo que más te resta</p>${resta.map(m => item(m, "fq-bad")).join("") || '<p class="fq-vacio">Nada importante</p>'}</div>
  </div>`;
}
function fila(m) {
  const v = s10(m.puntaje);
  return `<button type="button" class="fq-row" data-k="${clave(m)}">
    <span class="fq-row-n">${esc(m.nombre)} <em class="mono">${esc(fmt(m))}</em>${S.filtro === "todas" && m.vista === "perfil" ? '<i class="fq-tag">perfil</i>' : ""}</span>
    <span class="fq-track" aria-hidden="true"><i class="fq-ideal"></i><b class="${tono(v)}" style="left:${pos(m)}%"></b></span>
    <b class="fq-row-s">${f1(v)}</b>${CHEV}</button>`;
}

// ---------- drawing ----------
function fotoSvg(d, src) {
  const c = d.caja, w = c.x1 - c.x0, h = c.y1 - c.y0, lado = Math.max(w, h) * 1.25;
  const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
  return `<svg viewBox="${cx - lado / 2} ${cy - lado / 2} ${lado} ${lado}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect x="${cx - lado}" y="${cy - lado}" width="${lado * 2}" height="${lado * 2}" fill="#0E1114"/><image href="${esc(src)}" width="${d.ancho}" height="${d.alto}"/></svg>`;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function cruce(a1, a2, b1, b2) {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

// The angles to draw for an angle measurement: each pair of lines that meet at a point gets an arc there.
// Lines that do not meet (tilts like the canthal tilt) are each drawn against the horizontal.
function angulos(m, lado, vx, vy, centroX) {
  const L = (m.lineas || []).filter(l => dist(l[0], l[1]) > 0.5);
  if (m.unidad !== "°" || !L.length) return [];
  const eps = lado * 0.012, out = [];
  // lines come in pairs (one angle per pair: both sides of the jaw are two pairs)
  for (let i = 0; i + 1 < L.length; i += 2) {
    const a = L[i], b = L[i + 1];
    for (const p of a) for (const q of b) if (dist(p, q) < eps && !out.some(o => dist(o.v, p) < eps)) out.push({ v: p, a: a.find(x => x !== p), b: b.find(x => x !== q) });
  }
  if (out.length) return out;
  // tilt: each line against a horizontal that starts at its inner end and points outward
  return L.map(l => {
    const [p, q] = Math.abs(l[0].x - centroX) < Math.abs(l[1].x - centroX) ? [l[0], l[1]] : [l[1], l[0]];
    const h = { x: p.x + Math.sign(q.x - p.x || 1) * dist(p, q), y: p.y };
    return { v: p, a: h, b: q, ref: true };
  });
}

function figura(m) {
  const vista = m.vista === "perfil" ? S.perfil : S.frente;
  const d = vista.data, src = vista.src;
  const pts = (m.lineas || []).flat();
  const c = d.caja, cara = Math.max(c.x1 - c.x0, c.y1 - c.y0);
  let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
  let y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
  if (!pts.length) { x0 = c.x0; x1 = c.x1; y0 = c.y0; y1 = c.y1; }
  let lado = Math.max(x1 - x0, y1 - y0) * 1.7;
  lado = Math.max(lado, cara * 0.6); lado = Math.min(lado, cara * 1.35);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, vx = cx - lado / 2, vy = cy - lado / 2;
  const w = lado / 190, col = { "fq-ok": "#4ADE80", "fq-mid": "#F5B942", "fq-bad": "#F06A5A" }[tono(s10(m.puntaje))];

  // lines and their end points
  const seen = new Set(); let dots = "";
  const lines = (m.lineas || []).map(([a, b]) => {
    [a, b].forEach(p => { const k = p.x.toFixed(1) + "," + p.y.toFixed(1); if (!seen.has(k)) { seen.add(k); dots += `<circle cx="${p.x}" cy="${p.y}" r="${w * 2.3}"/>`; } });
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }).join("");

  // angles: arc between the two arms of each angle and the degrees next to the first one
  let arco = "", etiqueta = null;
  const A = angulos(m, lado, vx, vy, (c.x0 + c.x1) / 2);
  A.forEach((V, i) => {
    const r = Math.max(lado * 0.07, Math.min(dist(V.v, V.a), dist(V.v, V.b), lado * 0.22) * 0.55);
    const t1 = Math.atan2(V.a.y - V.v.y, V.a.x - V.v.x), t2 = Math.atan2(V.b.y - V.v.y, V.b.x - V.v.x);
    let dlt = t2 - t1; while (dlt > Math.PI) dlt -= 2 * Math.PI; while (dlt < -Math.PI) dlt += 2 * Math.PI;
    const p1 = { x: V.v.x + r * Math.cos(t1), y: V.v.y + r * Math.sin(t1) }, p2 = { x: V.v.x + r * Math.cos(t1 + dlt), y: V.v.y + r * Math.sin(t1 + dlt) };
    if (V.extiende) arco += `<line class="fq-ext" x1="${V.v.x}" y1="${V.v.y}" x2="${V.a.x}" y2="${V.a.y}" stroke-width="${w}"/><line class="fq-ext" x1="${V.v.x}" y1="${V.v.y}" x2="${V.b.x}" y2="${V.b.y}" stroke-width="${w}"/>`;
    if (V.ref) arco += `<line class="fq-ext" x1="${V.v.x}" y1="${V.v.y}" x2="${V.a.x}" y2="${V.a.y}" stroke-width="${w}"/>`;
    arco += `<path d="M${V.v.x} ${V.v.y} L${p1.x} ${p1.y} A${r} ${r} 0 0 ${dlt > 0 ? 1 : 0} ${p2.x} ${p2.y} Z" fill="${col}" fill-opacity=".16" stroke="none"/><path d="M${p1.x} ${p1.y} A${r} ${r} 0 0 ${dlt > 0 ? 1 : 0} ${p2.x} ${p2.y}" stroke="${col}" stroke-width="${w * 1.6}" fill="none"/>`;
    if (i === 0 && V.ref) {
      // tilts are small angles: the value goes above the line instead of inside the arc
      etiqueta = { x: (V.v.x + V.b.x) / 2, y: Math.min(V.v.y, V.b.y) - lado * 0.09 };
    } else if (i === 0) {
      // the label sits outside the arc, on the side away from the angle's opening when the angle is wide
      const mid = t1 + dlt / 2, rr = r + lado * 0.09, sgn = Math.abs(dlt) > 2.3 ? -1 : 1;
      etiqueta = { x: V.v.x + sgn * rr * Math.cos(mid), y: V.v.y + sgn * rr * Math.sin(mid) };
    }
  });
  if (!etiqueta && m.lineas && m.lineas.length) {
    const [a, b] = m.lineas[0];
    etiqueta = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - lado * 0.07 };
  }
  let chip = "";
  if (etiqueta) {
    const fs = lado / 20, txt = fmt(m), cw = fs * 0.62 * txt.length + fs * 0.9, ch = fs * 1.5;
    const ex = Math.max(vx + cw / 2 + w * 4, Math.min(vx + lado - cw / 2 - w * 4, etiqueta.x));
    const ey = Math.max(vy + ch / 2 + w * 4, Math.min(vy + lado - ch / 2 - w * 4, etiqueta.y));
    chip = `<g class="fq-chip"><rect x="${ex - cw / 2}" y="${ey - ch / 2}" width="${cw}" height="${ch}" rx="${ch / 2}" fill="${col}"/><text x="${ex}" y="${ey}" font-size="${fs}" dy=".35em" text-anchor="middle">${esc(txt)}</text></g>`;
  }
  return `<svg class="fq-fig" viewBox="${vx} ${vy} ${lado} ${lado}" role="img" aria-label="${esc(m.nombre)} marcado en tu foto">
    <rect x="${vx}" y="${vy}" width="${lado}" height="${lado}" fill="#0E1114"/>
    <image href="${esc(src)}" width="${d.ancho}" height="${d.alto}"/>
    <rect x="${vx}" y="${vy}" width="${lado}" height="${lado}" fill="rgba(10,12,15,.22)"/>
    <g class="fq-halo" stroke-width="${w * 2.6}">${lines}</g><g class="fq-line" stroke-width="${w}">${lines}</g>
    ${arco}<g class="fq-dot" stroke-width="${w * 0.8}">${dots}</g>${chip}</svg>`;
}

// ---------- detail ----------
function abrir(k) {
  const i = S.lista.findIndex(m => clave(m) === k); if (i < 0) return;
  S.abierta = i;
  let d = document.querySelector(".fq-det");
  if (!d) {
    d = document.createElement("div"); d.className = "fq-det"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true");
    d.innerHTML = `<div class="fq-det-box"></div>`;
    document.body.appendChild(d);
    d.addEventListener("click", e => { if (e.target === d) cerrar(); });
    document.addEventListener("keydown", tecla);
  }
  pintarDetalle();
  requestAnimationFrame(() => d.classList.add("on"));
  document.documentElement.classList.add("fq-abierto");
}
function tecla(e) {
  if (!document.querySelector(".fq-det.on")) return;
  if (e.key === "Escape") cerrar();
  if (e.key === "ArrowRight") mover(1);
  if (e.key === "ArrowLeft") mover(-1);
}
function cerrar() {
  const d = document.querySelector(".fq-det"); if (!d) return;
  d.classList.remove("on"); document.documentElement.classList.remove("fq-abierto");
  const m = S.lista[S.abierta]; const r = m && S.root.querySelector(`.fq-row[data-k="${clave(m)}"]`); if (r) r.focus({ preventScroll: true });
}
function mover(n) {
  S.abierta = (S.abierta + n + S.lista.length) % S.lista.length;
  pintarDetalle();
}
function pintarDetalle() {
  const m = S.lista[S.abierta], v = s10(m.puntaje), [mn, lo, hi, mx] = escala(m), p = pos(m);
  const grupo = (GRUPOS.find(g => g[0] === m.grupo) || ["", ""])[1];
  const pills = [0, 1, 2].map(i => `<i class="${["fq-bad", "fq-mid", "fq-ok"][i]}${tono(v) === ["fq-bad", "fq-mid", "fq-ok"][i] ? " on" : ""}"></i>`).join("");
  const u = m.unidad || "";
  const box = document.querySelector(".fq-det-box");
  box.innerHTML = `
    <div class="fq-det-top"><p class="fq-k">${esc(grupo)} · ${m.vista === "perfil" ? "Perfil" : "Frente"}</p><button type="button" class="fq-x" aria-label="Cerrar">×</button></div>
    <h3 class="fq-det-h">${esc(m.nombre)}</h3>
    <div class="fq-det-v"><span class="fq-big">${esc(fmt(m))}</span><span class="fq-score"><b>${f1(v)}</b><span class="fq-pills">${pills}</span></span></div>
    ${figura(m)}
    <div class="fq-range" aria-label="Tu valor contra el rango de referencia">
      <div class="fq-range-t"><i class="fq-ideal"></i><span class="fq-you ${tono(v)}" style="left:${p}%"><em>${esc(fmt(m))}</em></span></div>
      <div class="fq-range-l"><span style="left:0">${mn}${u}</span><span style="left:33.33%">${lo}${u}</span><span style="left:66.67%">${hi}${u}</span><span style="left:100%">${mx}${u}</span></div>
      <p class="fq-ref">Rango de referencia: ${lo}${u} a ${hi}${u}</p>
    </div>
    <div class="fq-imp"><div><p class="fq-k">Efecto en tu armonía</p><b class="${m.aporte >= 0 ? "fq-ok" : "fq-bad"}">${sgn(m.aporte)}</b></div>${m.gana > 0.005 ? `<div><p class="fq-k">Si llega a su ideal</p><b class="fq-ok">+${m.gana.toFixed(2)}</b></div>` : `<div><p class="fq-k">Estado</p><b class="fq-ok">En su ideal</b></div>`}</div>
    <div class="fq-txt"><p><b>Qué mide.</b> ${esc(m.que)}</p><p><b>Qué significa.</b> ${esc(m.significa)}</p></div>
    <div class="fq-nav"><button type="button" class="fq-prev" aria-label="Medida anterior">${CHEV}</button><span class="mono">${S.abierta + 1} / ${S.lista.length}</span><button type="button" class="fq-next" aria-label="Medida siguiente">${CHEV}</button></div>`;
  box.querySelector(".fq-x").onclick = cerrar;
  box.querySelector(".fq-prev").onclick = () => mover(-1);
  box.querySelector(".fq-next").onclick = () => mover(1);
  box.scrollTop = 0;
}
