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
    cb.cortes?.[0] ? `Hair: a fresh, clearly better haircut: ${cb.cortes[0]}. Professionally cut and styled, with real shape and texture. Keep their natural hair color and hairline.` : "Hair: a fresh, clearly better haircut, professionally cut and styled with real shape and texture. Same color and hairline.",
    mujer ? `Makeup and grooming: polished, natural makeup${cb.barba?.[0] ? `, ${cb.barba[0]}` : ""}; defined brows and lashes, healthy glow.` : (cb.barba?.[0] ? `Facial hair: ${cb.barba[0]}. Fuller and even, with sharp, clean neck and cheek lines that frame the jaw.` : "Facial hair: groomed short boxed beard with sharp, clean neck and cheek lines that frame the jaw."),
    cb.cejas?.[0] ? `Eyebrows: ${cb.cejas[0]}. Groomed and well defined.` : "Eyebrows: groomed and well defined, natural.",
    "Skin: visibly clearer and healthier: even tone, no redness, no blemishes, much less shine and smaller-looking pores, a healthy glow. Real skin texture, no plastic smoothing.",
    "Body fat: about 6 to 8 kg leaner. The face is visibly slimmer: sharper jawline, defined cheekbones, less fullness under the chin and in the cheeks.",
    "Eyes: well rested, no dark circles, brighter. Posture: head and neck upright, chin slightly forward, shoulders back.",
    "Photo: same framing and background, but cleaner, more flattering soft light, like a good portrait.",
  ];
  if (tipo === "hard") {
    const procs = (r.avanzado || []).map((x: Obj) => x.nombre).filter(Boolean).slice(0, 5);
    cambios.push(`On top of all of the above, show the result of these aesthetic procedures, clearly visible but still natural, as a top surgeon would do them: ${procs.length ? procs.join("; ") : "chin projected forward and a more defined, angular jawline"}. For example a chin that projects visibly further forward, a sharper jaw angle, a more refined nose. The change from the procedures must be easy to see side by side.`);
  }
  return `Edit this photo of a real person to show their best realistic version after following a ${tipo === "hard" ? "full program that includes aesthetic procedures" : "6 to 12 month self-improvement plan without procedures"}. The result must be clearly and noticeably better at first glance, not a subtle edit, while staying 100% the same person.

Keep: the same identity, the same eyes, eye color, ethnicity and age, the same expression, head angle, clothing and background. ${tipo === "hard" ? "Bone structure changes only where the procedures below say." : "Do not change bone structure, the nose or the eyes."}

Apply all of these improvements:
- ${cambios.join("\n- ")}

Photorealistic, like a real photo of the same person. Customer from ${a.pais || "Latin America"}, ${a.edad || "adult"} years old. No text, no watermark, no borders.`;
}

async function editar(bytes: Uint8Array, prompt: string, aspecto: string | null = "4:5") {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: encodeBase64(bytes) } }, { text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: aspecto ? { aspectRatio: aspecto, imageSize: "1K" } : { imageSize: "1K" } },
    }),
  });
  if (!resp.ok) { console.error("gemini", resp.status, (await resp.text()).slice(0, 500)); return null; }
  const out = await resp.json();
  const parte = (out.candidates?.[0]?.content?.parts || []).find((p: Obj) => p.inlineData?.data || p.inline_data?.data);
  const img = parte?.inlineData || parte?.inline_data;
  if (!img) { console.error("gemini sin imagen", JSON.stringify(out).slice(0, 500)); return null; }
  return { data: img.data as string, mime: (img.mimeType || img.mime_type || "image/png") as string };
}


