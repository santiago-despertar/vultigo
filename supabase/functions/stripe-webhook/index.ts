// Marks an order as paid when Stripe confirms the payment (card right away, OXXO when the voucher is paid).
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Deploy with --no-verify-jwt.
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Affiliate commission for a paid order or upgrade. Unique per order and concept, so retries never double-pay.
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
      }
    } else if (s.payment_status === "paid" && s.client_reference_id && s.metadata?.upgrade === "true") {
      // Upgrade paid through a separate checkout (fallback when the one-click charge was not possible).
      const { data: o } = await admin.from("orders").select("amount_mxn,tier").eq("id", s.client_reference_id).single();
      if (o && o.tier === "soft") {
        await admin.from("orders").update({
          tier: "hard",
          amount_mxn: (o.amount_mxn ?? 0) + (s.amount_total ? Math.round(s.amount_total / 100) : 0),
        }).eq("id", s.client_reference_id).in("status", ["pagado", "listo"]);
        await comision(s.client_reference_id, "mejora", s.amount_total ? Math.round(s.amount_total / 100) : 0);
      }
    } else if (s.payment_status === "paid" && s.client_reference_id) {
      const { data: cambiado } = await admin.from("orders").update({
        status: "pagado",
        tier: s.metadata?.tier === "hard" ? "hard" : "soft",
        stripe_session_id: s.id,
        amount_mxn: s.amount_total ? Math.round(s.amount_total / 100) : null,
        paid_at: new Date().toISOString(),
      }).eq("id", s.client_reference_id).eq("status", "borrador").select("id");
      if (cambiado && cambiado.length) await comision(s.client_reference_id, "venta", s.amount_total ? Math.round(s.amount_total / 100) : 0);
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
