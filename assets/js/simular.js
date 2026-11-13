// Simulator: warps a photo with sliders and measures the result again, front or profile.
// The same displacement that moves the pixels moves the landmarks, so the numbers follow what you see.
import { analizar, medir, resumen } from "/assets/js/medidas.js?v=20";
import { analizarPerfil, medirPuntos, ZONAS_PERFIL } from "/assets/js/perfil.js?v=20";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const armonia = (ms) => 10 * Math.pow(ms.reduce((s, m) => s + m.puntaje, 0) / ms.length / 100, 2.2);
const cargar = (url) => new Promise((ok, no) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = () => no(new Error("sin_foto")); i.src = url; });
const zonasPerfil = (ms) => ZONAS_PERFIL.map(([id, nombre]) => { const xs = ms.filter(m => m.zona === id); return xs.length ? { id, nombre, puntaje: Math.round(xs.reduce((s, m) => s + m.puntaje, 0) / xs.length) } : null; }).filter(Boolean);

// ---------- front
const CTL_FRENTE = [
  ["menton_largo", "Largo del mentón", "Mentón y mandíbula", 6, "Más corto", "Más largo"],
  ["menton_ancho", "Ancho del mentón", "Mentón y mandíbula", 5, "Más angosto", "Más ancho"],
  ["mandibula", "Ancho de la mandíbula", "Mentón y mandíbula", 6, "Más angosta", "Más ancha"],
  ["pomulos", "Ancho de pómulos", "Mentón y mandíbula", 5, "Más angostos", "Más anchos"],
  ["nariz_ancho", "Ancho de la nariz", "Nariz", 4, "Más angosta", "Más ancha"],
  ["nariz_punta", "Punta de la nariz", "Nariz", 4, "Más arriba", "Más abajo"],
  ["labios", "Grosor de labios", "Boca", 3, "Más delgados", "Más gruesos"],
  ["boca_ancho", "Ancho de la boca", "Boca", 4, "Más angosta", "Más ancha"],
  ["boca_altura", "Espacio nariz-labio", "Boca", 4, "Más corto", "Más largo"],
  ["cejas_altura", "Altura de las cejas", "Ojos y cejas", 4, "Más bajas", "Más altas"],
  ["cejas_cola", "Cola de la ceja", "Ojos y cejas", 4, "Más baja", "Más alta"],
  ["ojos", "Inclinación de los ojos", "Ojos y cejas", 3, "Más caídos", "Más rasgados"],
];
// each preset says which controls it may touch and in which direction; the values are searched per face
const PRE_FRENTE = [
  ["Mejor versión", { mandibula: [-2, 4], menton_largo: [-2, 2.5], menton_ancho: [-1.5, 2], pomulos: [-1, 2.5], nariz_ancho: [-3, 1], nariz_punta: [-2, 1], labios: [-1, 2.5], boca_ancho: [-2, 2], boca_altura: [-2, 1.5], cejas_altura: [-1.5, 2.5], cejas_cola: [-1.5, 2.5] }],
  ["Mandíbula marcada", { mandibula: [0, 4], menton_largo: [-1.5, 2], menton_ancho: [-1, 2] }],
  ["Relleno de mandíbula", { mandibula: [0, 4] }],
  ["Botox de maseteros", { mandibula: [-4, 0] }],
  ["Implante de mentón", { menton_largo: [0, 3], menton_ancho: [0, 2] }],
  ["Reducción de mentón", { menton_largo: [-3, 0], menton_ancho: [-2, 0] }],
  ["Pómulos (relleno o implante)", { pomulos: [0, 3] }],
  ["Rinoplastia: alas más angostas", { nariz_ancho: [-3, 0] }],
  ["Rinoplastia: punta más arriba", { nariz_punta: [-2.5, 0] }],
  ["Rinoplastia completa", { nariz_ancho: [-3, 0], nariz_punta: [-2, 1] }],
  ["Relleno de labios", { labios: [0, 2.5] }],
  ["Lip lift", { boca_altura: [-2.5, 0] }],
  ["Labios completos", { labios: [0, 2.5], boca_altura: [-1.5, 0] }],
  ["Levantar cejas", { cejas_altura: [0, 2.5], cejas_cola: [0, 2.5] }],
  ["Botox en cola de ceja", { cejas_cola: [0, 2.5] }],
  ["Cantoplastia (ojos rasgados)", { ojos: [0, 2.5] }],
];

