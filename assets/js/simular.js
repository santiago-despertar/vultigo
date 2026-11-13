// Simulator: warps the front photo with a few sliders and measures the result again.
// The same displacement that moves the pixels moves the landmarks, so the measurements follow what you see.
import { analizar, medir, resumen } from "/assets/js/medidas.js?v=18";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const armonia = (ms) => 10 * Math.pow(ms.reduce((s, m) => s + m.puntaje, 0) / ms.length / 100, 2.2);

// key, label, group, max mm, text for the two ends
const CONTROLES = [
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

export async function iniciar({ url, sexo }) {
  const img = await new Promise((ok, no) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = () => no(new Error("sin_foto")); i.src = url; });
  const base = await analizar(img, sexo);
  const L = base.puntos, W = base.ancho, H = base.alto;

  // face frame
  let pL = L[468], pR = L[473]; if (pL.x > pR.x) [pL, pR] = [pR, pL];
  const ipd = Math.hypot(pR.x - pL.x, pR.y - pL.y), mm = ipd / 63;
  const u = [(pR.x - pL.x) / ipd, (pR.y - pL.y) / ipd];
  let v = [-u[1], u[0]]; if ((L[152].x - L[9].x) * v[0] + (L[152].y - L[9].y) * v[1] < 0) v = [-v[0], -v[1]];
  const c = { x: (pL.x + pR.x) / 2, y: (pL.y + pR.y) / 2 };
  const fuera = (p) => { const s = Math.sign((p.x - c.x) * u[0] + (p.y - c.y) * u[1]) || 1; return [s * u[0], s * u[1]]; };
  const abajo = v, arriba = [-v[0], -v[1]];
  const A = (i, dir, r, k = 1) => ({ p: L[i], dir: [dir[0] * k, dir[1] * k], r: r * ipd });
  // where each control pulls, in which direction and how far its pull reaches
  const ANCLAS = {
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
  };
  const valores = Object.fromEntries(CONTROLES.map(x => [x[0], 0]));
  let mezcla = 1; // 0 shows the original, 1 the full change

  function campo(x, y) {
    let dx = 0, dy = 0;
    for (const k in valores) {
      const a = valores[k] * mezcla; if (!a) continue;
      let sx = 0, sy = 0, sw = 0;
      for (const an of ANCLAS[k]) {
        const d2 = ((x - an.p.x) ** 2 + (y - an.p.y) ** 2) / (an.r * an.r); if (d2 > 9) continue;
        const w = Math.exp(-d2); sx += w * an.dir[0]; sy += w * an.dir[1]; sw += w;
      }
      if (!sw) continue;
      const n = Math.max(1, sw); dx += a * mm * sx / n; dy += a * mm * sy / n;
    }
    return [dx, dy];
  }

  // stage: the same 4:5 frame around the face the viewer uses
  const b = base.caja, fw = b.x1 - b.x0, fh = b.y1 - b.y0;
  let vh = Math.min(H, fh * 1.75), vw = vh * 0.8;
  if (vw > W) { vw = W; vh = Math.min(H, vw / 0.8); }
  const vx = Math.max(0, Math.min(W - vw, (b.x0 + b.x1) / 2 - vw / 2)), vy = Math.max(0, Math.min(H - vh, (b.y0 + b.y1) / 2 - fh * 0.06 - vh / 2));
  const cv = $("#simCanvas"), cw = 600, ch = Math.round(cw * vh / vw), esc2 = cw / vw;
  cv.width = cw; cv.height = ch; $("#simStage").style.aspectRatio = cw + " / " + ch;
  const g = cv.getContext("2d");
  const NX = 30, NY = Math.round(NX * vh / vw), gx = vw / NX, gy = vh / NY;

  function tri(s0, s1, s2, d0, d1, d2) {
    const den = s0[0] * (s1[1] - s2[1]) + s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]); if (!den) return;
    const f = (q0, q1, q2) => [
      (q0 * (s1[1] - s2[1]) + q1 * (s2[1] - s0[1]) + q2 * (s0[1] - s1[1])) / den,
      (q0 * (s2[0] - s1[0]) + q1 * (s0[0] - s2[0]) + q2 * (s1[0] - s0[0])) / den,
      (q0 * (s1[0] * s2[1] - s2[0] * s1[1]) + q1 * (s2[0] * s0[1] - s0[0] * s2[1]) + q2 * (s0[0] * s1[1] - s1[0] * s0[1])) / den];
    const [a, cc, e] = f(d0[0], d1[0], d2[0]), [bb, dd, ff] = f(d0[1], d1[1], d2[1]);
    // grow the clip a little from its centre so neighbouring triangles overlap and no seams show
    const mx = (d0[0] + d1[0] + d2[0]) / 3, my = (d0[1] + d1[1] + d2[1]) / 3, k = 1.06;
    g.save(); g.beginPath();
    g.moveTo(mx + (d0[0] - mx) * k, my + (d0[1] - my) * k); g.lineTo(mx + (d1[0] - mx) * k, my + (d1[1] - my) * k); g.lineTo(mx + (d2[0] - mx) * k, my + (d2[1] - my) * k);
    g.closePath(); g.clip(); g.setTransform(a, bb, cc, dd, e, ff);
    const x0 = Math.max(0, Math.min(s0[0], s1[0], s2[0]) - 2), y0 = Math.max(0, Math.min(s0[1], s1[1], s2[1]) - 2);
    const x1 = Math.min(W, Math.max(s0[0], s1[0], s2[0]) + 2), y1 = Math.min(H, Math.max(s0[1], s1[1], s2[1]) + 2);
    g.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    g.restore();
  }
  function pintar() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(img, vx, vy, vw, vh, 0, 0, cw, ch);
    if (!mezcla || !Object.values(valores).some(Boolean)) return;
    const S = [], D = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const x = vx + i * gx, y = vy + j * gy, [dx, dy] = campo(x, y);
      S.push([x, y]); D.push([(x + dx - vx) * esc2, (y + dy - vy) * esc2, dx || dy]);
    }
    const n = NX + 1;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * n + i, b2 = a + 1, c2 = a + n, d2 = c2 + 1;
      if (!(D[a][2] || D[b2][2] || D[c2][2] || D[d2][2])) continue; // untouched cells keep the original pixels
      tri(S[a], S[b2], S[c2], D[a], D[b2], D[c2]); tri(S[b2], S[d2], S[c2], D[b2], D[d2], D[c2]);
    }
  }

  const antes = base.medidas, a0 = armonia(antes);
  function medirAhora() {
    const L2 = L.map(p => { const [dx, dy] = campo(p.x, p.y); return { x: p.x + dx, y: p.y + dy }; });
    return medir(L2, sexo);
  }
  function resumenUI() {
    const prev = mezcla; mezcla = 1; const ahora = medirAhora(); mezcla = prev;
    const a1 = armonia(ahora), d = a1 - a0, sg = (x) => (x > 0 ? "+" : "") + x.toFixed(1);
    const cls = Math.abs(d) < 0.05 ? "" : d > 0 ? "sube" : "baja";
    const html = `<span class="mono">${a0.toFixed(1)}</span><span class="sim-fl">→</span><b class="mono">${a1.toFixed(1)}</b><em class="sim-d ${cls}">${sg(d)}</em>`;
    $("#simScore").innerHTML = html; $("#simNow").innerHTML = `<b>Antes y después</b><i class="sim-mini">${html}</i>`;
    const cambios = ahora.map((m, i) => ({ m, o: antes[i], d: (m.puntaje - antes[i].puntaje) / 10 })).filter(x => Math.abs(x.d) >= 0.2).sort((p, q) => Math.abs(q.d) - Math.abs(p.d)).slice(0, 8);
    $("#simDelta").innerHTML = cambios.length ? cambios.map(x => `<div class="sim-row"><span>${esc(x.m.nombre)}<small class="mono">${x.o.valor}${x.o.unidad || ""} → ${x.m.valor}${x.m.unidad || ""}</small></span><em class="sim-d ${x.d > 0 ? "sube" : "baja"}">${sg(x.d)}</em><b class="mono">${(x.m.puntaje / 10).toFixed(1)}</b></div>`).join("")
      : '<p class="hint" style="padding:8px 0">Mueve un control para ver qué medidas cambian.</p>';
    const z0 = resumen(antes).zonas, z1 = resumen(ahora).zonas;
    $("#simZonas").innerHTML = z1.map((z, i) => `<div class="visor-zone"><span>${esc(z.nombre)}</span><i><b style="width:${z.puntaje}%"></b></i><em class="mono">${(z.puntaje / 10).toFixed(1)}</em></div>`).join("");
  }

  let pend = false;
  const refrescar = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; pintar(); resumenUI(); }); };

  const grupos = [...new Set(CONTROLES.map(x => x[2]))];
  $("#simCtl").innerHTML = grupos.map(gr => `<div class="card sim-g"><p class="label">${gr}</p>${CONTROLES.filter(x => x[2] === gr).map(([k, n, , max, izq, der]) =>
    `<label class="sim-c"><span class="sim-c-t"><span>${n}</span><em class="mono" data-v="${k}">0 mm</em></span><input type="range" min="${-max}" max="${max}" step="0.5" value="0" data-k="${k}" aria-label="${n}"><span class="sim-c-e"><small>${izq}</small><small>${der}</small></span></label>`).join("")}</div>`).join("");
  $("#simCtl").querySelectorAll("input").forEach(inp => inp.addEventListener("input", () => {
    valores[inp.dataset.k] = +inp.value;
    $(`#simCtl [data-v="${inp.dataset.k}"]`).textContent = (inp.value > 0 ? "+" : "") + inp.value + " mm";
    refrescar();
  }));
  $("#simReset").onclick = () => {
    for (const k in valores) valores[k] = 0;
    $("#simCtl").querySelectorAll("input").forEach(i => { i.value = 0; }); $("#simCtl").querySelectorAll("[data-v]").forEach(e => { e.textContent = "0 mm"; });
    refrescar();
  };
  const orig = $("#simOrig"), ver = (si) => { mezcla = si ? 0 : 1; pintar(); orig.classList.toggle("on", si); };
  ["pointerdown"].forEach(e => orig.addEventListener(e, (ev) => { ev.preventDefault(); ver(true); }));
  ["pointerup", "pointerleave", "pointercancel"].forEach(e => orig.addEventListener(e, () => ver(false)));
  orig.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); ver(true); } });
  orig.addEventListener("keyup", () => ver(false));

  pintar(); resumenUI();
}
