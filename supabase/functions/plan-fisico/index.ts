// Writes the nutrition and training plan for a subscriber's latest body check-in (table public.fisico).
// Calories and macros are worked out here with fixed, conservative rules; the model only turns them into
// meals and a training week that fit the person. The work continues after the response is sent and the
// panel asks again until the plan is there.
// Secrets: ANTHROPIC_API_KEY, optional ANTHROPIC_MODEL, SITE_URL.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MODELO = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
type Obj = Record<string, unknown>;

const ACTIVIDAD: Record<string, number> = { sedentario: 1.2, ligero: 1.375, moderado: 1.55, muy: 1.725 };
const OBJETIVO: Record<string, [number, string]> = {
  bajar: [-0.2, "bajar grasa"],
  recomp: [-0.1, "bajar grasa y ganar músculo al mismo tiempo"],
  musculo: [0.08, "ganar músculo"],
  mantener: [0, "mantener su peso y definir"],
};

// Mifflin-St Jeor, a moderate adjustment for the goal, and floors so the plan is never a crash diet.
function numeros(d: Obj) {
  const mujer = d.sexo === "mujer";
  const peso = Number(d.peso_kg), est = Number(d.estatura_cm), edad = Number(d.edad);
  const imc = peso / ((est / 100) ** 2);
  const bmr = 10 * peso + 6.25 * est - 5 * edad + (mujer ? -161 : 5);
  const tdee = bmr * (ACTIVIDAD[String(d.actividad)] ?? 1.375);
  let [ajuste] = OBJETIVO[String(d.objetivo)] ?? OBJETIVO.mantener;
  if (imc < 18.5 && ajuste < 0) ajuste = 0.05; // underweight: never a deficit
  if (imc < 20 && ajuste < -0.1) ajuste = -0.1;
  const piso = mujer ? 1400 : 1700;
  const kcal = Math.round(Math.max(piso, tdee * (1 + ajuste), ajuste < 0 ? bmr : 0) / 50) * 50;
  const pesoRef = Math.min(peso, 25 * (est / 100) ** 2); // protein on a healthy reference weight
  const prot = Math.round(pesoRef * (mujer ? 1.6 : 1.8) / 5) * 5;
  const grasa = Math.round(Math.max(peso * 0.7, kcal * 0.25 / 9) / 5) * 5;
  const carbs = Math.max(80, Math.round((kcal - prot * 4 - grasa * 9) / 4 / 5) * 5);
  const ritmo = ajuste < 0 ? `entre ${(peso * 0.004).toFixed(1)} y ${(peso * 0.008).toFixed(1)} kg por semana` : ajuste > 0 ? "entre 0.2 y 0.4 kg por semana" : "peso estable";
  return { kcal, prot, grasa, carbs, agua: Math.round(peso * 0.035 * 10) / 10, tdee: Math.round(tdee), imc: Math.round(imc * 10) / 10, ajuste, ritmo };
}

const lista = (desc: string, item: Obj = { type: "string" }) => ({ type: "array", description: desc, items: item });
const T_PLAN = {
  name: "plan_fisico",
  description: "El plan de nutrición y entrenamiento del cliente.",
  input_schema: {
    type: "object",
    required: ["resumen", "en_tu_cara", "comidas", "lista_super", "entreno", "habitos"],
    properties: {
      resumen: { type: "string", description: "2 o 3 frases: qué vamos a hacer este mes y por qué." },
      en_tu_cara: { type: "string", description: "2 o 3 frases: cómo se va a notar en su cara (mandíbula, pómulos, hinchazón, piel), sin prometer resultados exactos." },
      comidas: lista("Un día tipo. Cada momento del día con 3 opciones intercambiables que den más o menos lo mismo.", {
        type: "object", required: ["momento", "opciones"],
        properties: { momento: { type: "string", description: "Desayuno, Comida, Cena, Colación..." }, opciones: lista("3 opciones con porciones concretas (gramos, piezas, tazas).") },
      }),
      lista_super: lista("Lista del súper de la semana, ingredientes fáciles de conseguir en su país."),
      entreno: {
        type: "object", required: ["dias", "cardio", "progresion"],
        properties: {
          dias: lista("Un objeto por día de entrenamiento de la semana.", {
            type: "object", required: ["dia", "enfoque", "ejercicios"],
            properties: {
              dia: { type: "string", description: "Día 1, Día 2..." }, enfoque: { type: "string" },
              ejercicios: lista("Entre 4 y 7 ejercicios.", {
                type: "object", required: ["nombre", "series", "reps"],
                properties: { nombre: { type: "string" }, series: { type: "string" }, reps: { type: "string" }, nota: { type: "string", description: "Técnica o alternativa, corta. Opcional." } },
              }),
            },
          }),
          cardio: { type: "string", description: "Cuánto caminar o cardio a la semana." },
          progresion: { type: "string", description: "Cómo subir la dificultad semana a semana." },
        },
      },
      habitos: lista("Entre 4 y 6 hábitos concretos que más impactan la cara: sueño, sal, alcohol, agua, etc."),
    },
  },
};

function limpiar(v: unknown): Obj | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Obj;
  for (const k of Object.keys(o)) if (typeof o[k] === "string" && /^\s*[\[{]/.test(o[k] as string)) { try { o[k] = JSON.parse(o[k] as string); } catch { /* keep */ } }
  return o;
}
const valido = (p: Obj | null) => !!p && Array.isArray(p.comidas) && (p.comidas as unknown[]).length >= 2
  && !!p.entreno && Array.isArray((p.entreno as Obj).dias) && ((p.entreno as Obj).dias as unknown[]).length >= 1 && typeof p.resumen === "string";

async function fotoB64(path: string) {
  const { data } = await admin.storage.from("fotos").download(path);
  if (!data) return null;
  const buf = new Uint8Array(await data.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: btoa(s) } };
}

