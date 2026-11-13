// Writes the facial analysis for a paid order. Three requests run at the same time over the six photos
// and the measurements taken in the browser: the scored evaluation (angularity, dimorphism, features),
// the main report, and the detail sections. The work continues after the response is sent, so the
// panel asks again until the report is there.
// Secrets: ANTHROPIC_API_KEY, optional ANTHROPIC_MODEL, SITE_URL.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MODELO = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
const VERSION = 2;
const FOTOS: [string, string][] = [
  ["frente", "de frente, cara relajada"], ["sonrisa", "de frente sonriendo"],
  ["perfil_izq", "de perfil"], ["perfil_der", "el otro perfil"],
  ["tres_cuartos_izq", "tres cuartos izquierdo"], ["tres_cuartos_der", "tres cuartos derecho"]
];

// Everything the evaluation scores from the photos, grouped the way the panel shows it.
const CATALOGO: Record<string, { titulo: string; pilar: string; items: Record<string, string> }> = {
  angularidad: { titulo: "Angularidad", pilar: "angularidad", items: {
    ang_pomulos: "Prominencia de pómulos", ang_mandibula: "Definición de la mandíbula", ang_mejillas: "Mejillas sin exceso de volumen",
    ang_menton: "Definición del mentón", ang_submenton: "Definición bajo el mentón" } },
  tres_cuartos: { titulo: "Estructura en tres cuartos", pilar: "angularidad", items: {
    tq_pomulo: "Proyección del pómulo de lado", tq_hueco: "Sombra bajo el pómulo", tq_linea: "Línea de la mandíbula de lado" } },
  dimorfismo: { titulo: "Dimorfismo", pilar: "dimorfismo", items: {
    dim_mandibula: "Mandíbula", dim_arco: "Arco de la ceja", dim_cejas: "Grosor de cejas", dim_ojos: "Ojos", dim_forma: "Forma de la cara",
    dim_vello: "Vello facial", dim_cabello: "Cabello", dim_linea: "Línea del cabello", dim_labios: "Labios", dim_nariz: "Nariz" } },
  piel: { titulo: "Piel", pilar: "rasgos", items: {
    piel_acne: "Acné y granitos", piel_marcas: "Cicatrices y marcas", piel_manchas: "Manchas", piel_rojez: "Rojez", piel_textura: "Textura y poros",
    piel_brillo: "Brillo y grasa", piel_tono: "Tono uniforme", piel_lineas: "Líneas finas", piel_surcos: "Surcos de nariz a boca", piel_firmeza: "Firmeza" } },
  ojos: { titulo: "Zona de ojos", pilar: "rasgos", items: {
    ojo_ojeras: "Ojeras (color)", ojo_hundido: "Hundimiento bajo el ojo", ojo_bolsas: "Bolsas", ojo_blanco: "Blanco del ojo",
    ojo_parpado_sup: "Párpado superior", ojo_parpado_inf: "Párpado inferior", ojo_pestanas: "Pestañas", ojo_soporte: "Soporte bajo el ojo" } },
  cejas: { titulo: "Cejas", pilar: "rasgos", items: { ceja_densidad: "Densidad", ceja_forma: "Forma", ceja_pareja: "Parejas entre sí" } },
  nariz: { titulo: "Nariz", pilar: "rasgos", items: { nar_dorso: "Dorso", nar_punta: "Punta", nar_alas: "Alas" } },
  cabello: { titulo: "Cabello", pilar: "rasgos", items: { cab_densidad: "Densidad", cab_linea: "Línea frontal", cab_salud: "Salud y brillo", cab_corte: "Corte actual para tu cara" } },
  labios: { titulo: "Labios", pilar: "rasgos", items: { lab_definicion: "Definición del contorno", lab_hidratacion: "Hidratación" } },
  sonrisa: { titulo: "Sonrisa", pilar: "rasgos", items: {
    son_dientes: "Cuánto diente se ve", son_encia: "Encía visible", son_simetria: "Simetría de la sonrisa", son_alineacion: "Alineación", son_color: "Color de los dientes" } },
  conjunto: { titulo: "Conjunto", pilar: "rasgos", items: { con_simetria: "Simetría a la vista" } },
};
const IDS = Object.values(CATALOGO).flatMap((g) => Object.keys(g.items));

