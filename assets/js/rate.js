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
  [[9, 2], [2, 152]].forEach(([a, b]) => { const [x1, y1] = p(a), [, y2] = p(b); g.setLineDash([]); g.beginPath(); g.moveTo(x1 + W * 0.18, y1); g.lineTo(x1 + W * 0.18, y2); g.stroke(); });
  [33, 133, 362, 263, 234, 454, 172, 397, 152, 2, 9, 61, 291, 13].forEach(i => { const [x, y] = p(i); g.beginPath(); g.arc(x, y, Math.max(3, W / 250), 0, 7); g.fill(); });
}

go.addEventListener("click", async () => {
  if (!img || !adult.checked) return;
  go.disabled = true; go.textContent = "Midiendo tu rostro…"; msg.className = "msg";
  try {
    const lm = await getLandmarker();
    const res = lm.detect(img);
    const faces = res.faceLandmarks || [];
    if (faces.length === 0) throw new Error("noface");
    if (faces.length > 1) throw new Error("many");
    const L = faces[0];
    const m = measure(L);
    if (m.yaw > 0.18) throw new Error("turned");
    draw(L);
    show(m);
  } catch (e) {
    const t = { noface: "No encontramos una cara en la foto. Prueba con una foto de frente y buena luz.", many: "Hay más de una cara en la foto. Usa una foto donde solo salgas tú.", turned: "Tu cara está muy girada. Mira directo a la cámara y vuelve a intentar." }[e.message];
    say(t || "No pudimos analizar la foto. Revisa tu conexión e inténtalo de nuevo.");
  } finally { go.disabled = false; go.textContent = "Calcular mi puntaje"; }
});

function show(m) {
  $("#rateStart").hidden = true; $("#rateResult").hidden = false;
  const sc = $("#rScore"); let n = 0;
  const step = () => { n = Math.min(m.score, n + 2); sc.textContent = n; if (n < m.score) requestAnimationFrame(step); };
  step();
  $("#rVerdict").textContent = m.score >= 80 ? "Rostro muy armónico. Tu plan se enfocaría en detalles finos." : m.score >= 65 ? "Buena base. Hay varias mejoras claras al alcance." : "Mucho potencial. Los cambios correctos se van a notar bastante.";
  const sorted = [...m.parts].sort((a, b) => b.v - a.v);
  const free = ["Simetría", "Tercios faciales"];
  $("#rRows").innerHTML = m.parts.map(p => {
    const open = free.includes(p.k);
    return `<div class="report-row"><span>${p.k}</span><b class="mono ${open ? "" : "lock"}" style="${open ? "" : "filter:blur(5px)"}">${Math.round(p.v)}</b></div>`;
  }).join("") + `<p class="hint" style="margin-top:8px">Tu rasgo más fuerte: <b>${sorted[0].k.toLowerCase()}</b>.</p>`;
  const weak = sorted[sorted.length - 1];
  $("#rWeak").innerHTML = `<b>${weak.k}.</b> ${weak.tip}`;
  window.__resaltaScore = m;
  scrollTo({ top: 0, behavior: "smooth" });
}

$("#rateAgain").addEventListener("click", () => { $("#rateResult").hidden = true; $("#rateStart").hidden = false; });

$("#leadForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const m2 = $("#leadMsg"), email = ev.target.email.value.trim();
  const C = window.RESALTA || {};
  if (!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase)) {
    m2.textContent = "Estamos activando los envíos por correo. Vuelve a intentarlo en unos días."; m2.className = "msg show err";
    return;
  }
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  const m = window.__resaltaScore || {};
  const { error } = await sb.from("leads").insert({ email, score: m.score ?? null, source: "calificacion" });
  m2.textContent = error ? "No pudimos guardar tu correo. Inténtalo de nuevo." : "Listo. Revisa tu correo en unos minutos.";
  m2.className = "msg show " + (error ? "err" : "ok");
});
