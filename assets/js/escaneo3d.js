// 3D face scan: a slow head turn from side to side, read live with the face model.
// It keeps the 3D face mesh at each angle (and one small front picture), then shows the mesh
// turning on screen. Everything is measured on the device; only the result is handed back.
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

let lm = null;
async function cargar() {
  if (lm) return lm;
  const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate },
    runningMode: "VIDEO", numFaces: 2, outputFacialTransformationMatrixes: true,
  });
  try { lm = await FaceLandmarker.createFromOptions(fs, opts("GPU")); }
  catch (e) { lm = await FaceLandmarker.createFromOptions(fs, opts("CPU")); }
  return lm;
}

// angles we keep, in degrees; negative is the face turned toward the left of the picture
const BINS = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];

function pose(L, W, H) {
  const a = L[234], b = L[454], n = L[1];
  const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x), ancho = hi - lo;
  const r = ancho > 0 ? (n.x - lo) / ancho : 0.5;
  const yaw = Math.asin(Math.max(-1, Math.min(1, (r - 0.5) * 2))) * 180 / Math.PI;
  const oi = L[33], od = L[263];
  let roll = Math.abs(Math.atan2((od.y - oi.y) * H, (od.x - oi.x) * W) * 180 / Math.PI);
  if (roll > 90) roll = 180 - roll;
  let y0 = 1, y1 = 0, x0 = 1, x1 = 0;
  for (const p of L) { if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; }
  return { yaw, roll, alto: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// Turns a frame's landmarks into face-centred 3D points in pixel-like units.
function puntos(L, W, H) {
  const P = L.map(p => [p.x * W, p.y * H, p.z * W]);
  let cx = 0, cy = 0, cz = 0; for (const p of P) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= P.length; cy /= P.length; cz /= P.length;
  return P.map(p => [p[0] - cx, p[1] - cy, p[2] - cz]);
}

// Draws the mesh turned by `ang` degrees around the vertical axis.
export function dibujarMalla(ctx, P, aristas, ang, w, h, color = "255,255,255") {
  ctx.clearRect(0, 0, w, h);
  let r = 0; for (const p of P) r = Math.max(r, Math.hypot(p[0], p[1]));
  const k = (Math.min(w, h) * 0.42) / (r || 1), c = Math.cos(ang * Math.PI / 180), s = Math.sin(ang * Math.PI / 180);
  const Q = P.map(p => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]);
  let zmin = Infinity, zmax = -Infinity; for (const q of Q) { if (q[2] < zmin) zmin = q[2]; if (q[2] > zmax) zmax = q[2]; }
  ctx.lineWidth = 1;
  for (const [i, j] of aristas) {
    const A = Q[i], B = Q[j]; if (!A || !B) continue;
    const z = ((A[2] + B[2]) / 2 - zmin) / ((zmax - zmin) || 1); // 0 is nearest the viewer
    ctx.strokeStyle = `rgba(${color},${(0.85 - z * 0.7).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(w / 2 + A[0] * k, h / 2 + A[1] * k); ctx.lineTo(w / 2 + B[0] * k, h / 2 + B[1] * k); ctx.stroke();
  }
}
export function aristasMalla() { return (FaceLandmarker.FACE_LANDMARKS_TESSELATION || []).map(e => [e.start, e.end]); }

export async function escanear3d({ alTerminar }) {
  const ui = document.createElement("div");
  ui.className = "esc esc3d";
  ui.innerHTML = `
    <div class="esc-top"><button type="button" class="esc-x" aria-label="Cerrar escaneo">✕</button><div class="esc3d-bins">${BINS.map(b => `<i data-b="${b}"></i>`).join("")}</div><span style="width:40px"></span></div>
    <div class="esc-stage"><video playsinline muted autoplay class="espejo"></video><canvas class="esc3d-malla" hidden></canvas><div class="esc-oval"></div></div>
    <div class="esc-bottom">
      <p class="esc-t">Escaneo 3D</p><p class="esc-p"></p><p class="esc-h"></p>
      <div class="esc-acc"></div>
    </div>`;
  document.body.appendChild(ui); document.documentElement.classList.add("esc-on");
  const $ = s => ui.querySelector(s);
  const video = $("video");
  const estado = (p, h) => { $(".esc-p").textContent = p || ""; $(".esc-h").textContent = h || ""; };
  estado("Preparando la cámara", "Permite el acceso a la cámara cuando te lo pida tu navegador.");

  let stream = null, vivo = true, ultimo = 0, giroAnim = 0;
  const datos = {};
  let frente = null;

  function cerrar(res) {
    vivo = false; cancelAnimationFrame(giroAnim);
    if (stream) stream.getTracks().forEach(t => t.stop());
    ui.remove(); document.documentElement.classList.remove("esc-on");
    if (alTerminar) alTerminar(res || null);
  }
  $(".esc-x").onclick = () => cerrar(null);

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = stream; await video.play();
  } catch (e) {
    estado("No pudimos abrir la cámara", "Revisa que le diste permiso a tu navegador e inténtalo otra vez.");
    $(".esc-acc").innerHTML = '<button type="button" class="btn btn-primary">Cerrar</button>';
    $(".esc-acc button").onclick = () => cerrar(null);
    return;
  }
  estado("Cargando", "Un momento…");
  try { await cargar(); }
  catch (e) {
    estado("No pudimos preparar el escaneo", "Tu navegador no pudo cargar el modelo. Prueba en Chrome o Safari actualizados.");
    $(".esc-acc").innerHTML = '<button type="button" class="btn btn-primary">Cerrar</button>';
    $(".esc-acc button").onclick = () => cerrar(null);
    return;
  }

  const pintar = () => ui.querySelectorAll(".esc3d-bins i").forEach(d => d.classList.toggle("ok", !!datos[d.dataset.b]));
  function tomarFrente() {
    const W = video.videoWidth, H = video.videoHeight, esc = Math.min(1, 640 / W), c = document.createElement("canvas");
    c.width = Math.round(W * esc); c.height = Math.round(H * esc);
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    frente = c.toDataURL("image/jpeg", 0.8);
  }

  function ciclo() {
    if (!vivo) return;
    requestAnimationFrame(ciclo);
    if (video.readyState < 2) return;
    const now = performance.now(); if (now - ultimo < 50) return; ultimo = now;
    let r; try { r = lm.detectForVideo(video, now); } catch (e) { return; }
    const caras = r.faceLandmarks || [];
    const W = video.videoWidth, H = video.videoHeight;
    const faltan = BINS.filter(b => !datos[b]);
    let pide = "Gira la cabeza despacio hacia un lado y luego hacia el otro", aviso = "";
    if (!caras.length) aviso = "No vemos tu cara. Ponla dentro del óvalo.";
    else if (caras.length > 1) aviso = "Solo debe salir una persona.";
    else {
      const p = pose(caras[0], W, H);
      if (p.alto < 0.22) aviso = "Acércate un poco a la cámara.";
      else if (p.alto > 0.85) aviso = "Aléjate un poco de la cámara.";
      else if (Math.abs(p.cx - 0.5) > 0.2 || Math.abs(p.cy - 0.5) > 0.22) aviso = "Centra tu cara en el óvalo.";
      else if (p.roll > 12) aviso = "Endereza la cabeza, sin inclinarla.";
      else {
        const b = BINS.find(b => Math.abs(p.yaw - b) < 4);
        if (b !== undefined && !datos[b]) {
          datos[b] = { yaw: +p.yaw.toFixed(1), puntos: caras[0].map(q => [+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4)]) };
          if (b === 0) tomarFrente();
          pintar();
        }
        const izq = faltan.filter(x => x < 0).length, der = faltan.filter(x => x > 0).length;
        aviso = !faltan.length ? "" : izq && der ? "Muy bien, sigue girando despacio." : izq ? "Ahora gira hacia el otro lado." : der ? "Ahora gira hacia el otro lado." : "Regresa al frente.";
        if (faltan.length === 1 && faltan[0] === 0) aviso = "Regresa al frente y mira a la cámara.";
      }
    }
    estado(pide, aviso);
    if (!BINS.some(b => !datos[b])) terminar();
  }

  function terminar() {
    vivo = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    video.hidden = true; $(".esc-oval").hidden = true;
    const cv = $(".esc3d-malla"); cv.hidden = false;
    const ar = aristasMalla(), P = puntos(datos[0].puntos.map(q => ({ x: q[0], y: q[1], z: q[2] })), video.videoWidth || 1280, video.videoHeight || 720);
    let ang = 0, arrastre = null;
    function cuadro(t) {
      const w = cv.clientWidth, h = cv.clientHeight, d = devicePixelRatio || 1;
      if (cv.width !== w * d) { cv.width = w * d; cv.height = h * d; }
      const ctx = cv.getContext("2d"); ctx.setTransform(d, 0, 0, d, 0, 0);
      if (arrastre === null) ang = Math.sin(t / 1600) * 38;
      dibujarMalla(ctx, P, ar, ang, w, h);
      giroAnim = requestAnimationFrame(cuadro);
    }
    cv.onpointerdown = e => { arrastre = { x: e.clientX, a: ang }; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = e => { if (arrastre) ang = Math.max(-80, Math.min(80, arrastre.a + (e.clientX - arrastre.x) * 0.4)); };
    cv.onpointerup = () => { arrastre = null; };
    giroAnim = requestAnimationFrame(cuadro);
    $(".esc-t").textContent = "Tu cara en 3D";
    estado("Listo. Así se ve tu cara en 3D", "Con esto medimos tus proporciones en todos los ángulos. Arrastra para girarla.");
    $(".esc-acc").innerHTML = '<button type="button" class="btn btn-ghost esc-otra">Repetir</button><button type="button" class="btn btn-primary esc-fin">Guardar y continuar</button>';
    $(".esc-fin").onclick = () => cerrar({ v: 1, ancho: video.videoWidth, alto: video.videoHeight, fecha: new Date().toISOString(), angulos: BINS.map(b => datos[b]), frente });
    $(".esc-otra").onclick = () => { cerrar(null); escanear3d({ alTerminar }); };
  }

  pintar();
  ciclo();
}