// How each control is described to the image model: what it changes, and what minus / plus mean.
const EN = {
  menton_largo: ["Chin vertical length", "shorter chin", "longer chin"],
  menton_ancho: ["Chin width", "narrower chin", "wider, squarer chin"],
  mandibula: ["Jaw width at the jaw angles", "narrower jaw", "wider, more angular jaw"],
  pomulos: ["Cheekbone width", "narrower cheekbones", "wider, more prominent cheekbones"],
  nariz_ancho: ["Nostril (alar) width", "narrower nose base", "wider nose base"],
  nariz_punta: ["Nose tip height", "nose tip lifted", "nose tip lowered"],
  labios: ["Lip fullness", "thinner lips", "fuller lips"],
  boca_ancho: ["Mouth width", "narrower mouth", "wider mouth"],
  boca_altura: ["Distance from nose base to upper lip", "shorter upper lip", "longer upper lip"],
  cejas_altura: ["Eyebrow height", "lower eyebrows", "higher eyebrows"],
  cejas_cola: ["Height of the outer end of the eyebrows", "lower brow tails", "lifted brow tails"],
  ojos: ["Canthal tilt (outer eye corners)", "outer corners lower", "outer corners lifted"],
  menton_proy: ["Chin projection forward", "chin further back", "chin projected further forward"],
  menton_vert: ["Chin vertical length", "shorter chin", "longer chin"],
  cuello: ["Definition of the line under the chin (jaw-neck angle)", "softer jaw-neck line", "sharper, more defined jaw-neck line"],
  nariz_proy: ["Nose tip projection", "less projected nose tip", "more projected nose tip"],
  nariz_rot: ["Nose tip rotation", "nose tip rotated down", "nose tip rotated up"],
  nariz_dorso: ["Nasal bridge (dorsal hump)", "straighter bridge, hump reduced", "bigger dorsal hump"],
  labios_proy: ["Lip projection", "lips further back", "lips further forward"],
  ceja: ["Brow ridge prominence", "softer brow ridge", "more prominent brow ridge"],
};
export function cambiosIA() {
  return Object.entries(valores).filter(([, v]) => v).map(([k, v]) => {
    const e = EN[k] || [k, "less", "more"];
    return { que: e[0], mm: v, menos: e[1], mas: e[2] };
  });
}

async function frente(url, sexo) {
  const img = await cargar(url);
  const base = await analizar(img, sexo);
  const L = base.puntos;
  let pL = L[468], pR = L[473]; if (pL.x > pR.x) [pL, pR] = [pR, pL];
  const ipd = Math.hypot(pR.x - pL.x, pR.y - pL.y);
  const u = [(pR.x - pL.x) / ipd, (pR.y - pL.y) / ipd];
  let v = [-u[1], u[0]]; if ((L[152].x - L[9].x) * v[0] + (L[152].y - L[9].y) * v[1] < 0) v = [-v[0], -v[1]];
  const c = { x: (pL.x + pR.x) / 2, y: (pL.y + pR.y) / 2 };
  const fuera = (p) => { const s = Math.sign((p.x - c.x) * u[0] + (p.y - c.y) * u[1]) || 1; return [s * u[0], s * u[1]]; };
  const abajo = v, arriba = [-v[0], -v[1]];
  const A = (i, dir, r, k = 1) => ({ p: L[i], dir: [dir[0] * k, dir[1] * k], r: r * ipd });
  return {
    img, ancho: base.ancho, alto: base.alto, caja: base.caja, alto_marco: 1.75, mm: ipd / 63,
    controles: CTL_FRENTE, presets: PRE_FRENTE,
    anclas: {
      menton_largo: [A(152, abajo, .42), A(148, abajo, .3), A(377, abajo, .3)],
      menton_ancho: [148, 377, 176, 400].map(i => A(i, fuera(L[i]), .26)),
      mandibula: [172, 397, 136, 365, 58, 288].map(i => A(i, fuera(L[i]), .42)),
      pomulos: [234, 454, 116, 345].map(i => A(i, fuera(L[i]), .42)),
      nariz_ancho: [129, 358, 64, 294].map(i => A(i, fuera(L[i]), .16)),
      nariz_punta: [A(1, abajo, .2), A(2, abajo, .16)],
      labios: [A(0, arriba, .16), A(37, arriba, .12), A(267, arriba, .12), A(17, abajo, .16), A(84, abajo, .12), A(314, abajo, .12)],
      boca_ancho: [61, 291].map(i => A(i, fuera(L[i]), .17)),
      boca_altura: [0, 13, 14, 17, 61, 291].map(i => A(i, abajo, .24)),
      cejas_altura: [105, 334, 70, 300, 107, 336, 66, 296].map(i => A(i, arriba, .18)),
      cejas_cola: [70, 300, 63, 293].map(i => A(i, arriba, .15)),
      ojos: [A(33, arriba, .12), A(263, arriba, .12), A(133, abajo, .1, .35), A(362, abajo, .1, .35)],
    },
    antes: base.medidas,
    medir: (mover) => medir(L.map(mover), sexo),
    zonas: (ms) => resumen(ms).zonas,
  };
}

