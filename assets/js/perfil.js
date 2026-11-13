// Side-profile measurements. The face landmark model does not work well at 90 degrees, so the
// profile is read from the silhouette: the photo is segmented, the front edge of the head is traced
// and the classic soft-tissue points are found as the bumps and dips of that edge.
import { ImageSegmenter, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

let seg = null;
async function getSegmenter() {
  if (seg) return seg;
  const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  seg = await ImageSegmenter.createFromOptions(fs, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite" },
    runningMode: "IMAGE", outputCategoryMask: true, outputConfidenceMasks: false
  });
  return seg;
}
export function precargarPerfil() { getSegmenter().catch(() => {}); }

const deg = (r) => (r * 180) / Math.PI;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function angleAt(v, a, b) {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x), a2 = Math.atan2(b.y - v.y, b.x - v.x);
  let x = Math.abs(deg(a1 - a2)); if (x > 180) x = 360 - x; return x;
}
// signed distance from p to the line a-b; positive on the side the face points to
function lado(p, a, b, d) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  const s = ((p.x - a.x) * dy - (p.y - a.y) * dx) / L;
  // normal (dy,-dx) points anterior when the face looks right (d=1) and the line runs top to bottom
  return s * (dy >= 0 ? 1 : -1) * d;
}
const round = (v, n = 2) => +v.toFixed(n);
function estado(v, lo, hi) {
  if (v >= lo && v <= hi) return "dentro";
  const span = hi - lo, off = v < lo ? lo - v : v - hi;
  return off <= span * 0.5 ? "cerca" : "fuera";
}
function puntaje(v, lo, hi, tipo) {
  const half = (hi - lo) / 2 || 1;
  let z;
  if (tipo === "alto") z = Math.max(0, hi - v) / half;
  else if (tipo === "bajo") z = Math.max(0, v - lo) / half;
  else z = Math.abs(v - (lo + hi) / 2) / half;
  return Math.round(100 / (1 + Math.pow(z / 1.6, 2)));
}

export const ZONAS_PERFIL = [
  ["nariz", "Nariz"],
  ["labios", "Labios"],
  ["menton", "Mentón y perfil"],
  ["cuello", "Cuello y mandíbula"],
  ["proporciones", "Proporciones"]
];

