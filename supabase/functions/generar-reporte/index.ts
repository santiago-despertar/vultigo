// Writes the facial analysis report for a paid order, using the measurements taken in the browser
// plus the customer's photos. Secrets: ANTHROPIC_API_KEY, optional ANTHROPIC_MODEL, SITE_URL.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MODELO = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5";
// All six angles go to the model: structure from the front, projection from the profiles, volume from the three-quarter views.
const FOTOS: [string, string][] = [
  ["frente", "de frente, cara relajada"], ["sonrisa", "de frente sonriendo"],
  ["perfil_izq", "perfil izquierdo"], ["perfil_der", "perfil derecho"],
  ["tres_cuartos_izq", "tres cuartos izquierdo"], ["tres_cuartos_der", "tres cuartos derecho"]
];

const esquema = {
  type: "object",
  required: ["resumen", "fortalezas", "prioridades", "zonas", "piel", "color", "cabello_barba", "plan"],
  properties: {
    resumen: { type: "string", description: "Dos o tres frases sobre la cara en conjunto. Directo y respetuoso." },
    fortalezas: {
      type: "array", minItems: 3, maxItems: 4,
      items: { type: "object", required: ["titulo", "texto"], properties: { titulo: { type: "string" }, texto: { type: "string" } } }
    },
    prioridades: {
      type: "array", minItems: 3, maxItems: 4,
      description: "Lo que más cambia la percepción si se trabaja, ordenado por impacto.",
      items: {
        type: "object", required: ["titulo", "texto", "impacto", "esfuerzo"],
        properties: {
          titulo: { type: "string" }, texto: { type: "string" },
          impacto: { type: "string", enum: ["alto", "medio", "bajo"] },
          esfuerzo: { type: "string", enum: ["bajo", "medio", "alto"] }
        }
      }
    },
    zonas: {
      type: "array", minItems: 6, maxItems: 6,
      description: "Una entrada por zona, en este orden: proporciones, ojos, nariz, boca, mandibula, simetria.",
      items: {
        type: "object", required: ["id", "lectura", "acciones"],
        properties: {
          id: { type: "string", enum: ["proporciones", "ojos", "nariz", "boca", "mandibula", "simetria"] },
          lectura: { type: "string", description: "Qué dicen las medidas de esa zona, en lenguaje claro." },
          acciones: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } }
        }
      }
    },
    piel: {
      type: "object", required: ["lectura", "acciones"],
      properties: {
        lectura: { type: "string", description: "Tono, textura, zonas de rojez, brillo y ojeras visibles en la foto." },
        acciones: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } }
      }
    },
    color: {
      type: "object", required: ["subtono", "lectura", "paleta", "evitar"],
      properties: {
        subtono: { type: "string", enum: ["cálido", "frío", "neutro"] },
        lectura: { type: "string" },
        paleta: { type: "array", minItems: 5, maxItems: 8, items: { type: "object", required: ["nombre", "hex"], properties: { nombre: { type: "string" }, hex: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } } } },
        evitar: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", required: ["nombre", "hex"], properties: { nombre: { type: "string" }, hex: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } } } }
      }
    },
    cabello_barba: {
      type: "object", required: ["cortes", "barba", "cejas"],
      properties: {
        cortes: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
        barba: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
        cejas: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } }
      }
    },
    perfil: {
      type: "object", required: ["lectura", "acciones"],
      description: "Lectura del perfil: nariz, labios, mentón, cuello y línea de la mandíbula, con las medidas de perfil y lo que se ve en las dos fotos de lado.",
      properties: { lectura: { type: "string" }, acciones: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } } }
    },
    sonrisa: {
      type: "object", required: ["lectura", "acciones"],
      description: "Lectura de la foto sonriendo: cuánto diente y encía se ve, simetría de la sonrisa, color y alineación visibles, cómo cambian mejillas y ojos.",
      properties: { lectura: { type: "string" }, acciones: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } } }
    },
    tres_cuartos: {
      type: "object", required: ["lectura", "acciones"],
      description: "Lectura de las fotos de tres cuartos: pómulos, volumen de mejillas, definición de la mandíbula, ojeras y surcos que no se ven de frente.",
      properties: { lectura: { type: "string" }, acciones: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } } }
    },
    plan: {
      type: "array", minItems: 3, maxItems: 3,
      description: "Fases: 0 a 4 semanas, 1 a 3 meses, 3 a 12 meses.",
      items: {
        type: "object", required: ["fase", "pasos"],
        properties: {
          fase: { type: "string" },
          pasos: {
            type: "array", minItems: 2, maxItems: 5,
            items: { type: "object", required: ["accion", "porque"], properties: { accion: { type: "string" }, porque: { type: "string" } } }
          }
        }
      }
    },
    avanzado: {
      type: "array", maxItems: 5,
      description: "Solo para el plan completo: procedimientos que suelen considerarse para este tipo de rostro.",
      items: {
        type: "object", required: ["nombre", "que_hace", "considerar"],
        properties: { nombre: { type: "string" }, que_hace: { type: "string" }, considerar: { type: "string" } }
      }
    }
  }
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
const lista = (x: unknown) => Array.isArray(x) && x.length > 0;
function limpiar(r: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[k] = parsear(v);
  return o;
}
// Every section the panel shows has to be there and in the right shape.
function completo(r: Record<string, any>) {
  return typeof r.resumen === "string" && r.resumen.length > 20
    && lista(r.fortalezas) && lista(r.prioridades) && lista(r.zonas) && lista(r.plan)
    && r.piel && typeof r.piel.lectura === "string" && lista(r.piel.acciones)
    && r.color && typeof r.color.lectura === "string" && lista(r.color.paleta)
    && r.cabello_barba && lista(r.cabello_barba.cortes);
}