// ---------- profile
const CTL_PERFIL = [
  ["menton_proy", "Proyección del mentón", "Mentón y cuello", 8, "Más atrás", "Más adelante"],
  ["menton_vert", "Largo del mentón", "Mentón y cuello", 6, "Más corto", "Más largo"],
  ["cuello", "Línea bajo el mentón", "Mentón y cuello", 8, "Más suelta", "Más definida"],
  ["nariz_proy", "Proyección de la punta", "Nariz", 5, "Menos", "Más"],
  ["nariz_rot", "Rotación de la punta", "Nariz", 5, "Más caída", "Más arriba"],
  ["nariz_dorso", "Dorso de la nariz", "Nariz", 4, "Más recto", "Más giba"],
  ["labios_proy", "Proyección de labios", "Labios y frente", 4, "Más atrás", "Más adelante"],
  ["ceja", "Arco de la ceja", "Labios y frente", 4, "Menos marcado", "Más marcado"],
];
const PRE_PERFIL = [
  ["Mejor versión", { menton_proy: [-3, 6], menton_vert: [-2, 3], cuello: [0, 7], nariz_dorso: [-3, 0], nariz_proy: [-3, 2], nariz_rot: [-1, 3], labios_proy: [-3, 3], ceja: [-2, 3] }],
  ["Implante de mentón", { menton_proy: [0, 6] }],
  ["Genioplastia de avance", { menton_proy: [0, 6], menton_vert: [0, 3] }],
  ["Reducción de mentón", { menton_proy: [-4, 0], menton_vert: [-2, 0] }],
  ["Lipo de papada", { cuello: [0, 7] }],
  ["Rinoplastia: quitar giba", { nariz_dorso: [-3, 0] }],
  ["Rinoplastia: rotar la punta", { nariz_rot: [0, 3] }],
  ["Rinoplastia: menos proyección", { nariz_proy: [-3, 0] }],
  ["Rinoplastia completa", { nariz_dorso: [-3, 0], nariz_proy: [-3, 2], nariz_rot: [-1, 3] }],
  ["Relleno de labios de perfil", { labios_proy: [0, 3] }],
  ["Retraer labios", { labios_proy: [-3, 0] }],
  ["Arco de ceja más marcado", { ceja: [0, 3] }],
  ["Suavizar arco de ceja", { ceja: [-3, 0] }],
];
async function perfil(url, sexo) {
  const img = await cargar(url);
  const base = await analizarPerfil(img, sexo);
  const P = base.puntos, d = base.d, Hf = Math.abs(P.Me.y - P.N.y);
  const mm = Hf / (sexo === "mujer" ? 115 : sexo === "hombre" ? 125 : 120);
  const fw = [d, 0], dn = [0, 1], up = [0, -1];
  const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  const A = (p, dir, r, k = 1) => ({ p, dir: [dir[0] * k, dir[1] * k], r: r * Hf });
  const mitad = (a, b, t = .5) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const dorso = mitad(P.N, P.Prn, .55);
  // the dorsum moves at a right angle to the line of the nose
  const t = norm(P.Prn.x - P.N.x, P.Prn.y - P.N.y); let nOut = [t[1], -t[0]]; if (Math.sign(nOut[0]) !== d) nOut = [-t[1], t[0]];
  const levanta = norm(-d * .5, -1), sub = mitad(P.Me, P.C);
  return {
    img, ancho: base.ancho, alto: base.alto, caja: base.caja, alto_marco: 1.2, mm,
    controles: CTL_PERFIL, presets: PRE_PERFIL,
    anclas: {
      menton_proy: [A(P.Pog, fw, .11), A(P.Me, fw, .08, .8), A(P.B, fw, .07, .35)],
      menton_vert: [A(P.Me, dn, .1), A(P.Pog, dn, .08, .6)],
      cuello: [A(sub, levanta, .1), A(P.C, levanta, .08, .7)],
      nariz_proy: [A(P.Prn, fw, .07), A(P.Cm, fw, .05, .6)],
      nariz_rot: [A(P.Prn, up, .07), A(P.Cm, up, .05, .8)],
      nariz_dorso: [A(dorso, nOut, .07)],
      labios_proy: [A(P.Ls, fw, .06), A(P.Li, fw, .06)],
      ceja: [A(P.G, fw, .08)],
    },
    antes: base.medidas,
    medir: (mover) => { const Q = {}; for (const k in P) Q[k] = P[k] ? mover(P[k]) : P[k]; return medirPuntos(Q, d, sexo); },
    zonas: zonasPerfil,
  };
}

