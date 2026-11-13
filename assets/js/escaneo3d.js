// Guided 3D face scan. Nothing is recorded until the face is in position: the oval is red while
// something is off (too far, too close, off center, tilted, too dark) and turns green when it is right.
// Then it walks through steps: hold still, turn right, back to center, turn left, back to center,
// chin up, chin down. At each angle it keeps the 3D face mesh. Everything runs on the device.
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

// Head pose from the landmarks. yaw: negative when the person turns to their right
// (in the unmirrored picture the nose moves left). pitchR: nose height between the eyes and the chin,
// smaller when the chin goes up; compared against the person's own value at the start.
export function pose(L, W, H) {
  const a = L[234], b = L[454], n = L[1];
  const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x), ancho = hi - lo;
  const r = ancho > 0 ? (n.x - lo) / ancho : 0.5;
  const yaw = Math.asin(Math.max(-1, Math.min(1, (r - 0.5) * 2))) * 180 / Math.PI;
  const oi = L[33], od = L[263];
  let roll = Math.abs(Math.atan2((od.y - oi.y) * H, (od.x - oi.x) * W) * 180 / Math.PI);
  if (roll > 90) roll = 180 - roll;
  const ojosY = (oi.y + od.y) / 2, barba = L[152];
  const pitchR = (n.y - ojosY) / ((barba.y - ojosY) || 1);
  let y0 = 1, y1 = 0, x0 = 1, x1 = 0;
  for (const p of L) { if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; }
  return { yaw, roll, pitchR, alto: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, caja: [x0, y0, x1, y1] };
}

function puntos(L, W, H) {
  const P = L.map(p => [p.x * W, p.y * H, p.z * W]);
  let cx = 0, cy = 0, cz = 0; for (const p of P) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= P.length; cy /= P.length; cz /= P.length;
  return P.map(p => [p[0] - cx, p[1] - cy, p[2] - cz]);
}

