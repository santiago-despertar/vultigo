// The customer's projection: their own front photo edited with Nano Banana Pro following their report.
// soft = without procedures (every plan). hard = adds the procedures that make sense (Plan Completo only).
// Made once per order and kind, then reused. Secrets: GEMINI_API_KEY, GEMINI_IMAGE_MODEL (optional), SITE_URL
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODELO = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-3-pro-image";
// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

function instrucciones(tipo: string, r: Obj, a: Obj) {
  const cb = r.cabello_barba || {};
  const mujer = a.sexo === "mujer";
  const cambios = [
    cb.cortes?.[0] ? `Hair: ${cb.cortes[0]}. Keep their natural hair color, density and hairline; style it well, freshly cut.` : "Hair: neat, freshly cut, well styled, same color and hairline.",
    mujer ? (cb.barba?.[0] ? `Makeup: very subtle and natural, ${cb.barba[0]}.` : "Makeup: very subtle and natural.") : (cb.barba?.[0] ? `Facial hair: ${cb.barba[0]}. Clean, defined lines.` : "Facial hair: clean and well groomed."),
    cb.cejas?.[0] ? `Eyebrows: ${cb.cejas[0]}. Groomed, natural, same color.` : "Eyebrows: lightly groomed, natural.",
    "Skin: healthier and more even, less redness, shine and visible pores, no blemishes, but keep real skin texture. No smoothing filter, no makeup look.",
    "Face: about 3 to 4 kg leaner, so the jawline and cheekbones read a little sharper. Rested eyes, lighter under-eye circles. Upright head and neck posture.",
  ];
  if (tipo === "hard") {
    const procs = (r.avanzado || []).map((x: Obj) => x.nombre).filter(Boolean).slice(0, 4);
    cambios.push(`Also show the realistic result of these procedures, subtle and natural, as a good surgeon would do them: ${procs.length ? procs.join("; ") : "a slightly more projected chin and a more defined jawline"}. Never exaggerated.`);
  }
  return `Edit this photo of a real person. It must stay exactly the same person: same face shape, same eyes, same nose and mouth${tipo === "hard" ? " (except the subtle procedure changes below)" : ""}, same skin tone, same age, same expression, same head angle, same clothing, same background, same lighting and same camera. Photorealistic, like a real photo taken a few months later. Spanish-speaking customer from ${a.pais || "Latin America"}, ${a.edad || "adult"} years old.

Apply only these improvements:
- ${cambios.join("\n- ")}

Do not change identity, ethnicity, eye color or bone structure${tipo === "hard" ? " beyond the procedures listed" : ""}. Do not beautify into a different person. No text, no watermark, no borders.`;
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
    const tipo = body.tipo === "hard" ? "hard" : "soft";
    const { data: order } = await supabase.from("orders").select("id,user_id,tier,answers,status").eq("id", String(body.order_id || "")).maybeSingle();
    if (!order || !["pagado", "listo"].includes(order.status)) return json({ error: "Pedido no válido" }, 400);
    if (tipo === "hard" && order.tier !== "hard") return json({ error: "Solo en el plan completo" }, 403);

    const { data: rep } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
    const r: Obj = rep?.data || {};
    if (!r.resumen) return json({ error: "Tu reporte todavía no está listo" }, 400);
    const pr: Obj = r.proyeccion || {};
    const firmar = async (path: string) => (await admin.storage.from("fotos").createSignedUrl(path, 3600)).data?.signedUrl ?? null;

    // already made: hand it back
    if (pr[tipo]) return json({ url: await firmar(pr[tipo]) });
    if (!Deno.env.get("GEMINI_API_KEY")) return json({ error: "no_configurado" }, 503);
    // someone else is making it right now
    if (pr[`${tipo}_desde`] && Date.now() - Date.parse(pr[`${tipo}_desde`]) < 150000) return json({ generando: true }, 202);
    if ((pr[`${tipo}_intentos`] ?? 0) >= 3) return json({ error: "intentos" }, 429);

    const marcar = async (cambios: Obj) => {
      const { data: cur } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
      const d = cur?.data || {};
      d.proyeccion = { ...(d.proyeccion || {}), ...cambios };
      await admin.from("reports").update({ data: d }).eq("order_id", order.id);
    };
    await marcar({ [`${tipo}_desde`]: new Date().toISOString(), [`${tipo}_intentos`]: (pr[`${tipo}_intentos`] ?? 0) + 1 });

    const { data: foto } = await admin.storage.from("fotos").download(`${order.user_id}/${order.id}/frente.jpg`);
    if (!foto) { await marcar({ [`${tipo}_desde`]: null }); return json({ error: "sin_foto" }, 400); }
    const b64 = encodeBase64(new Uint8Array(await foto.arrayBuffer()));

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: b64 } }, { text: instrucciones(tipo, r, order.answers || {}) }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5", imageSize: "1K" } },
      }),
    });
    if (!resp.ok) {
      console.error("gemini", resp.status, (await resp.text()).slice(0, 500));
      await marcar({ [`${tipo}_desde`]: null });
      return json({ error: "No pudimos generar tu proyección ahorita" }, 502);
    }
    const out = await resp.json();
    const parte = (out.candidates?.[0]?.content?.parts || []).find((p: Obj) => p.inlineData?.data || p.inline_data?.data);
    const img = parte?.inlineData || parte?.inline_data;
    if (!img) {
      console.error("gemini sin imagen", JSON.stringify(out).slice(0, 500));
      await marcar({ [`${tipo}_desde`]: null });
      return json({ error: "No pudimos generar tu proyección ahorita" }, 502);
    }
    const mime = img.mimeType || img.mime_type || "image/png";
    const path = `${order.user_id}/${order.id}/proy_${tipo}.${mime.includes("jpeg") ? "jpg" : "png"}`;
    const bytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
    const { error } = await admin.storage.from("fotos").upload(path, bytes, { upsert: true, contentType: mime });
    if (error) { console.error(error); await marcar({ [`${tipo}_desde`]: null }); return json({ error: "No pudimos guardar tu proyección" }, 500); }
    await marcar({ [tipo]: path, [`${tipo}_desde`]: null });
    return json({ url: await firmar(path) });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos generar tu proyección ahorita" }, 500);
  }
});
