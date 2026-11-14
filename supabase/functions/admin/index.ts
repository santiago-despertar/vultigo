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
          { paso: "Vieron su resultado", n: unicos("calificacion_resultado") },
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

    if (accion === "enlaces") {
      // Per tagged link (source + medium + campaign): who arrived through it and what they did afterwards.
      // A visitor is credited to the first tagged link they used in the period (first touch, same device).
      const dias = Math.min(365, Math.max(1, Number(b.dias) || 30));
      const desde = new Date(hoy0().getTime() - (dias - 1) * DIA);
      const [ev, ord] = await Promise.all([
        eventosDesde(desde, "ts,nombre,vid,sid,user_id,utm_source,utm_medium,utm_campaign,utm_content,datos"),
        admin.from("orders").select("id,amount_mxn,status,tier").then((r) => r.data ?? []),
      ]);
      const monto = new Map(ord.map((o: Obj) => [o.id, o]));
      const llave = (e: Obj) => [e.utm_source || "", e.utm_medium || "", e.utm_campaign || "", e.utm_content || ""].join("|");
      const origen = new Map<string, string>();
      for (const e of ev) if (e.vid && e.utm_source && !origen.has(e.vid)) origen.set(e.vid, llave(e));
      const filas: Record<string, Obj> = {};
      const fila = (k: string) => filas[k] ??= { clics: 0, visitantes: new Set(), calificaciones: new Set(), leads: new Set(), registros: new Set(), pagos: new Set(), compras: 0, ingresos_mxn: 0, completo: 0 };
      for (const e of ev) {
        if (e.nombre === "page_view" && e.utm_source) fila(llave(e)).clics++;
        const k = e.vid ? origen.get(e.vid) : undefined;
        if (!k) continue;
        const f = fila(k);
        if (e.nombre === "page_view") f.visitantes.add(e.vid);
        else if (e.nombre === "calificacion_resultado") f.calificaciones.add(e.vid);
        else if (e.nombre === "generate_lead") f.leads.add(e.vid);
        else if (e.nombre === "sign_up") f.registros.add(e.vid);
        else if (e.nombre === "begin_checkout") f.pagos.add(e.vid);
        else if (e.nombre === "purchase") {
          f.compras++;
          const o = monto.get(e.datos?.transaction_id);
          if (o) { f.ingresos_mxn += o.amount_mxn ?? 0; if (o.tier === "hard") f.completo++; }
        }
      }
      const out = Object.entries(filas).map(([k, f]) => {
        const [fuente, medio, campana, contenido] = k.split("|");
        return { fuente, medio, campana, contenido, clics: f.clics, visitantes: f.visitantes.size, calificaciones: f.calificaciones.size, leads: f.leads.size,
          registros: f.registros.size, pagos: f.pagos.size, compras: f.compras, completo: f.completo, ingresos_mxn: f.ingresos_mxn };
      }).sort((a, b2) => b2.ingresos_mxn - a.ingresos_mxn || b2.visitantes - a.visitantes);
      return json({ ok: true, dias, enlaces: out });
    }

    if (accion === "secuencias") {
      const [{ data: correos }, { data: ins }, { data: env }, ev] = await Promise.all([
        admin.from("secuencia_correos").select("*").order("secuencia").order("paso"),
        admin.from("secuencia_inscritos").select("secuencia,salio_at,motivo,desde"),
        admin.from("secuencia_envios").select("secuencia,paso,ok"),
        eventosDesde(new Date(Date.now() - 90 * DIA), "nombre,vid,utm_medium,utm_campaign"),
      ]);
      const clics: Record<string, Set<string>> = {}, compras: Record<string, Set<string>> = {};
      const viaCorreo = new Map<string, string>();
      for (const e of ev) if (e.utm_medium === "abandono" && e.utm_campaign && e.nombre === "page_view") { (clics[e.utm_campaign] ??= new Set()).add(e.vid); viaCorreo.set(e.vid, e.utm_campaign); }
      for (const e of ev) if (e.nombre === "purchase" && viaCorreo.has(e.vid)) (compras[viaCorreo.get(e.vid)!] ??= new Set()).add(e.vid);
      const stats: Obj = {};
      for (const i of ins ?? []) { const x = (stats[i.secuencia] ??= { inscritos: 0, activos: 0, compraron: 0, bajas: 0, terminaron: 0 }); x.inscritos++; if (!i.salio_at) x.activos++; else if (i.motivo === "compra") x.compraron++; else if (i.motivo === "baja") x.bajas++; else if (i.motivo === "terminó") x.terminaron++; }
      return json({ ok: true, stats, correos: (correos ?? []).map((c: Obj) => ({ ...c,
        enviados: (env ?? []).filter((e: Obj) => e.secuencia === c.secuencia && e.paso === c.paso && e.ok).length,
        fallidos: (env ?? []).filter((e: Obj) => e.secuencia === c.secuencia && e.paso === c.paso && !e.ok).length,
        clics: clics[`${c.secuencia}-${c.paso}`]?.size ?? 0, compras: compras[`${c.secuencia}-${c.paso}`]?.size ?? 0 })) });
    }

    if (accion === "guardar_correo") {
      const id = Number(b.id);
      const asunto = String(b.asunto ?? "").trim().slice(0, 200), cuerpo = String(b.cuerpo ?? "").slice(0, 8000);
      const dias = Math.max(0, Math.min(90, Number(b.dias)));
      if (!id || !asunto || cuerpo.trim().length < 20 || !Number.isFinite(dias)) return json({ error: "Revisa el asunto, el texto y los días" }, 400);
      const abiertos = (cuerpo.match(/\[\[(\w+)\]\]/g) ?? []).length, cerrados = (cuerpo.match(/\[\[\/(\w+)\]\]/g) ?? []).length;
      if (abiertos !== cerrados) return json({ error: "Hay un bloque [[...]] sin cerrar" }, 400);
      const { error } = await admin.from("secuencia_correos").update({ asunto, cuerpo, dias, activo: b.activo !== false, actualizado: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (accion === "insights") {
      const dias = Math.min(365, Math.max(1, Number(b.dias) || 30));
      const desde = new Date(hoy0().getTime() - (dias - 1) * DIA);
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      const stripe = async (path: string) => {
        if (!stripeKey) return null;
        const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${stripeKey}` } });
        return r.ok ? r.json() : null;
      };
      const [ord, rep, usuarios, leads, ev, envFall, subsSt, disputas, facturas] = await Promise.all([
        admin.from("orders").select("id,user_id,status,tier,amount_mxn,paid_at,delivered_at,created_at,answers").then((r) => r.data ?? []),
        admin.from("reports").select("order_id,data->uso,data->>estado,data->>desde,data->>generado,data->>motivo").then((r) => r.data ?? []),
        todosLosUsuarios(),
        admin.from("leads").select("email,created_at,enviado_at,source").then((r) => r.data ?? []),
        eventosDesde(desde, "ts,nombre,vid,user_id,datos"),
        admin.from("secuencia_envios").select("email,secuencia,paso,enviado_at").eq("ok", false).gte("enviado_at", new Date(Date.now() - 3 * DIA).toISOString()).then((r) => r.data ?? []),
        stripe("subscriptions?status=all&limit=100&expand[]=data.items.data.price"),
        stripe("disputes?limit=20"),
        stripe(`invoices?status=open&limit=50&created[gte]=${Math.floor((Date.now() - 30 * DIA) / 1000)}`),
      ]);
      const pagada = (o: Obj) => o.status === "pagado" || o.status === "listo";

      // 1) onboarding drop-off, question by question
      const ORDEN = ["nombre", "edad", "sexo", "pais", "estatura", "peso", "objetivo", "piel", "rutina", "lentes", "procedimientos", "presupuesto_procedimientos", "presupuesto", "tiempo", "notas", "mayor"];
      const ETQ: Obj = { nombre: "Nombre", edad: "Edad", sexo: "Sexo", pais: "País", estatura: "Estatura", peso: "Peso", objetivo: "Qué quiere mejorar", piel: "Tipo de piel", rutina: "Rutina", lentes: "Lentes", procedimientos: "Procedimientos", presupuesto_procedimientos: "Presupuesto para procedimientos", presupuesto: "Presupuesto", tiempo: "Tiempo al día", notas: "Notas", mayor: "Confirma que es mayor de edad" };
      const unicos = (pred: (e: Obj) => boolean) => new Set(ev.filter(pred).map((e) => e.vid)).size;
      const onboarding = [
        ...ORDEN.map((k) => ({ paso: ETQ[k], n: unicos((e) => e.nombre === "onboarding_pregunta" && e.datos?.paso === k) })).filter((x, i) => x.n > 0 || i < 7),
        { paso: "Subir fotos", n: unicos((e) => e.nombre === "onboarding_paso" && e.datos?.paso === "fotos") },
        { paso: "Midiendo su cara", n: unicos((e) => e.nombre === "onboarding_paso" && e.datos?.paso === "midiendo") },
        { paso: "Vio la oferta", n: unicos((e) => e.nombre === "onboarding_paso" && e.datos?.paso === "oferta") },
        { paso: "Inició el pago", n: unicos((e) => e.nombre === "begin_checkout") },
        { paso: "Compró", n: unicos((e) => e.nombre === "purchase") },
      ];

      // 2) answers and how each one converts (everyone who answered, any date)
      const conResp = ord.filter((o: Obj) => o.answers && Object.keys(o.answers).length > 2);
      const porUsuario = new Map<string, Obj>();
      for (const o of conResp) { const p = porUsuario.get(o.user_id); if (!p || pagada(o) || (!pagada(p) && o.created_at > p.created_at)) porUsuario.set(o.user_id, o); }
      const personas = [...porUsuario.values()];
      const compraUser = new Set(ord.filter(pagada).map((o: Obj) => o.user_id));
      const tramoEdad = (e: unknown) => { const n = Number(e); return !n ? null : n < 25 ? "18 a 24" : n < 35 ? "25 a 34" : n < 45 ? "35 a 44" : n < 55 ? "45 a 54" : "55 o más"; };
      const dim = (titulo: string, val: (a: Obj) => string[] | string | null) => {
        const m: Record<string, { n: number; compras: number }> = {};
        for (const o of personas) {
          let v = val(o.answers ?? {}); if (v == null || v === "") continue;
          for (const x of (Array.isArray(v) ? v : [v])) { const r = (m[x] ??= { n: 0, compras: 0 }); r.n++; if (compraUser.has(o.user_id)) r.compras++; }
        }
        return { titulo, filas: Object.entries(m).map(([valor, r]) => ({ valor, ...r })).sort((a, c) => c.n - a.n) };
      };
      const respuestas = [
        dim("Qué quiere mejorar", (a) => String(a.objetivo ?? "").split(", ").filter(Boolean)),
        dim("Sexo", (a) => a.sexo), dim("Edad", (a) => tramoEdad(a.edad)), dim("País", (a) => a.pais),
        dim("Procedimientos", (a) => a.procedimientos), dim("Presupuesto", (a) => a.presupuesto),
        dim("Tiempo al día", (a) => a.tiempo), dim("Tipo de piel", (a) => a.piel), dim("Rutina actual", (a) => a.rutina),
      ];

      // 3) margin per paid order: price minus AI cost (Opus 5.5 rates) minus estimated Stripe fee
      const USD_MXN = Number(Deno.env.get("USD_MXN") ?? "18");
      const costoIA = (uso: unknown) => {
        let usd = 0;
        for (const u of (Array.isArray(uso) ? uso : []) as Obj[]) {
          if (!u) continue;
          usd += ((u.input_tokens ?? 0) * 4 + (u.output_tokens ?? 0) * 20 + (u.cache_creation_input_tokens ?? 0) * 5 + (u.cache_read_input_tokens ?? 0) * 0.4) / 1e6;
        }
        return usd * USD_MXN;
      };
      const repPor = new Map(rep.map((r: Obj) => [r.order_id, r]));
      const pagadas = ord.filter(pagada);
      const filasMargen = pagadas.map((o: Obj) => {
        const ingreso = o.amount_mxn ?? 0, ia = costoIA(repPor.get(o.id)?.uso), comision = ingreso ? (ingreso * 0.036 + 3) * 1.16 : 0;
        return { id: o.id, tier: o.tier, ingreso, ia: Math.round(ia * 100) / 100, comision: Math.round(comision * 100) / 100, margen: Math.round((ingreso - ia - comision) * 100) / 100 };
      });
      const sum = (xs: Obj[], k: string) => xs.reduce((t, x) => t + (x[k] ?? 0), 0);
      const porPlan = (t: string) => { const xs = filasMargen.filter((x) => x.tier === t); return { pedidos: xs.length, ingreso: sum(xs, "ingreso"), ia: sum(xs, "ia"), comision: sum(xs, "comision"), margen: sum(xs, "margen") }; };
      const margen = { tipo_cambio: USD_MXN, total: { pedidos: filasMargen.length, ingreso: sum(filasMargen, "ingreso"), ia: sum(filasMargen, "ia"), comision: sum(filasMargen, "comision"), margen: sum(filasMargen, "margen") }, esencial: porPlan("soft"), completo: porPlan("hard"), pedidos: filasMargen.slice(0, 50) };

      // 4) time to purchase
      const usuarioPor = new Map(usuarios.map((u) => [u.id, u]));
      const mediana = (xs: number[]) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
      const horas = (a: string, b2: string) => (new Date(b2).getTime() - new Date(a).getTime()) / 3600e3;
      const deCuenta: number[] = [], deLead: number[] = [], deOnb: number[] = [];
      for (const o of pagadas) {
        if (!o.paid_at) continue;
        const u = usuarioPor.get(o.user_id);
        if (u?.created_at) deCuenta.push(horas(u.created_at, o.paid_at));
        deOnb.push(horas(o.created_at, o.paid_at));
        const em = (u?.email ?? "").toLowerCase(), l = leads.filter((x: Obj) => x.email === em && x.created_at < o.paid_at).sort((a: Obj, c: Obj) => a.created_at < c.created_at ? -1 : 1)[0];
        if (l) deLead.push(horas(l.created_at, o.paid_at));
      }
      const tiempos = { compras: pagadas.length, desde_cuenta_h: mediana(deCuenta), desde_onboarding_h: mediana(deOnb), desde_lead_h: mediana(deLead), con_lead: deLead.length,
        mismo_dia: deCuenta.filter((h) => h < 24).length, semana: deCuenta.filter((h) => h >= 24 && h < 168).length, mas: deCuenta.filter((h) => h >= 168).length };

      // 6) subscriptions straight from Stripe (real amounts in each currency)
      const SUB_MXN: Obj = { mxn: 1, usd: 349 / 19, eur: 349 / 16, cop: 349 / 59000, clp: 349 / 18990, pen: 349 / 65 };
      let suscripciones: Obj | null = null;
      if (subsSt?.data) {
        const subs = subsSt.data as Obj[];
        const activas = subs.filter((x) => x.status === "active" || x.status === "trialing" || x.status === "past_due");
        const mrrMon: Obj = {};
        for (const x of activas) for (const it of x.items?.data ?? []) {
          const pr = it.price ?? {}, cur = String(pr.currency ?? "mxn");
          const meses = pr.recurring?.interval === "year" ? 12 : pr.recurring?.interval === "week" ? 0.23 : (pr.recurring?.interval_count ?? 1);
          mrrMon[cur] = (mrrMon[cur] ?? 0) + (pr.unit_amount ?? 0) * (it.quantity ?? 1) / (cur === "clp" ? 1 : 100) / meses;
        }
        const mrr_mxn = Object.entries(mrrMon).reduce((t, [c, v]) => t + (v as number) * (SUB_MXN[c] ?? 1), 0);
        const canceladas = subs.filter((x) => x.canceled_at);
        const vida = canceladas.map((x) => (x.canceled_at - x.start_date) / 86400);
        const porMes: Obj = {};
        for (const x of subs) { const m = new Date(x.start_date * 1000).toISOString().slice(0, 7); (porMes[m] ??= { altas: 0, bajas: 0 }).altas++; }
        for (const x of canceladas) { const m = new Date(x.canceled_at * 1000).toISOString().slice(0, 7); (porMes[m] ??= { altas: 0, bajas: 0 }).bajas++; }
        suscripciones = { activas: activas.length, morosas: subs.filter((x) => x.status === "past_due" || x.status === "unpaid").length, cancelan_al_final: activas.filter((x) => x.cancel_at_period_end).length,
          mrr_por_moneda: mrrMon, mrr_mxn: Math.round(mrr_mxn), vida_promedio_dias: vida.length ? Math.round(vida.reduce((a, c) => a + c, 0) / vida.length) : null,
          por_mes: Object.entries(porMes).sort().map(([mes, v]) => ({ mes, ...(v as Obj) })) };
      }

      // 7) alerts: things that need a human
      const ahora = Date.now(), alertas: Obj[] = [];
      for (const r of rep) {
        if (r.estado === "error") alertas.push({ nivel: "alta", tipo: "Reporte con error", detalle: `Pedido ${String(r.order_id).slice(0, 8)}: ${r.motivo ?? "sin detalle"}`, order_id: r.order_id });
        else if (r.estado === "generando" && r.desde && ahora - new Date(r.desde).getTime() > 10 * 60e3) alertas.push({ nivel: "alta", tipo: "Reporte atorado", detalle: `Pedido ${String(r.order_id).slice(0, 8)} lleva más de 10 minutos generándose` , order_id: r.order_id });
      }
      for (const o of ord) if (o.status === "pagado" && o.paid_at && ahora - new Date(o.paid_at).getTime() > 2 * 3600e3 && !repPor.get(o.id)?.generado)
        alertas.push({ nivel: "media", tipo: "Pagó y no tiene reporte", detalle: `Pedido ${String(o.id).slice(0, 8)}, pagado ${new Date(o.paid_at).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}. Puede que no haya subido sus fotos.`, user_id: o.user_id });
      const sinEnviar = leads.filter((l: Obj) => l.source === "calificacion" && !l.enviado_at && ahora - new Date(l.created_at).getTime() > 3600e3 && ahora - new Date(l.created_at).getTime() < 7 * DIA);
      if (sinEnviar.length) alertas.push({ nivel: "media", tipo: "Resultados gratis sin enviar", detalle: `${sinEnviar.length} personas no han recibido su resultado por correo. Revisa Sender.` });
      if (envFall.length) alertas.push({ nivel: "media", tipo: "Correos de secuencia rechazados", detalle: `${envFall.length} en los últimos 3 días. Revisa la cuenta de Sender.` });
      for (const d of (disputas?.data ?? []) as Obj[]) if (!["won", "lost", "warning_closed"].includes(d.status))
        alertas.push({ nivel: "alta", tipo: "Contracargo en Stripe", detalle: `${(d.amount / 100).toFixed(2)} ${String(d.currency).toUpperCase()}, motivo: ${d.reason}. Responde en Stripe antes de la fecha límite.` });
      const fallidas = ((facturas?.data ?? []) as Obj[]).filter((f) => f.attempt_count > 0);
      if (fallidas.length) alertas.push({ nivel: "media", tipo: "Cobros de suscripción fallidos", detalle: `${fallidas.length} facturas abiertas con cobro rechazado en los últimos 30 días.` });
      if (!stripeKey) alertas.push({ nivel: "baja", tipo: "Sin conexión a Stripe", detalle: "No se pudo leer Stripe desde el panel." });

      return json({ ok: true, dias, onboarding, respuestas, personas: personas.length, margen, tiempos, suscripciones, alertas });
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
