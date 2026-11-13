// Guided camera scan: follows the face live and takes each of the six photos when the pose is right.
// Everything runs on the device; only the finished photos go through onFoto, the same path as a manual upload.
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

let lm = null;
async function cargar() {
  if (lm) return lm;
  const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate },
    runningMode: "VIDEO", numFaces: 2, outputFaceBlendshapes: true,
  });
  try { lm = await FaceLandmarker.createFromOptions(fs, opts("GPU")); }
  catch (e) { lm = await FaceLandmarker.createFromOptions(fs, opts("CPU")); }
  return lm;
}

// turning to their right shows the left side of the face, and in the camera's (unmirrored) picture the nose moves left
const PASOS = [
  { key: "frente", titulo: "Frente", pide: "Mira directo a la cámara, cara relajada y boca cerrada", lado: 0, min: 0, max: 7, sonrisa: false },
  { key: "sonrisa", titulo: "Sonrisa", pide: "Ahora sonríe de forma natural, mostrando los dientes", lado: 0, min: 0, max: 9, sonrisa: true },
  { key: "tres_cuartos_izq", titulo: "Tres cuartos", pide: "Gira la cabeza un poco a tu derecha, como 45°", lado: -1, min: 26, max: 48, sonrisa: false },
  { key: "perfil_izq", titulo: "Perfil", pide: "Sigue girando a tu derecha hasta quedar de perfil", lado: -1, min: 58, max: 90, sonrisa: false },
  { key: "tres_cuartos_der", titulo: "Tres cuartos", pide: "Ahora gira a tu izquierda, como 45°", lado: 1, min: 26, max: 48, sonrisa: false },
  { key: "perfil_der", titulo: "Perfil", pide: "Sigue girando a tu izquierda hasta quedar de perfil", lado: 1, min: 58, max: 90, sonrisa: false },
];

function pose(L, bs, W, H) {
  const a = L[234], b = L[454], n = L[1];
  const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x), ancho = hi - lo;
  const r = ancho > 0 ? (n.x - lo) / ancho : 0.5;
  const s = Math.max(-1, Math.min(1, (r - 0.5) * 2));
  const yaw = Math.asin(s) * 180 / Math.PI; // negative: nose toward the left of the picture
  const ojoI = L[33], ojoD = L[263];
  const roll = Math.atan2((ojoD.y - ojoI.y) * H, (ojoD.x - ojoI.x) * W) * 180 / Math.PI;
  const rollN = Math.abs(roll) > 90 ? 180 - Math.abs(roll) : Math.abs(roll);
  const ys = L.map(p => p.y), alto = Math.max(...ys) - Math.min(...ys);
  const cx = (lo + hi) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const cat = (n2) => ((bs || []).find(c => c.categoryName === n2) || {}).score || 0;
  const sonrisa = (cat("mouthSmileLeft") + cat("mouthSmileRight")) / 2;
  return { yaw, roll: rollN, alto, cx, cy, sonrisa };
}

