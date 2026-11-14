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

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, { expand: ["payment_intent"] });
    const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const pi = session.payment_intent as Stripe.PaymentIntent | null;
    const pm = pi && (typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id);
    // Charged in the same currency as the first payment. In pesos the UPGRADE_PRICE_MXN secret can override it.
    const moneda = monedaDe(session.currency);
    const diff = moneda === "MXN" ? Math.round(Number(Deno.env.get("UPGRADE_PRICE_MXN") ?? "999") * 100) : PRECIOS[moneda].up;
    if (!(diff > 0)) return json({ error: "Mejora no disponible" }, 400);
    const pesos = aPesos(diff, moneda);

    if (customer && pm) {
      try {
        const charge = await stripe.paymentIntents.create({
          amount: diff,
          currency: moneda.toLowerCase(),
          customer,
          payment_method: pm,
          off_session: true,
          confirm: true,
          description: "Resalta: análisis avanzado",
          metadata: { order_id: order.id, user_id: user.id, upgrade: "true" },
        }, { idempotencyKey: `upgrade-${order.id}` });
        if (charge.status === "succeeded") {
          await admin.from("orders").update({ tier: "hard", amount_mxn: (order.amount_mxn ?? 0) + pesos })
            .eq("id", order.id).eq("tier", "soft");
          // Affiliate commission on the upgrade too (unique per order, so it is never counted twice).
          const { data: o } = await admin.from("orders").select("afiliado_id,user_id").eq("id", order.id).single();
          if (o?.afiliado_id) {
            const { data: a } = await admin.from("afiliados").select("id,comision_pct,activo,user_id").eq("id", o.afiliado_id).single();
            if (a && a.activo && a.user_id !== o.user_id) {
              const venta = pesos;
              await admin.from("comisiones").insert({ afiliado_id: a.id, order_id: order.id, concepto: "mejora", venta_mxn: venta, comision_mxn: Math.round(venta * Number(a.comision_pct) / 100) });
            }
          }
          return json({ ok: true });
        }
      } catch (e) {
        console.error("one-click upgrade failed, sending to checkout", e);
      }
    }

    const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";
    const fallback = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: moneda.toLowerCase(), unit_amount: diff, product_data: { name: "Resalta: análisis avanzado" } } }],
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
