// Resalta measurement engine. Finds the face landmarks in a frontal photo and turns them into
// measurements with a reference range. Runs in the browser: the photo is not uploaded by this file.
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

let landmarker = null;
async function getLandmarker() {
  if (landmarker) return landmarker;
  const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  landmarker = await FaceLandmarker.createFromOptions(fs, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
    runningMode: "IMAGE", numFaces: 2
  });
  return landmarker;
}

// Starts loading the model ahead of time so the first measurement is not the one that waits for it.
export function precargar() { getLandmarker().catch(() => {}); }

// ---- geometry (all points are in image pixels)
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const deg = (r) => (r * 180) / Math.PI;
// angle at vertex v between rays v->a and v->b
function angleAt(v, a, b) {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x), a2 = Math.atan2(b.y - v.y, b.x - v.x);
  let x = Math.abs(deg(a1 - a2)); if (x > 180) x = 360 - x; return x;
}
function reflect(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const fx = a.x + t * dx, fy = a.y + t * dy;
  return { x: 2 * fx - p.x, y: 2 * fy - p.y };
}
// project p onto the line through a in direction (ux,uy)
const along = (p, a, ux, uy) => (p.x - a.x) * ux + (p.y - a.y) * uy;

const round = (v, n = 2) => +v.toFixed(n);

// Where a value falls against its reference range.
function estado(v, lo, hi) {
  if (v >= lo && v <= hi) return "dentro";
  const span = hi - lo, off = v < lo ? lo - v : v - hi;
  return off <= span * 0.5 ? "cerca" : "fuera";
}
// 0-100. Only the center of the reference range scores 100; the edge of the range scores about 72
// and it keeps falling outside it. "alto" and "bajo" are for measurements where more (or less) is always better.
function puntaje(v, lo, hi, tipo) {
  const half = (hi - lo) / 2 || 1;
  let z;
  if (tipo === "alto") z = Math.max(0, hi - v) / half;
  else if (tipo === "bajo") z = Math.max(0, v - lo) / half;
  else z = Math.abs(v - (lo + hi) / 2) / half;
  return Math.round(100 / (1 + Math.pow(z / 1.6, 2)));
}

export { ZONAS } from "/assets/js/zonas.js?v=15";
import { ZONAS } from "/assets/js/zonas.js?v=15";