async function generar(fila: Obj, anterior: Obj | null) {
  const d = fila.datos as Obj, n = numeros(d), mujer = d.sexo === "mujer";
  const fotos = (await Promise.all(((fila.fotos as string[]) ?? []).slice(0, 3).map(fotoB64))).filter(Boolean);
  const previo = anterior ? `\nMes anterior (${String(anterior.created_at).slice(0, 10)}): pesaba ${anterior.peso_kg} kg. Hoy pesa ${fila.peso_kg} kg. Ajusta el plan a ese avance y menciónalo en el resumen.` : "";
  const sistema = `Eres el coach de nutrición y entrenamiento de Resalta, un servicio de análisis facial para hispanohablantes. Escribes en español neutro, de tú, claro y directo, sin frases motivacionales ni relleno, y sin guiones largos.
Tu enfoque: que el cliente se vea mejor, sobre todo de la cara. Bajar grasa corporal define mandíbula y pómulos; menos sal, alcohol y mejor sueño bajan la hinchazón.
${mujer ? "Es mujer: prioriza bajar grasa e hinchazón y tonificar; fuerza con cargas progresivas sin miedo a ponerse grande; nada de dietas extremas." : "Es hombre: prioriza bajar grasa para marcar la mandíbula, fuerza en espalda, hombros y cuello que enmarcan la cara, y buena postura."}
Reglas: respeta exactamente las calorías y macros que te doy. Comida real y fácil de conseguir en ${d.pais || "Latinoamérica"}, nada de suplementos raros. Respeta lo que no come. Nunca recomiendes ayunos largos, purgas, menos calorías de las indicadas ni pesarse a diario de forma obsesiva. No diagnostiques ni hables de enfermedades.`;
  const datos = `Datos: ${mujer ? "mujer" : "hombre"}, ${d.edad} años, ${d.estatura_cm} cm, ${d.peso_kg} kg (IMC ${n.imc}). Actividad: ${d.actividad}. Objetivo: ${(OBJETIVO[String(d.objetivo)] ?? OBJETIVO.mantener)[1]}.
Entrena ${d.dias} días por semana, ${d.minutos} minutos por sesión, en ${d.lugar === "gym" ? "gimnasio" : d.lugar === "casa_equipo" ? "casa con mancuernas o ligas" : "casa sin equipo"}.
Come ${d.comidas} veces al día. Tipo de alimentación: ${d.dieta}. No come o no le gusta: ${d.no_come || "nada en especial"}.
Objetivos del día (no los cambies): ${n.kcal} kcal, ${n.prot} g de proteína, ${n.carbs} g de carbohidratos, ${n.grasa} g de grasa, ${n.agua} litros de agua. Ritmo esperado: ${n.ritmo}.${previo}
${fotos.length ? "Las fotos son de su físico; úsalas solo para orientar el entrenamiento (postura, zonas a priorizar), sin comentar su cuerpo de forma negativa." : ""}`;
  for (let intento = 0; intento < 2; intento++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELO, max_tokens: 8000, system: sistema, tools: [T_PLAN], tool_choice: { type: "auto" },
        messages: [{ role: "user", content: [...fotos, { type: "text", text: `${datos}\n\nArma su plan de este mes con ${d.comidas} momentos de comida y ${d.dias} días de entrenamiento. Entrégalo llamando a la herramienta plan_fisico. No escribas nada fuera de la herramienta.` }] }],
      }),
    });
    if (!r.ok) { console.error("anthropic", r.status, (await r.text()).slice(0, 400)); continue; }
    const resp = await r.json();
    const bloque = (resp.content ?? []).find((c: Obj) => c.type === "tool_use") as Obj | undefined;
    const plan = bloque ? limpiar(bloque.input) : null;
    if (valido(plan)) return { ...plan, numeros: n };
    console.warn("plan incompleto", resp.stop_reason);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);

    const { data: sub } = await admin.from("suscripciones").select("estado").eq("user_id", user.id).maybeSingle();
    if (!sub || !["active", "trialing"].includes(sub.estado)) return json({ error: "Necesitas el seguimiento mensual activo." }, 403);

    const { data: filas } = await admin.from("fisico").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2);
    const fila = filas?.[0];
    if (!fila) return json({ error: "Primero llena tus datos." }, 400);
    if (fila.estado === "listo") return json({ ok: true, listo: true });
    // one plan at a time; a job that got stuck for more than 4 minutes can start again
    if (fila.estado === "generando" && Date.now() - new Date(fila.plan_at ?? fila.created_at).getTime() < 240000) return json({ ok: true, generando: true });
    const d = fila.datos ?? {};
    if (!(Number(d.edad) >= 18 && Number(d.estatura_cm) >= 120 && Number(d.peso_kg) >= 30)) return json({ error: "Revisa tu edad, estatura y peso." }, 400);

    await admin.from("fisico").update({ estado: "generando", plan_at: new Date().toISOString() }).eq("id", fila.id);
    const trabajo = (async () => {
      try {
        const plan = await generar(fila, filas?.[1] ?? null);
        await admin.from("fisico").update(plan ? { estado: "listo", plan, plan_at: new Date().toISOString() } : { estado: "error" }).eq("id", fila.id);
      } catch (e) { console.error(e); await admin.from("fisico").update({ estado: "error" }).eq("id", fila.id); }
    })();
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) { rt.waitUntil(trabajo); return json({ ok: true, generando: true }); }
    await trabajo;
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo generar tu plan" }, 500);
  }
});