export async function iniciar({ onFoto, alTerminar, hechas = [] }) {
  const ui = document.createElement("div");
  ui.className = "esc";
  ui.innerHTML = `
    <div class="esc-top"><button type="button" class="esc-x" aria-label="Cerrar escaneo">✕</button><div class="esc-dots">${PASOS.map(p => `<i data-k="${p.key}"></i>`).join("")}</div><button type="button" class="esc-cam" aria-label="Cambiar cámara">⟲</button></div>
    <div class="esc-stage"><video playsinline muted autoplay></video><div class="esc-oval"></div><div class="esc-flash"></div></div>
    <div class="esc-bottom">
      <p class="esc-t"></p><p class="esc-p"></p><p class="esc-h"></p>
      <div class="esc-meter"><b></b></div>
      <div class="esc-acc"><button type="button" class="btn btn-ghost esc-skip">Saltar</button><button type="button" class="btn btn-primary esc-shot">Tomar foto</button></div>
    </div>`;
  document.body.appendChild(ui); document.documentElement.classList.add("esc-on");
  const $ = s => ui.querySelector(s);
  const video = $("video"), estado = (t, p, h) => { $(".esc-t").textContent = t; $(".esc-p").textContent = p || ""; $(".esc-h").textContent = h || ""; };
  estado("Preparando la cámara", "Permite el acceso a la cámara cuando te lo pida tu celular.");

  let stream = null, frontal = true, vivo = true, i = 0, estable = 0, ultimo = 0, tomando = false;
  const listas = new Set(hechas);
  while (i < PASOS.length && listas.has(PASOS[i].key)) i++;
  const pintarDots = () => ui.querySelectorAll(".esc-dots i").forEach((d, k) => { d.className = listas.has(d.dataset.k) ? "ok" : k === i ? "on" : ""; });

  async function abrirCam() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: frontal ? "user" : "environment", width: { ideal: 1920 }, height: { ideal: 1920 } } });
    video.srcObject = stream; await video.play();
    video.classList.toggle("espejo", frontal);
  }
  function cerrar(listo) {
    vivo = false; if (stream) stream.getTracks().forEach(t => t.stop());
    ui.remove(); document.documentElement.classList.remove("esc-on");
    if (alTerminar) alTerminar(listo);
  }
  async function tomar() {
    if (tomando || i >= PASOS.length) return;
    tomando = true;
    const W = video.videoWidth, H = video.videoHeight, c = document.createElement("canvas");
    c.width = W; c.height = H; c.getContext("2d").drawImage(video, 0, 0, W, H);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
    const f = $(".esc-flash"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
    try { navigator.vibrate && navigator.vibrate(40); } catch (e) {}
    const paso = PASOS[i];
    listas.add(paso.key);
    onFoto(paso.key, blob);
    do { i++; } while (i < PASOS.length && listas.has(PASOS[i].key));
    estable = 0; pintarDots();
    setTimeout(() => { tomando = false; }, 700);
    if (i >= PASOS.length) {
      estado("Listo", "Tus 6 fotos quedaron guardadas.", "");
      $(".esc-acc").innerHTML = '<button type="button" class="btn btn-primary esc-fin">Continuar</button>';
      $(".esc-fin").onclick = () => cerrar(true);
    }
  }
  $(".esc-x").onclick = () => cerrar(false);
  $(".esc-shot").onclick = tomar;
  $(".esc-skip").onclick = () => { if (i < PASOS.length) { do { i++; } while (i < PASOS.length && listas.has(PASOS[i].key)); estable = 0; pintarDots(); if (i >= PASOS.length) cerrar(listas.size === PASOS.length); } };
  $(".esc-cam").onclick = async () => { frontal = !frontal; try { await abrirCam(); } catch (e) {} };

  try { await abrirCam(); }
  catch (e) { estado("No pudimos abrir la cámara", "Revisa que le diste permiso a tu navegador, o sube tus fotos una por una.", ""); $(".esc-acc").innerHTML = '<button type="button" class="btn btn-primary esc-fin">Subir mis fotos</button>'; $(".esc-fin").onclick = () => cerrar(false); return; }
  pintarDots();
  estado("Cargando", "Un momento…");
  try { await cargar(); } catch (e) { estado("No pudimos preparar el escaneo", "Puedes tomar cada foto con el botón o subirlas una por una.", ""); }

  const meter = $(".esc-meter b");
  function ciclo() {
    if (!vivo) return;
    requestAnimationFrame(ciclo);
    if (i >= PASOS.length || tomando || video.readyState < 2) return;
    // without the face model each pose is taken with the button
    if (!lm) { const q = PASOS[i]; estado(`${q.titulo} · ${i + 1} de ${PASOS.length}`, q.pide, "Toca Tomar foto cuando estés en posición."); return; }
    const now = performance.now(); if (now - ultimo < 60) return; ultimo = now;
    const paso = PASOS[i];
    let r; try { r = lm.detectForVideo(video, now); } catch (e) { return; }
    const caras = r.faceLandmarks || [];
    let aviso = "", ok = false;
    if (!caras.length) aviso = paso.min >= 58 ? "Si ya estás de perfil y no avanza, toca Tomar foto." : "No vemos tu cara. Ponla dentro del óvalo.";
    else if (caras.length > 1) aviso = "Solo debe salir una persona.";
    else {
      const W = video.videoWidth, H = video.videoHeight;
      const p = pose(caras[0], (r.faceBlendshapes || [])[0] && r.faceBlendshapes[0].categories, W, H);
      const yaw = p.yaw, giro = Math.abs(yaw), lado = Math.sign(yaw);
      if (p.alto < 0.32) aviso = "Acércate un poco.";
      else if (p.alto > 0.78) aviso = "Aléjate un poco.";
      else if (paso.lado === 0 && (Math.abs(p.cx - 0.5) > 0.14 || Math.abs(p.cy - 0.48) > 0.16)) aviso = "Centra tu cara en el óvalo.";
      else if (p.roll > 8) aviso = "Endereza la cabeza.";
      else if (paso.lado === 0 && giro > paso.max) aviso = "Mira directo a la cámara.";
      else if (paso.lado !== 0 && giro > 8 && lado !== paso.lado) aviso = paso.lado < 0 ? "Hacia el otro lado: gira a tu derecha." : "Hacia el otro lado: gira a tu izquierda.";
      else if (paso.lado !== 0 && giro < paso.min) aviso = "Sigue girando despacio.";
      else if (paso.lado !== 0 && giro > paso.max) aviso = "Te pasaste un poco, regresa tantito.";
      else if (paso.sonrisa && p.sonrisa < 0.5) aviso = "Sonríe un poco más.";
      else if (!paso.sonrisa && paso.lado === 0 && p.sonrisa > 0.35) aviso = "Relaja la boca, sin sonreír.";
      else { ok = true; aviso = "Quieto…"; }
    }
    estable = ok ? estable + 1 : 0;
    meter.style.width = Math.min(100, estable / 10 * 100) + "%";
    ui.classList.toggle("bien", ok);
    estado(`${PASOS[i].titulo} · ${i + 1} de ${PASOS.length}`, paso.pide, aviso);
    if (estable >= 10) tomar();
  }
  ciclo();
}
