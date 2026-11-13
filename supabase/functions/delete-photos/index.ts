// Right to erasure for the signed-in user.
//   {}                                  -> delete every photo, keep the account and reports
//   { accion: "pedido", order_id }      -> delete one unpaid analysis (draft) and its photos, to start over
//   { accion: "cuenta", confirmar: "BORRAR" } -> cancel any subscription, delete photos, leads and the account
//                                          (orders, reports, chat and subscription rows go with it by cascade)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Stripe from "npm:stripe@16.12.0";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user_client = createClient(Deno.env.get("SUPABASE_URL")!, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await user_client.auth.getUser();
  if (!user) return json({ error: "No autorizado" }, 401);
  const body = await req.json().catch(() => ({}));
  const accion = body.accion ?? "fotos";

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const bucket = admin.storage.from("fotos");

  // every file under a folder, at any depth
  async function archivos(prefijo: string): Promise<string[]> {
    const out: string[] = [];
    const { data } = await bucket.list(prefijo, { limit: 1000 });
    for (const x of data ?? []) {
      const ruta = `${prefijo}/${x.name}`;
      if (x.id === null || !x.metadata) out.push(...await archivos(ruta)); // a folder
      else out.push(ruta);
    }
    return out;
  }
  async function borrar(prefijo: string) {
    const paths = await archivos(prefijo);
    for (let i = 0; i < paths.length; i += 100) await bucket.remove(paths.slice(i, i + 100));
    return paths.length;
  }

  if (accion === "fotos") return json({ deleted: await borrar(user.id) });

  if (accion === "pedido") {
    const id = String(body.order_id ?? "");
    const { data: order } = await admin.from("orders").select("id,status").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!order) return json({ error: "Pedido no encontrado" }, 404);
    if (order.status !== "borrador") return json({ error: "Solo se puede borrar un análisis sin pagar" }, 400);
    const n = await borrar(`${user.id}/${order.id}`);
    const { error } = await admin.from("orders").delete().eq("id", order.id).eq("status", "borrador");
    if (error) return json({ error: "No se pudo borrar" }, 500);
    return json({ ok: true, fotos: n });
  }

  if (accion === "cuenta") {
    if (String(body.confirmar ?? "").trim().toUpperCase() !== "BORRAR") return json({ error: "Falta confirmar" }, 400);
    // stop any future charge first; if this fails, nothing else is deleted
    const { data: sub } = await admin.from("suscripciones").select("stripe_subscription,estado").eq("user_id", user.id).maybeSingle();
    if (sub?.stripe_subscription && !["canceled", "incomplete_expired"].includes(sub.estado ?? "")) {
      try {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
        await stripe.subscriptions.cancel(sub.stripe_subscription);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code !== "resource_missing") return json({ error: "No pudimos cancelar tu suscripción" }, 500);
      }
    }
    const n = await borrar(user.id);
    if (user.email) await admin.from("leads").delete().eq("email", user.email.toLowerCase());
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return json({ error: "No se pudo borrar la cuenta" }, 500);
    return json({ ok: true, fotos: n });
  }

  return json({ error: "Acción no válida" }, 400);
});
