// Free facial harmony score. Runs entirely in the browser: the photo is never uploaded.
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const $ = (s) => document.querySelector(s);
const file = $("#rateFile"), adult = $("#rateAdult"), go = $("#rateGo"), msg = $("#rateMsg");
let img = null, landmarker = null;

function say(t, type = "err") { msg.textContent = t; msg.className = "msg show " + type; }
function ready() { go.disabled = !(img && adult.checked); }
adult.addEventListener("change", ready);

file.addEventListener("change", async () => {
  msg.className = "msg";
  const f = file.files[0]; if (!f) return;
  if (!/^image\//.test(f.type)) return say("Ese archivo no es una imagen.");
  img = await createImageBitmap(f);
  const slot = $("#rateDrop");
  let p = slot.querySelector("img"); if (!p) { p = document.createElement("img"); slot.prepend(p); }
  p.src = URL.createObjectURL(f); slot.classList.add("done");
  getLandmarker().catch(() => {}); // start loading the face model while they tick the box
  ready();
});

async function getLandmarker() {
  if (landmarker) return landmarker;
  const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  landmarker = await FaceLandmarker.createFromOptions(fs, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
    runningMode: "IMAGE", numFaces: 2
  });
  return landmarker;
}

// ---- geometry helpers
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v) => Math.max(0, Math.min(100, v));
const near = (v, ideal, tol) => clamp(100 * (1 - Math.abs(v - ideal) / tol));
function reflect(p, a, b) { // reflect p across line a-b
  const dx = b.x - a.x, dy = b.y - a.y, t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const fx = a.x + t * dx, fy = a.y + t * dy;
  return { x: 2 * fx - p.x, y: 2 * fy - p.y };
}

function measure(L) {
  const P = (i) => L[i];
  const faceW = d(P(234), P(454));
  // symmetry: mirrored landmark pairs across the facial midline
  const pairs = [[33, 263], [133, 362], [61, 291], [234, 454], [172, 397], [70, 300], [105, 334], [50, 280], [58, 288], [127, 356]];
  const a = P(168), b = P(152);
  const dev = pairs.reduce((s, [l, r]) => s + d(P(l), reflect(P(r), a, b)), 0) / pairs.length / faceW;
  const symmetry = clamp(100 * (1 - dev / 0.09));
  // facial thirds: brow-to-nose vs nose-to-chin
  const mid = d(P(9), P(2)), low = d(P(2), P(152));
  const thirds = near(low / mid, 1.0, 0.45);
  // lower third: nose-to-lips vs lips-to-chin (ideal 1:2)
  const upperLip = d(P(2), P(13)), chin = d(P(13), P(152));
  const lowerThird = near(chin / upperLip, 2.0, 1.1);
  // eyes: spacing vs eye width (ideal ~1)
  const eyeW = (d(P(33), P(133)) + d(P(362), P(263))) / 2;
  const eyes = near(d(P(133), P(362)) / eyeW, 1.0, 0.5);
  // canthal tilt: angle of each eye (inner to outer corner) against the line between the eyes; ideal ~ +5°
  const ux0 = P(263).x - P(33).x, uy0 = P(263).y - P(33).y, un = Math.hypot(ux0, uy0);
  const u = { x: ux0 / un, y: uy0 / un }, nrm = { x: -u.y, y: u.x };
  const eyeTilt = (outer, inner, dir) => {
    const v = { x: P(outer).x - P(inner).x, y: P(outer).y - P(inner).y };
    const along = (v.x * u.x + v.y * u.y) * dir, up = -(v.x * nrm.x + v.y * nrm.y);
    return Math.atan2(up, along) * 180 / Math.PI;
  };
  const tiltL = eyeTilt(33, 133, -1), tiltR = eyeTilt(263, 362, 1);
  const tilt = near((tiltL + tiltR) / 2, 5, 10);
  // jaw: bigonial vs bizygomatic width
  const jaw = near(d(P(172), P(397)) / faceW, 0.86, 0.22);
  // face width-to-height (bizygomatic / nasion-to-upper-lip)
  const fwhr = near(faceW / d(P(168), P(0)), 1.95, 0.6);
  // head turned too much? compare left/right half widths
  const yaw = Math.abs(d(P(1), P(234)) - d(P(1), P(454))) / faceW;

  const parts = [
    { k: "Simetría", v: symmetry, w: 0.24, tip: "Pequeñas asimetrías se notan menos con el corte, la barba y la postura correctos." },
    { k: "Tercios faciales", v: thirds, w: 0.18, tip: "El equilibrio entre la parte media y baja de tu cara se puede compensar con cabello y barba." },
    { k: "Tercio inferior", v: lowerThird, w: 0.14, tip: "La proporción entre labio y mentón se puede equilibrar visualmente con la barba." },
    { k: "Ojos", v: eyes, w: 0.14, tip: "La forma de tus cejas cambia mucho cómo se perciben tus ojos." },
    { k: "Inclinación de ojos", v: tilt, w: 0.1, tip: "Cejas, descanso y piel de la zona de los ojos cambian tu mirada." },
    { k: "Mandíbula", v: jaw, w: 0.12, tip: "Menos grasa facial, postura de cuello y barba bien definida marcan la mandíbula." },
    { k: "Proporción del rostro", v: fwhr, w: 0.08, tip: "El volumen del cabello arriba o a los lados cambia la proporción de tu cara." }
  ];
  const raw = parts.reduce((s, p) => s + p.v * p.w, 0);
  // compress into a realistic 35-95 band so scores read like a rating, not a test grade
  const score = Math.round(35 + raw * 0.6);
  return { score, parts, yaw };
}