export function dibujarMalla(ctx, P, aristas, ang, w, h, color = "255,255,255") {
  ctx.clearRect(0, 0, w, h);
  let r = 0; for (const p of P) r = Math.max(r, Math.hypot(p[0], p[1]));
  const k = (Math.min(w, h) * 0.42) / (r || 1), c = Math.cos(ang * Math.PI / 180), s = Math.sin(ang * Math.PI / 180);
  const Q = P.map(p => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]);
  let zmin = Infinity, zmax = -Infinity; for (const q of Q) { if (q[2] < zmin) zmin = q[2]; if (q[2] > zmax) zmax = q[2]; }
  ctx.lineWidth = 1;
  for (const [i, j] of aristas) {
    const A = Q[i], B = Q[j]; if (!A || !B) continue;
    const z = ((A[2] + B[2]) / 2 - zmin) / ((zmax - zmin) || 1);
    ctx.strokeStyle = `rgba(${color},${(0.85 - z * 0.7).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(w / 2 + A[0] * k, h / 2 + A[1] * k); ctx.lineTo(w / 2 + B[0] * k, h / 2 + B[1] * k); ctx.stroke();
  }
}
export function aristasMalla() { return (FaceLandmarker.FACE_LANDMARKS_TESSELATION || []).map(e => [e.start, e.end]); }

// The steps. "toma" lists what each step must collect before moving on.
const PASOS = [
  { id: "frente", pide: "Mira directo a la cámara y quédate quieto", flecha: "" },
  { id: "der", pide: "Gira la cabeza despacio a tu derecha", flecha: "der", yaws: [-15, -25, -35, -45] },
  { id: "c1", pide: "Regresa despacio al centro", flecha: "centro" },
  { id: "izq", pide: "Ahora gira despacio a tu izquierda", flecha: "izq", yaws: [15, 25, 35, 45] },
  { id: "c2", pide: "Regresa despacio al centro", flecha: "centro" },
  { id: "arriba", pide: "Sube un poco la barbilla", flecha: "arriba" },
  { id: "abajo", pide: "Ahora baja un poco la barbilla", flecha: "abajo" },
];
const TOTAL = 1 + 4 + 4 + 2;

export async function escanear3d({ alTerminar }) {
  const ui = document.createElement("div");
  ui.className = "esc esc3d";
  ui.innerHTML = `
    <div class="esc-top"><button type="button" class="esc-x" aria-label="Cerrar escaneo">✕</button><p class="esc3d-paso">Escaneo 3D</p><span style="width:40px"></span></div>
    <div class="esc-stage">
      <video playsinline muted autoplay class="espejo"></video>
      <div class="esc3d-marco">
        <svg class="esc3d-anillo" viewBox="0 0 300 400" preserveAspectRatio="none"><ellipse class="base" cx="150" cy="200" rx="146" ry="196"/><ellipse class="prog" cx="150" cy="200" rx="146" ry="196" pathLength="100"/></svg>
        <div class="esc3d-flecha"></div>
      </div>
      <canvas class="esc3d-malla" hidden></canvas>
    </div>
    <div class="esc-bottom">
      <p class="esc-p"></p><p class="esc-h"></p>
      <div class="esc-acc"></div>
    </div>`;
  document.body.appendChild(ui); document.documentElement.classList.add("esc-on");
  const $ = s => ui.querySelector(s);
  const video = $("video"), marco = $(".esc3d-marco"), prog = $(".esc3d-anillo .prog"), flecha = $(".esc3d-flecha");
  const texto = (p, h) => { $(".esc-p").textContent = p || ""; $(".esc-h").textContent = h || ""; };
  texto("Preparando la cámara", "Permite el acceso a la cámara cuando te lo pida tu navegador.");

  let stream = null, vivo = true, ultimo = 0, giroAnim = 0;
  function cerrar(res) {
    vivo = false; cancelAnimationFrame(giroAnim);
    if (stream) stream.getTracks().forEach(t => t.stop());
    ui.remove(); document.documentElement.classList.remove("esc-on");
    if (alTerminar) alTerminar(res || null);
  }
  const fallo = (t, h) => { texto(t, h); $(".esc-acc").innerHTML = '<button type="button" class="btn btn-primary">Cerrar</button>'; $(".esc-acc button").onclick = () => cerrar(null); };
  $(".esc-x").onclick = () => cerrar(null);

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = stream; await video.play();
  } catch (e) { return fallo("No pudimos abrir la cámara", "Revisa que le diste permiso a tu navegador e inténtalo otra vez."); }
  texto("Cargando", "Un momento…");
  try { await cargar(); } catch (e) { return fallo("No pudimos preparar el escaneo", "Prueba en Chrome o Safari actualizados."); }

  // the ring and arrow sit exactly over the visible picture, whatever the screen shape
  function ajustarMarco() {
    const st = $(".esc-stage"), sw = st.clientWidth, sh = st.clientHeight, vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    const esc = Math.min(sw / vw, sh / vh), w = vw * esc, h = vh * esc;
    const oh = h * 0.62, ow = oh * 0.75;
    Object.assign(marco.style, { width: ow + "px", height: oh + "px", left: (sw - ow) / 2 + "px", top: (sh - oh) / 2 + "px" });
  }
  ajustarMarco(); addEventListener("resize", ajustarMarco);

  // light check: average brightness of the face area, sampled small
  const muestra = document.createElement("canvas"); muestra.width = 32; muestra.height = 32;
  const mctx = muestra.getContext("2d", { willReadFrequently: true });
  let luz = 1, ultLuz = 0;
  function medirLuz(caja) {
    const W = video.videoWidth, H = video.videoHeight;
    const [x0, y0, x1, y1] = caja;
    try {
      mctx.drawImage(video, x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H, 0, 0, 32, 32);
      const d = mctx.getImageData(0, 0, 32, 32).data; let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      luz = s / (d.length / 4) / 255;
    } catch (e) {}
  }

  const datos = { angulos: [], frente: null, base: null };
  let paso = 0, quieto = 0, tomas = 0, inicioPaso = performance.now();
  const hechosYaw = new Set();
  function guardar(L, p, etiqueta) {
    datos.angulos.push({ etiqueta, yaw: +p.yaw.toFixed(1), pitch: p.pitch === null || p.pitch === undefined ? null : +p.pitch.toFixed(1), puntos: L.map(q => [+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4)]) });
    tomas++; prog.style.strokeDasharray = `${Math.min(100, tomas / TOTAL * 100)} 100`;
    try { navigator.vibrate && navigator.vibrate(15); } catch (e) {}
  }
  function siguiente() { paso++; quieto = 0; inicioPaso = performance.now(); if (paso >= PASOS.length) terminar(); }
  function pintar(ok, aviso) {
    ui.classList.toggle("bien", ok); ui.classList.toggle("mal", !ok);
    const P = PASOS[paso];
    flecha.className = "esc3d-flecha" + (ok && P.flecha ? " f-" + P.flecha : "");
    $(".esc3d-paso").textContent = `Paso ${Math.min(paso + 1, PASOS.length)} de ${PASOS.length}`;
    texto(ok ? P.pide : aviso, ok ? "" : "Cuando el óvalo esté en verde, seguimos.");
  }

  function ciclo() {
    if (!vivo) return;
    requestAnimationFrame(ciclo);
    if (video.readyState < 2 || paso >= PASOS.length) return;
    const now = performance.now(); if (now - ultimo < 45) return; ultimo = now;
    let r; try { r = lm.detectForVideo(video, now); } catch (e) { return; }
    const caras = r.faceLandmarks || [], W = video.videoWidth, H = video.videoHeight, P = PASOS[paso];
    if (!caras.length) return pintar(false, P.yaws ? "Gira más despacio, te perdimos de vista" : "No vemos tu cara. Ponla dentro del óvalo");
    if (caras.length > 1) return pintar(false, "Solo debe salir una persona");
    const L = caras[0], p = pose(L, W, H);
    // head pitch in degrees from the face model's own 3D pose (falls back to the landmark ratio)
    const M = r.facialTransformationMatrixes && r.facialTransformationMatrixes[0] && r.facialTransformationMatrixes[0].data;
    p.pitch = M ? Math.atan2(M[6], M[10]) * 180 / Math.PI : null;
    if (now - ultLuz > 400) { ultLuz = now; medirLuz(p.caja); }
    const girando = !!P.yaws, holgura = girando ? 0.2 : 0.12;
    // is the face in position? one clear correction at a time
    let aviso = "";
    if (p.alto < 0.24) aviso = "Acércate un poco a la cámara";
    else if (p.alto > 0.7) aviso = "Aléjate un poco de la cámara";
    else if (Math.abs(p.cx - 0.5) > holgura) aviso = "Mueve tu cara al centro del óvalo";
    else if (Math.abs(p.cy - 0.5) > 0.16) aviso = p.cy < 0.5 ? "Baja un poco el celular o tu cara al centro" : "Sube un poco el celular o tu cara al centro";
    else if (p.roll > (girando ? 14 : 9)) aviso = "Endereza la cabeza, sin inclinarla de lado";
    else if (luz < 0.22) aviso = "Hay muy poca luz. Ponte frente a una ventana o una lámpara";
    if (aviso) { quieto = 0; return pintar(false, aviso); }

    // in position: work the current step
    if (P.id === "frente") {
      if (Math.abs(p.yaw) > 7) { quieto = 0; return pintar(false, "Mira directo a la cámara"); }
      pintar(true);
      if (++quieto >= 18) { datos.base = p.pitchR; datos.basePitch = p.pitch; guardar(L, p, "frente"); tomarFrente(); siguiente(); }
      return;
    }
    if (P.yaws) {
      pintar(true);
      for (const b of P.yaws) if (!hechosYaw.has(b) && Math.abs(p.yaw - b) < 4) { hechosYaw.add(b); guardar(L, p, "yaw" + b); }
      const faltan = P.yaws.filter(b => !hechosYaw.has(b));
      if (!faltan.length) return siguiente();
      // the last, widest angle can be hard to reach: after a while, three of four is enough
      if (faltan.length === 1 && now - inicioPaso > 9000) { tomas++; return siguiente(); }
      if (Math.sign(p.yaw) === -Math.sign(P.yaws[0]) && Math.abs(p.yaw) > 10) texto("Hacia el otro lado", P.pide);
      return;
    }
    if (P.id === "c1" || P.id === "c2") {
      pintar(true);
      if (Math.abs(p.yaw) < 7 && ++quieto >= 6) siguiente();
      return;
    }
    // chin up / chin down, measured against the person's own front position
    if (Math.abs(p.yaw) > 12) { quieto = 0; return pintar(false, "Mira al frente mientras mueves la barbilla"); }
    pintar(true);
    // chin up lowers the pitch angle; validated on test photos (about 20° up gave -20°)
    let listo;
    if (p.pitch !== null && datos.basePitch !== null && datos.basePitch !== undefined) {
      const d = p.pitch - datos.basePitch;
      listo = P.id === "arriba" ? d < -12 : d > 10;
    } else {
      const d = p.pitchR - datos.base;
      listo = P.id === "arriba" ? d < -0.07 : d > 0.05;
    }
    if (listo && ++quieto >= 4) { guardar(L, p, P.id); siguiente(); }
    else if (!listo) quieto = 0;
  }

  function tomarFrente() {
    const W = video.videoWidth, H = video.videoHeight, esc = Math.min(1, 640 / W), c = document.createElement("canvas");
    c.width = Math.round(W * esc); c.height = Math.round(H * esc);
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    datos.frente = c.toDataURL("image/jpeg", 0.8);
  }

  function terminar() {
    vivo = false; removeEventListener("resize", ajustarMarco);
    ui.classList.remove("mal"); ui.classList.add("bien");
    if (stream) stream.getTracks().forEach(t => t.stop());
    video.hidden = true; marco.hidden = true;
    const cv = $(".esc3d-malla"); cv.hidden = false;
    const f = datos.angulos.find(a => a.etiqueta === "frente");
    const Pm = puntos(f.puntos.map(q => ({ x: q[0], y: q[1], z: q[2] })), video.videoWidth || 1280, video.videoHeight || 720), ar = aristasMalla();
    let ang = 0, arrastre = null;
    function cuadro(t) {
      const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1;
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (arrastre === null) ang = Math.sin(t / 1600) * 38;
      dibujarMalla(ctx, Pm, ar, ang, w, h);
      giroAnim = requestAnimationFrame(cuadro);
    }
    cv.onpointerdown = e => { arrastre = { x: e.clientX, a: ang }; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = e => { if (arrastre) ang = Math.max(-80, Math.min(80, arrastre.a + (e.clientX - arrastre.x) * 0.4)); };
    cv.onpointerup = () => { arrastre = null; };
    giroAnim = requestAnimationFrame(cuadro);
    $(".esc3d-paso").textContent = "Listo";
    texto("Así se ve tu cara en 3D", "Con esto medimos tus proporciones en todos los ángulos. Arrastra para girarla.");
    $(".esc-acc").innerHTML = '<button type="button" class="btn btn-ghost esc-otra">Repetir</button><button type="button" class="btn btn-primary esc-fin">Guardar y continuar</button>';
    $(".esc-fin").onclick = () => cerrar({ v: 2, ancho: video.videoWidth, alto: video.videoHeight, fecha: new Date().toISOString(), angulos: datos.angulos, frente: datos.frente });
    $(".esc-otra").onclick = () => { cerrar(null); escanear3d({ alTerminar }); };
  }

  prog.style.strokeDasharray = "0 100";
  pintar(false, "Pon tu cara dentro del óvalo");
  ciclo();
}
