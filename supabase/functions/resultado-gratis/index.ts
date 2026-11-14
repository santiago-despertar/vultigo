// Free rating: saves the lead and emails the result. The result is only delivered by email, so the
// address has to be real and the first email gets opened (good for the follow-up sequence).
// It also adds the contact to a Sender group, which is what starts the email sequence.
// Secrets: SENDER_API_KEY, SENDER_GROUP_ID (optional, defaults to the "Leads calificación gratis" group), SENDER_FROM (default contacto@resalta.co), SITE_URL
// Without SENDER_API_KEY the lead is still saved with enviado_at empty. Every later call also retries
// a few leads that were never sent, so a backlog clears itself once the key exists.
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
  // The two best proportions are shown; the rest stay locked. Knowing why the score is what it is, is
  // what the full analysis sells, so the email gives just enough to want the rest.
  const orden = [...partes].sort((x, y) => y.v - x.v);
  const visibles = new Set(orden.slice(0, 2).map(p => p.k));
  const fila = (p: Parte) => visibles.has(p.k) ? `
      <tr><td style="padding:10px 0;border-bottom:1px solid #E3E7EA;font-size:15px;color:#16191D">${esc(p.k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #E3E7EA;width:140px"><div style="background:#E3E7EA;border-radius:4px;height:6px"><div style="background:#4A5866;border-radius:4px;height:6px;width:${Math.max(4, Math.min(100, p.v))}%"></div></div></td>
      <td style="padding:10px 0 10px 12px;border-bottom:1px solid #E3E7EA;text-align:right;font-family:monospace;font-size:15px;color:#16191D">${Math.round(p.v)}</td></tr>` : `
      <tr><td style="padding:10px 0;border-bottom:1px solid #E3E7EA;font-size:15px;color:#16191D">${esc(p.k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #E3E7EA;width:140px"><div style="background:#EEF0F2;border-radius:4px;height:6px"></div></td>
      <td style="padding:10px 0 10px 12px;border-bottom:1px solid #E3E7EA;text-align:right;font-family:monospace;font-size:15px;color:#C9CED3;letter-spacing:1px">&#9632;&#9632;</td></tr>`;
  const filas = partes.map(fila).join("");
  const ocultos = partes.length - visibles.size;
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
    ${ocultos > 0 ? `<div style="margin:18px 0 0;padding:18px;background:#F3F1EC;border-radius:12px">
      <p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5B6470">${ocultos} puntajes bloqueados</p>
      <p style="margin:0;font-size:15px;line-height:1.55">${debil ? `Hay una zona que está bajando tu puntaje más que las demás, y es <b>${esc(debil.k.toLowerCase())}</b>. ` : ""}Los demás puntajes, por qué te dimos este resultado y qué hacer para subirlo vienen en tu análisis completo.</p>
    </div>` : ""}
  </td></tr>
  <tr><td style="padding:24px 30px 30px">
    <p style="margin:0 0 6px;font-size:19px;line-height:1.35">¿Quieres saber por qué te dimos ${Math.round(score)}?</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#5B6470">Este puntaje mide 6 proporciones de tu cara de frente. El análisis completo revisa más de 110 rasgos con tus fotos de frente, sonriendo y de perfil, y te dice qué cambiar primero, qué no vale la pena y cómo te verías con tu plan.</p>
    <a href="${url}" style="display:inline-block;background:#4A5866;color:#FFFFFF;text-decoration:none;padding:14px 26px;border-radius:999px;font-size:15px">Ver mi análisis completo</a>
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

    const key = Deno.env.get("SENDER_API_KEY");
    if (!key) return json({ ok: true, pendiente: true });
    const enviado = await enviar(key, { id: lead.id, email, nombre, score, metrics: { partes, fuerte, debil } });

    // clear any backlog (leads saved while email was not set up yet)
    const { data: atrasados } = await admin.from("leads").select("id,email,nombre,score,metrics")
      .eq("source", "calificacion").is("enviado_at", null).neq("id", lead.id).order("created_at").limit(5);
    for (const l of atrasados ?? []) await enviar(key, l);

    return json({ ok: true, enviado });
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo enviar" }, 500);
  }
});

type Lead = { id: string; email: string; nombre: string; score: number; metrics: { partes?: Parte[]; fuerte?: string; debil?: { k: string; tip?: string } | null } | null };

async function enviar(key: string, l: Lead) {
  const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";
  const h = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" };
  const m = l.metrics ?? {};
  const nombre = l.nombre || "Hola";
  const envio = await fetch("https://api.sender.net/v2/message/send", {
    method: "POST", headers: h,
    body: JSON.stringify({
      from: { name: "Resalta", email: Deno.env.get("SENDER_FROM") ?? "contacto@resalta.co" },
      to: { email: l.email, name: nombre },
      subject: `${nombre.split(/\s+/)[0]}, tu calificación facial: ${Math.round(l.score)}/100`,
      html: correo(nombre, l.score, m.partes ?? [], m.fuerte ?? "", m.debil ?? null, site),
    }),
  });
  const r = await envio.text();
  if (!envio.ok || !/"success"\s*:\s*true/.test(r)) { console.error("sender send", envio.status, r); return false; }
  await admin.from("leads").update({ enviado_at: new Date().toISOString() }).eq("id", l.id);

  // the group is what starts the sequence in Sender
  const grupo = Deno.env.get("SENDER_GROUP_ID") ?? "aM2mX5"; // "Leads calificación gratis"
  const sub = await fetch("https://api.sender.net/v2/subscribers", {
    method: "POST", headers: h,
    body: JSON.stringify({ email: l.email, firstname: nombre, ...(grupo ? { groups: [grupo] } : {}), trigger_automation: true }),
  });
  if (!sub.ok) console.error("sender subscriber", sub.status, await sub.text());
  return true;
}
