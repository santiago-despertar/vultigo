// Monthly follow-up plan: one full rescan per billing period, progress and compare.
// Actions: estado, suscribir, usar (spend this month's rescan on a draft order), cancelar, reactivar.
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_SUB, SITE_URL
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ACTIVAS = ["active", "trialing"];

// Reads the subscription from Stripe so the answer never depends on a missed webhook.
async function leer(userId: string) {
  const { data: row } = await admin.from("suscripciones").select("*").eq("user_id", userId).maybeSingle();
  if (!row?.stripe_subscription) return { row, sub: null as Stripe.Subscription | null };
  const sub = await stripe.subscriptions.retrieve(row.stripe_subscription);
  const upd = {
    estado: sub.status,
    periodo_inicio: new Date(sub.current_period_start * 1000).toISOString(),
    periodo_fin: new Date(sub.current_period_end * 1000).toISOString(),
    cancela: sub.cancel_at_period_end,
    actualizado: new Date().toISOString(),
  };
  await admin.from("suscripciones").update(upd).eq("user_id", userId);
  return { row: { ...row, ...upd }, sub };
}

async function usado(userId: string, desde: string) {
  const { count } = await admin.from("orders").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("origen", "suscripcion").gte("paid_at", desde);
  return (count ?? 0) > 0;
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
    const accion = body.accion ?? "estado";
    const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";

    if (accion === "suscribir") {
      const { row, sub } = await leer(user.id);
      if (sub && ACTIVAS.includes(sub.status)) return json({ ya: true });
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: Deno.env.get("STRIPE_PRICE_SUB")!, quantity: 1 }],
        ...(row?.stripe_customer ? { customer: row.stripe_customer } : { customer_email: user.email }),
        client_reference_id: user.id,
        metadata: { user_id: user.id, tipo: "suscripcion" },
        subscription_data: { metadata: { user_id: user.id } },
        locale: "es-419",
        success_url: `${site}/panel.html?suscripcion=ok`,
        cancel_url: `${site}/panel.html`,
      });
      return json({ url: session.url });
    }

    const { row, sub } = await leer(user.id);
    const activa = !!sub && ACTIVAS.includes(sub.status);

    if (accion === "estado") {
      return json({
        activa,
        periodo_fin: row?.periodo_fin ?? null,
        cancela: row?.cancela ?? false,
        disponible: activa ? !(await usado(user.id, row!.periodo_inicio)) : false,
      });
    }

    if (accion === "usar") {
      if (!activa) return json({ error: "Sin suscripción activa" }, 400);
      if (await usado(user.id, row!.periodo_inicio)) return json({ error: "Ya usaste el escaneo de este mes" }, 400);
      const { data: order } = await supabase.from("orders").select("id,status,photos_consent_at").eq("id", body.order_id).single();
      if (!order || order.status !== "borrador") return json({ error: "Pedido no válido" }, 400);
      if (!order.photos_consent_at) return json({ error: "Faltan fotos o consentimiento" }, 400);
      const { error } = await admin.from("orders").update({
        status: "pagado", tier: "hard", origen: "suscripcion", amount_mxn: 0, paid_at: new Date().toISOString(),
      }).eq("id", order.id).eq("status", "borrador");
      if (error) throw error;
      return json({ url: `${site}/panel.html` });
    }

    if (accion === "cancelar" || accion === "reactivar") {
      if (!sub) return json({ error: "Sin suscripción" }, 400);
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: accion === "cancelar" });
      await admin.from("suscripciones").update({ cancela: accion === "cancelar" }).eq("user_id", user.id);
      return json({ ok: true, cancela: accion === "cancelar", periodo_fin: row?.periodo_fin });
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo completar" }, 500);
  }
});