// ---------- shared warp and UI
let S = null, raf = false;
const valores = {};
let mezcla = 1;

function campo(x, y) {
  let dx = 0, dy = 0;
  for (const k in S.anclas) {
    const a = (valores[k] || 0) * mezcla; if (!a) continue;
    let sx = 0, sy = 0, sw = 0;
    for (const an of S.anclas[k]) {
      const d2 = ((x - an.p.x) ** 2 + (y - an.p.y) ** 2) / (an.r * an.r); if (d2 > 9) continue;
      const w = Math.exp(-d2); sx += w * an.dir[0]; sy += w * an.dir[1]; sw += w;
    }
    if (!sw) continue;
    const n = Math.max(1, sw); dx += a * S.mm * sx / n; dy += a * S.mm * sy / n;
  }
  return [dx, dy];
}

function marco() {
  const W = S.ancho, H = S.alto, b = S.caja, fw = b.x1 - b.x0, fh = b.y1 - b.y0;
  let vh = Math.min(H, fh * S.alto_marco), vw = vh * 0.8;
  if (vw > W) { vw = W; vh = Math.min(H, vw / 0.8); }
  if (vw < fw * 1.15) { vw = Math.min(W, fw * 1.15); vh = Math.min(H, vw / 0.8); }
  const vx = Math.max(0, Math.min(W - vw, (b.x0 + b.x1) / 2 - vw / 2)), vy = Math.max(0, Math.min(H - vh, (b.y0 + b.y1) / 2 - fh * 0.04 - vh / 2));
  const cv = $("#simCanvas"), cw = 600, ch = Math.round(cw * vh / vw);
  cv.width = cw; cv.height = ch; $("#simStage").style.aspectRatio = cw + " / " + ch;
  S.v = { vx, vy, vw, vh, cw, ch, k: cw / vw, g: cv.getContext("2d") };
}

function tri(g, img, W, H, s0, s1, s2, d0, d1, d2) {
  const den = s0[0] * (s1[1] - s2[1]) + s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]); if (!den) return;
  const f = (q0, q1, q2) => [
    (q0 * (s1[1] - s2[1]) + q1 * (s2[1] - s0[1]) + q2 * (s0[1] - s1[1])) / den,
    (q0 * (s2[0] - s1[0]) + q1 * (s0[0] - s2[0]) + q2 * (s1[0] - s0[0])) / den,
    (q0 * (s1[0] * s2[1] - s2[0] * s1[1]) + q1 * (s2[0] * s0[1] - s0[0] * s2[1]) + q2 * (s0[0] * s1[1] - s1[0] * s0[1])) / den];
  const [a, c, e] = f(d0[0], d1[0], d2[0]), [b, dd, ff] = f(d0[1], d1[1], d2[1]);
  // grow the clip a little so neighbouring triangles overlap and no seams show
  const mx = (d0[0] + d1[0] + d2[0]) / 3, my = (d0[1] + d1[1] + d2[1]) / 3, k = 1.06;
  g.save(); g.beginPath();
  g.moveTo(mx + (d0[0] - mx) * k, my + (d0[1] - my) * k); g.lineTo(mx + (d1[0] - mx) * k, my + (d1[1] - my) * k); g.lineTo(mx + (d2[0] - mx) * k, my + (d2[1] - my) * k);
  g.closePath(); g.clip(); g.setTransform(a, b, c, dd, e, ff);
  const x0 = Math.max(0, Math.min(s0[0], s1[0], s2[0]) - 2), y0 = Math.max(0, Math.min(s0[1], s1[1], s2[1]) - 2);
  const x1 = Math.min(W, Math.max(s0[0], s1[0], s2[0]) + 2), y1 = Math.min(H, Math.max(s0[1], s1[1], s2[1]) + 2);
  g.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  g.restore();
}