// Simulator controls as the image model should read them: what changes, and what minus / plus mean.
const EN: Record<string, [string, string, string]> = {
  menton_largo: ["Chin vertical length", "shorter chin", "longer chin"], menton_ancho: ["Chin width", "narrower chin", "wider, squarer chin"],
  mandibula: ["Jaw width at the jaw angles", "narrower jaw", "wider, more angular jaw"], pomulos: ["Cheekbone width", "narrower cheekbones", "wider, more prominent cheekbones"],
  nariz_ancho: ["Nostril (alar) width", "narrower nose base", "wider nose base"], nariz_punta: ["Nose tip height", "nose tip lifted", "nose tip lowered"],
  labios: ["Lip fullness", "thinner lips", "fuller lips"], boca_ancho: ["Mouth width", "narrower mouth", "wider mouth"],
  boca_altura: ["Distance from nose base to upper lip", "shorter upper lip", "longer upper lip"], cejas_altura: ["Eyebrow height", "lower eyebrows", "higher eyebrows"],
  cejas_cola: ["Height of the outer end of the eyebrows", "lower brow tails", "lifted brow tails"], ojos: ["Canthal tilt (outer eye corners)", "outer corners lower", "outer corners lifted"],
  menton_proy: ["Chin projection forward", "chin further back", "chin projected further forward"], menton_vert: ["Chin vertical length", "shorter chin", "longer chin"],
  cuello: ["Definition of the line under the chin (jaw-neck angle)", "softer jaw-neck line", "sharper, more defined jaw-neck line"],
  nariz_proy: ["Nose tip projection", "less projected nose tip", "more projected nose tip"], nariz_rot: ["Nose tip rotation", "nose tip rotated down", "nose tip rotated up"],
  nariz_dorso: ["Nasal bridge (dorsal hump)", "straighter bridge, hump reduced", "bigger dorsal hump"], labios_proy: ["Lip projection", "lips further back", "lips further forward"],
  ceja: ["Brow ridge prominence", "softer brow ridge", "more prominent brow ridge"],
};
const EXTRAS: Record<string, string> = {
  piel: "Clearer skin: as after a few months of a good skincare routine. Fewer spots, marks and redness, more even tone, natural texture with visible pores (not airbrushed).",
  ojeras: "Under-eyes: less dark color and less hollowness under the eyes, as after good sleep and treatment. Natural, not filtered.",
};

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
    // owner tool for the home page examples: edits a public image from the site and returns it without saving
    if (body.demo_url) {
      if (user.email !== "sochoarigby@gmail.com" || !String(body.demo_url).startsWith("https://resalta.co/")) return json({ error: "No autorizado" }, 403);
      const src = await fetch(String(body.demo_url));
      if (!src.ok) return json({ error: "sin_foto" }, 400);
      const out = await editar(new Uint8Array(await src.arrayBuffer()), instrucciones(tipo, body.reporte || {}, body.answers || {}));
      if (!out) return json({ error: "fallo" }, 502);
      // example images only (never a customer): public so they can be added to the site
      const path = `demo/${Date.now()}.${out.mime.includes("jpeg") ? "jpg" : "png"}`;
      await admin.storage.from("publico").upload(path, Uint8Array.from(atob(out.data), (c) => c.charCodeAt(0)), { contentType: out.mime });
      return json({ url: admin.storage.from("publico").getPublicUrl(path).data.publicUrl });
    }
    const { data: order } = await supabase.from("orders").select("id,user_id,tier,answers,status").eq("id", String(body.order_id || "")).maybeSingle();
    if (!order || !["pagado", "listo"].includes(order.status)) return json({ error: "Pedido no válido" }, 400);

    // Simulator: the changes the customer set with the sliders, rendered on their own photo so it looks real.
    if (body.tipo === "sim") {
      if (!Deno.env.get("GEMINI_API_KEY")) return json({ error: "no_configurado" }, 503);
      const vista = body.vista === "perfil" ? "perfil" : "frente";
      // the chat sends control keys; the simulator sends the descriptions already
      const desdeClaves = body.claves && typeof body.claves === "object" ? Object.entries(body.claves).filter(([k]) => EN[k]).map(([k, v]) => ({ que: EN[k][0], mm: Number(v), menos: EN[k][1], mas: EN[k][2] })) : [];
      const extras = (Array.isArray(body.extras) ? body.extras : []).filter((x: string) => EXTRAS[x]).slice(0, 4);
      const cambios = [...(Array.isArray(body.cambios) ? body.cambios : []), ...desdeClaves].slice(0, 14)
        .map((c: Obj) => ({ que: String(c.que || "").slice(0, 60), mm: Math.max(-8, Math.min(8, Number(c.mm) || 0)), menos: String(c.menos || "").slice(0, 30), mas: String(c.mas || "").slice(0, 30) }))
        .filter((c: Obj) => c.que && c.mm);
      const magro = body.magro === true;
      if (!cambios.length && !magro && !extras.length) return json({ error: "sin_cambios" }, 400);
      // a daily cap per order keeps the cost bounded
      const { data: cur } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
      const d: Obj = cur?.data || {};
      const hoy = new Date().toISOString().slice(0, 10);
      const uso = d.sim_uso?.dia === hoy ? d.sim_uso.n : 0;
      if (uso >= 15) return json({ error: "limite" }, 429);
      d.sim_uso = { dia: hoy, n: uso + 1 };
      await admin.from("reports").update({ data: d }).eq("order_id", order.id);
      const archivo = vista === "perfil" ? (body.foto === "perfil_der" ? "perfil_der" : "perfil_izq") : "frente";
      const { data: foto } = await admin.storage.from("fotos").download(`${order.user_id}/${order.id}/${archivo}.jpg`);
      if (!foto) return json({ error: "sin_foto" }, 400);
      const lista = [...cambios.map((c: Obj) => `- ${c.que}: ${Math.abs(c.mm)} mm ${c.mm > 0 ? `(${c.mas})` : `(${c.menos})`}`),
        ...(magro ? ["- Less facial fat: as if this person had gradually lost their excess weight and reached a lean, healthy body fat level. Less fat in the cheeks and under the chin, a sharper jawline, more visible cheekbones and a cleaner jaw-to-neck line. Natural and healthy, not gaunt or hollow."] : []), ...extras.map((x: string) => "- " + EXTRAS[x])].join("\n");
      const prompt = `Edit this ${vista === "perfil" ? "side profile" : "front"} photo of a real person to show exactly these facial changes, as a top aesthetic surgeon would achieve them (or, for fat loss, as weight loss would), with a natural, healed result (no swelling, no marks):
${lista}

The millimetres are real-world sizes on this face (an adult's pupils are about 63 mm apart): make each change exactly that big, visible side by side, no more and no less. Change nothing else: same identity, same skin, hair, beard, eyes, expression, head angle, lighting, clothing and background. Keep every other feature exactly where it is. Photorealistic, like the same photo taken after the procedure. No text, no watermark, no borders.`;
      const out = await editar(new Uint8Array(await foto.arrayBuffer()), prompt, null); // keeps the photo's own proportions
      if (!out) return json({ error: "No pudimos generar la imagen ahorita" }, 502);
      // keep it, so the customer can come back to their simulations
      let ruta: string | null = null;
      try {
        const ext = out.mime.includes("png") ? "png" : "jpg";
        ruta = `${order.user_id}/${order.id}/sim/${Date.now()}.${ext}`;
        const bytes = Uint8Array.from(atob(out.data), (c) => c.charCodeAt(0));
        const { error: eUp } = await admin.storage.from("fotos").upload(ruta, bytes, { contentType: out.mime, upsert: false });
        if (eUp) { console.error("sim upload", eUp.message); ruta = null; }
        else {
          const { data: cur2 } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
          const d2: Obj = cur2?.data || {};
          const resumenTxt = [...cambios.map((c: Obj) => `${c.mm > 0 ? c.mas : c.menos} ${Math.abs(c.mm)} mm`), ...(magro ? ["less facial fat"] : []), ...extras].join(", ");
          d2.sims = [{ ruta, vista, fecha: new Date().toISOString(), cambios: body.etiquetas && Array.isArray(body.etiquetas) ? body.etiquetas.slice(0, 16).map((x: unknown) => String(x).slice(0, 60)) : [resumenTxt.slice(0, 200)] }, ...(d2.sims || [])].slice(0, 30);
          await admin.from("reports").update({ data: d2 }).eq("order_id", order.id);
        }
      } catch (e) { console.error("sim save", e); }
      return json({ imagen: `data:${out.mime};base64,${out.data}`, ruta, quedan: 15 - (uso + 1) });
    }

    // the customer's saved simulations, newest first
    if (body.tipo === "sims") {
      const { data: cur } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
      const sims = (cur?.data?.sims || []) as Obj[];
      const firmadas = await Promise.all(sims.map(async (x) => ({ ...x, url: (await admin.storage.from("fotos").createSignedUrl(x.ruta, 3600)).data?.signedUrl ?? null })));
      return json({ sims: firmadas.filter((x) => x.url) });
    }

    if (tipo === "hard" && order.tier !== "hard") return json({ error: "Solo en el plan completo" }, 403);

    const { data: rep } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
    const r: Obj = rep?.data || {};
    if (!r.resumen) return json({ error: "Tu reporte todavía no está listo" }, 400);
    const pr: Obj = r.proyeccion || {};
    const firmar = async (path: string) => (await admin.storage.from("fotos").createSignedUrl(path, 3600)).data?.signedUrl ?? null;

    // already made: hand it back (the owner can ask for a fresh one while tuning)
    const rehacer = body.rehacer === true && user.email === "sochoarigby@gmail.com";
    if (pr[tipo] && !rehacer) return json({ url: await firmar(pr[tipo]) });
    if (!Deno.env.get("GEMINI_API_KEY")) return json({ error: "no_configurado" }, 503);
    // someone else is making it right now
    if (pr[`${tipo}_desde`] && Date.now() - Date.parse(pr[`${tipo}_desde`]) < 150000) return json({ generando: true }, 202);
    if ((pr[`${tipo}_intentos`] ?? 0) >= 3 && !rehacer) return json({ error: "intentos" }, 429);

    const marcar = async (cambios: Obj) => {
      const { data: cur } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
      const d = cur?.data || {};
      d.proyeccion = { ...(d.proyeccion || {}), ...cambios };
      await admin.from("reports").update({ data: d }).eq("order_id", order.id);
    };
    await marcar({ [`${tipo}_desde`]: new Date().toISOString(), [`${tipo}_intentos`]: (pr[`${tipo}_intentos`] ?? 0) + 1 });

    const { data: foto } = await admin.storage.from("fotos").download(`${order.user_id}/${order.id}/frente.jpg`);
    if (!foto) { await marcar({ [`${tipo}_desde`]: null }); return json({ error: "sin_foto" }, 400); }
    const img = await editar(new Uint8Array(await foto.arrayBuffer()), instrucciones(tipo, r, order.answers || {}));
    if (!img) {
      await marcar({ [`${tipo}_desde`]: null });
      return json({ error: "No pudimos generar tu proyección ahorita" }, 502);
    }
    const mime = img.mime;
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