// Builds every measurement from the 478 landmarks. L[i] = {x,y} in pixels.
export function medir(L, sexo) {
  const mujer = sexo === "mujer";
  const P = (i) => L[i];
  const out = [];
  const add = (m) => {
    m.valor = round(m.valor, m.unidad === "°" ? 1 : m.unidad === "%" ? 1 : m.rango[1] < 0.5 ? 3 : 2);
    m.estado = estado(m.valor, m.rango[0], m.rango[1]);
    m.puntaje = puntaje(m.valor, m.rango[0], m.rango[1], m.tipo);
    out.push(m);
  };

  // reference frame: the line between the pupils is "horizontal"
  let pupL = P(468), pupR = P(473); // iris centers
  if (pupL.x > pupR.x) [pupL, pupR] = [pupR, pupL]; // pupL is always the one on the left of the image
  const ipd = dist(pupL, pupR);
  const ux = (pupR.x - pupL.x) / ipd, uy = (pupR.y - pupL.y) / ipd; // unit along the eye line
  let vx = -uy, vy = ux;                                             // unit pointing down the face
  if (along(P(152), P(9), vx, vy) < 0) { vx = -vx; vy = -vy; }
  const down = (a, b) => Math.abs(along(b, a, vx, vy));              // vertical distance in the face frame
  const across = (a, b) => Math.abs(along(b, a, ux, uy));            // horizontal distance in the face frame

  const zyL = P(234), zyR = P(454), bizy = dist(zyL, zyR);
  const glab = P(9), subn = P(2), ment = P(152), stom = P(13);
  const browMid = mid(P(105), P(334));
  const lipTop = P(0);

  // ---------- proporciones
  add({ id: "tercios", zona: "proporciones", nombre: "Tercio medio contra tercio inferior",
    valor: down(glab, subn) / down(subn, ment), unidad: "", rango: [0.9, 1.1],
    lineas: [[glab, subn], [subn, ment]],
    que: "Compara la altura de la zona media (entrecejo a base de la nariz) con la inferior (base de la nariz a mentón).",
    significa: "Cerca de 1 las dos zonas miden lo mismo, que es lo que se percibe como una cara equilibrada. Por debajo de 1 el tercio inferior domina; por encima, la zona media se ve más larga." });

  add({ id: "alto_ancho", zona: "proporciones", nombre: "Altura contra ancho de la cara",
    valor: down(P(10), ment) / bizy, unidad: "", rango: [1.15, 1.35],
    lineas: [[P(10), ment], [zyL, zyR]],
    que: "Altura de la cara (frente a mentón) dividida entre el ancho de pómulos.",
    significa: "Valores bajos dan una cara más ancha y compacta; valores altos, una cara más alargada. Sirve para elegir corte de cabello, barba y lentes." });

  add({ id: "fwhr", zona: "proporciones", nombre: "Ancho contra altura del rostro medio",
    valor: bizy / down(browMid, lipTop), unidad: "", rango: mujer ? [1.4, 1.65] : [1.55, 1.85],
    lineas: [[zyL, zyR], [browMid, lipTop]],
    que: "Ancho de pómulos dividido entre la distancia de cejas a labio superior.",
    significa: "Un valor más alto se asocia con un rostro medio compacto y pómulos marcados. Uno más bajo, con un rostro medio alto." });

  add({ id: "tercio_inferior", zona: "proporciones", nombre: "Reparto del tercio inferior",
    valor: down(stom, ment) / down(subn, stom), unidad: "", rango: [1.8, 2.2],
    lineas: [[subn, stom], [stom, ment]],
    que: "Distancia de boca a mentón dividida entre la de nariz a boca.",
    significa: "La referencia clásica es 2: el mentón ocupa el doble que el espacio entre nariz y boca. Menos de eso sugiere mentón corto o labio superior largo." });

  // ---------- ojos
  const eyeLo = P(33), eyeLi = P(133), eyeRi = P(362), eyeRo = P(263);
  const eyeW = (dist(eyeLo, eyeLi) + dist(eyeRi, eyeRo)) / 2;
  add({ id: "separacion_ojos", zona: "ojos", nombre: "Separación entre los ojos",
    valor: dist(eyeLi, eyeRi) / eyeW, unidad: "", rango: [1.12, 1.34],
    lineas: [[eyeLo, eyeLi], [eyeLi, eyeRi], [eyeRi, eyeRo]],
    que: "Espacio entre los dos ojos dividido entre el ancho de un ojo.",
    significa: "La regla de los quintos dice que entre los ojos cabe un ojo. Por debajo del rango se percibe como ojos juntos; por encima, como ojos separados." });

  const tilt = (inner, outer) => {
    // positive when the outer corner sits higher than the inner one
    const dy = along(inner, outer, vx, vy), dx = Math.abs(along(inner, outer, ux, uy));
    return deg(Math.atan2(dy, dx));
  };
  add({ id: "inclinacion_ojos", zona: "ojos", nombre: "Inclinación de los ojos",
    valor: (tilt(eyeLi, eyeLo) + tilt(eyeRi, eyeRo)) / 2, unidad: "°", rango: mujer ? [4, 8] : [1, 6],
    lineas: [[eyeLi, eyeLo], [eyeRi, eyeRo]],
    que: "Ángulo entre el lagrimal y la esquina externa de cada ojo. Positivo cuando la esquina externa queda más alta.",
    significa: "Una inclinación positiva moderada se percibe como mirada despierta. Cerca de 0 o negativa, como mirada caída o cansada." });

  const eyeH = (dist(P(159), P(145)) + dist(P(386), P(374))) / 2;
  add({ id: "forma_ojos", zona: "ojos", nombre: "Forma del ojo (ancho contra alto)",
    valor: eyeW / eyeH, unidad: "", rango: [2.8, 3.6],
    lineas: [[eyeLo, eyeLi], [P(159), P(145)], [eyeRi, eyeRo], [P(386), P(374)]],
    que: "Ancho del ojo dividido entre su apertura.",
    significa: "Valores altos dan un ojo más rasgado; valores bajos, un ojo más redondo y abierto. Depende mucho de la expresión en la foto." });

  add({ id: "esr", zona: "ojos", nombre: "Distancia entre pupilas contra ancho de cara",
    valor: ipd / bizy, unidad: "", rango: [0.44, 0.49],
    lineas: [[pupL, pupR], [zyL, zyR]],
    que: "Distancia entre pupilas dividida entre el ancho de pómulos.",
    significa: "Dice qué tanto del ancho de la cara ocupan los ojos. Valores bajos hacen que la cara se vea más ancha alrededor de los ojos." });

  add({ id: "rostro_medio", zona: "ojos", nombre: "Compacidad del rostro medio",
    valor: ipd / down(mid(pupL, pupR), lipTop), unidad: "", rango: [0.95, 1.05],
    lineas: [[pupL, pupR], [mid(pupL, pupR), lipTop]],
    que: "Distancia entre pupilas dividida entre la distancia de los ojos al labio superior.",
    significa: "Cerca de 1 el rostro medio se ve compacto. Por debajo, la zona entre ojos y boca se ve larga." });

  // ---------- nariz
  const alaL = P(129), alaR = P(358), noseW = dist(alaL, alaR);
  add({ id: "nariz_ojos", zona: "nariz", nombre: "Ancho de nariz contra separación de ojos",
    valor: noseW / dist(eyeLi, eyeRi), unidad: "", rango: [1.1, 1.32],
    lineas: [[alaL, alaR], [eyeLi, eyeRi]],
    que: "Ancho de la base de la nariz dividido entre la distancia entre lagrimales.",
    significa: "La referencia clásica es que la nariz mida lo mismo que el espacio entre los ojos. Por encima, la nariz se percibe ancha para la cara." });

  const mouthL = P(61), mouthR = P(291), mouthW = dist(mouthL, mouthR);
  add({ id: "boca_nariz", zona: "nariz", nombre: "Ancho de boca contra ancho de nariz",
    valor: mouthW / noseW, unidad: "", rango: [1.25, 1.55],
    lineas: [[mouthL, mouthR], [alaL, alaR]],
    que: "Ancho de la boca dividido entre el ancho de la nariz.",
    significa: "Una boca cerca de una vez y media el ancho de la nariz se ve en proporción. Menos, boca pequeña o nariz ancha." });

  // ---------- boca
  add({ id: "labios", zona: "boca", nombre: "Labio inferior contra labio superior",
    valor: dist(P(14), P(17)) / dist(P(0), P(13)), unidad: "", rango: [1.3, 1.8],
    lineas: [[P(0), P(13)], [P(14), P(17)]],
    que: "Grosor del labio inferior dividido entre el del superior.",
    significa: "La referencia es un labio inferior algo más grueso que el superior. Se mide mejor con la boca relajada y cerrada." });

  add({ id: "boca_pupilas", zona: "boca", nombre: "Ancho de boca contra distancia entre pupilas",
    valor: mouthW / ipd, unidad: "", rango: [0.75, 0.9],
    lineas: [[mouthL, mouthR], [pupL, pupR]],
    que: "Ancho de la boca dividido entre la distancia entre pupilas.",
    significa: "Indica si la boca se ve ancha o angosta para tu cara." });

  add({ id: "filtrum_menton", zona: "boca", nombre: "Mentón contra espacio nariz-labio",
    valor: down(P(17), ment) / down(subn, lipTop), unidad: "", rango: [2.0, 2.6],
    lineas: [[subn, lipTop], [P(17), ment]],
    que: "Altura del mentón dividida entre el espacio de la nariz al labio superior.",
    significa: "Un mentón de al menos el doble que ese espacio da un tercio inferior firme. Valores bajos sugieren mentón corto o espacio nariz-labio largo." });

  // ---------- mandíbula
  const goL = P(172), goR = P(397), bigo = dist(goL, goR);
  add({ id: "mandibula_pomulos", zona: "mandibula", nombre: "Ancho de mandíbula contra pómulos",
    valor: bigo / bizy, unidad: "", rango: [0.75, 0.9],
    lineas: [[goL, goR], [zyL, zyR]],
    que: "Ancho de la mandíbula (de ángulo a ángulo) dividido entre el ancho de pómulos.",
    significa: "Valores altos dan una mandíbula ancha y cuadrada; valores bajos, una cara que se afina hacia abajo." });

  add({ id: "angulo_mandibula", zona: "mandibula", nombre: "Ángulo de la mandíbula visto de frente",
    valor: (angleAt(goL, zyL, ment) + angleAt(goR, zyR, ment)) / 2, unidad: "°", rango: [120, 138],
    lineas: [[zyL, goL], [goL, ment], [zyR, goR], [goR, ment]],
    que: "Ángulo que forma el contorno de la cara al doblar en la mandíbula hacia el mentón.",
    significa: "Un ángulo más cerrado se ve como mandíbula marcada; uno más abierto, como contorno suave o redondeado. El ángulo real se mide mejor en la foto de perfil." });

  const chinW = dist(P(148), P(377));
  add({ id: "menton_boca", zona: "mandibula", nombre: "Ancho de mentón contra ancho de boca",
    valor: chinW / mouthW, unidad: "", rango: [0.4, 0.6],
    lineas: [[P(148), P(377)], [mouthL, mouthR]],
    que: "Ancho del mentón dividido entre el ancho de la boca.",
    significa: "Dice si el mentón se ve ancho y cuadrado o angosto y en punta respecto a la boca." });

  // ---------- cejas y más proporciones
  const bLi = P(107), bLo = P(70), bRi = P(336), bRo = P(300), bLp = P(105), bRp = P(334);
  add({ id: "ceja_inclinacion", zona: "ojos", nombre: "Caída de la cola de la ceja",
    valor: -(tilt(bLi, bLo) + tilt(bRi, bRo)) / 2, unidad: "°", rango: [4, 9],
    lineas: [[bLi, bLo], [bRi, bRo]],
    que: "Qué tanto baja la cola de la ceja respecto a donde empieza, medido en el borde superior.",
    significa: "Una cola que baja poco mantiene la mirada abierta. Si cae mucho, el ojo se ve triste o cansado; se corrige con diseño de cejas." });
  add({ id: "ceja_altura", zona: "ojos", nombre: "Altura de la ceja sobre el ojo",
    valor: (down(bLp, P(159)) + down(bRp, P(386))) / 2 / eyeW, unidad: "", rango: mujer ? [0.68, 0.88] : [0.55, 0.72],
    lineas: [[bLp, P(159)], [bRp, P(386)]],
    que: "Distancia de la ceja al párpado superior, en proporción al ancho del ojo.",
    significa: "Cejas bajas dan una mirada más intensa y marcada; cejas altas, una expresión más abierta y suave." });
  add({ id: "ceja_largo", zona: "ojos", nombre: "Largo de la ceja contra el ojo",
    valor: (dist(bLi, bLo) + dist(bRi, bRo)) / 2 / eyeW, unidad: "", rango: [1.5, 1.68],
    lineas: [[bLi, bLo], [bRi, bRo], [eyeLo, eyeLi], [eyeRi, eyeRo]],
    que: "Largo de la ceja dividido entre el ancho del ojo.",
    significa: "La ceja debe pasar al ojo por los dos lados. Corta, la mirada pierde marco; se corrige con diseño o maquillaje de cejas." });
  add({ id: "entrecejo", zona: "ojos", nombre: "Separación entre cejas",
    valor: dist(bLi, bRi) / dist(eyeLi, eyeRi), unidad: "", rango: [0.84, 0.95],
    lineas: [[bLi, bRi], [eyeLi, eyeRi]],
    que: "Espacio entre las dos cejas dividido entre el espacio entre los lagrimales.",
    significa: "Cejas muy juntas endurecen la expresión; muy separadas hacen ver la nariz más ancha." });
  add({ id: "ojo_cara", zona: "ojos", nombre: "Ancho del ojo contra ancho de cara",
    valor: eyeW / bizy, unidad: "", rango: [0.185, 0.205],
    lineas: [[eyeLo, eyeLi], [zyL, zyR]],
    que: "Ancho de un ojo dividido entre el ancho de pómulos.",
    significa: "La regla de los quintos dice que un ojo ocupa cerca de un quinto del ancho de la cara." });
  add({ id: "bitemporal", zona: "proporciones", nombre: "Ancho de sienes contra pómulos",
    valor: dist(P(21), P(251)) / bizy, unidad: "", rango: [0.9, 0.96],
    lineas: [[P(21), P(251)], [zyL, zyR]],
    que: "Ancho de la frente a la altura de las sienes dividido entre el ancho de pómulos.",
    significa: "Dice si la parte alta de la cara es más angosta o más ancha que los pómulos. Ayuda a elegir corte de cabello." });
  add({ id: "ojos_boca", zona: "proporciones", nombre: "Distancia de ojos a boca contra alto de cara",
    valor: down(mid(pupL, pupR), stom) / down(P(10), ment), unidad: "", rango: [0.4, 0.43],
    lineas: [[mid(pupL, pupR), stom], [P(10), ment]],
    que: "Distancia vertical de los ojos a la boca dividida entre el alto de la cara.",
    significa: "Relaciona el largo del centro de la cara con su alto total. Alto, la zona entre ojos y boca se ve larga; bajo, compacta." });
  add({ id: "nariz_alto_ancho", zona: "nariz", nombre: "Ancho contra largo de la nariz",
    valor: noseW / down(P(168), subn), unidad: "", rango: [0.78, 0.88],
    lineas: [[alaL, alaR], [P(168), subn]],
    que: "Ancho de la base de la nariz dividido entre su largo, del entrecejo a la base.",
    significa: "Valores altos dan una nariz ancha y corta; valores bajos, una nariz larga y angosta." });
  add({ id: "nariz_cara", zona: "nariz", nombre: "Ancho de nariz contra ancho de cara",
    valor: noseW / bizy, unidad: "", rango: [0.28, 0.305],
    lineas: [[alaL, alaR], [zyL, zyR]],
    que: "Ancho de la nariz dividido entre el ancho de pómulos.",
    significa: "Dice qué tanto espacio ocupa la nariz en el ancho total de la cara." });
  add({ id: "filtrum", zona: "boca", nombre: "Espacio nariz-boca en el tercio inferior",
    valor: down(subn, stom) / down(subn, ment), unidad: "", rango: [0.305, 0.34],
    lineas: [[subn, stom], [subn, ment]],
    que: "Distancia de la base de la nariz a la línea de la boca, como parte del tercio inferior.",
    significa: "La referencia es cerca de un tercio. Más que eso, el labio superior se ve largo y la cara envejece; menos, el mentón domina." });
  add({ id: "labios_grosor", zona: "boca", nombre: "Grosor de labios contra ancho de boca",
    valor: down(P(0), P(17)) / mouthW, unidad: "", rango: mujer ? [0.32, 0.37] : [0.26, 0.31],
    lineas: [[P(0), P(17)], [mouthL, mouthR]],
    que: "Alto total de los dos labios dividido entre el ancho de la boca.",
    significa: "Valores altos dan labios gruesos; bajos, labios delgados. Cambia mucho si la boca está apretada." });
  add({ id: "boca_mandibula", zona: "boca", nombre: "Ancho de boca contra mandíbula",
    valor: mouthW / bigo, unidad: "", rango: [0.44, 0.52],
    lineas: [[mouthL, mouthR], [goL, goR]],
    que: "Ancho de la boca dividido entre el ancho de la mandíbula.",
    significa: "Relaciona el tamaño de la boca con la parte baja de la cara." });
  add({ id: "angulo_menton", zona: "mandibula", nombre: "Ángulo frontal de la mandíbula",
    valor: angleAt(ment, goL, goR), unidad: "°", rango: mujer ? [110, 117] : [116, 123],
    lineas: [[goL, ment], [ment, goR]],
    que: "Ángulo que forman las dos líneas de la mandíbula al llegar al mentón.",
    significa: "Cerrado, la cara termina en punta, en forma de V; abierto, la mandíbula se ve ancha y cuadrada." });
  add({ id: "afinado", zona: "mandibula", nombre: "Ancho de mentón contra mandíbula",
    valor: chinW / bigo, unidad: "", rango: [0.21, 0.235],
    lineas: [[P(148), P(377)], [goL, goR]],
    que: "Ancho del mentón dividido entre el ancho de la mandíbula.",
    significa: "Dice qué tanto se afina la cara de la mandíbula al mentón." });

  // ---------- simetría
  // ---------- more detail: lips, nose bridge, cheekbones
  const peakL = P(37), peakR = P(267), peakMid = mid(peakL, peakR);
  add({ id: "arco_cupido", zona: "boca", nombre: "Profundidad del arco de cupido",
    valor: down(peakMid, lipTop) / Math.max(1, down(peakMid, stom)), unidad: "", rango: [0.15, 0.3],
    lineas: [[peakL, lipTop], [lipTop, peakR], [peakMid, stom]],
    que: "Qué tanto baja el centro del labio superior entre los dos picos, contra la altura del labio superior.",
    significa: "Un arco de cupido marcado da un labio superior definido. Muy plano se ve sin forma; muy profundo, un labio en forma de corazón." });
  const stomMid = mid(P(13), P(14));
  const comis = (along(stomMid, mid(mouthL, mouthR), vx, vy)) / mouthW * 100;
  add({ id: "comisuras", zona: "boca", nombre: "Posición de las comisuras", unidad: "%",
    valor: comis, rango: [-2, 4],
    lineas: [[mouthL, stomMid], [stomMid, mouthR]],
    que: "Qué tan arriba o abajo quedan las esquinas de la boca respecto al centro de los labios, con la cara relajada.",
    significa: "Comisuras un poco hacia arriba dan una expresión amable aunque no sonrías. Hacia abajo, la cara se ve seria o cansada." });
  const puente = dist(P(193), P(417));
  add({ id: "puente_nariz", zona: "nariz", nombre: "Ancho del puente contra ancho de la nariz", unidad: "",
    valor: puente / noseW, rango: [0.3, 0.45],
    lineas: [[P(193), P(417)], [alaL, alaR]],
    que: "Ancho del dorso de la nariz a la altura de los ojos, dividido entre el ancho de las alas.",
    significa: "Un puente angosto con alas proporcionadas se ve fino. Un puente ancho hace que la nariz se vea más grande de frente." });
  const eyeY = mid(pupL, pupR), pom = mid(P(116), P(345));
  add({ id: "pomulos_altura", zona: "proporciones", nombre: "Altura de los pómulos", unidad: "",
    valor: down(pom, stomMid) / Math.max(1, down(eyeY, stomMid)), rango: [0.7, 0.85],
    lineas: [[P(116), P(345)], [eyeY, stomMid]],
    que: "Dónde quedan los pómulos entre los ojos y la boca. 1 sería a la altura de los ojos y 0 a la altura de la boca.",
    significa: "Pómulos altos dan un rostro medio con más estructura. Bajos, la cara se ve más plana en la zona media." });

  const a = P(168), b = ment;
  const pairs = [[33, 263], [133, 362], [61, 291], [234, 454], [172, 397], [70, 300], [105, 334], [50, 280], [58, 288], [129, 358]];
  const devs = pairs.map(([l, r]) => dist(P(l), reflect(P(r), a, b)) / bizy);
  const dev = devs.reduce((s, x) => s + x, 0) / devs.length;
  add({ id: "simetria", zona: "simetria", nombre: "Simetría general",
    valor: Math.max(0, 100 * (1 - dev / 0.09)), unidad: "%", rango: [80, 100], tipo: "alto",
    lineas: [[a, b]].concat(pairs.slice(0, 5).map(([l, r]) => [P(l), P(r)])),
    que: "Qué tanto coinciden los puntos del lado izquierdo con los del derecho al reflejarlos sobre la línea media.",
    significa: "Nadie es perfectamente simétrico. Si la cabeza está girada o inclinada en la foto, este número baja aunque tu cara sea simétrica." });

  const tiltDiff = Math.abs(tilt(eyeLi, eyeLo) - tilt(eyeRi, eyeRo));
  add({ id: "simetria_ojos", zona: "simetria", nombre: "Diferencia de inclinación entre ojos",
    valor: tiltDiff, unidad: "°", rango: [0, 2], tipo: "bajo",
    lineas: [[eyeLi, eyeLo], [eyeRi, eyeRo]],
    que: "Diferencia entre la inclinación del ojo izquierdo y la del derecho.",
    significa: "Hasta unos 2 grados es normal y casi nadie lo nota." });

  const midP = mid(pupL, pupR), pct = (x) => x * 100;
  add({ id: "sim_cejas", zona: "simetria", nombre: "Diferencia de altura entre cejas",
    valor: pct(Math.abs(along(bLp, midP, vx, vy) - along(bRp, midP, vx, vy)) / ipd), unidad: "%", rango: [0, 3], tipo: "bajo",
    lineas: [[bLp, bRp]],
    que: "Qué tanto más alta queda una ceja que la otra, como porcentaje de la distancia entre pupilas.",
    significa: "Casi todos tenemos una ceja más alta. Arriba de 3% ya se nota y se corrige con diseño de cejas." });
  const hL = dist(P(159), P(145)), hR = dist(P(386), P(374));
  add({ id: "sim_apertura", zona: "simetria", nombre: "Diferencia de apertura entre ojos",
    valor: pct(Math.abs(hL - hR) / ((hL + hR) / 2)), unidad: "%", rango: [0, 10], tipo: "bajo",
    lineas: [[P(159), P(145)], [P(386), P(374)]],
    que: "Diferencia entre qué tan abierto está un ojo y el otro.",
    significa: "Un ojo algo más cerrado es común. Depende de la expresión y del cansancio." });
  add({ id: "sim_boca", zona: "simetria", nombre: "Inclinación de la boca",
    valor: Math.abs(deg(Math.atan2(along(mouthR, mouthL, vx, vy), Math.abs(along(mouthR, mouthL, ux, uy))))), unidad: "°", rango: [0, 2], tipo: "bajo",
    lineas: [[mouthL, mouthR], [pupL, pupR]],
    que: "Ángulo de la línea de la boca contra la línea de los ojos.",
    significa: "Hasta 2 grados no se percibe. Más que eso, una comisura queda visiblemente más alta." });
  add({ id: "sim_nariz", zona: "simetria", nombre: "Desviación de la nariz",
    valor: pct(Math.abs(along(P(1), midP, ux, uy)) / ipd), unidad: "%", rango: [0, 4], tipo: "bajo",
    lineas: [[midP, ment], [midP, P(1)]],
    que: "Qué tanto se sale la punta de la nariz de la línea media de la cara.",
    significa: "Si la cabeza está girada en la foto este número sube. Con la foto bien de frente, indica una nariz desviada." });
  add({ id: "sim_menton", zona: "simetria", nombre: "Desviación del mentón",
    valor: pct(Math.abs(along(ment, midP, ux, uy)) / ipd), unidad: "%", rango: [0, 5], tipo: "bajo",
    lineas: [[midP, { x: midP.x + vx * down(midP, ment), y: midP.y + vy * down(midP, ment) }], [midP, ment]],
    que: "Qué tanto se sale el mentón de la línea media de la cara.",
    significa: "Un mentón desviado suele venir de la mandíbula o de la mordida. Una desviación chica es normal." });
  add({ id: "sim_mandibula", zona: "simetria", nombre: "Diferencia entre lados de la mandíbula",
    valor: pct(Math.abs(dist(goL, ment) - dist(goR, ment)) / ((dist(goL, ment) + dist(goR, ment)) / 2)), unidad: "%", rango: [0, 6], tipo: "bajo",
    lineas: [[goL, ment], [goR, ment]],
    que: "Diferencia de largo entre el lado izquierdo y el derecho de la mandíbula.",
    significa: "Diferencias chicas son normales. Las grandes suelen venir de masticar más de un lado o de la postura." });

  return out;
}

