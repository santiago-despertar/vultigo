// Follow-up sequences for people who finished the onboarding questions but did not pay.
// Runs every hour (pg_cron). One hour after someone leaves the offer page without paying, they join the
// sequence that matches what they want to improve, leave the free-rating sequence in Sender, and get one
// email per step on the days set in public.secuencia_correos (editable from admin.resalta.co).
// Paying, unsubscribing or deleting the account stops it. Safe to call often: it only sends what is due.
// Secrets: SENDER_API_KEY, SENDER_FROM (default contacto@resalta.co), SITE_URL. Deploy with JWT verification off.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = Deno.env.get("SITE_URL") ?? "https://resalta.co";
const GRUPO_LEADS = Deno.env.get("SENDER_GROUP_ID") ?? "aM2mX5";
const ESPERA_MIN = 60;          // minutes after the onboarding before the first email
const MAX_POR_CORRIDA = 150;    // emails per run, well under Sender's limits
type Obj = Record<string, any>; // deno-lint-ignore no-explicit-any

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const html = (b: string, s = 200) => new Response(b, { status: s, headers: { "Content-Type": "text/html; charset=utf-8" } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function firma(email: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.toLowerCase() + "|" + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")));
  return [...new Uint8Array(d)].slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// which sequence fits best: the most specific goal wins
export function elegir(objetivo: string) {
  const o = (objetivo || "").toLowerCase();
  if (/mand[ií]bula|perfil/.test(o)) return "mandibula";
  if (/piel/.test(o)) return "piel";
  if (/joven/.test(o)) return "joven";
  if (/cabello|cejas|vello|ojos/.test(o)) return "rasgos";
  return "fotos";
}

export function banderas(a: Obj) {
  const p = String(a.procedimientos ?? ""), pr = String(a.presupuesto ?? "");
  return {
    sin_proc: /^Solo/.test(p),
    proc: /Abierto/.test(p),
    cirugia: /cirug[ií]a/i.test(p) && !/sin cirug/i.test(p),
    presupuesto_bajo: /Menos de|\$500 a \$2,000/.test(pr),
  };
}

export function render(cuerpo: string, vars: Obj, flags: Obj, enlace: string) {
  let t = cuerpo.replace(/\[\[(\w+)\]\]([\s\S]*?)\[\[\/\1\]\]/g, (_, k, dentro) => (flags[k] ? dentro : ""));
  t = t.replace(/\{(nombre|objetivo)\}/g, (_, k) => String(vars[k] ?? ""));
  const partes = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return partes.map((p) => {
    const b = p.match(/^\{boton:([^}]+)\}$/);
    if (b) return `<p style="margin:22px 0"><a href="${enlace}" style="display:inline-block;background:#4A5866;color:#FFFFFF;text-decoration:none;padding:14px 26px;border-radius:999px;font-size:15px">${esc(b[1])}</a></p>`;
    const lineas = esc(p).split("\n").join("<br>");
    return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#16191D">${lineas}</p>`;
  }).join("");
}

export function plantilla(contenido: string, baja: string) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F3F1EC;font-family:Helvetica,Arial,sans-serif;color:#16191D">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F1EC"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;background:#FFFFFF;border-radius:16px;border:1px solid #D3D8DD">
<tr><td style="padding:30px 30px 18px">
<p style="margin:0 0 22px;font-size:20px;letter-spacing:-.01em">resalta</p>
${contenido}
</td></tr></table>
<p style="max-width:540px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#5B6470">Te escribimos porque empezaste tu análisis en resalta.co. <a href="${baja}" style="color:#5B6470">No quiero recibir estos correos</a>.</p>
</td></tr></table></body></html>`;
}

const nombreDe = (a: Obj, u: Obj) => String(a?.nombre || u?.user_metadata?.full_name || "").trim().split(/\s+/)[0] || "Hola";
const objetivoTexto = (o: string) => (o || "").split(", ").filter(Boolean).map((x) => x.toLowerCase()).join(" y ") || "tu imagen";

async function enviar(key: string, email: string, asunto: string, cuerpo: string, nombre: string) {
  const r = await fetch("https://api.sender.net/v2/message/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ from: { name: "Resalta", email: Deno.env.get("SENDER_FROM") ?? "contacto@resalta.co" }, to: { email, name: nombre }, subject: asunto, html: cuerpo }),
  });
  const t = await r.text();
  if (!r.ok || !/"success"\s*:\s*true/.test(t)) { console.error("sender", r.status, t.slice(0, 200)); return false; }
  return true;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // unsubscribe link from the email footer
  if (req.method === "GET" && url.searchParams.get("baja")) {
    const email = String(url.searchParams.get("baja")).toLowerCase().slice(0, 200), t = url.searchParams.get("t") ?? "";
    const pagina = (m: string) => html(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#F3F1EC;font-family:Helvetica,Arial,sans-serif;color:#16191D;display:grid;place-items:center;min-height:100vh"><div style="max-width:420px;padding:30px;background:#fff;border:1px solid #D3D8DD;border-radius:16px;margin:20px"><p style="font-size:20px;margin:0 0 14px">resalta</p><p style="font-size:15px;line-height:1.6;margin:0">${m}</p></div></body></html>`);
    if (t !== await firma(email)) return pagina("Este enlace no es válido.");
    await admin.from("bajas").upsert({ email });
    await admin.from("secuencia_inscritos").update({ salio_at: new Date().toISOString(), motivo: "baja" }).eq("email", email).is("salio_at", null);
    return pagina("Listo. Ya no te vamos a mandar estos correos. Los avisos de tu cuenta (por ejemplo, cuando tu análisis está listo) te siguen llegando.");
  }
  if (req.method !== "POST") return new Response("ok");

  const key = Deno.env.get("SENDER_API_KEY");
  if (!key) return json({ ok: false, motivo: "sin_sender" });
  const ahora = Date.now();
  const resumen = { inscritos: 0, enviados: 0, fallidos: 0, salieron: 0 };

  const [{ data: correos }, { data: pagos }, { data: bajasL }] = await Promise.all([
    admin.from("secuencia_correos").select("*").eq("activo", true).order("paso"),
    admin.from("orders").select("user_id").in("status", ["pagado", "listo"]),
    admin.from("bajas").select("email"),
  ]);
  const compro = new Set((pagos ?? []).map((o: Obj) => o.user_id));
  const bajas = new Set((bajasL ?? []).map((b: Obj) => b.email));
  const porSec: Record<string, Obj[]> = {};
  for (const c of correos ?? []) (porSec[c.secuencia] ??= []).push(c);

  // 1) new people: finished the questions at least an hour ago, no payment, not enrolled yet
  const limite = new Date(ahora - ESPERA_MIN * 60e3).toISOString(), mes = new Date(ahora - 30 * 864e5).toISOString();
  const { data: borradores } = await admin.from("orders").select("id,user_id,answers,created_at").eq("status", "borrador")
    .not("answers", "is", null).lt("created_at", limite).gt("created_at", mes).order("created_at", { ascending: false }).limit(500);
  const { data: ya } = await admin.from("secuencia_inscritos").select("user_id");
  const inscritos = new Set((ya ?? []).map((x: Obj) => x.user_id));
  for (const o of borradores ?? []) {
    if (inscritos.has(o.user_id) || compro.has(o.user_id) || !o.answers?.objetivo) continue;
    const { data: ud } = await admin.auth.admin.getUserById(o.user_id);
    const email = (ud?.user?.email ?? "").toLowerCase();
    if (!email || bajas.has(email)) continue;
    const sec = elegir(o.answers.objetivo);
    if (!porSec[sec]?.length) continue;
    const { error } = await admin.from("secuencia_inscritos").insert({ user_id: o.user_id, email, secuencia: sec, order_id: o.id });
    if (error) continue;
    inscritos.add(o.user_id); resumen.inscritos++;
    // out of the free-rating sequence: this one is about what they told us
    await fetch(`https://api.sender.net/v2/subscribers/groups/${GRUPO_LEADS}`, { method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ subscribers: [email], trigger_automation: false }) }).catch(() => {});
  }

  // 2) send whatever is due
  const { data: activos } = await admin.from("secuencia_inscritos").select("*").is("salio_at", null).limit(2000);
  const { data: hechos } = await admin.from("secuencia_envios").select("user_id,secuencia,paso");
  const enviados = new Set((hechos ?? []).map((e: Obj) => `${e.user_id}|${e.secuencia}|${e.paso}`));
  let cuenta = 0;
  for (const ins of activos ?? []) {
    if (cuenta >= MAX_POR_CORRIDA) break;
    if (compro.has(ins.user_id)) { await admin.from("secuencia_inscritos").update({ salio_at: new Date().toISOString(), motivo: "compra" }).eq("user_id", ins.user_id); resumen.salieron++; continue; }
    if (bajas.has(ins.email)) { await admin.from("secuencia_inscritos").update({ salio_at: new Date().toISOString(), motivo: "baja" }).eq("user_id", ins.user_id); continue; }
    const pasos = porSec[ins.secuencia] ?? [];
    const sig = pasos.find((c) => !enviados.has(`${ins.user_id}|${ins.secuencia}|${c.paso}`));
    if (!sig) { await admin.from("secuencia_inscritos").update({ salio_at: new Date().toISOString(), motivo: "terminó" }).eq("user_id", ins.user_id); continue; }
    if (ahora < new Date(ins.desde).getTime() + Number(sig.dias) * 864e5) continue;
    // never two emails on the same day
    const { data: ult } = await admin.from("secuencia_envios").select("enviado_at").eq("user_id", ins.user_id).order("enviado_at", { ascending: false }).limit(1);
    if (ult?.[0] && ahora - new Date(ult[0].enviado_at).getTime() < 20 * 3600e3) continue;

    const { data: o } = await admin.from("orders").select("answers").eq("id", ins.order_id).maybeSingle();
    const { data: ud } = await admin.auth.admin.getUserById(ins.user_id);
    if (!ud?.user) { await admin.from("secuencia_inscritos").update({ salio_at: new Date().toISOString(), motivo: "sin_cuenta" }).eq("user_id", ins.user_id); continue; }
    const a = o?.answers ?? {}, nombre = nombreDe(a, ud.user);
    const vars = { nombre, objetivo: objetivoTexto(a.objetivo) };
    const enlace = `${SITE}/analisis?utm_source=email&utm_medium=abandono&utm_campaign=${ins.secuencia}-${sig.paso}`;
    const baja = `${Deno.env.get("SUPABASE_URL")}/functions/v1/secuencias?baja=${encodeURIComponent(ins.email)}&t=${await firma(ins.email)}`;
    const asunto = String(sig.asunto).replace(/\{(nombre|objetivo)\}/g, (_: string, k: string) => String((vars as Obj)[k] ?? ""));
    const ok = await enviar(key, ins.email, asunto, plantilla(render(sig.cuerpo, vars, banderas(a), enlace), baja), nombre);
    await admin.from("secuencia_envios").insert({ user_id: ins.user_id, email: ins.email, secuencia: ins.secuencia, paso: sig.paso, ok });
    cuenta++; ok ? resumen.enviados++ : resumen.fallidos++;
    if (!ok) break; // Sender is refusing (limit or account issue): try again next hour
  }
  return json({ ok: true, ...resumen });
});