function pintar() {
  const { vx, vy, vw, vh, cw, ch, k, g } = S.v;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(S.img, vx, vy, vw, vh, 0, 0, cw, ch);
  if (!mezcla || !Object.values(valores).some(Boolean)) return;
  const NX = 34, NY = Math.round(NX * vh / vw), gx = vw / NX, gy = vh / NY, Sx = [], D = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const x = vx + i * gx, y = vy + j * gy, [dx, dy] = campo(x, y);
    Sx.push([x, y]); D.push([(x + dx - vx) * k, (y + dy - vy) * k, dx || dy]);
  }
  const n = NX + 1;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (!(D[a][2] || D[b][2] || D[c][2] || D[d][2])) continue; // untouched cells keep the original pixels
    tri(g, S.img, S.ancho, S.alto, Sx[a], Sx[b], Sx[c], D[a], D[b], D[c]); tri(g, S.img, S.ancho, S.alto, Sx[b], Sx[d], Sx[c], D[b], D[d], D[c]);
  }
}

function numeros() {
  const prev = mezcla; mezcla = 1;
  const ahora = S.medir(p => { const [dx, dy] = campo(p.x, p.y); return { x: p.x + dx, y: p.y + dy }; });
  mezcla = prev;
  const a0 = armonia(S.antes), a1 = armonia(ahora), dl = a1 - a0, sg = (x) => (x > 0 ? "+" : "") + x.toFixed(1);
  const cls = Math.abs(dl) < 0.05 ? "" : dl > 0 ? "sube" : "baja";
  const html = `<span class="mono">${a0.toFixed(1)}</span><span class="sim-fl">→</span><b class="mono">${a1.toFixed(1)}</b><em class="sim-d ${cls}">${sg(dl)}</em>`;
  $("#simScore").innerHTML = html; $("#simNow").innerHTML = `<b>Armonía</b><i class="sim-mini">${html}</i>`;
  const porId = Object.fromEntries(S.antes.map(m => [m.id, m]));
  const cambios = ahora.filter(m => porId[m.id]).map(m => ({ m, o: porId[m.id], d: (m.puntaje - porId[m.id].puntaje) / 10 }))
    .filter(x => Math.abs(x.d) >= 0.2).sort((p, q) => Math.abs(q.d) - Math.abs(p.d)).slice(0, 8);
  $("#simDelta").innerHTML = cambios.length ? cambios.map(x => `<div class="sim-row"><span>${esc(x.m.nombre)}<small class="mono">${x.o.valor}${x.o.unidad || ""} → ${x.m.valor}${x.m.unidad || ""}</small></span><em class="sim-d ${x.d > 0 ? "sube" : "baja"}">${sg(x.d)}</em><b class="mono">${(x.m.puntaje / 10).toFixed(1)}</b></div>`).join("")
    : '<p class="hint" style="padding:8px 0">Mueve un control para ver qué medidas cambian.</p>';
  $("#simZonas").innerHTML = S.zonas(ahora).map(z => `<div class="visor-zone"><span>${esc(z.nombre)}</span><i><b style="width:${z.puntaje}%"></b></i><em class="mono">${(z.puntaje / 10).toFixed(1)}</em></div>`).join("");
}
// best values for one preset on this face: coordinate search over half-millimetre steps
function evaluar(vals) {
  const guard = { ...valores }, prev = mezcla;
  for (const k in valores) delete valores[k]; Object.assign(valores, vals); mezcla = 1;
  const r = armonia(S.medir(p => { const [dx, dy] = campo(p.x, p.y); return { x: p.x + dx, y: p.y + dy }; }));
  for (const k in valores) delete valores[k]; Object.assign(valores, guard); mezcla = prev;
  return r;
}
function optimizar(rangos) {
  const v = {}; for (const k in rangos) v[k] = 0;
  let mejor = evaluar(v); const base = mejor;
  for (let pasada = 0; pasada < 3; pasada++) {
    let cambio = false;
    for (const k in rangos) {
      const [lo, hi] = rangos[k];
      for (let x = lo; x <= hi + 1e-9; x += 0.5) {
        if (x === v[k]) continue;
        const r = evaluar({ ...v, [k]: x });
        if (r > mejor + 0.005) { mejor = r; v[k] = x; cambio = true; }
      }
    }
    if (!cambio) break;
  }
  return { v, gana: mejor - base };
}
const refrescar = () => { if (raf) return; raf = true; requestAnimationFrame(() => { raf = false; pintar(); numeros(); }); };