function draw(L) {
  const c = $("#rateCanvas"), W = Math.min(1000, img.width), H = Math.round(img.height * W / img.width);
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, W, H);
  g.fillStyle = "rgba(22,25,29,.18)"; g.fillRect(0, 0, W, H);
  const p = (i) => [L[i].x * W, L[i].y * H];
  g.strokeStyle = "#FFFFFF"; g.fillStyle = "#FFFFFF"; g.lineWidth = Math.max(1.5, W / 600);
  const line = (a, b, dash) => { g.setLineDash(dash ? [6, 6] : []); g.beginPath(); g.moveTo(...p(a)); g.lineTo(...p(b)); g.stroke(); };
  line(10, 152, true); line(33, 263); line(234, 454); line(172, 152); line(397, 152);
  // facial thirds ruler: sits just outside the cheek, with a tick at brow, nose base and chin
  // and a faint guide from each point to the ruler, so it reads as a measurement of the face
  const rx = Math.min(W - 8, Math.max(p(454)[0], p(234)[0]) + W * 0.035), tk = Math.max(6, W / 90);
  g.setLineDash([]); g.beginPath(); g.moveTo(rx, p(9)[1]); g.lineTo(rx, p(152)[1]); g.stroke();
  [9, 2, 152].forEach(i => {
    const [x, y] = p(i);
    g.setLineDash([]); g.beginPath(); g.moveTo(rx - tk, y); g.lineTo(rx + tk, y); g.stroke();
    g.save(); g.globalAlpha = .45; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(x, y); g.lineTo(rx - tk, y); g.stroke(); g.restore();
  });
  [33, 133, 362, 263, 234, 454, 172, 397, 152, 2, 9, 61, 291, 13].forEach(i => { const [x, y] = p(i); g.beginPath(); g.arc(x, y, Math.max(3, W / 250), 0, 7); g.fill(); });
}

// ---- the flow: photo, processing, locked result, email, thanks
const pasos = [...document.querySelectorAll(".cal-paso")];
function ir(p) {
  pasos.forEach(x => x.classList.toggle("on", x.dataset.p === p));
  scrollTo({ top: 0, behavior: "smooth" });
}
const espera = ms => new Promise(r => setTimeout(r, ms));