const texto = { type: "string" };
const lista = (min: number, max: number) => ({ type: "array", minItems: min, maxItems: max, items: texto });
const lectura = (d: string) => ({ type: "object", required: ["lectura", "acciones"], description: d, properties: { lectura: texto, acciones: lista(1, 4) } });
const muestra = { type: "object", required: ["nombre", "hex"], properties: { nombre: texto, hex: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } } };

const T_EVAL = {
  name: "evaluacion", description: "Entrega la calificación de cada rasgo.",
  input_schema: { type: "object", required: ["evaluaciones"], properties: { evaluaciones: {
    type: "array", minItems: IDS.length, maxItems: IDS.length,
    items: { type: "object", required: ["id", "puntaje", "nota"], properties: {
      id: { type: "string", enum: IDS }, puntaje: { type: "number", minimum: 0, maximum: 10 },
      nota: { type: "string", description: "Una frase corta, máximo 18 palabras, con lo que se ve en sus fotos." } } } } } }
};
const T_PRINCIPAL = {
  name: "reporte", description: "Entrega la parte principal del reporte.",
  input_schema: { type: "object", required: ["resumen", "fortalezas", "prioridades", "plan"], properties: {
    resumen: { type: "string", description: "Tres o cuatro frases sobre la cara en conjunto. Directo y respetuoso." },
    arquetipo: { type: "object", required: ["nombre", "texto"], description: "El tipo de cara en dos o tres palabras descriptivas (por ejemplo: anguloso y serio, suave y juvenil) y a qué estilo le favorece.", properties: { nombre: texto, texto } },
    fortalezas: { type: "array", minItems: 3, maxItems: 5, items: { type: "object", required: ["titulo", "texto"], properties: { titulo: texto, texto } } },
    prioridades: { type: "array", minItems: 4, maxItems: 6, description: "Lo que más cambia la percepción si se trabaja, ordenado por impacto.",
      items: { type: "object", required: ["titulo", "texto", "impacto", "esfuerzo"], properties: { titulo: texto, texto,
        impacto: { type: "string", enum: ["alto", "medio", "bajo"] }, esfuerzo: { type: "string", enum: ["bajo", "medio", "alto"] } } } },
    plan: { type: "array", minItems: 3, maxItems: 3, description: "Fases: 0 a 4 semanas, 1 a 3 meses, 3 a 12 meses.",
      items: { type: "object", required: ["fase", "pasos"], properties: { fase: texto,
        pasos: { type: "array", minItems: 3, maxItems: 6, items: { type: "object", required: ["accion", "porque"], properties: { accion: texto, porque: texto } } } } } },
    avanzado: { type: "array", maxItems: 6, description: "Solo plan completo: procedimientos que suelen considerarse para este rostro.",
      items: { type: "object", required: ["nombre", "que_hace", "considerar"], properties: { nombre: texto, que_hace: texto, considerar: texto } } }
  } }
};
const T_ZONAS = {
  name: "zonas", description: "Entrega la lectura por zonas y por ángulo.",
  input_schema: { type: "object", required: ["zonas", "perfil", "sonrisa", "tres_cuartos"], properties: {
    zonas: { type: "array", minItems: 6, maxItems: 6, description: "Una por zona, en este orden: proporciones, ojos, nariz, boca, mandibula, simetria.",
      items: { type: "object", required: ["id", "lectura", "acciones"], properties: {
        id: { type: "string", enum: ["proporciones", "ojos", "nariz", "boca", "mandibula", "simetria"] }, lectura: texto, acciones: lista(1, 3) } } },
    perfil: lectura("Nariz, labios, mentón, cuello y mandíbula de lado, con las medidas de perfil."),
    sonrisa: lectura("Dientes, encía, simetría y cómo cambia la cara al sonreír."),
    tres_cuartos: lectura("Pómulos, volumen de mejillas, mandíbula, ojeras y surcos vistos de tres cuartos.")
  } }
};
const T_ESTILO = {
  name: "estilo", description: "Entrega piel, color y estilo.",
  input_schema: { type: "object", required: ["piel", "color", "cabello_barba"], properties: {
    piel: lectura("Tono, textura, rojez, brillo, marcas y ojeras. Con una rutina concreta de mañana y noche en las acciones."),
    color: { type: "object", required: ["subtono", "lectura", "paleta", "evitar"], properties: {
      subtono: { type: "string", enum: ["cálido", "frío", "neutro"] }, contraste: { type: "string", enum: ["alto", "medio", "bajo"] }, lectura: texto,
      paleta: { type: "array", minItems: 6, maxItems: 8, items: muestra }, evitar: { type: "array", minItems: 2, maxItems: 4, items: muestra } } },
    cabello_barba: { type: "object", required: ["cortes", "barba", "cejas"], properties: {
      cortes: lista(2, 4), barba: lista(1, 3), cejas: lista(1, 3), lentes: lista(0, 3) },
      description: "barba: para mujeres úsalo para maquillaje de contorno. lentes: formas de armazón que favorecen." },
    longevidad: { type: "object", required: ["edad_visual", "edad_visual_meta", "lectura", "acciones"], description: "Edad visual: cuántos años aparenta en las fotos, por piel, ojeras, surcos, volumen, cabello y postura. Sé honesto: puede ser mayor o menor que su edad real.",
      properties: { edad_visual: { type: "integer", minimum: 15, maximum: 90 }, edad_visual_meta: { type: "integer", minimum: 15, maximum: 90, description: "Edad que podría aparentar en 6 a 12 meses siguiendo su plan sin procedimientos. Realista: casi nunca más de 4 años menos." },
        lectura: { type: "string", description: "Dos o tres frases: qué le suma o le quita años." }, acciones: lista(2, 4) } },
    potencial: { type: "object", required: ["general_soft", "grupos"], description: "Calificación realista de 0 a 10 que podría alcanzar.",
      properties: { general_soft: { type: "number", minimum: 0, maximum: 10, description: "General en 6 a 12 meses siguiendo el plan sin procedimientos." },
        general_hard: { type: "number", minimum: 0, maximum: 10, description: "Solo plan completo: general sumando los procedimientos que sí tienen sentido." },
        grupos: { type: "array", items: { type: "object", required: ["id", "valor"], properties: { id: { type: "string", enum: ["angularidad", "dimorfismo", "piel", "ojos", "cejas", "nariz", "cabello", "labios", "sonrisa"] }, valor: { type: "number", minimum: 0, maximum: 10 } } } } } }
  } }
};

