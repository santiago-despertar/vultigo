// Free rating: saves the lead and emails the result. The result is only delivered by email, so the
// address has to be real and the first email gets opened (good for the follow-up sequence).
// It also adds the contact to a Brevo list, which is what starts the email sequence.
// Secrets: BREVO_API_KEY, BREVO_LIST_ID (number), BREVO_SENDER_EMAIL (default hola@resalta.co), SITE_URL
// Without BREVO_API_KEY the lead is still saved with enviado_at empty, so it can be sent later.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

type Parte = { k: string; v: number; tip?: string };

function correo(nombre: string, score: number, partes: Parte[], fuerte: string, debil: { k: string; tip?: string } | null, site: string) {
  const nivel = score >= 80 ? "Tienes una cara muy armónica. Tu margen está en los detalles finos." : score >= 65 ? "Tienes una buena base y varias mejoras claras a tu alcance." : "Tienes mucho potencial. Los cambios correctos se van a notar bastante.";
  const filas = partes.map(p => `
      <tr><td style="padding:10px 0;border-bottom:1px solid #E3E7EA;font-size:15px;color:#16191D">${esc(p.k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #E3E7EA;width:140px"><div style="background:#E3E7EA;border-radius:4px;height:6px"><div style="background:#4A5866;border-radius:4px;height:6px;width:${Math.max(4, Math.min(100, p.v))}%"></div></div></td>
      <td style="padding:10px 0 10px 12px;border-bottom:1px solid #E3E7EA;text-align:right;font-family:monospace;font-size:15px;color:#16191D">${Math.round(p.v)}</td></tr>`).join("");
  const url = `${site}/cuenta?next=/analisis&utm_source=email&utm_medium=resultado&utm_campaign=calificacion`;
  return `<!doctype html><html><body style="margin:0;background:#F3F1EC;font-family:Helvetica,Arial,sans-serif;color:#16191D">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F1EC"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid #D3D8DD">
  <tr><td style="padding:32px 30px 8px">
    <p style="margin:0 0 22px;font-size:20px;letter-spacing:-.01em">resalta</p>
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5B6470">Tu calificación facial</p>
    <h1 style="margin:0 0 18px;font-size:26px;font-weight:400;line-height:1.2">${esc(nombre)}, este es tu resultado</h1>
    <p style="margin:0;font-size:15px;color:#5B6470">Armonía facial</p>
    <p style="margin:4px 0 6px;font-family:monospace;font-size:64px;line-height:1">${Math.round(score)}<span style="font-size:20px;color:#5B6470"> / 100</span></p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#5B6470">${esc(nivel)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${filas}</table>
    <p style="margin:20px 0 0;font-size:15px;line-height:1.5">Tu punto más fuerte: <b>${esc((fuerte || "").toLowerCase())}</b>.</p>
    ${debil ? `<div style="margin:18px 0 0;padding:16px 18px;background:#F3F1EC;border-radius:12px"><p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5B6470">Lo que puedes mejorar primero</p><p style="margin:0;font-size:15px;line-height:1.5"><b>${esc(debil.k)}.</b> ${esc(debil.tip)}</p></div>` : ""}
  </td></tr>
  <tr><td style="padding:24px 30px 30px">
    <p style="margin:0 0 14px;font-size:15px;line-height:1.55">Este puntaje mide 6 proporciones de tu cara de frente. El análisis completo revisa más de 110 rasgos con tus fotos de frente, sonriendo y de perfil, y te dice qué cambiar primero, qué no vale la pena y cómo te verías con tu plan.</p>
    <a href="${url}" style="display:inline-block;background:#4A5866;color:#FFFFFF;text-decoration:none;padding:14px 26px;border-radius:999px;font-size:15px">Quiero mi análisis completo</a>
  </td></tr>
  </table>
  <p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#5B6470">Puntaje estético y educativo basado en proporciones medidas en una foto. No es un juicio sobre tu valor ni un diagnóstico. Nunca guardamos tu foto.</p>
  </td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email ?? "").trim().toLowerCase().slice(0, 200);
    const nombre = String(b.nombre ?? "").trim().slice(0, 60);
    const score = Math.round(Number(b.score));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nombre || !(score >= 0 && score <= 100)) return json({ error: "Datos no válidos" }, 400);
    const partes: Parte[] = (Array.isArray(b.partes) ? b.partes : []).slice(0, 8).map((p: Parte) => ({ k: String(p.k).slice(0, 40), v: Math.max(0, Math.min(100, Number(p.v) || 0)), tip: String(p.tip ?? "").slice(0, 300) }));
    const fuerte = String(b.fuerte ?? "").slice(0, 40);
    const debil = b.debil ? { k: String(b.debil.k ?? "").slice(0, 40), tip: String(b.debil.tip ?? "").slice(0, 300) } : null;

    // a few results per address per day at most
    const desde = new Date(Date.now() - 864e5).toISOString();
    const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("email", email).eq("source", "calificacion").gte("created_at", desde);
    if ((count ?? 0) >= 5) return json({ ok: true, limitado: true });

    const { data: lead, error } = await admin.from("leads").insert({ email, nombre, score, metrics: { partes, fuerte, debil }, source: "calificacion" }).select("id").single();
    if (error) throw error;

    const key = Deno.env.get("BREVO_API_KEY");
    if (!key) return json({ ok: true, pendiente: true });
    const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";
    const h = { "api-key": key, "Content-Type": "application/json", accept: "application/json" };

    const envio = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: h,
      body: JSON.stringify({
        sender: { name: "Resalta", email: Deno.env.get("BREVO_SENDER_EMAIL") ?? "hola@resalta.co" },
        to: [{ email, name: nombre }],
        subject: `${nombre.split(/\s+/)[0]}, tu calificación facial: ${score}/100`,
        htmlContent: correo(nombre, score, partes, fuerte, debil, site),
        tags: ["calificacion"],
      }),
    });
    if (!envio.ok) console.error("brevo send", envio.status, await envio.text());
    else await admin.from("leads").update({ enviado_at: new Date().toISOString() }).eq("id", lead.id);

    // the list is what starts the sequence in Brevo
    const lista = Number(Deno.env.get("BREVO_LIST_ID") ?? "");
    const contacto = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST", headers: h,
      body: JSON.stringify({ email, updateEnabled: true, attributes: { FIRSTNAME: nombre, PUNTAJE: score }, ...(lista > 0 ? { listIds: [lista] } : {}) }),
    });
    if (!contacto.ok && contacto.status !== 204) console.error("brevo contact", contacto.status, await contacto.text());

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo enviar" }, 500);
  }
});
