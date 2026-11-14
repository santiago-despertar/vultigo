// Marks an order as paid when Stripe confirms the payment (card right away, OXXO when the voucher is paid).
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Deploy with --no-verify-jwt.
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Affiliate commission for a paid order or upgrade. Unique per order and concept, so retries never double-pay.
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

// Meta Conversions API: the same purchase the browser pixel reports, sent from the server so it is not lost
// to ad blockers or iPhone tracking limits. Same event_id as the pixel, so Meta counts it once.
// Secret: META_CAPI_TOKEN (without it nothing is sent). Pixel: META_PIXEL_ID (default Resalta's).
async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function capi(nombre: string, id: string, s: Stripe.Checkout.Session, userId?: string | null) {
  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!token || !s.amount_total) return;
  try {
    const moneda = (s.currency ?? "mxn").toUpperCase();
    const valor = moneda === "CLP" ? s.amount_total : s.amount_total / 100;
    const email = s.customer_details?.email ?? s.customer_email ?? "";
    const user_data: Record<string, unknown> = {};
    if (email) user_data.em = [await sha256(email.trim().toLowerCase())];
    if (userId) user_data.external_id = [await sha256(userId)];
    if (s.metadata?.fbp) user_data.fbp = s.metadata.fbp;
    if (s.metadata?.fbc) user_data.fbc = s.metadata.fbc;
    const pixel = Deno.env.get("META_PIXEL_ID") ?? "3159447567559166";
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [{
        event_name: nombre, event_time: Math.floor(Date.now() / 1000), event_id: id, action_source: "website",
        event_source_url: `${Deno.env.get("SITE_URL") ?? "https://resalta.co"}/gracias`, user_data,
        custom_data: { value: valor, currency: moneda },
      }] }),
    });
    if (!r.ok) console.error("capi", r.status, (await r.text()).slice(0, 300));
  } catch (e) { console.error("capi", e); }
}

async function comision(orderId: string, concepto: string, ventaMxn: number) {
  if (!ventaMxn) return;
  const { data: o } = await admin.from("orders").select("afiliado_id,user_id").eq("id", orderId).single();
  if (!o?.afiliado_id) return;
  const { data: a } = await admin.from("afiliados").select("id,comision_pct,activo,user_id").eq("id", o.afiliado_id).single();
  if (!a || !a.activo || a.user_id === o.user_id) return;
  await admin.from("comisiones").insert({
    afiliado_id: a.id, order_id: orderId, concepto, venta_mxn: ventaMxn,
    comision_mxn: Math.round(ventaMxn * Number(a.comision_pct) / 100),
  });
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const paidEvents = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
  if (paidEvents.includes(event.type)) {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.mode === "subscription") {
      // Monthly follow-up plan: remember who it belongs to; the status is re-read from Stripe when used.
      const userId = s.metadata?.user_id || s.client_reference_id;
      if (userId && s.subscription) {
        const sub = await stripe.subscriptions.retrieve(String(s.subscription));
        await admin.from("suscripciones").upsert({
          user_id: userId,
          stripe_customer: String(s.customer ?? ""),
          stripe_subscription: sub.id,
          estado: sub.status,
          periodo_inicio: new Date(sub.current_period_start * 1000).toISOString(),
          periodo_fin: new Date(sub.current_period_end * 1000).toISOString(),
          cancela: sub.cancel_at_period_end,
          actualizado: new Date().toISOString(),
        });
        await capi("Subscribe", `sub-${sub.id}`, s, userId);
      }
    } else if (s.payment_status === "paid" && s.client_reference_id && s.metadata?.upgrade === "true") {
      // Upgrade paid through a separate checkout (fallback when the one-click charge was not possible).
      const { data: o } = await admin.from("orders").select("amount_mxn,tier").eq("id", s.client_reference_id).single();
      if (o && o.tier === "soft") {
        await admin.from("orders").update({
          tier: "hard",
          amount_mxn: (o.amount_mxn ?? 0) + (aPesos(s.amount_total, s.currency)),
        }).eq("id", s.client_reference_id).in("status", ["pagado", "listo"]);
        await comision(s.client_reference_id, "mejora", aPesos(s.amount_total, s.currency));
      }
    } else if (s.payment_status === "paid" && s.client_reference_id) {
      const { data: cambiado } = await admin.from("orders").update({
        status: "pagado",
        tier: s.metadata?.tier === "hard" ? "hard" : "soft",
        stripe_session_id: s.id,
        amount_mxn: s.amount_total ? aPesos(s.amount_total, s.currency) : null,
        paid_at: new Date().toISOString(),
      }).eq("id", s.client_reference_id).eq("status", "borrador").select("id");
      if (cambiado && cambiado.length) {
        await comision(s.client_reference_id, "venta", aPesos(s.amount_total, s.currency));
        await capi("Purchase", "compra-" + s.client_reference_id, s, s.metadata?.user_id);
      }
    }
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await admin.from("suscripciones").update({
      estado: sub.status,
      periodo_inicio: new Date(sub.current_period_start * 1000).toISOString(),
      periodo_fin: new Date(sub.current_period_end * 1000).toISOString(),
      cancela: sub.cancel_at_period_end,
      actualizado: new Date().toISOString(),
    }).eq("stripe_subscription", sub.id);
  }
  return new Response("ok");
});