// The model sometimes hands back a section as a JSON string (with stray text after it). Recover the object.
function parsear(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  try { return JSON.parse(t); } catch (_) { /* fall through */ }
  if (t[0] !== "{" && t[0] !== "[") return v;
  let depth = 0, enTexto = false, escape = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enTexto) { if (escape) escape = false; else if (c === "\\") escape = true; else if (c === '"') enTexto = false; continue; }
    if (c === '"') enTexto = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) { try { return JSON.parse(t.slice(0, i + 1)); } catch (_) { return v; } } }
  }
  return v;
}
function limpiar(r: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[k] = parsear(v);
  return o;
}
const hay = (x: unknown) => Array.isArray(x) && x.length > 0;
// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;
const okEval = (r: Obj) => hay(r.evaluaciones) && r.evaluaciones.length >= IDS.length * 0.8;
const okPrincipal = (r: Obj) => typeof r.resumen === "string" && r.resumen.length > 20 && hay(r.fortalezas) && hay(r.prioridades) && hay(r.plan);
const okZonas = (r: Obj) => hay(r.zonas) && r.perfil?.lectura;
const okEstilo = (r: Obj) => r.piel?.lectura && hay(r.piel.acciones) && r.color?.lectura && hay(r.color.paleta) && hay(r.cabello_barba?.cortes);

const dec = (v: number) => Math.round(v * 10) / 10;
const prom = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
// Proportion alone says little about how a face is perceived, so the curve is strict: an ordinary set of ratios lands near 5.5.
const armonia = (m: Obj) => {
  const ps = [...(m.medidas ?? []), ...(m.perfil?.medidas ?? [])].map((x: Obj) => x.puntaje).filter((x: unknown) => typeof x === "number");
  return ps.length ? dec(10 * Math.pow((prom(ps) as number) / 100, 2.2)) : null;
};