function instrucciones(tier: string, a: Record<string, unknown>) {
  const edad = `${a.sexo ?? "sexo no indicado"}, ${a.edad ? `${a.edad} años` : "edad no indicada"}`;
  return `Eres el analista de Resalta, un servicio de análisis de estética facial para México y Latinoamérica.
Escribes el reporte que recibe un cliente que ya pagó. Tu trabajo es leer sus medidas y sus fotos y decirle qué tiene a favor, qué le conviene trabajar y en qué orden.

Datos del cliente: ${edad}, país ${a.pais ?? "no indicado"}, objetivo declarado: ${a.objetivo ?? "no indicado"}.${a.notas ? ` Notas suyas: ${a.notas}` : ""}

Cómo escribir:
- Español de México, de tú, claro y directo. Nada de relleno ni de frases motivacionales.
- Nunca uses guiones largos. Usa comas o reescribe la frase.
- Que no suene a texto escrito por una máquina. Frases normales, como las diría una persona que sabe del tema.
- Habla de lo que de verdad se ve en sus fotos y en sus números, no de generalidades. Cita medidas concretas cuando apoyen lo que dices.
- Honesto y respetuoso. Puedes decir qué está fuera de rango sin insultar ni dramatizar.
- Si falta alguna foto o las medidas de perfil, llena esa sección con lo que sí se puede ver y dilo en una frase.
- Las medidas vienen de fotos de celular, así que son estimaciones. Si una foto está girada o inclinada, dilo en vez de sacar conclusiones.
- No diagnostiques ni recetes. Nada de medicamentos con nombre ni dosis.
${tier === "hard"
  ? "- Llena también el campo avanzado: procedimientos estéticos que se suelen considerar para un rostro con estas proporciones, qué hace cada uno y qué hay que pensar antes. Preséntalo como información general que debe evaluar un médico certificado, no como una recomendación tuya."
  : "- No llenes el campo avanzado. Este cliente tiene el plan esencial, que no incluye la parte de procedimientos."}`;
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

    // Already written for this plan: hand it back instead of paying for it twice.
    // A report written before an upgrade to the full plan is written again so it gains the advanced part.
    const { data: previo } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
    const pd = previo?.data ?? null;
    const vigente = pd?.resumen && !(order.tier === "hard" && pd.tier !== "hard");
    if (vigente && pd.estado !== "generando") return json({ ok: true, data: pd });
    if (pd?.estado === "generando" && Date.now() - Date.parse(pd.desde) < 180000) return json({ ok: true, generando: true, data: pd.resumen ? pd : null });

    // Orders paid before measuring existed can send the measurements now, once.
    if (!order.medidas?.medidas?.length) {
      const m = body.medidas;
      const valido = m && Array.isArray(m.medidas) && m.medidas.length > 5 && m.medidas.length < 40 && m.resumen?.zonas && m.caja && JSON.stringify(m).length < 60000;
      if (!valido) return json({ error: "sin_medidas" }, 400);
      await admin.from("orders").update({ medidas: m }).eq("id", order.id);
      order.medidas = m;
    }

    if (!order.medidas.perfil && body.perfil) {
      const pf = body.perfil;
      if (Array.isArray(pf.medidas) && pf.medidas.length > 3 && pf.medidas.length < 40 && pf.caja && JSON.stringify(pf).length < 40000) {
        order.medidas = { ...order.medidas, perfil: pf };
        await admin.from("orders").update({ medidas: order.medidas }).eq("id", order.id);
      }
    }

    // Claim the job so two open tabs don't each pay for a report.
    if (!previo) {
      const { error } = await admin.from("reports").insert({ order_id: order.id, user_id: order.user_id, data: { estado: "generando", desde: ahora } });
      if (error) return json({ ok: true, generando: true });
    } else {
      await admin.from("reports").update({ data: { ...pd, estado: "generando", desde: ahora } }).eq("order_id", order.id);
    }
    const soltar = async () => {
      if (pd) await admin.from("reports").update({ data: { ...pd, estado: null } }).eq("order_id", order.id);
      else await admin.from("reports").delete().eq("order_id", order.id);
    };

    const imagenes = [], vistas: string[] = [];
    for (const [slot, etiqueta] of FOTOS) {
      const { data: file } = await admin.storage.from("fotos").download(`${order.user_id}/${order.id}/${slot}.jpg`);
      if (!file) continue;
      vistas.push(etiqueta);
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = ""; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
      imagenes.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: btoa(bin) } });
    }
    if (!imagenes.length) { await soltar(); return json({ error: "No encontramos tus fotos" }, 400); }

    const m = order.medidas;
    const tabla = m.medidas.map((x: Record<string, unknown>) =>
      `${x.nombre} (${x.zona}): ${x.valor}${x.unidad ?? ""} | referencia ${(x.rango as number[])[0]} a ${(x.rango as number[])[1]} | ${x.estado} | puntaje ${x.puntaje}`).join("\n");
    const fila = (x: Record<string, unknown>) =>
      `${x.nombre} (${x.zona}): ${x.valor}${x.unidad ?? ""} | referencia ${(x.rango as number[])[0]} a ${(x.rango as number[])[1]} | ${x.estado} | puntaje ${x.puntaje}`;
    const perfilTxt = m.perfil?.medidas?.length
      ? `\n\nMedidas de perfil (puntaje de perfil ${m.perfil.resumen?.general}/100, tomadas de la silueta de la foto de ${m.perfil.foto === "perfil_der" ? "perfil derecho" : "perfil izquierdo"}; los milímetros son aproximados):\n${m.perfil.medidas.map(fila).join("\n")}`
      : "\n\nNo hay medidas de perfil para este pedido.";
    const zonas = m.resumen.zonas.map((z: Record<string, unknown>) => `${z.nombre}: ${z.puntaje}`).join(", ");

    const cuerpo = {
        model: MODELO,
        max_tokens: 10000,
        system: instrucciones(order.tier, order.answers ?? {}),
        tools: [{ name: "reporte", description: "Entrega el reporte de análisis facial.", input_schema: esquema }],
        tool_choice: { type: "auto" },
        messages: [{
          role: "user",
          content: [
            ...imagenes,
            { type: "text", text: `Fotos, en este orden: ${vistas.join("; ")}.\n\nPuntaje general de frente: ${m.resumen.general}/100.\nPuntajes por zona: ${zonas}.\n\nMedidas de frente:\n${tabla}${perfilTxt}\n${m.avisos?.length ? `\nAvisos de calidad de la foto: ${m.avisos.join(" ")}` : ""}\n\nEntrega el reporte llamando a la herramienta reporte, con todas sus secciones. No escribas nada fuera de la herramienta.` }
          ]
        }]
      };
    const pedir = async () => {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(cuerpo)
      });
      if (!r.ok) { console.error("anthropic", r.status, (await r.text()).slice(0, 500)); return null; }
      const resp = await r.json();
      const bloque = (resp.content ?? []).find((c: Record<string, unknown>) => c.type === "tool_use");
      if (bloque) return { input: limpiar(bloque.input), usage: resp.usage ?? null };
      // some models answer with the JSON as text instead of calling the tool
      const texto = (resp.content ?? []).filter((c: Record<string, unknown>) => c.type === "text").map((c: Record<string, unknown>) => c.text).join("");
      const desde = texto.indexOf("{");
      const obj = desde >= 0 ? parsear(texto.slice(desde)) : null;
      if (obj && typeof obj === "object") return { input: limpiar(obj as Record<string, unknown>), usage: resp.usage ?? null };
      console.error("sin tool_use", resp.stop_reason, JSON.stringify(resp).slice(0, 500)); return null;
    };
    // one retry if a section came back missing or malformed
    let res = await pedir();
    if (res && !completo(res.input as Record<string, any>)) { console.warn("reporte incompleto, reintento"); const otro = await pedir(); if (otro && completo(otro.input as Record<string, any>)) res = otro; }
    if (!res || !completo(res.input as Record<string, any>)) { await soltar(); return json({ error: "No pudimos generar tu reporte en este momento" }, 502); }
    const data = { ...res.input, tier: order.tier, modelo: MODELO, generado: new Date().toISOString(), uso: res.usage };
    if (order.tier !== "hard") delete data.avanzado;
    await admin.from("reports").update({ data }).eq("order_id", order.id);
    await admin.from("orders").update({ status: "listo", delivered_at: new Date().toISOString() }).eq("id", order.id).eq("status", "pagado");
    return json({ ok: true, data });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos generar tu reporte en este momento" }, 500);
  }
});