function controles() {
  const grupos = [...new Set(S.controles.map(x => x[2]))];
  $("#simPre").innerHTML = S.presets.map(([n], i) => `<button type="button" class="rep-tag sim-pre" data-i="${i}">${esc(n)}</button>`).join("");
  $("#simCtl").innerHTML = grupos.map(gr => `<div class="card sim-g"><p class="label">${gr}</p>${S.controles.filter(x => x[2] === gr).map(([k, n, , max, izq, der]) =>
    `<label class="sim-c"><span class="sim-c-t"><span>${n}</span><em class="mono" data-v="${k}">0 mm</em></span><input type="range" min="${-max}" max="${max}" step="0.5" value="0" data-k="${k}" aria-label="${n}"><span class="sim-c-e"><small>${izq}</small><small>${der}</small></span></label>`).join("")}</div>`).join("");
  const poner = (k, v) => { valores[k] = v; const i = $(`#simCtl input[data-k="${k}"]`); if (i) i.value = v; const e = $(`#simCtl [data-v="${k}"]`); if (e) e.textContent = (v > 0 ? "+" : "") + v + " mm"; };
  $("#simCtl").querySelectorAll("input").forEach(inp => inp.addEventListener("input", () => { poner(inp.dataset.k, +inp.value); refrescar(); }));
  const nota = $("#simPreNota");
  const decir = (t) => { nota.textContent = t || ""; nota.hidden = !t; };
  decir("");
  S.optimos ||= {};
  $("#simPre").querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    const i = +b.dataset.i, [nombre, rangos] = S.presets[i];
    const o = S.optimos[i] ||= optimizar(rangos);
    S.controles.forEach(([k]) => poner(k, 0));
    $("#simPre").querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
    const mejor = /^Mejor/.test(nombre);
    if (o.gana < 0.05 && mejor) { decir("Tu cara ya está muy bien proporcionada: no encontramos cambios que suban tu armonía."); refrescar(); return; }
    if (o.gana < 0.05) {
      // the treatment would not raise the score here, but the customer still wants to see it: a moderate amount
      for (const k in rangos) { const [lo, hi] = rangos[k]; poner(k, Math.round((Math.abs(hi) >= Math.abs(lo) ? hi : lo) * 0.6 * 2) / 2); }
      decir(`En tu cara, ${nombre.toLowerCase()} no subiría tu armonía, pero así se vería. Puedes ajustarlo a mano.`);
    } else {
      for (const k in o.v) poner(k, o.v[k]);
      decir("Valores calculados para tu cara. Puedes ajustarlos a mano.");
    }
    refrescar();
    if (/^Mejor/.test(nombre)) setTimeout(() => realista(), 50);
  }));
  $("#simReset").onclick = () => { S.controles.forEach(([k]) => poner(k, 0)); $("#simPre").querySelectorAll("button").forEach(x => x.classList.remove("active")); decir(""); refrescar(); };
}