function estilo(tier: string, a: Obj) {
  const datos = Object.entries(a).filter(([, v]) => v !== null && v !== "" && v !== undefined).map(([k, v]) => `${k}: ${v}`).join("; ");
  return `Eres el analista de Resalta, un servicio de análisis de estética facial para México y Latinoamérica. Escribes para un cliente que ya pagó, a partir de sus fotos y de sus medidas. Algunas fotos son opcionales: si falta un ángulo, no inventes lo que no se ve y dilo cuando importe.

Datos que dio el cliente: ${datos || "ninguno"}. Plan contratado: ${tier === "hard" ? "completo" : "esencial"}.

Cómo escribir:
- Español de México, de tú, claro y directo. Nada de relleno ni de frases motivacionales.
- Nunca uses guiones largos. Usa comas o reescribe la frase.
- Que no suene a texto escrito por una máquina. Frases normales, como las diría una persona que sabe del tema.
- Habla de lo que de verdad se ve en sus fotos y en sus números, no de generalidades. Cita medidas concretas cuando apoyen lo que dices.
- Honesto y respetuoso. Puedes decir qué está fuera de rango sin insultar ni dramatizar. No infles: decirle a alguien que todo está bien cuando no lo está no le sirve.
- Ajusta las recomendaciones a lo que el cliente dijo de su presupuesto, su tiempo y si le interesan procedimientos. "presupuesto" es lo que puede gastar al mes en su cuidado diario; "presupuesto_procedimientos" es lo que puede invertir en total en procedimientos. Si un procedimiento que conviene queda fuera de ese presupuesto, dilo y ofrece primero la opción que sí le alcanza.
- Las medidas vienen de fotos de celular, así que son estimaciones. Si una foto está girada o inclinada, dilo en vez de sacar conclusiones.
- Grasa facial: si en las fotos se nota grasa acumulada en la cara (mejillas llenas, papada, mandíbula y pómulos poco marcados, cuello que se une con la barbilla) y la persona no se ve delgada, dilo con respeto y pon bajar de peso de forma gradual entre las primeras acciones: es de lo que más define la mandíbula, los pómulos y el cuello, mejora casi todas las medidas y suele cambiar más la cara que cualquier tratamiento. Antes de sugerir procedimientos para definir (rellenos de mandíbula, lipo de papada, bichectomía), aclara que primero conviene bajar de peso y ver cómo queda. Sin cifras de kilos, calorías ni dietas específicas; sugiere hacerlo con un médico o nutriólogo. Si la cara ya se ve delgada, no lo menciones.
- No diagnostiques ni recetes. Nada de medicamentos con nombre ni dosis.
- Sé concreto y breve: cada texto de dos a cuatro frases, cada acción en una frase. No pienses en voz alta ni expliques tu proceso.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);

    const body = await req.json();
    const { data: order } = await userClient.from("orders")
      .select("id,user_id,status,tier,answers,medidas").eq("id", body.order_id).single();
    if (!order) return json({ error: "Pedido no encontrado" }, 404);
    if (order.status !== "pagado" && order.status !== "listo") return json({ error: "Este pedido todavía no está pagado" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ahora = new Date().toISOString();

    // Already written for this plan and this version: hand it back instead of paying for it twice.
    const { data: previo } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
    const pd = previo?.data ?? null;
    const vigente = pd?.resumen && pd.v === VERSION && !(order.tier === "hard" && pd.tier !== "hard");
    if (vigente && pd.estado !== "generando") return json({ ok: true, data: pd });
    if (pd?.estado === "generando" && Date.now() - Date.parse(pd.desde) < 200000) return json({ ok: true, generando: true });

    // Orders paid before measuring existed can send the measurements now, once.
    if (!order.medidas?.medidas?.length) {
      const m = body.medidas;
      const valido = m && Array.isArray(m.medidas) && m.medidas.length > 5 && m.medidas.length < 80 && m.resumen?.zonas && m.caja && JSON.stringify(m).length < 150000;
      if (!valido) return json({ error: "sin_medidas" }, 400);
      await admin.from("orders").update({ medidas: m }).eq("id", order.id);
      order.medidas = m;
    }
    if (!order.medidas.perfil && body.perfil) {
      const pf = body.perfil;
      if (Array.isArray(pf.medidas) && pf.medidas.length > 3 && pf.medidas.length < 60 && pf.caja && JSON.stringify(pf).length < 80000) {
        order.medidas = { ...order.medidas, perfil: pf };
        await admin.from("orders").update({ medidas: order.medidas }).eq("id", order.id);
      }
    }

    // Claim the job so two open tabs don't each pay for a report.
    const viejo = pd?.resumen ? pd : null;
    const marca = { ...(viejo ?? {}), estado: "generando", desde: ahora };
    if (!previo) {
      const { error } = await admin.from("reports").insert({ order_id: order.id, user_id: order.user_id, data: marca });
      if (error) return json({ ok: true, generando: true });
    } else {
      await admin.from("reports").update({ data: marca }).eq("order_id", order.id);
    }
    const fallar = (motivo: string) => admin.from("reports").update({ data: { ...(viejo ?? {}), estado: "error", motivo, desde: new Date().toISOString() } }).eq("order_id", order.id);

    const trabajo = (async () => {
      try {
        const imagenes: unknown[] = [], vistas: string[] = [];
        await Promise.all(FOTOS.map(async ([slot, etiqueta], i) => {
          const { data: file } = await admin.storage.from("fotos").download(`${order.user_id}/${order.id}/${slot}.jpg`);
          if (!file) return;
          const bytes = new Uint8Array(await file.arrayBuffer());
          let bin = ""; for (let j = 0; j < bytes.length; j += 8192) bin += String.fromCharCode(...bytes.subarray(j, j + 8192));
          imagenes[i] = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: btoa(bin) } }; vistas[i] = etiqueta;
        }));
        const fotos = imagenes.filter(Boolean), nombres = vistas.filter(Boolean);
        if (!fotos.length) { await fallar("sin_fotos"); return; }

        const m = order.medidas;
        const fila = (x: Obj) => `${x.nombre} (${x.zona}): ${x.valor}${x.unidad ?? ""} | referencia ${x.rango[0]} a ${x.rango[1]} | ${x.estado} | ${dec(x.puntaje / 10)}/10`;
        const datos = `Fotos, en este orden: ${nombres.join("; ")}.

Medidas de frente:
${m.medidas.map(fila).join("\n")}
${m.perfil?.medidas?.length ? `\nMedidas de perfil (tomadas de la silueta; los milímetros son aproximados):\n${m.perfil.medidas.map(fila).join("\n")}` : "\nNo hay medidas de perfil para este pedido."}
${m.avisos?.length ? `\nAvisos de calidad de la foto de frente: ${m.avisos.join(" ")}` : ""}`;

        const sistema = estilo(order.tier, order.answers ?? {});
        const inicio = Date.now();
        const pedir = async (tool: Obj, instruccion: string, valido: (r: Obj) => boolean, max: number) => {
          // a second try only if the first one failed fast, so the whole job fits in the time the server allows
          for (let intento = 0; intento < 2 && (intento === 0 || Date.now() - inicio < 45000); intento++) {
            const r = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
              body: JSON.stringify({
                model: MODELO, max_tokens: max, system: sistema, tools: [tool], tool_choice: { type: "auto" },
                messages: [{ role: "user", content: [...fotos, { type: "text", text: `${datos}\n\n${instruccion}\n\nEntrega el resultado llamando a la herramienta ${tool.name}. No escribas nada fuera de la herramienta.` }] }]
              })
            });
            if (!r.ok) { console.error("anthropic", tool.name, r.status, (await r.text()).slice(0, 400)); continue; }
            const resp = await r.json();
            const bloque = (resp.content ?? []).find((c: Obj) => c.type === "tool_use");
            let input: Obj | null = bloque ? limpiar(bloque.input) : null;
            if (!input) { // some models answer with the JSON as text instead of calling the tool
              const t = (resp.content ?? []).filter((c: Obj) => c.type === "text").map((c: Obj) => c.text).join("");
              const obj = t.indexOf("{") >= 0 ? parsear(t.slice(t.indexOf("{"))) : null;
              if (obj && typeof obj === "object") input = limpiar(obj as Obj);
            }
            if (input && valido(input)) return { input, usage: resp.usage ?? null };
            console.warn("respuesta incompleta", tool.name, resp.stop_reason, JSON.stringify(resp.usage ?? {}));
          }
          return null;
        };

        const [ev, pr, zo, es] = await Promise.all([
          pedir(T_EVAL, `Califica de 0 a 10 cada uno de estos rasgos a partir de las fotos, uno por cada id, sin saltarte ninguno:
${Object.values(CATALOGO).map((g) => `${g.titulo}: ${Object.entries(g.items).map(([id, n]) => `${id} (${n})`).join(", ")}`).join("\n")}

Escala: 5 es una persona promedio de su edad y sexo. La mayoría de la gente queda entre 4 y 6. Un 7 ya es claramente por encima del promedio, un 8 es poco común y un 9 es nivel de modelo profesional. Sé estricto y usa decimales; no regales puntos. Más alto siempre es mejor (por ejemplo, en acné un 9 es piel limpia).
En dimorfismo, califica qué tanto ese rasgo se acerca a lo que se percibe como atractivo para su sexo. Si un rasgo no aplica o no se alcanza a ver (por ejemplo vello facial en una mujer, o cabello tapado), pon 5 y dilo en la nota.`, okEval, 12000),
          pedir(T_PRINCIPAL, `Escribe la parte principal del reporte: resumen, arquetipo, fortalezas, prioridades y plan por fases.${order.tier === "hard"
            ? " Incluye también avanzado: procedimientos estéticos que se suelen considerar para un rostro con estas proporciones, qué hace cada uno y qué pensar antes. Preséntalo como información general que debe evaluar un médico certificado, no como una recomendación tuya, y di cuando algo no parece indicado."
            : " No llenes avanzado, este cliente tiene el plan esencial."}`, okPrincipal, 12000),
          pedir(T_ZONAS, "Escribe la lectura zona por zona y las de perfil, sonrisa y tres cuartos.", okZonas, 12000),
          pedir(T_ESTILO, `Escribe piel, color personal y cabello, barba, cejas y lentes. Además: longevidad (edad visual contra su edad real de ${(order.answers ?? {}).edad || "?"} años, y la que podría aparentar con su plan) y potencial (calificación realista que podría alcanzar en general y en cada grupo, en la misma escala estricta donde 5 es el promedio; el potencial casi nunca sube más de 1.5 puntos sin procedimientos).${order.tier === "hard" ? " Incluye general_hard." : " No llenes general_hard."}`, okEstilo, 12000),
        ]);
        if (!pr) { await fallar("modelo"); return; }

        // group the scored items and work out the pillars
        const porId: Obj = {};
        for (const e of (ev?.input.evaluaciones ?? [])) if (e && IDS.includes(e.id) && typeof e.puntaje === "number") porId[e.id] = e;
        const grupos = Object.entries(CATALOGO).map(([id, g]) => {
          const items = Object.entries(g.items).filter(([k]) => porId[k]).map(([k, nombre]) => ({ id: k, nombre, puntaje: dec(Math.max(0, Math.min(10, porId[k].puntaje))), nota: String(porId[k].nota ?? "") }));
          return { id, titulo: g.titulo, pilar: g.pilar, puntaje: items.length ? dec(prom(items.map((x) => x.puntaje)) as number) : null, items };
        }).filter((g) => g.items.length);
        const pilar = (p: string) => { const xs = grupos.filter((g) => g.pilar === p).flatMap((g) => g.items.map((x) => x.puntaje)); return xs.length ? dec(prom(xs) as number) : null; };
        const puntajes: Obj = { armonia: armonia(m), angularidad: pilar("angularidad"), dimorfismo: pilar("dimorfismo"), rasgos: pilar("rasgos") };
        const vals = Object.values(puntajes).filter((x) => typeof x === "number" && x > 0) as number[];
        // close to a geometric mean: the weakest pillar pulls the total down
        puntajes.general = vals.length ? dec(Math.pow(vals.reduce((s, x) => s * x, 1), 1 / vals.length)) : null;
        const nMedidas = (m.medidas?.length ?? 0) + (m.perfil?.medidas?.length ?? 0);

        const data: Obj = { ...pr.input, ...(zo?.input ?? {}), ...(es?.input ?? {}), grupos, puntajes, evaluaciones: nMedidas + Object.keys(porId).length,
          v: VERSION, tier: order.tier, modelo: MODELO, generado: new Date().toISOString(), uso: [ev?.usage, pr.usage, zo?.usage, es?.usage], segundos: Math.round((Date.now() - inicio) / 1000) };
        if (order.tier !== "hard") { delete data.avanzado; if (data.potencial) delete data.potencial.general_hard; }
        await admin.from("reports").update({ data }).eq("order_id", order.id);
        await admin.from("orders").update({ status: "listo", delivered_at: new Date().toISOString() }).eq("id", order.id).eq("status", "pagado");
      } catch (e) {
        console.error(e);
        await fallar("excepcion");
      }
    })();

    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) { rt.waitUntil(trabajo); return json({ ok: true, generando: true }); }
    await trabajo;
    const { data: fin } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
    return fin?.data?.resumen && fin.data.estado !== "error" ? json({ ok: true, data: fin.data }) : json({ error: "No pudimos generar tu reporte en este momento" }, 502);
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos generar tu reporte en este momento" }, 500);
  }
});
