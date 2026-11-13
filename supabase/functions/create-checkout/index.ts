// Creates a Stripe Checkout session for one of the signed-in user's draft orders.
// Secrets (set in Supabase > Edge Functions > Secrets): STRIPE_SECRET_KEY, STRIPE_PRICE_SOFT, STRIPE_PRICE_HARD, SITE_URL
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
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);

    const { order_id, tier: wanted, ref } = await req.json();
    const { data: order } = await supabase.from("orders").select("id,status,tier,photos_consent_at,afiliado_id").eq("id", order_id).single();
    if (!order || order.status !== "borrador") return json({ error: "Pedido no válido" }, 400);
    const tier = (wanted ?? order.tier) === "hard" ? "hard" : "soft";
    if (!order.photos_consent_at) return json({ error: "Faltan fotos o consentimiento" }, 400);

    // Keep the stored plan in sync with what the customer picked on the payment step.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("orders").update({ tier }).eq("id", order.id).eq("status", "borrador");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);

    // Affiliate: keep the one already on the order, otherwise use the link the buyer came from.
    // Nobody earns a commission on their own purchase.
    let afiliado: { id: string; descuento_pct: number } | null = null;
    if (order.afiliado_id) {
      const { data } = await admin.from("afiliados").select("id,descuento_pct,activo,user_id").eq("id", order.afiliado_id).maybeSingle();
      if (data && data.activo && data.user_id !== user.id) afiliado = data;
    } else if (ref) {
      const codigo = String(ref).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
      const { data } = await admin.from("afiliados").select("id,descuento_pct,activo,user_id").eq("codigo", codigo).maybeSingle();
      if (data && data.activo && data.user_id !== user.id) {
        afiliado = data;
        await admin.from("orders").update({ afiliado_id: data.id }).eq("id", order.id).eq("status", "borrador");
      }
    }
    let discounts: { coupon: string }[] | undefined;
    const pct = afiliado ? Math.round(Number(afiliado.descuento_pct) || 0) : 0;
    if (pct > 0) {
      const id = `AFILIADO_${pct}`;
      // Only apply the discount if the coupon really exists, so a Stripe hiccup never blocks the payment.
      const cupon = await stripe.coupons.retrieve(id).catch(() =>
        stripe.coupons.create({ id, percent_off: pct, duration: "once", name: `Invitación ${pct}%` }).catch(e => { console.error("coupon", e); return null; }));
      if (cupon) discounts = [{ coupon: id }];
    }
    const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";
    const base = {
      mode: "payment" as const,
      line_items: [{ price: Deno.env.get(tier === "hard" ? "STRIPE_PRICE_HARD" : "STRIPE_PRICE_SOFT")!, quantity: 1 }],
      customer_creation: "always" as const,
      customer_email: user.email,
      client_reference_id: order.id,
      metadata: { order_id: order.id, user_id: user.id, tier, afiliado_id: afiliado ? afiliado.id : "" },
      ...(discounts ? { discounts } : {}),
      locale: "es-419" as const,
      success_url: `${site}/gracias?pedido=${order.id}`,
      cancel_url: `${site}/analisis`,
    };
    let session;
    try {
      // Saves the card so the one-click upgrade on the thank-you page can reuse it.
      session = await stripe.checkout.sessions.create({
        ...base,
        payment_method_options: { card: { installments: { enabled: true }, setup_future_usage: "off_session" } },
      });
    } catch (e) {
      console.error("checkout with saved card failed, retrying without it", e);
      session = await stripe.checkout.sessions.create({
        ...base,
        payment_method_options: { card: { installments: { enabled: true } } },
      });
    }
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo crear el pago" }, 500);
  }
});
