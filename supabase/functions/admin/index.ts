// Owner's panel (admin.resalta.co): every user, order, report, photo, lead, subscription, affiliate and the
// site analytics (table eventos). Only accounts listed in public.admins get an answer; everything is read
// with the service role here, never from the browser. Deploy with JWT verification off and check it below.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGENES = ["https://admin.resalta.co"];
const corsDe = (req: Request) => {
  const o = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENES.includes(o) ? o : ORIGENES[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
type Obj = Record<string, any>; // deno-lint-ignore no-explicit-any

const DIA = 864e5;
const hoy0 = () => { const d = new Date(); d.setUTCHours(6, 0, 0, 0); if (d.getTime() > Date.now()) d.setTime(d.getTime() - DIA); return d; }; // midnight in Mexico City
const diaMX = (t: string | number | Date) => new Date(new Date(t).getTime() - 6 * 3600e3).toISOString().slice(0, 10);
const cuenta = <T>(xs: T[], k: (x: T) => string | null | undefined) => {
  const m: Record<string, number> = {};
  for (const x of xs) { const v = k(x) || "(directo)"; m[v] = (m[v] ?? 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const dominio = (r?: string | null) => { if (!r) return null; try { return new URL(r).hostname.replace(/^www\./, ""); } catch { return null; } };
const fuente = (e: Obj) => e.utm_source || (dominio(e.ref) && !/resalta\.co$/.test(dominio(e.ref)!) ? dominio(e.ref) : null);
const PAIS_TZ: [RegExp, string][] = [
  [/^America\/(Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ciudad_Juarez|Ojinaga|Mazatlan|Bahia_Banderas|Hermosillo|Tijuana)$/, "México"],
  [/^America\/Bogota$/, "Colombia"], [/^America\/(Santiago|Punta_Arenas)$/, "Chile"], [/^America\/Lima$/, "Perú"],
  [/^America\/(Argentina\/|Buenos_Aires)/, "Argentina"], [/^Europe\/Madrid|^Atlantic\/Canary|^Africa\/Ceuta/, "España"],
  [/^America\/(Guatemala|El_Salvador|Tegucigalpa|Managua|Costa_Rica|Panama)$/, "Centroamérica"],
  [/^America\/(Caracas)$/, "Venezuela"], [/^America\/(Guayaquil)$/, "Ecuador"], [/^America\/(La_Paz)$/, "Bolivia"],
  [/^America\/(Asuncion)$/, "Paraguay"], [/^America\/(Montevideo)$/, "Uruguay"], [/^America\/(Santo_Domingo|Puerto_Rico|Havana)$/, "Caribe"],
  [/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Indiana)/, "Estados Unidos"],
];
const paisDe = (tz?: string | null) => { if (!tz) return null; for (const [r, p] of PAIS_TZ) if (r.test(tz)) return p; return tz.split("/")[0] === "Europe" ? "Europa (otro)" : tz; };

async function todosLosUsuarios() {
  const out: Obj[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out;
}
async function eventosDesde(desde: Date, cols = "*") {
  const out: Obj[] = [];
  for (let i = 0; i < 100; i++) {
    const { data, error } = await admin.from("eventos").select(cols).gte("ts", desde.toISOString()).order("id").range(i * 1000, i * 1000 + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
const resumenUsuario = (u: Obj) => ({
  id: u.id, email: u.email ?? u.new_email ?? null, nombre: u.user_metadata?.full_name ?? null, creado: u.created_at, ultimo: u.last_sign_in_at,
  proveedor: u.app_metadata?.provider ?? (u.is_anonymous ? "anónimo" : null), anonimo: !!u.is_anonymous, tipo: u.user_metadata?.tipo ?? null,
});

async function listarFotos(uid: string) {
  const b = admin.storage.from("fotos"), rutas: string[] = [];
  const recorrer = async (pref: string, nivel: number) => {
    const { data } = await b.list(pref, { limit: 200 });
    for (const it of data ?? []) {
      const ruta = `${pref}/${it.name}`;
      if (it.id) { if (/\.(jpe?g|png|webp)$/i.test(it.name)) rutas.push(ruta); }
      else if (nivel < 3) await recorrer(ruta, nivel + 1);
    }
  };
  await recorrer(uid, 0);
  if (!rutas.length) return [];
  const { data } = await b.createSignedUrls(rutas, 3600);
  return (data ?? []).map((x, i) => ({ ruta: rutas[i], url: x.signedUrl }));
}

Deno.serve(async (req) => {
  const cors = corsDe(req);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "No autorizado" }, 401);
    const { data: ud } = await admin.auth.getUser(token);
    const yo = ud?.user;
    if (!yo || yo.is_anonymous) return json({ error: "No autorizado" }, 401);
    const { data: esAdmin } = await admin.from("admins").select("user_id").eq("user_id", yo.id).maybeSingle();
    if (!esAdmin) return json({ error: "Esta cuenta no tiene acceso" }, 403);

    const b = await req.json().catch(() => ({}));
    const accion = String(b.accion ?? "resumen");

    if (accion === "yo") return json({ ok: true, email: yo.email });

    if (accion === "resumen") {
      const dias = Math.min(365, Math.max(1, Number(b.dias) || 30));
      const desde = new Date(hoy0().getTime() - (dias - 1) * DIA);
      const [usuarios, ord, subs, leads, rep, ev, com, afi, fis] = await Promise.all([
        todosLosUsuarios(),
        admin.from("orders").select("id,user_id,status,tier,amount_mxn,paid_at,created_at,origen,afiliado_id").then((r) => r.data ?? []),
        admin.from("suscripciones").select("user_id,estado,periodo_fin,cancela,actualizado").then((r) => r.data ?? []),
        admin.from("leads").select("id,email,score,source,created_at,enviado_at").then((r) => r.data ?? []),
        admin.from("reports").select("order_id,data->>estado,data->>generado").then((r) => r.data ?? []),
        eventosDesde(desde, "ts,nombre,path,ref,vid,sid,user_id,utm_source,utm_medium,utm_campaign,dispositivo,tz,valor"),
        admin.from("comisiones").select("comision_mxn,estado").then((r) => r.data ?? []),
        admin.from("afiliados").select("id,activo,clics").then((r) => r.data ?? []),
        admin.from("fisico").select("id,estado,created_at").then((r) => r.data ?? []),
      ]);
      const pagadas = ord.filter((o: Obj) => o.status === "pagado" || o.status === "listo");
      const enRango = (t?: string | null) => !!t && new Date(t) >= desde;
      const reales = usuarios.filter((u) => !u.is_anonymous);
      const vids = new Set(ev.filter((e) => e.nombre === "page_view").map((e) => e.vid));
      const visitasA = (re: RegExp) => new Set(ev.filter((e) => e.nombre === "page_view" && re.test(e.path ?? "")).map((e) => e.vid)).size;
      const unicos = (n: string) => new Set(ev.filter((e) => e.nombre === n).map((e) => e.vid || e.sid)).size;
      const activas = subs.filter((s: Obj) => s.estado === "active" || s.estado === "trialing");

      // daily series (Mexico City days)
      const serie: Obj = {};
      for (let i = 0; i < dias; i++) serie[diaMX(desde.getTime() + i * DIA + 7 * 3600e3)] = { visitantes: new Set(), vistas: 0, leads: 0, registros: 0, compras: 0, ingresos: 0 };
      for (const e of ev) { const s = serie[diaMX(e.ts)]; if (!s) continue; if (e.nombre === "page_view") { s.vistas++; s.visitantes.add(e.vid); } }
      for (const l of leads) { const s = serie[diaMX(l.created_at)]; if (s) s.leads++; }
      for (const u of reales) { const s = serie[diaMX(u.created_at)]; if (s) s.registros++; }
      for (const o of pagadas) { if (!o.paid_at) continue; const s = serie[diaMX(o.paid_at)]; if (s) { s.compras++; s.ingresos += o.amount_mxn ?? 0; } }
      const serieOut = Object.entries(serie).map(([d, s]: [string, Obj]) => ({ dia: d, visitantes: s.visitantes.size, vistas: s.vistas, leads: s.leads, registros: s.registros, compras: s.compras, ingresos: s.ingresos }));

      const pv = ev.filter((e) => e.nombre === "page_view");
      const primeraPorVisitante = new Map<string, Obj>();
      for (const e of pv) if (e.vid && !primeraPorVisitante.has(e.vid)) primeraPorVisitante.set(e.vid, e);
      const entradas = [...primeraPorVisitante.values()];
      const compradoresVid = new Set(ev.filter((e) => e.nombre === "purchase").map((e) => e.vid));
      const fuentes = cuenta(entradas, fuente).slice(0, 15).map(([k, n]) => ({ fuente: k, visitantes: n, compras: entradas.filter((e) => (fuente(e) || "(directo)") === k && compradoresVid.has(e.vid)).length }));

      return json({
        ok: true, dias, desde: desde.toISOString(),
        kpis: {
          usuarios: reales.length, usuarios_rango: reales.filter((u) => enRango(u.created_at)).length, anonimos: usuarios.length - reales.length,
          leads: leads.length, leads_rango: leads.filter((l: Obj) => enRango(l.created_at)).length,
          compras: pagadas.length, compras_rango: pagadas.filter((o: Obj) => enRango(o.paid_at)).length,
          ingresos_mxn: pagadas.reduce((s: number, o: Obj) => s + (o.amount_mxn ?? 0), 0),
          ingresos_rango_mxn: pagadas.filter((o: Obj) => enRango(o.paid_at)).reduce((s: number, o: Obj) => s + (o.amount_mxn ?? 0), 0),
          esencial: pagadas.filter((o: Obj) => o.tier === "soft").length, completo: pagadas.filter((o: Obj) => o.tier === "hard").length,
          borradores: ord.filter((o: Obj) => o.status === "borrador").length,
          suscripciones_activas: activas.length, suscripciones_canceladas: subs.filter((s: Obj) => s.estado === "canceled").length,
          mrr_mxn: activas.length * 349,
          reportes_listos: rep.filter((r: Obj) => r.estado !== "error" && r.generado).length, reportes_error: rep.filter((r: Obj) => r.estado === "error").length,
          planes_fisico: fis.length,
          afiliados: afi.length, clics_afiliados: afi.reduce((s: number, a: Obj) => s + (a.clics ?? 0), 0),
          comisiones_pendientes_mxn: com.filter((c: Obj) => c.estado !== "pagada").reduce((s: number, c: Obj) => s + (c.comision_mxn ?? 0), 0),
          visitantes: vids.size, vistas: pv.length, sesiones: new Set(pv.map((e) => e.sid)).size,
        },
        embudo: [
          { paso: "Visitantes", n: vids.size },
          { paso: "Vieron la calificación gratis", n: visitasA(/^\/calificacion/) },
          { paso: "Dejaron su correo (lead)", n: unicos("generate_lead") },
          { paso: "Vieron la oferta", n: visitasA(/^\/(analisis|cuenta)/) },
          { paso: "Iniciaron pago", n: unicos("begin_checkout") },
          { paso: "Compraron", n: unicos("purchase") },
        ],
        serie: serieOut,
        fuentes,
        campanas: cuenta(entradas.filter((e) => e.utm_campaign), (e) => e.utm_campaign).slice(0, 15),
        paginas: cuenta(pv, (e) => e.path).slice(0, 20),
        dispositivos: cuenta(entradas, (e) => e.dispositivo),
        paises: cuenta(entradas, (e) => paisDe(e.tz)).slice(0, 15),
      });
    }

    if (accion === "usuarios") {
      const [usuarios, ord, subs, leads] = await Promise.all([
        todosLosUsuarios(),
        admin.from("orders").select("id,user_id,status,tier,amount_mxn,paid_at,answers->>nombre,answers->>pais,answers->>edad,answers->>sexo").then((r) => r.data ?? []),
        admin.from("suscripciones").select("user_id,estado,periodo_fin,cancela").then((r) => r.data ?? []),
        admin.from("leads").select("email,score,created_at").then((r) => r.data ?? []),
      ]);
      const filas = usuarios.map((u) => {
        const os = ord.filter((o: Obj) => o.user_id === u.id), pag = os.filter((o: Obj) => o.status === "pagado" || o.status === "listo");
        const s = subs.find((x: Obj) => x.user_id === u.id), em = (u.email ?? "").toLowerCase();
        const l = leads.filter((x: Obj) => x.email === em).sort((a: Obj, b2: Obj) => a.created_at < b2.created_at ? 1 : -1)[0];
        const o0 = os[0] ?? {};
        return { ...resumenUsuario(u), pedidos: os.length, pagados: pag.length, plan: pag.some((o: Obj) => o.tier === "hard") ? "Completo" : pag.length ? "Esencial" : null,
          pagado_mxn: pag.reduce((t: number, o: Obj) => t + (o.amount_mxn ?? 0), 0), suscripcion: s?.estado ?? null,
          puntaje_gratis: l?.score ?? null, pais: o0.pais ?? null, edad: o0.edad ?? null, sexo: o0.sexo ?? null, nombre_form: o0.nombre ?? null };
      }).sort((a, b2) => (a.creado < b2.creado ? 1 : -1));
      return json({ ok: true, usuarios: filas });
    }

    if (accion === "usuario") {
      const id = String(b.id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "id" }, 400);
      const { data: ud2 } = await admin.auth.admin.getUserById(id);
      if (!ud2?.user) return json({ error: "No existe" }, 404);
      const u = ud2.user, em = (u.email ?? "").toLowerCase();
      const [ord, rep, sub, fis, chat, leads, ev, afi, fotos] = await Promise.all([
        admin.from("orders").select("*").eq("user_id", id).order("created_at", { ascending: false }).then((r) => r.data ?? []),
        admin.from("reports").select("order_id,data").eq("user_id", id).then((r) => r.data ?? []),
        admin.from("suscripciones").select("*").eq("user_id", id).maybeSingle().then((r) => r.data),
        admin.from("fisico").select("*").eq("user_id", id).order("created_at", { ascending: false }).then((r) => r.data ?? []),
        admin.from("chat").select("rol,texto,creado,order_id").eq("user_id", id).order("creado").limit(300).then((r) => r.data ?? []),
        em ? admin.from("leads").select("*").eq("email", em).order("created_at").then((r) => r.data ?? []) : Promise.resolve([]),
        admin.from("eventos").select("ts,nombre,path,ref,vid,utm_source,utm_medium,utm_campaign,dispositivo,tz,valor,datos").eq("user_id", id).order("ts", { ascending: false }).limit(300).then((r) => r.data ?? []),
        admin.from("afiliados").select("*").eq("user_id", id).maybeSingle().then((r) => r.data),
        listarFotos(id),
      ]);
      // the same visitor before they logged in (same device id)
      const vids = [...new Set(ev.map((e: Obj) => e.vid).filter(Boolean))].slice(0, 5);
      const antes = vids.length ? (await admin.from("eventos").select("ts,nombre,path,ref,utm_source,utm_medium,utm_campaign,dispositivo,tz").in("vid", vids).is("user_id", null).order("ts", { ascending: false }).limit(200)).data ?? [] : [];
      const reportes = rep.map((r: Obj) => {
        const d = r.data ?? {};
        return { order_id: r.order_id, estado: d.estado ?? (d.resumen ? "listo" : null), generado: d.generado ?? null, puntajes: d.puntajes ?? null, resumen: d.resumen ?? null,
          arquetipo: d.arquetipo ?? null, fortalezas: d.fortalezas ?? null, prioridades: d.prioridades ?? null, grupos: (d.grupos ?? []).map((g: Obj) => ({ titulo: g.titulo, puntaje: g.puntaje })),
          longevidad: d.longevidad ?? null, potencial: d.potencial ?? null, motivo: d.motivo ?? null, segundos: d.segundos ?? null, modelo: d.modelo ?? null };
      });
      const pedidos = ord.map((o: Obj) => ({ ...o, medidas: o.medidas ? { n: (o.medidas.medidas?.length ?? 0) + (o.medidas.perfil?.medidas?.length ?? 0), resumen: o.medidas.resumen ?? null, avisos: o.medidas.avisos ?? null, ajustado: o.medidas.ajustado ?? null } : null }));
      return json({ ok: true, usuario: { ...resumenUsuario(u), confirmado: u.email_confirmed_at, telefono: u.phone || null, metadata: u.user_metadata },
        pedidos, reportes, suscripcion: sub, fisico: fis, chat, leads, eventos: [...ev, ...antes].sort((a: Obj, b2: Obj) => (a.ts < b2.ts ? 1 : -1)), afiliado: afi, fotos });
    }

    if (accion === "leads") {
      const { data } = await admin.from("leads").select("*").order("created_at", { ascending: false }).limit(2000);
      return json({ ok: true, leads: data ?? [] });
    }

    if (accion === "pedidos") {
      const [{ data: ord }, usuarios] = await Promise.all([
        admin.from("orders").select("id,user_id,status,tier,amount_mxn,paid_at,delivered_at,created_at,origen,afiliado_id,stripe_session_id,answers->>nombre").order("created_at", { ascending: false }).limit(2000),
        todosLosUsuarios(),
      ]);
      const correo = new Map(usuarios.map((u) => [u.id, u.email]));
      return json({ ok: true, pedidos: (ord ?? []).map((o: Obj) => ({ ...o, email: correo.get(o.user_id) ?? null })) });
    }

    if (accion === "afiliados") {
      const [{ data: afi }, { data: com }, usuarios] = await Promise.all([
        admin.from("afiliados").select("*").order("created_at", { ascending: false }),
        admin.from("comisiones").select("*").order("created_at", { ascending: false }),
        todosLosUsuarios(),
      ]);
      const correo = new Map(usuarios.map((u) => [u.id, u.email]));
      return json({ ok: true, afiliados: (afi ?? []).map((a: Obj) => ({ ...a, pago_datos: undefined, email: correo.get(a.user_id) ?? null,
        ventas: (com ?? []).filter((c: Obj) => c.afiliado_id === a.id && c.concepto === "venta").length,
        ganado_mxn: (com ?? []).filter((c: Obj) => c.afiliado_id === a.id).reduce((s: number, c: Obj) => s + (c.comision_mxn ?? 0), 0),
        pendiente_mxn: (com ?? []).filter((c: Obj) => c.afiliado_id === a.id && c.estado !== "pagada").reduce((s: number, c: Obj) => s + (c.comision_mxn ?? 0), 0) })) });
    }

    if (accion === "eventos") {
      const q = admin.from("eventos").select("*").order("id", { ascending: false }).limit(Math.min(1000, Number(b.limite) || 300));
      const { data } = b.nombre ? await q.eq("nombre", String(b.nombre).slice(0, 40)) : await q;
      return json({ ok: true, eventos: (data ?? []).map((e: Obj) => ({ ...e, pais: paisDe(e.tz) })) });
    }

    return json({ error: "accion" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Error del servidor" }, 500);
  }
});