// a short, visible scan: the steps tick one by one while the face is measured
async function procesar(L) {
  ir("proceso");
  const c = $("#scanCanvas"), W = Math.min(720, img.width), H = Math.round(img.height * W / img.width);
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, W, H);
  const items = [...document.querySelectorAll("#calPasos li")];
  items.forEach(li => li.className = "");
  for (let i = 0; i < items.length; i++) {
    items[i].className = "act";
    if (i === 0 && L) { // points appear while the first step runs
      g.fillStyle = "rgba(255,255,255,.85)";
      for (let k = 0; k < L.length; k += 3) { g.beginPath(); g.arc(L[k].x * W, L[k].y * H, Math.max(1, W / 420), 0, 7); g.fill(); if (k % 45 === 0) await espera(16); }
    } else await espera(950 + Math.random() * 400);
    items[i].className = "ok";
  }
  await espera(350);
}

go.addEventListener("click", async () => {
  if (!img || !adult.checked) return;
  go.disabled = true; go.textContent = "Preparando…"; msg.className = "msg";
  try {
    const lm = await getLandmarker();
    const res = lm.detect(img);
    const faces = res.faceLandmarks || [];
    if (faces.length === 0) throw new Error("noface");
    if (faces.length > 1) throw new Error("many");
    const L = faces[0];
    const m = measure(L);
    if (m.yaw > 0.18) throw new Error("turned");
    await procesar(L);
    draw(L);
    bloquear(m);
  } catch (e) {
    ir("foto");
    const t = { noface: "No encontramos una cara en la foto. Prueba con una foto de frente y buena luz.", many: "Hay más de una cara en la foto. Usa una foto donde solo salgas tú.", turned: "Tu cara está muy girada. Mira directo a la cámara y vuelve a intentar." }[e.message];
    say(t || "No pudimos analizar la foto. Revisa tu conexión e inténtalo de nuevo.");
  } finally { go.disabled = false; go.textContent = "Calcular mi puntaje"; }
});

// the result is shown blurred: the numbers are real but unreadable until they leave their email
let resultado = null;
function bloquear(m) {
  resultado = m;
  $("#rScore").textContent = String(Math.max(10, m.score)).replace(/\d/g, "8");
  $("#rRows").innerHTML = m.parts.map(p => `<div class="report-row"><span>${p.k}</span><b class="mono cal-borroso">88</b></div>`).join("");
  ir("bloqueado");
}

$("#leadForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target, m2 = $("#leadMsg"), b = f.querySelector("button");
  const nombre = f.nombre.value.trim().slice(0, 60), email = f.email.value.trim().toLowerCase();
  m2.className = "msg";
  if (!nombre) { m2.textContent = "Escribe tu nombre."; m2.className = "msg show err"; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { m2.textContent = "Escribe un correo válido."; m2.className = "msg show err"; return; }
  const C = window.RESALTA || {};
  b.disabled = true; b.textContent = "Enviando…";
  try {
    const m = resultado || {};
    const sorted = [...(m.parts || [])].sort((a, c) => c.v - a.v);
    const r = await fetch(`${C.SUPABASE_URL}/functions/v1/resultado-gratis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY, Authorization: `Bearer ${C.SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        nombre, email, score: m.score,
        partes: (m.parts || []).map(p => ({ k: p.k, v: Math.round(p.v), tip: p.tip })),
        fuerte: sorted[0] && sorted[0].k, debil: sorted.length ? { k: sorted[sorted.length - 1].k, tip: sorted[sorted.length - 1].tip } : null,
      }),
    });
    if (!r.ok) throw new Error(String(r.status));
    try { sessionStorage.setItem("resalta_lead", JSON.stringify({ nombre, email })); } catch (e) {}
    document.querySelectorAll("[data-cal-nombre]").forEach(e => { e.textContent = nombre.split(/\s+/)[0]; });
    document.querySelectorAll("[data-cal-email]").forEach(e => { e.textContent = email; });
    ir("gracias");
  } catch (e) {
    m2.textContent = "No pudimos enviarlo. Revisa tu correo e inténtalo de nuevo."; m2.className = "msg show err";
  } finally { b.disabled = false; b.textContent = "Enviarme mi resultado"; }
});