// ---------- realistic render: the same changes, applied to the photo by the image model
let modoActual = "frente";
async function realista() {
  const box = $("#simIA"), b = $("#simIABtn"), m = $("#simIAMsg");
  if (!actuales || !actuales.ia) return;
  const cambios = cambiosIA();
  const magro = !!($("#simMagro") || {}).checked;
  const extras = [...document.querySelectorAll("#simBox [data-extra]")].filter(x => x.checked).map(x => x.dataset.extra);
  if (!cambios.length && !magro && !extras.length) { m.textContent = "Mueve al menos un control, elige un tratamiento de ejemplo o marca menos grasa en la cara."; m.className = "msg show info"; return; }
  m.className = "msg"; b.disabled = true; b.textContent = "Generando…";
  box.hidden = false; box.classList.add("cargando");
  $("#simIAAntes").src = modoActual === "perfil" ? actuales.urlPerfil : actuales.url;
  $("#simIADesp").removeAttribute("src");
  $("#simIALista").innerHTML = cambios.map(c => `<li>${esc((S.controles.find(x => EN[x[0]] && EN[x[0]][0] === c.que) || [, c.que])[1])} <span class="mono">${c.mm > 0 ? "+" : ""}${c.mm} mm</span></li>`).join("") + (magro ? '<li>Menos grasa en la cara</li>' : "") + extras.map(x => `<li>${x === "piel" ? "Piel más limpia" : "Ojeras corregidas"}</li>`).join("");
  const etiquetas = [...$("#simIALista").querySelectorAll("li")].map(li => li.textContent);
  try {
    const r = await actuales.ia({ tipo: "sim", order_id: actuales.id, vista: modoActual, foto: actuales.fotoPerfil, cambios, magro, extras, etiquetas });
    $("#simIADesp").src = r.imagen;
    box.classList.remove("cargando");
    galeria();
    setTimeout(() => box.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
  } catch (e) {
    box.hidden = true;
    m.textContent = e.message === "limite" ? "Llegaste al límite de imágenes de hoy. Mañana puedes generar más." : "No pudimos generar la imagen ahorita. Inténtalo de nuevo en un momento.";
    m.className = "msg show err";
  }
  b.disabled = false; b.textContent = "Ver resultado realista";
}

// saved simulations, newest first
async function galeria() {
  const g = $("#simGal"); if (!g || !actuales || !actuales.ia) return;
  try {
    const { sims } = await actuales.ia({ tipo: "sims", order_id: actuales.id });
    if (!sims || !sims.length) { g.hidden = true; return; }
    g.hidden = false;
    g.querySelector(".sim-gal-l").innerHTML = sims.map(x => `<a class="sim-gal-i" href="${esc(x.url)}" target="_blank" rel="noopener"><img src="${esc(x.url)}" alt="Simulación guardada" loading="lazy"><span>${esc((x.cambios || []).join(" · "))}</span><time>${new Date(x.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short" })} · ${x.vista === "perfil" ? "Perfil" : "Frente"}</time></a>`).join("");
  } catch (e) { g.hidden = true; }
}

const sesiones = {};
async function usar(modo, datos) {
  for (const k in valores) delete valores[k];
  const llave = modo + "|" + (modo === "perfil" ? datos.urlPerfil : datos.url).split("?")[0];
  modoActual = modo;
  S = await (sesiones[llave] ||= (modo === "perfil" ? perfil(datos.urlPerfil, datos.sexo) : frente(datos.url, datos.sexo)).catch(e => { delete sesiones[llave]; throw e; }));
  $("#simScoreL").textContent = modo === "perfil" ? "Armonía de perfil" : "Armonía de frente";
  marco(); controles(); pintar(); numeros();
}

const $$vistas = () => document.querySelectorAll("#simVistas button");
let actuales = null, listo = false;
export async function iniciar(datos) {
  actuales = datos;
  $$vistas().forEach(x => x.classList.toggle("active", x.dataset.v === "frente"));
  await usar("frente", datos);
  $("#simVistas").hidden = !datos.urlPerfil;
  if (listo) return;
  listo = true;
  const bIA = $("#simIABtn"); if (bIA) bIA.addEventListener("click", () => realista());
  galeria();
  const orig = $("#simOrig"), ver = (si) => { mezcla = si ? 0 : 1; pintar(); orig.classList.toggle("on", si); };
  orig.addEventListener("pointerdown", (ev) => { ev.preventDefault(); ver(true); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(e => orig.addEventListener(e, () => ver(false)));
  orig.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); ver(true); } });
  orig.addEventListener("keyup", () => ver(false));
  const vistas = $("#simVistas");
  vistas.querySelectorAll("button").forEach(b => b.addEventListener("click", async () => {
    if (b.classList.contains("active")) return;
    vistas.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
    $("#simMsg").className = "msg"; $("#simBox").classList.add("sim-cargando");
    try { await usar(b.dataset.v, actuales); }
    catch (e) { const m = $("#simMsg"); m.textContent = "No pudimos leer tu foto de perfil para simular. Prueba con la otra vista."; m.className = "msg show err"; }
    $("#simBox").classList.remove("sim-cargando");
  }));
}
