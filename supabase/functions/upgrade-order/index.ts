// One-click upgrade from Plan Esencial to Plan Completo after the first payment.
// Charges a discounted upgrade price to the card saved at checkout. If that is not possible
// (OXXO payment, bank asks for confirmation, card declined) it returns a normal checkout link instead.
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);

    const { order_id } = await req.json();
    const { data: order } = await userClient.from("orders").select("id,status,tier,stripe_session_id,amount_mxn").eq("id", order_id).single();
    if (!order || !["pagado", "listo"].includes(order.status) || order.tier !== "soft" || !order.stripe_session_id) return json({ error: "Pedido no válido" }, 400);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
    // Discounted price for customers who skipped the upgrade at checkout. Change it with the UPGRADE_PRICE_MXN secret.
    const diff = Math.round(Number(Deno.env.get("UPGRADE_PRICE_MXN") ?? "999") * 100);
    if (!(diff > 0)) return json({ error: "Mejora no disponible" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, { expand: ["payment_intent"] });
    const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const pi = session.payment_intent as Stripe.PaymentIntent | null;
    const pm = pi && (typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id);

    if (customer && pm) {
      try {
        const charge = await stripe.paymentIntents.create({
          amount: diff,
          currency: "mxn",
          customer,
          payment_method: pm,
          off_session: true,
          confirm: true,
          description: "Resalta: análisis avanzado",
          metadata: { order_id: order.id, user_id: user.id, upgrade: "true" },
        }, { idempotencyKey: `upgrade-${order.id}` });
        if (charge.status === "succeeded") {
          await admin.from("orders").update({ tier: "hard", amount_mxn: (order.amount_mxn ?? 0) + Math.round(diff / 100) })
            .eq("id", order.id).eq("tier", "soft");
          return json({ ok: true });
        }
      } catch (e) {
        console.error("one-click upgrade failed, sending to checkout", e);
      }
    }

    const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";
    const fallback = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "mxn", unit_amount: diff, product_data: { name: "Resalta: análisis avanzado" } } }],
      ...(customer ? { customer } : { customer_email: user.email }),
      client_reference_id: order.id,
      metadata: { order_id: order.id, user_id: user.id, upgrade: "true" },
      locale: "es-419",
      success_url: `${site}/gracias?pedido=${order.id}&mejora=1`,
      cancel_url: `${site}/gracias?pedido=${order.id}`,
    });
    return json({ url: fallback.url });
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo completar la mejora" }, 500);
  }
});
