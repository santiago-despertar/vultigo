// The free viewer at /visor: pick a photo, measure it in the browser, show it in the viewer.
import { analizar, precargar } from "/assets/js/medidas.js?v=18";
import { montar } from "/assets/js/visor-ui.js?v=17";

const $ = (s) => document.querySelector(s);
const file = $("#vFile"), go = $("#vGo"), msgEl = $("#vMsg");
let img = null;
precargar(); // starts downloading the face model right away so measuring feels instant

function say(el, t, type = "err") { el.textContent = t; el.className = "msg show " + type; }

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
    const data = await analizar(img);
    $("#vStart").hidden = true; $("#vResult").hidden = false;
    montar(data, img.src);
  } catch (e) {
    const t = { sin_cara: "No encontramos una cara en la foto. Prueba con una foto de frente y con buena luz.",
      varias_caras: "Hay más de una persona en la foto. Usa una donde salgas solo tú.",
      sin_iris: "No pudimos ubicar bien tus ojos. Prueba sin lentes y con más luz." }[e.message];
    say(msgEl, t || "No pudimos medir esta foto. Inténtalo de nuevo en un momento.");
  }
  go.disabled = false; go.textContent = "Medir mi cara";
}

// Lets the page be opened with a sample photo: /visor?foto=/assets/img/...
const sample = new URLSearchParams(location.search).get("foto");
if (sample && /^\/assets\/img\//.test(sample)) loadImage(sample).then(i => { img = i; run(); }).catch(() => {});