// image: HTMLImageElement / ImageBitmap / canvas. sexo: "hombre" | "mujer" | undefined
export async function analizarPerfil(image, sexo) {
  const s = await getSegmenter();
  const W = image.naturalWidth || image.width, Hh = image.naturalHeight || image.height;
  const mascara = (src) => {
    const res = s.segment(src); const m = res.categoryMask;
    const o = { mw: m.width, mh: m.height, cat: m.getAsUint8Array().slice() }; m.close && m.close(); return o;
  };
  // First pass on the whole photo only to find the head, second pass on a close crop so the edge is finer.
  const p1 = mascara(image);
  let bx0 = p1.mw, bx1 = 0, by0 = p1.mh, by1 = 0, n1 = 0;
  for (let y = 0; y < p1.mh; y++) for (let x = 0; x < p1.mw; x++) if (p1.cat[y * p1.mw + x] === 3) { n1++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  if (n1 < p1.mw * p1.mh * 0.01) throw new Error("sin_cara");
  const k1x = W / p1.mw, k1y = Hh / p1.mh, hs = (by1 - by0) * k1y;
  let cy0 = Math.max(0, by0 * k1y - 0.35 * hs), cy1 = Math.min(Hh, by1 * k1y + 0.8 * hs);
  let lado0 = cy1 - cy0, ccx = ((bx0 + bx1) / 2) * k1x;
  let cx0 = Math.max(0, Math.min(W - Math.min(W, lado0), ccx - lado0 / 2)), cw = Math.min(W, lado0);
  const lienzo = document.createElement("canvas"); const esc = Math.min(1, 1024 / Math.max(cw, lado0));
  lienzo.width = Math.round(cw * esc); lienzo.height = Math.round(lado0 * esc);
  lienzo.getContext("2d").drawImage(image, cx0, cy0, cw, lado0, 0, 0, lienzo.width, lienzo.height);
  const { mw, mh, cat } = mascara(lienzo);
  const sx = cw / mw, sy = lado0 / mh, ox = cx0, oy = cy0;
  const at = (x, y) => cat[y * mw + x];
  const persona = (x, y) => at(x, y) !== 0;

  // which way the face looks: face skin sits in front of the hair
  let fx = 0, fn = 0, hx = 0, hn = 0, yTop = mh, yBotSkin = 0;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const c = at(x, y);
    if (c === 3) { fx += x; fn++; if (y < yTop) yTop = y; if (y > yBotSkin) yBotSkin = y; }
    else if (c === 1) { hx += x; hn++; }
  }
  if (fn < mw * mh * 0.01) throw new Error("sin_cara");
  const fcx = fx / fn;
  const d = hn > fn * 0.1 ? Math.sign(fcx - hx / hn) || 1 : (fcx > mw / 2 ? 1 : -1);

  // front edge of the person in every row, as "how far forward" (a) and x
  const frente = new Array(mh).fill(null);
  for (let y = 0; y < mh; y++) {
    if (d > 0) { for (let x = mw - 1; x >= 0; x--) if (persona(x, y)) { frente[y] = x; break; } }
    else { for (let x = 0; x < mw; x++) if (persona(x, y)) { frente[y] = x; break; } }
  }
  const aRaw = frente.map(x => x === null ? null : d * x);
  // light smoothing of the edge
  const k = Math.max(1, Math.round(mh * 0.004));
  const a = aRaw.map((v, y) => {
    if (v === null) return null;
    let s2 = 0, n = 0;
    for (let j = y - k; j <= y + k; j++) if (j >= 0 && j < mh && aRaw[j] !== null) { s2 += aRaw[j]; n++; }
    return s2 / n;
  });
  const P = (y) => ({ x: ox + frente[y] * sx + sx / 2, y: oy + y * sy + sy / 2 });
  const arg = (y0, y1, fn2) => {
    y0 = Math.max(0, Math.round(y0)); y1 = Math.min(mh - 1, Math.round(y1));
    let best = null;
    for (let y = y0; y <= y1; y++) if (a[y] !== null && (best === null || fn2(a[y], a[best]))) best = y;
    return best;
  };
  const max = (y0, y1) => arg(y0, y1, (p, q) => p > q);
  const min = (y0, y1) => arg(y0, y1, (p, q) => p < q);

  // rough face height from the visible skin, refined once the chin is found
  let H = Math.max(10, (yBotSkin - yTop) * 1.05);
  const yPrn = max(yTop + 0.25 * H, yTop + 0.72 * H);
  if (yPrn === null) throw new Error("perfil_no_claro");
  const ySn = min(yPrn + 0.01 * H, yPrn + 0.14 * H);
  const yLs = max(ySn + 0.01 * H, ySn + 0.13 * H);
  const yLi = max(yLs + 0.04 * H, yLs + 0.17 * H);
  const ySto = min(yLs, yLi);
  const yB = min(yLi + 0.01 * H, yLi + 0.14 * H);
  const yPog = max(yB + 0.01 * H, yB + 0.16 * H);
  if ([ySn, yLs, yLi, yB, yPog].some(v => v === null)) throw new Error("perfil_no_claro");

  // contour under the chin: bottom of the person in every column, walking from the chin back to the neck
  const xPog = frente[yPog];
  const sub = [];
  for (let i = 0; i < mw; i++) {
    const x = xPog - d * i; if (x < 0 || x >= mw) break;
    let y = yPog; while (y < mh && persona(x, y)) y++;
    if (y >= mh || y - yPog > 0.6 * H) break;
    sub.push({ x, y });
  }
  if (sub.length < 6) throw new Error("perfil_no_claro");
  // menton: the point of the chin furthest down and forward
  let me = sub[0], mejor = -1e9;
  sub.forEach(p => { const v = p.y * sy + d * p.x * sx; if (v > mejor) { mejor = v; me = p; } });
  const ne = sub[sub.length - 1];
  // cervical point: the corner between the line under the chin and the neck
  let c = null, prof = 0;
  { const dx = ne.x - me.x, dy = ne.y - me.y, L = Math.hypot(dx * sx, dy * sy) || 1;
    sub.forEach(p => { if (d * (me.x - p.x) <= 0) return;
      const t = Math.abs((p.x - me.x) * sx * dy * sy - (p.y - me.y) * sy * dx * sx) / L;
      if (t > prof) { prof = t; c = p; } }); }
  if (!c) throw new Error("perfil_no_claro");
  const toImg = (p) => ({ x: ox + p.x * sx + sx / 2, y: oy + p.y * sy + sy / 2 });
  const Me = toImg(me), C = toImg(c), Ne = prof > 0.02 * H * sy ? toImg(ne) : null;

  // nasion: deepest point between the brow and the nose tip, searched where the proportions say it should be
  const Lf = me.y - ySn;
  const yTopN = Math.max(yTop, Math.round(ySn - 1.2 * Lf)), yBotN = Math.round(yPrn - 0.3 * Lf);
  let yN = null, hondo = -1e9;
  if (a[yTopN] === null) throw new Error("perfil_no_claro");
  for (let y = yTopN; y <= yBotN; y++) { if (a[y] === null) continue;
    const t = (y - yTopN) / (yPrn - yTopN), cuerda = a[yTopN] + t * (a[yPrn] - a[yTopN]);
    if (cuerda - a[y] > hondo) { hondo = cuerda - a[y]; yN = y; } }
  if (yN === null) throw new Error("perfil_no_claro");
  const yG = max(yN - 0.32 * Lf, yN - 0.04 * Lf);
  if (yG === null) throw new Error("perfil_no_claro");

  const G = P(yG), N = P(yN), Prn = P(yPrn), Sn = P(ySn), Ls = P(yLs), Sto = P(ySto), Li = P(yLi), B = P(yB), Pog = P(yPog);
  const yCm = Math.round(ySn - 0.45 * (ySn - yPrn)), Cm = P(yCm);
  // order sanity check: every point below the previous one and the nose tip in front
  const orden = [G, N, Prn, Sn, Ls, Li, B, Pog, Me];
  for (let i = 1; i < orden.length; i++) if (orden[i].y < orden[i - 1].y - 2) throw new Error("perfil_no_claro");

  const mm = (sexo === "mujer" ? 115 : sexo === "hombre" ? 125 : 120) / Math.abs(Me.y - N.y); // N-Me ≈ 120 mm
  const fwd = (p, q) => d * (p.x - q.x); // how far p sits in front of q, px
  const mujer = sexo === "mujer";

  const out = [];
  const add = (x) => {
    x.valor = round(x.valor, x.unidad === "°" ? 1 : x.unidad === " mm" ? 1 : 2);
    x.estado = estado(x.valor, x.rango[0], x.rango[1]);
    x.puntaje = puntaje(x.valor, x.rango[0], x.rango[1], x.tipo);
    out.push(x);
  };

  add({ id: "nasofrontal", zona: "nariz", nombre: "Ángulo nasofrontal", unidad: "°",
    valor: angleAt(N, G, Prn), rango: mujer ? [120, 140] : [115, 135],
    lineas: [[G, N], [N, Prn]],
    que: "El ángulo que forma la frente con el dorso de la nariz, medido en el punto más hundido entre los ojos.",
    significa: "Un ángulo dentro del rango marca bien el inicio de la nariz. Muy abierto, la nariz arranca sin transición desde la frente; muy cerrado, el entrecejo se ve hundido." });

  add({ id: "nasolabial", zona: "nariz", nombre: "Ángulo nasolabial", unidad: "°",
    valor: angleAt(Sn, Cm, Ls), rango: mujer ? [95, 115] : [90, 105],
    lineas: [[Cm, Sn], [Sn, Ls]],
    que: "El ángulo entre la parte de abajo de la nariz y el labio superior.",
    significa: "Dice si la punta de la nariz está caída, recta o levantada. Abierto de más se ve una punta respingada; cerrado, una punta que cae sobre el labio." });

  add({ id: "nasofacial", zona: "nariz", nombre: "Ángulo nasofacial", unidad: "°",
    valor: angleAt(N, Prn, Pog), rango: [30, 40],
    lineas: [[N, Prn], [N, Pog]],
    que: "El ángulo entre el dorso de la nariz y la línea que baja del entrecejo al mentón.",
    significa: "Mide qué tanto sobresale la nariz respecto a la cara. Por encima del rango la nariz se proyecta mucho; por debajo, se ve chica o plana de perfil." });

  add({ id: "nasomental", zona: "nariz", nombre: "Ángulo nasomental", unidad: "°",
    valor: angleAt(Prn, N, Pog), rango: [120, 132],
    lineas: [[Prn, N], [Prn, Pog]],
    que: "El ángulo con vértice en la punta de la nariz, entre el entrecejo y el mentón.",
    significa: "Relaciona nariz y mentón. Bajo, la nariz domina el perfil o el mentón queda atrás; alto, la nariz se ve pequeña para el perfil." });

  const eLs = lado(Ls, Prn, Pog, d) * mm, eLi = lado(Li, Prn, Pog, d) * mm;
  add({ id: "e_superior", zona: "labios", nombre: "Labio superior contra la línea E", unidad: " mm",
    valor: eLs, rango: [-6, -2],
    lineas: [[Prn, Pog], [Ls, Ls]],
    que: "Distancia del labio superior a la línea que va de la punta de la nariz al mentón. Negativo es detrás de la línea.",
    significa: "La referencia es que el labio quede unos milímetros detrás. Muy atrás, labios que se ven delgados o un perfil hundido; delante, labios que protruyen." });
  add({ id: "e_inferior", zona: "labios", nombre: "Labio inferior contra la línea E", unidad: " mm",
    valor: eLi, rango: [-4, 0],
    lineas: [[Prn, Pog], [Li, Li]],
    que: "Distancia del labio inferior a la misma línea de nariz a mentón.",
    significa: "Lo esperado es que quede justo detrás o tocando la línea. Delante de ella suele significar mentón retraído o labio protruido." });
  add({ id: "holdaway", zona: "labios", nombre: "Ángulo H de Holdaway", unidad: "°",
    valor: angleAt(Pog, Ls, N), rango: [7, 15],
    lineas: [[Pog, Ls], [Pog, N]],
    que: "El ángulo entre la línea labio superior a mentón y la línea entrecejo a mentón.",
    significa: "Resume el balance entre labios y mentón. Alto, labios adelantados o mentón atrás; bajo, labios retraídos." });
  add({ id: "labios_perfil", zona: "labios", nombre: "Labio superior por delante del inferior", unidad: " mm",
    valor: fwd(Ls, Li) * mm, rango: [0, 3],
    lineas: [[Ls, Li]],
    que: "Cuánto sobresale el labio superior respecto al inferior.",
    significa: "Lo común es que el superior vaya un poco por delante. Si el inferior sobresale más, suele haber mentón o mandíbula adelantados." });

  add({ id: "convexidad", zona: "menton", nombre: "Convexidad del perfil", unidad: "°",
    valor: angleAt(Sn, G, Pog), rango: [162, 172],
    lineas: [[G, Sn], [Sn, Pog]],
    que: "El ángulo entre la frente, la base de la nariz y el mentón. 180 sería un perfil totalmente recto.",
    significa: "Un perfil ligeramente convexo es lo más común y armónico. Muy bajo, mentón retraído o tercio medio adelantado; muy alto, perfil plano o mentón adelantado." });
  add({ id: "mentolabial", zona: "menton", nombre: "Ángulo mentolabial", unidad: "°",
    valor: angleAt(B, Li, Pog), rango: [105, 130],
    lineas: [[Li, B], [B, Pog]],
    que: "El ángulo del pliegue entre el labio inferior y el mentón.",
    significa: "Cerrado marca un pliegue profundo; abierto, una transición plana entre labio y mentón." });
  add({ id: "menton_vertical", zona: "menton", nombre: "Posición del mentón", unidad: " mm",
    valor: fwd(Pog, Sn) * mm, rango: mujer ? [-6, -1] : [-4, 1],
    lineas: [[Sn, { x: Sn.x, y: Pog.y }], [{ x: Sn.x, y: Pog.y }, Pog]],
    que: "Cuánto queda el mentón por delante o por detrás de una vertical que baja de la base de la nariz. Supone la cabeza derecha en la foto.",
    significa: "Un mentón un poco detrás de esa vertical es lo esperado. Mucho más atrás se percibe como mentón débil; delante, como mentón prominente." });

  if (Ne) add({ id: "cervicomental", zona: "cuello", nombre: "Ángulo cervicomental", unidad: "°",
    valor: angleAt(C, Me, Ne), rango: [100, 120],
    lineas: [[Me, C], [C, Ne]],
    que: "El ángulo entre la parte de abajo del mentón y el cuello.",
    significa: "Es lo que hace ver una mandíbula definida de perfil. Cerrado y marcado se ve definido; abierto, el contorno se pierde entre mentón y cuello." });
  add({ id: "submental", zona: "cuello", nombre: "Largo bajo el mentón", unidad: "",
    valor: dist(Me, C) / Math.abs(Me.y - N.y), rango: [0.38, 0.55],
    lineas: [[Me, C]],
    que: "Largo de la línea bajo el mentón, del mentón al cuello, en proporción a la altura de la cara.",
    significa: "Una línea larga y recta bajo el mentón da un perfil definido. Corta, el cuello empieza casi en el mentón." });

  add({ id: "tercio_inferior_perfil", zona: "proporciones", nombre: "Tercio inferior de perfil", unidad: "",
    valor: Math.abs(Me.y - Sn.y) / Math.abs(Me.y - N.y), rango: [0.53, 0.59],
    lineas: [[N, Sn], [Sn, Me]],
    que: "Altura de la base de la nariz al mentón dividida entre la altura del entrecejo al mentón.",
    significa: "Fuera del rango por arriba, el tercio inferior se ve largo; por abajo, corto." });
  add({ id: "nariz_largo", zona: "proporciones", nombre: "Largo de la nariz", unidad: "",
    valor: dist(N, Prn) / Math.abs(Me.y - N.y), rango: [0.38, 0.46],
    lineas: [[N, Prn]],
    que: "Largo del dorso de la nariz, del entrecejo a la punta, contra la altura de la cara.",
    significa: "Arriba del rango la nariz se percibe larga; abajo, corta." });

  const puntos = { G, N, Prn, Cm, Sn, Ls, Sto, Li, B, Pog, Me, C, Ne };
  const ps = Object.values(puntos).filter(Boolean);
  const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
  const caja = { x0: Math.min(...xs) - (d < 0 ? 0 : 0.35 * H * sx), x1: Math.max(...xs) + (d > 0 ? 0 : 0.35 * H * sx), y0: Math.min(...ys), y1: Math.max(...ys) };
  const zonas = ZONAS_PERFIL.map(([id, nombre]) => {
    const ms = out.filter(x => x.zona === id);
    return { id, nombre, puntaje: ms.length ? Math.round(ms.reduce((t, x) => t + x.puntaje, 0) / ms.length) : null };
  }).filter(z => z.puntaje !== null);
  const avisos = [];
  if (yTop < 2) avisos.push("La cabeza queda cortada arriba en la foto.");
  if ((yPog - yTop) < mh * 0.25) avisos.push("La cara se ve pequeña en la foto de perfil. Acércate un poco más.");
  return {
    tipo: "perfil", mira: d > 0 ? "derecha" : "izquierda", ancho: W, alto: Hh, caja, puntos,
    zonas: ZONAS_PERFIL.filter(([id]) => zonas.some(z => z.id === id)),
    medidas: out, avisos,
    resumen: { zonas, general: Math.round(zonas.reduce((t, z) => t + z.puntaje, 0) / zonas.length) }
  };
}
