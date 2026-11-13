// Chat about the customer's own results. The report, measurements and answers go in the system prompt.
// Secrets: ANTHROPIC_API_KEY, ANTHROPIC_CHAT_MODEL (optional, default claude-haiku-5-5), SITE_URL
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODELO = Deno.env.get("ANTHROPIC_CHAT_MODEL") ?? "claude-haiku-5-5";
const LIMITE_DIA = 40;
type Obj = Record<string, any>;

function medidasTexto(m: Obj | null) {
  if (!m) return "";
  const fila = (x: Obj) => `${x.nombre}: ${x.valor}${x.unidad || ""} (rango ideal ${Array.isArray(x.rango) ? x.rango.join(" a ") : "?"}, ${Math.round(x.puntaje) / 10}/10)`;
  const frente = (m.medidas || []).map(fila).join("\n");
  const perfil = ((m.perfil || {}).medidas || []).map(fila).join("\n");
  return `Medidas de frente:\n${frente}${perfil ? `\n\nMedidas de perfil:\n${perfil}` : ""}`;
}

function reporteTexto(r: Obj) {
  const copia = { ...r };
  for (const k of ["uso", "modelo", "segundos", "estado", "desde", "v"]) delete copia[k];
  // evaluated items without the long arrays of numbers
  if (Array.isArray(copia.evaluaciones)) delete copia.evaluaciones;
  return JSON.stringify(copia);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);
    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id || "");

    // the user's own order and report only (RLS on the user's client)
    const { data: order } = await supabase.from("orders").select("id,tier,answers,medidas,status").eq("id", orderId).maybeSingle();
    if (!order || !["pagado", "listo"].includes(order.status)) return json({ error: "Pedido no válido" }, 400);

    if (body.accion === "historial") {
      const { data } = await admin.from("chat").select("rol,texto,creado").eq("order_id", orderId).eq("user_id", user.id).order("creado", { ascending: true }).limit(60);
      return json({ mensajes: data ?? [] });
    }

    const texto = String(body.mensaje || "").trim().slice(0, 1500);
    if (!texto) return json({ error: "Mensaje vacío" }, 400);

    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin.from("chat").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("rol", "user").gte("creado", desde);
    if ((count ?? 0) >= LIMITE_DIA) return json({ error: "limite", texto: "Llegaste al límite de preguntas por hoy. Mañana puedes seguir." }, 429);

    const { data: rep } = await supabase.from("reports").select("data").eq("order_id", orderId).maybeSingle();
    if (!rep?.data?.resumen) return json({ error: "Tu reporte todavía no está listo" }, 400);

    const { data: previos } = await admin.from("chat").select("rol,texto").eq("order_id", orderId).eq("user_id", user.id).order("creado", { ascending: false }).limit(16);
    const historia = (previos ?? []).reverse().map((m) => ({ role: m.rol === "user" ? "user" : "assistant", content: m.texto }));

    const a = order.answers || {};
    const avanzado = order.tier === "hard";
    const sistema = `Eres el asesor de Resalta, un servicio de análisis estético facial. Hablas con un cliente sobre SU reporte, que ya pagó y ya leyó.

Cómo respondes:
- Español de México, tono cercano y directo, como un asesor que sabe del tema. Tutea.
- Respuestas cortas: 2 a 6 frases, o una lista breve si de verdad ayuda. Nada de introducciones ni de repetir la pregunta.
- No uses guiones largos (el carácter "—"). Usa comas o puntos.
- Basa todo en los datos de abajo: sus medidas, puntajes y el reporte. Cita números concretos cuando sirvan.
- La escala es de 0 a 10 y 5 es el promedio. Sé honesto: no infles ni consueles con mentiras, pero tampoco seas cruel.
- Si pregunta algo que los datos no cubren, dilo y da la mejor orientación general que puedas.
- Cortes, barba, cuidado de piel, ejercicio de cuello, postura, lentes, ropa y hábitos: da recomendaciones concretas.
- ${avanzado ? "Tiene el plan completo: puedes hablar de tratamientos médicos y procedimientos (rellenos, rinoplastia, implantes, etc.) como información general, con rangos realistas, y siempre recomendar consultarlo con un médico certificado." : "Tiene el plan esencial: sobre procedimientos médicos o cirugía da solo información muy general y dile que el plan completo incluye esa parte en detalle. Recomienda consultar a un médico certificado."}
- No diagnosticas enfermedades. Si menciona algo médico (dolor, lesiones, cambios raros en la piel), recomiéndale ver a un médico.
- Si pide algo que no tiene que ver con su cara, su imagen o su reporte, regrésalo amablemente al tema.

Datos del cliente: sexo ${a.sexo || "no indicado"}, edad ${a.edad || "no indicada"}, país ${a.pais || "no indicado"}, objetivo "${a.objetivo || ""}", presupuesto ${a.presupuesto || "no indicado"}, rutina actual "${a.rutina || ""}", procedimientos previos "${a.procedimientos || ""}", notas "${a.notas || ""}".

${medidasTexto(order.medidas)}

Reporte completo (JSON):
${reporteTexto(rep.data)}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 900,
        system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
        messages: [...historia, { role: "user", content: texto }],
      }),
    });
    if (!r.ok) { console.error("anthropic", r.status, (await r.text()).slice(0, 400)); return json({ error: "No pude responder ahorita" }, 502); }
    const out = await r.json();
    const respuesta = (out.content || []).filter((c: Obj) => c.type === "text").map((c: Obj) => c.text).join("\n").replace(/—/g, ", ").trim();
    if (!respuesta) return json({ error: "No pude responder ahorita" }, 502);

    await admin.from("chat").insert([
      { user_id: user.id, order_id: orderId, rol: "user", texto },
      { user_id: user.id, order_id: orderId, rol: "assistant", texto: respuesta },
    ]);
    return json({ respuesta, quedan: LIMITE_DIA - (count ?? 0) - 1 });
  } catch (e) {
    console.error(e);
    return json({ error: "No pude responder ahorita" }, 500);
  }
});
