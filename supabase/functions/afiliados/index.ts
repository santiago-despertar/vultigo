// Affiliate program: clicks, sign-up, the affiliate's own panel, and the owner's payout view.
// Uses SUPABASE_SERVICE_ROLE_KEY server-side only. Deploy with JWT verification off (clicks come from visitors).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const limpiarCodigo = (c: unknown) => String(c ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
const RESERVADOS = ["resalta", "admin", "soporte", "oficial", "descuento", "gratis", "test"];

async function usuario(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const { data } = await admin.auth.getUser(auth.replace("Bearer ", ""));
  const u = data?.user;
  // Sign-up starts as an anonymous session with the email attached, so accept a pending email too.
  if (!u) return null;
  const email = u.email || (u as unknown as { new_email?: string }).new_email || "";
  return email ? { ...u, email } : null;
}

async function resumen(afiliadoId: string) {
  const { data: c } = await admin.from("comisiones")
    .select("id,concepto,venta_mxn,comision_mxn,estado,disponible_at,pagada_at,created_at")
    .eq("afiliado_id", afiliadoId).order("created_at", { ascending: false }).limit(500);
  const ahora = Date.now();
  const lista = (c ?? []).map(x => ({ ...x, estado: x.estado === "pendiente" && new Date(x.disponible_at).getTime() <= ahora ? "aprobada" : x.estado }));
  const suma = (e: string) => lista.filter(x => x.estado === e).reduce((a, x) => a + x.comision_mxn, 0);
  return { lista, pendiente: suma("pendiente"), por_pagar: suma("aprobada"), pagado: suma("pagada"), ventas: lista.filter(x => x.concepto === "venta" && x.estado !== "cancelada").length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion ?? "");

    // Public: count a visit from an affiliate link and say whose link it is (for the discount note).
    if (accion === "clic" || accion === "info") {
      const codigo = limpiarCodigo(body.codigo);
      const { data: a } = await admin.from("afiliados").select("nombre,descuento_pct,activo").eq("codigo", codigo).maybeSingle();
      if (!a || !a.activo) return json({ valido: false });
      if (accion === "clic") await admin.rpc("sumar_clic", { c: codigo });
      return json({ valido: true, nombre: (a.nombre || "").split(" ")[0], descuento: a.descuento_pct });
    }

    const user = await usuario(req);
    if (!user) return json({ error: "Inicia sesión con tu correo para continuar." }, 401);
    const { data: yo } = await admin.from("afiliados").select("*").eq("user_id", user.id).maybeSingle();
    const { data: esAdmin } = await admin.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();

    if (accion === "panel") {
      return json({ afiliado: yo, admin: !!esAdmin, email: user.email, ...(yo ? await resumen(yo.id) : {}) });
    }

    if (accion === "unirme" || accion === "editar") {
      const nombre = String(body.nombre ?? "").trim().slice(0, 80);
      const redes = String(body.redes ?? "").trim().slice(0, 300);
      const pago_metodo = ["paypal", "transferencia", "otro"].includes(body.pago_metodo) ? body.pago_metodo : null;
      const pago_datos = String(body.pago_datos ?? "").trim().slice(0, 200);
      if (!nombre) return json({ error: "Escribe tu nombre." }, 400);
      if (accion === "editar") {
        if (!yo) return json({ error: "Aún no eres afiliado." }, 400);
        await admin.from("afiliados").update({ nombre, redes, pago_metodo, pago_datos }).eq("id", yo.id);
        return json({ ok: true });
      }
      if (yo) return json({ ok: true });
      const codigo = limpiarCodigo(body.codigo);
      if (codigo.length < 3) return json({ error: "Tu código necesita al menos 3 letras o números." }, 400);
      if (RESERVADOS.some(r => codigo.includes(r))) return json({ error: "Ese código no está disponible. Prueba otro." }, 400);
      const { error } = await admin.from("afiliados").insert({ user_id: user.id, codigo, nombre, redes, pago_metodo, pago_datos });
      if (error) return json({ error: error.code === "23505" ? "Ese código ya lo tiene alguien más. Prueba otro." : "No se pudo crear tu cuenta de afiliado." }, 400);
      return json({ ok: true });
    }

    // Owner only: everyone's balances, and marking commissions as paid.
    if (accion === "admin_lista" || accion === "admin_pagar" || accion === "admin_estado") {
      if (!esAdmin) return json({ error: "No autorizado" }, 403);
      if (accion === "admin_pagar") {
        const ahora = new Date().toISOString();
        const { data } = await admin.from("comisiones").update({ estado: "pagada", pagada_at: ahora })
          .eq("afiliado_id", body.afiliado_id).in("estado", ["pendiente", "aprobada"]).lte("disponible_at", ahora).select("comision_mxn");
        return json({ ok: true, pagado: (data ?? []).reduce((a, x) => a + x.comision_mxn, 0) });
      }
      if (accion === "admin_estado") {
        const cambios: Record<string, unknown> = {};
        if (typeof body.activo === "boolean") cambios.activo = body.activo;
        if (Number.isFinite(body.comision_pct) && body.comision_pct >= 0 && body.comision_pct <= 60) cambios.comision_pct = body.comision_pct;
        if (body.cancelar_comision) await admin.from("comisiones").update({ estado: "cancelada" }).eq("id", body.cancelar_comision).neq("estado", "pagada");
        if (Object.keys(cambios).length) await admin.from("afiliados").update(cambios).eq("id", body.afiliado_id);
        return json({ ok: true });
      }
      const { data: todos } = await admin.from("afiliados").select("id,codigo,nombre,redes,pago_metodo,pago_datos,comision_pct,activo,clics,created_at,user_id").order("created_at", { ascending: false });
      const filas = [];
      for (const a of todos ?? []) {
        const r = await resumen(a.id);
        const { data: u } = await admin.auth.admin.getUserById(a.user_id);
        filas.push({ ...a, email: u?.user?.email || (u?.user as unknown as { new_email?: string })?.new_email || "", ventas: r.ventas, pendiente: r.pendiente, por_pagar: r.por_pagar, pagado: r.pagado });
      }
      return json({ afiliados: filas });
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Algo falló. Intenta de nuevo." }, 500);
  }
});