// Zone scores and overall score from the measurements.
export function resumen(medidas) {
  const zonas = ZONAS.map(([id, nombre]) => {
    const ms = medidas.filter(m => m.zona === id);
    return { id, nombre, puntaje: ms.length ? Math.round(ms.reduce((s, m) => s + m.puntaje, 0) / ms.length) : null };
  });
  const con = zonas.filter(z => z.puntaje !== null);
  return { zonas, general: Math.round(con.reduce((s, z) => s + z.puntaje, 0) / con.length) };
}

// Checks that the photo is usable: one face, looking at the camera, head level.
function calidad(L, w, h) {
  const avisos = [];
  const pupL = L[468], pupR = L[473];
  const roll = Math.abs(deg(Math.atan2(pupR.y - pupL.y, pupR.x - pupL.x)));
  if (roll > 6) avisos.push("La cabeza está inclinada. Con la cabeza derecha las medidas salen más exactas.");
  const nose = L[1], zyL = L[234], zyR = L[454];
  const yaw = Math.abs((nose.x - zyL.x) - (zyR.x - nose.x)) / (zyR.x - zyL.x);
  if (yaw > 0.12) avisos.push("La cara está girada hacia un lado. Mira de frente a la cámara.");
  if ((zyR.x - zyL.x) / w < 0.25) avisos.push("La cara se ve pequeña en la foto. Acércate un poco más.");
  return avisos;
}

// image: HTMLImageElement, ImageBitmap or canvas.
export async function analizar(image, sexo) {
  const lm = await getLandmarker();
  const res = lm.detect(image);
  const faces = res.faceLandmarks || [];
  if (!faces.length) throw new Error("sin_cara");
  if (faces.length > 1) throw new Error("varias_caras");
  const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
  const L = faces[0].map(p => ({ x: p.x * w, y: p.y * h }));
  if (L.length < 478) throw new Error("sin_iris");
  const medidas = medir(L, sexo);
  const xs = L.map(p => p.x), ys = L.map(p => p.y);
  const caja = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  return { ancho: w, alto: h, puntos: L, caja, medidas, resumen: resumen(medidas), avisos: calidad(L, w, h) };
}
