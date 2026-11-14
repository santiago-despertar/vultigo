// Monthly follow-up plan: one full rescan per billing period, progress and compare.
// Actions: estado, activar (one click after a purchase, on the card just used), suscribir (checkout),
// usar (spend this month's rescan on a draft order), cancelar, reactivar.
// No free month: the first month is charged when they subscribe.
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

// Local prices, in the smallest unit Stripe uses for each currency (CLP has no cents). Keep in sync with MONEDAS in assets/js/config.js.
const PRECIOS: Record<string, { soft: number; hard: number; up: number; sub: number }> = {
  MXN: { soft: 149900, hard: 299900, up: 99900, sub: 34900 },
  USD: { soft: 7900, hard: 15900, up: 4900, sub: 1900 },
  EUR: { soft: 6900, hard: 13900, up: 4500, sub: 1600 },
  COP: { soft: 25900000, hard: 51900000, up: 16900000, sub: 5900000 },
  CLP: { soft: 79990, hard: 159990, up: 49990, sub: 18990 },
  PEN: { soft: 27900, hard: 55900, up: 18900, sub: 6500 },
};
const monedaDe = (m: unknown) => { const c = String(m ?? "").toUpperCase(); return PRECIOS[c] ? c : "MXN"; };
// Any charged amount expressed in pesos, using the same ratio as the price table. Commissions are always in pesos.
const aPesos = (amount: number | null | undefined, currency: string | null | undefined) => {
  const c = monedaDe(currency); if (!amount) return 0;
  return c === "MXN" ? Math.round(amount / 100) : Math.round(amount * 1499 / PRECIOS[c].soft);
};

async function guardarFila(userId: string, sub: Stripe.Subscription) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await admin.from("suscripciones").upsert({
    user_id: userId, stripe_customer: customer, stripe_subscription: sub.id, estado: sub.status,
    periodo_inicio: new Date(sub.current_period_start * 1000).toISOString(),
    periodo_fin: new Date(sub.current_period_end * 1000).toISOString(),
    cancela: sub.cancel_at_period_end, actualizado: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

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
    // Pesos use the Stripe price; other currencies a monthly price in that currency on the same product.
    const moneda = monedaDe(body.moneda);
    let item: { price: string } | { price_data: { currency: string; product: string; unit_amount: number; recurring: { interval: "month" } } } = { price: Deno.env.get("STRIPE_PRICE_SUB")! };
    if (moneda !== "MXN" && ["activar", "suscribir"].includes(accion)) {
      const p = await stripe.prices.retrieve(Deno.env.get("STRIPE_PRICE_SUB")!);
      item = { price_data: { currency: moneda.toLowerCase(), product: typeof p.product === "string" ? p.product : p.product.id, unit_amount: PRECIOS[moneda].sub, recurring: { interval: "month" } } };
    }
    const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";

    // One click right after paying for an analysis: subscribe on the card saved at that checkout,
    // free for the first month. Falls back to a checkout page (still with the free month) if there is no saved card.
    if (accion === "activar") {
      const { row, sub } = await leer(user.id);
      if (sub && ACTIVAS.includes(sub.status)) return json({ ya: true });
      const { data: order } = await supabase.from("orders").select("id,status,stripe_session_id").eq("id", body.order_id).single();
      let customer: string | undefined, pm: string | undefined;
      if (order?.stripe_session_id) {
        const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, { expand: ["payment_intent", "payment_intent.payment_method"] });
        customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const pi = session.payment_intent as Stripe.PaymentIntent | null;
        const met = pi?.payment_method as Stripe.PaymentMethod | string | null | undefined;
        const metodo = typeof met === "string" ? await stripe.paymentMethods.retrieve(met) : met;
        // only a card that was saved to the customer can be charged later
        if (metodo && metodo.type === "card" && metodo.customer) pm = metodo.id;
      }
      if (customer && pm) {
        try {
          const nueva = await stripe.subscriptions.create({
            customer,
            items: [item],
            default_payment_method: pm,
            metadata: { user_id: user.id, origen: "upsell" },
            // no free month: the first month is charged right away on the saved card
            payment_behavior: "error_if_incomplete" as const, off_session: true,
          }, { idempotencyKey: `sub-${user.id}-${order!.id}` });
          if (ACTIVAS.includes(nueva.status)) {
            await guardarFila(user.id, nueva);
            return json({ ok: true, prueba: false, siguiente_cobro: new Date(nueva.current_period_end * 1000).toISOString() });
          }
          await stripe.subscriptions.cancel(nueva.id).catch(() => {});
        } catch (e) { console.error("one-click subscription failed, sending to checkout", e); }
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ ...item, quantity: 1 }],
        ...(row?.stripe_customer ? { customer: row.stripe_customer } : customer ? { customer } : { customer_email: user.email }),
        client_reference_id: user.id,
        metadata: { user_id: user.id, tipo: "suscripcion" },
        subscription_data: { metadata: { user_id: user.id } },
        locale: "es-419",
        success_url: `${site}/panel?suscripcion=ok`,
        cancel_url: `${site}/gracias?pedido=${body.order_id ?? ""}`,
      });
      return json({ url: session.url });
    }

    if (accion === "suscribir") {
      const { row, sub } = await leer(user.id);
      if (sub && ACTIVAS.includes(sub.status)) return json({ ya: true });
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ ...item, quantity: 1 }],
        ...(row?.stripe_customer ? { customer: row.stripe_customer } : { customer_email: user.email }),
        client_reference_id: user.id,
        metadata: { user_id: user.id, tipo: "suscripcion" },
        subscription_data: { metadata: { user_id: user.id } },
        locale: "es-419",
        success_url: `${site}/panel?suscripcion=ok`,
        cancel_url: `${site}/panel`,
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
        prueba: sub?.status === "trialing",
        // the free month is covered by the analysis they bought; the first monthly rescan opens when billing starts
        disponible: activa && sub?.status !== "trialing" ? !(await usado(user.id, row!.periodo_inicio)) : false,
        nuevo: !row?.stripe_subscription,
      });
    }

    if (accion === "usar") {
      if (!activa) return json({ error: "Sin suscripción activa" }, 400);
      if (sub?.status === "trialing") return json({ error: "Tu primer escaneo del seguimiento se libera al terminar el mes gratis" }, 400);
      if (await usado(user.id, row!.periodo_inicio)) return json({ error: "Ya usaste el escaneo de este mes" }, 400);
      const { data: order } = await supabase.from("orders").select("id,status,photos_consent_at").eq("id", body.order_id).single();
      if (!order || order.status !== "borrador") return json({ error: "Pedido no válido" }, 400);
      if (!order.photos_consent_at) return json({ error: "Faltan fotos o consentimiento" }, 400);
      const { error } = await admin.from("orders").update({
        status: "pagado", tier: "hard", origen: "suscripcion", amount_mxn: 0, paid_at: new Date().toISOString(),
      }).eq("id", order.id).eq("status", "borrador");
      if (error) throw error;
      return json({ url: `${site}/panel` });
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
