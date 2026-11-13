(function () {
  "use strict";
  const C = window.RESALTA || {};
  const configured = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  const sb = configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
  const page = document.body.dataset.page;
  // ---------- homepage: animated panel demos, one at a time, only while on screen ----------
  (function () {
    const fx = document.querySelector(".fx"); if (!fx) return;
    const tabs = [...fx.querySelectorAll(".fx-tab")], sc = [...fx.querySelectorAll(".fx-scene")], desc = fx.querySelector(".fx-desc");
    const DUR = 8000; let i = 0, t = null, visible = false;
    const ir = (n, scroll) => {
      i = (n + tabs.length) % tabs.length;
      tabs.forEach((b, j) => { b.classList.remove("on"); b.setAttribute("aria-selected", j === i ? "true" : "false"); });
      sc.forEach((s, j) => { s.classList.remove("on"); s.setAttribute("aria-hidden", j === i ? "false" : "true"); });
      void fx.offsetWidth; // restart the animations
      tabs[i].classList.add("on"); sc[i].classList.add("on");
      if (desc) desc.textContent = tabs[i].querySelector(".fx-d").textContent;
      if (scroll && innerWidth <= 900) { const box = tabs[i].parentElement; box.scrollTo({ left: tabs[i].offsetLeft - 16, behavior: "smooth" }); }
      clearTimeout(t); if (visible) t = setTimeout(() => ir(i + 1, true), DUR);
    };
    tabs.forEach((b, j) => b.addEventListener("click", () => ir(j, true)));
    ir(0);
    if ("IntersectionObserver" in window) new IntersectionObserver(es => {
      const v = es[0].isIntersecting; if (v === visible) return; visible = v;
      fx.classList.toggle("fx-run", v);
      if (v) ir(i); else clearTimeout(t);
    }, { threshold: 0.35 }).observe(fx.querySelector(".fx-screen"));
    else { visible = true; fx.classList.add("fx-run"); ir(0); }
  })();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---------- shared ----------
  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();
  const qsPlan = new URLSearchParams(location.search).get("plan");
  let plan = qsPlan === "hard" || qsPlan === "soft" ? qsPlan : null;
  try { if (plan) sessionStorage.setItem("plan", plan); else plan = sessionStorage.getItem("plan"); } catch (e) {}
  if (plan !== "hard") plan = "soft";
  const PRICES = C.PRICES || {};
  $$("[data-price]").forEach(e => {
    const k = e.dataset.price === "plan" ? plan : (e.dataset.price || "soft");
    if (PRICES[k]) e.textContent = PRICES[k];
  });
  $$("[data-plan-name]").forEach(e => { if (C.PLAN_NAMES && C.PLAN_NAMES[plan]) e.textContent = C.PLAN_NAMES[plan]; });
  const header = $(".site-header");
  if (header) addEventListener("scroll", () => header.classList.toggle("scrolled", scrollY > 8), { passive: true });

  function msg(el, text, type = "err") {
    if (!el) return;
    el.textContent = text; el.className = "msg show " + type;
  }
  function clearMsg(el) { if (el) el.className = "msg"; }
  function notReady(el) {
    msg(el, "Estamos terminando de preparar esta sección. Vuelve a intentarlo en unos minutos.");
  }
  async function getUser() {
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    return data.user || null;
  }
  async function fnCall(name, body) {
    const { data: s } = await sb.auth.getSession();
    const headers = { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY };
    if (s.session) headers.Authorization = "Bearer " + s.session.access_token;
    const r = await fetch(`${C.SUPABASE_URL}/functions/v1/${name}`, { method: "POST", headers, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Error " + r.status);
    return j;
  }
  // A confirm window for things that can't be undone. With `palabra`, the button only works after typing it.
  function confirmar({ titulo, texto, boton = "Borrar", palabra = "" }) {
    return new Promise(res => {
      const d = document.createElement("div"); d.className = "conf"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true");
      d.innerHTML = `<div class="conf-box"><h3></h3><p class="hint"></p>${palabra ? `<div class="field"><label for="confIn">Escribe <b>${palabra}</b> para confirmar</label><input id="confIn" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>` : ""}<div class="conf-acc"><button type="button" class="btn btn-ghost" data-c="no">Cancelar</button><button type="button" class="btn conf-si" data-c="si"></button></div></div>`;
      d.querySelector("h3").textContent = titulo; d.querySelector("p").textContent = texto; d.querySelector(".conf-si").textContent = boton;
      const si = d.querySelector(".conf-si"), inp = d.querySelector("#confIn");
      const ok = () => !palabra || (inp.value.trim().toUpperCase() === palabra);
      si.disabled = !ok();
      if (inp) inp.addEventListener("input", () => { si.disabled = !ok(); });
      const fin = v => { document.removeEventListener("keydown", tecla); d.remove(); document.body.style.overflow = ""; res(v); };
      const tecla = e => { if (e.key === "Escape") fin(false); if (e.key === "Enter" && ok()) fin(true); };
      d.addEventListener("click", e => { if (e.target === d || e.target.dataset.c === "no") fin(false); if (e.target.dataset.c === "si" && ok()) fin(true); });
      document.addEventListener("keydown", tecla);
      document.body.appendChild(d); document.body.style.overflow = "hidden";
      (inp || si).focus();
    });
  }
  // What an order keeps from the engine: enough for the report and to redraw every measurement later.
  function compactar(r) {
    const p1 = v => Math.round(v * 10) / 10;
    return {
      ancho: r.ancho, alto: r.alto, caja: r.caja, resumen: r.resumen, avisos: r.avisos,
      medidas: r.medidas.map(x => ({ id: x.id, nombre: x.nombre, zona: x.zona, valor: x.valor, unidad: x.unidad, rango: x.rango, estado: x.estado, puntaje: x.puntaje,
        que: x.que, significa: x.significa, lineas: (x.lineas || []).map(l => l.map(p => ({ x: p1(p.x), y: p1(p.y) }))) }))
    };
  }
  function compactarPerfil(r) {
    const p1 = v => Math.round(v * 10) / 10, pt = p => ({ x: p1(p.x), y: p1(p.y) });
    return {
      ancho: r.ancho, alto: r.alto, mira: r.mira, resumen: r.resumen, avisos: r.avisos, zonas: r.zonas,
      caja: { x0: p1(r.caja.x0), y0: p1(r.caja.y0), x1: p1(r.caja.x1), y1: p1(r.caja.y1) },
      medidas: r.medidas.map(x => ({ id: x.id, nombre: x.nombre, zona: x.zona, valor: x.valor, unidad: x.unidad, rango: x.rango, estado: x.estado, puntaje: x.puntaje,
        que: x.que, significa: x.significa, lineas: (x.lineas || []).map(l => l.map(pt)) }))
    };
  }
  // Only allow redirects to pages of this site.
  const safePath = (p, fallback) => (typeof p === "string" && /^\/(?!\/)/.test(p) ? p : fallback);
  // A saved session that no longer works would bounce between pages, so clear it before sending to sign-in.
  // ---------- affiliate links: resalta.co/?ref=code (any page) ----------
  // Last link wins and lasts 60 days. The code goes to checkout, where the server checks it.
  const REF_DIAS = 60;
  function getRef() {
    try { const r = JSON.parse(localStorage.getItem("rs_ref") || "null"); if (r && r.c && Date.now() - r.t < REF_DIAS * 864e5) return r.c; } catch (e) {}
    return null;
  }
  (function () {
    const u = new URL(location.href);
    const raw = u.searchParams.get("ref") || u.searchParams.get("r");
    if (!raw) return;
    const c = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
    u.searchParams.delete("ref"); u.searchParams.delete("r");
    try { history.replaceState(null, "", u.pathname + u.search + u.hash); } catch (e) {}
    if (c.length < 3) return;
    let ya = null; try { ya = JSON.parse(localStorage.getItem("rs_ref") || "null"); localStorage.setItem("rs_ref", JSON.stringify({ c, t: Date.now() })); } catch (e) {}
    if (ya && ya.c === c && Date.now() - ya.t < 864e5) return; // one visit per person per day
    if (C.SUPABASE_URL && C.SUPABASE_ANON_KEY) fetch(`${C.SUPABASE_URL}/functions/v1/afiliados`, { method: "POST", headers: { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY }, body: JSON.stringify({ accion: "clic", codigo: c }), keepalive: true }).catch(() => {});
  })();

  async function toLogin(url) { try { await sb.auth.signOut({ scope: "local" }); } catch (e) {} location.replace(url); }
  // Load the next page in the background as soon as someone points at or touches a link.
  const warmed = new Set();
  function warmLink(a) {
    const h = a.getAttribute("href");
    if (!h || h[0] !== "/" || warmed.has(h) || a.target === "_blank") return;
    warmed.add(h);
    const l = document.createElement("link"); l.rel = "prefetch"; l.href = h; document.head.appendChild(l);
  }
  ["pointerenter", "touchstart", "focusin"].forEach(ev => document.addEventListener(ev, e => {
    const a = e.target && e.target.closest && e.target.closest("a[href]"); if (a) warmLink(a);
  }, { capture: true, passive: true }));

  // analytics events (Google Analytics; the Meta pixel can hook here too)
  // Meta pixel names for our events; purchase carries the order id so Meta never counts it twice.
  const META = { sign_up: "CompleteRegistration", begin_checkout: "InitiateCheckout", purchase: "Purchase", generate_lead: "Lead" };
  const track = (nombre, datos) => {
    datos = datos || {};
    try { if (window.gtag) window.gtag("event", nombre, datos); } catch (e) {}
    try {
      if (window.fbq && META[nombre]) {
        const p = {}; if (datos.value) { p.value = datos.value; p.currency = datos.currency || "MXN"; }
        if (datos.items && datos.items[0]) { p.content_ids = [datos.items[0].item_id]; p.content_name = datos.items[0].item_name; p.content_type = "product"; }
        window.fbq("track", META[nombre], p, datos.transaction_id ? { eventID: "compra-" + datos.transaction_id } : undefined);
      }
    } catch (e) {}
  };
  const precio = tier => Number(String((C.PRICES || {})[tier] || "").replace(/[^0-9.]/g, "")) || undefined;
  const errES = (e) => {
    const m = (e && e.message) || "";
    if (/Invalid login/i.test(m)) return "Correo o contraseña incorrectos.";
    if (/already registered|already exists/i.test(m)) return "Ya existe una cuenta con ese correo.";
    if (/Email not confirmed/i.test(m)) return "Confirma tu correo: te mandamos un enlace al registrarte.";
    if (/different from the old|same_password/i.test(m) || (e && e.code === "same_password")) return "Usa una contraseña distinta a la anterior.";
    if (/Auth session missing|session.*expired|invalid.*token/i.test(m)) return "Este enlace ya caducó. Pide uno nuevo desde Entrar.";
    if (/Password/i.test(m)) return "La contraseña debe tener al menos 8 caracteres.";
    if (/rate limit|too many/i.test(m)) return "Demasiados intentos. Espera un minuto e inténtalo de nuevo.";
    if (/Manual linking|linking is disabled/i.test(m)) return "No pudimos conectar Google. Crea una contraseña.";
    if (/identity.*already|already linked/i.test(m)) return "Esa cuenta de Google ya está ligada a otra cuenta.";
    return "Algo salió mal. Inténtalo de nuevo.";
  };


  // ---------- v3 home interactions ----------
  // before/projection sliders
  $$("[data-ba]").forEach(fig => {
    const imgs = $$("img", fig);
    let missing = 0;
    const gone = (im) => { im.remove(); if (++missing === imgs.length) fig.classList.add("empty"); };
    imgs.forEach(im => { if (im.complete && !im.naturalWidth) gone(im); else im.addEventListener("error", () => gone(im)); });
    const set = (cx) => { const r = fig.getBoundingClientRect(); fig.style.setProperty("--x", Math.min(100, Math.max(0, (cx - r.left) / r.width * 100)) + "%"); };
    let drag = false;
    fig.addEventListener("pointerdown", e => { drag = true; fig.setPointerCapture(e.pointerId); set(e.clientX); });
    fig.addEventListener("pointermove", e => { if (drag) set(e.clientX); });
    fig.addEventListener("pointerup", () => (drag = false));
  });
  // pill tabs
  $$("[data-tabs]").forEach(g => {
    const name = g.dataset.tabs;
    $$("button", g).forEach(b => b.addEventListener("click", () => {
      $$("button", g).forEach(x => x.classList.toggle("on", x === b));
      $$(`[data-pane-of="${name}"]`).forEach(p => (p.hidden = p.dataset.p !== b.dataset.t));
    }));
  });
  // dashboard dot grid
  const dots = $("#dots");
  if (dots) for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    const d = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const hot = Math.hypot(r - 3, c - 6) < 2.2;
    d.setAttribute("x", 30 + c * 14); d.setAttribute("y", 28 + r * 14); d.setAttribute("width", 9); d.setAttribute("height", 9); d.setAttribute("rx", 1.5);
    if (hot) d.setAttribute("fill-opacity", ".7");
    dots.appendChild(d);
  }
  // hero video: load only if the file exists
  // hero: chain morph clips with two videos so the switch has no flash
  const hm = $(".hero-media");
  if (hm && hm.dataset.clips) {
    const clips = hm.dataset.clips.split(",").map(x => x.trim()).filter(Boolean);
    const stillList = (hm.dataset.stills || "").split(",").map(x => x.trim()).filter(Boolean);
    const [va, vb] = $$("video", hm);
    let i = 0, cur = va, nxt = vb, dead = false, started = false, watch = 0;

    // Photo sequence: used when the browser will not autoplay video
    // (iOS Low Power Mode, data saver, reduced motion, blocked or slow video).
    const stills = () => {
      if (dead) return;
      dead = true; clearInterval(watch);
      va.remove(); vb.remove();
      if (stillList.length < 2) return;
      const per = +(hm.dataset.stillGroup || stillList.length);
      const mk = () => { const im = new Image(); im.className = "hero-still"; im.alt = ""; im.decoding = "async"; hm.appendChild(im); return im; };
      let top = mk(), bot = mk(), k = 1;
      const step = () => {
        const src = stillList[k % stillList.length];
        const pre = new Image();
        pre.onload = () => {
          bot.src = src;
          const go = () => {
            bot.classList.add("top", "front"); top.classList.remove("top");
            const old = top; top = bot; bot = old;
            setTimeout(() => old.classList.remove("front"), 1000);
            k++;
            setTimeout(step, k % per === 0 ? 2800 : 1500);
          };
          (bot.decode ? bot.decode().catch(() => {}) : Promise.resolve()).then(go);
        };
        pre.onerror = () => setTimeout(step, 3000);
        pre.src = src;
      };
      setTimeout(step, 1100);
    };

    const conn = navigator.connection || {};
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || conn.saveData) {
      stills();
    } else {
      [va, vb].forEach(v => {
        v.muted = true; v.defaultMuted = true; v.playsInline = true;
        v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
      });
      const load = (v, k) => { v.src = clips[k % clips.length]; v.load(); };
      const hold = +(hm.dataset.hold || 0), group = +(hm.dataset.group || 0);
      const onEnd = () => {
        if (dead) return;
        if (clips.length === 1) { cur.currentTime = 0; cur.play().catch(stills); return; }
        if (hold && group && i % group === group - 1 && !onEnd.held) { onEnd.held = true; setTimeout(onEnd, hold); return; }
        onEnd.held = false;
        try { nxt.currentTime = 0; } catch (e) {}
        nxt.classList.add("front"); cur.classList.remove("front");
        nxt.play().catch(stills);
        i++; const old = cur; cur = nxt; nxt = old;
        setTimeout(() => { if (!dead) load(nxt, i + 1); }, 1400);
      };
      [va, vb].forEach(v => { v.addEventListener("ended", onEnd); v.addEventListener("error", stills); });
      cur.addEventListener("playing", () => {
        started = true; cur.classList.add("front");
        if (clips.length > 1) load(nxt, 1);   // second clip only once the first is running
      }, { once: true });
      load(cur, 0);
      const p = cur.play();
      if (p && p.catch) p.catch(stills);
      setTimeout(() => { if (!started) stills(); }, 6000);
      // watchdog: a clip that stops advancing means the browser paused it
      let last = -1, stuck = 0;
      watch = setInterval(() => {
        if (dead || document.hidden || onEnd.held || !started) { stuck = 0; return; }
        const t = cur.currentTime;
        if (t === last && !cur.ended) { if (++stuck >= 3) stills(); } else stuck = 0;
        last = t;
      }, 2000);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && !dead && started && cur.paused && !cur.ended) cur.play().catch(stills);
      });
    }
  }

  // header state
  (async () => {
    const u = await getUser();
    document.documentElement.classList.toggle("authed", !!u);
  })();

  // ---------- save access ----------
  // People start without a password. After paying (and in their account until they do it) they are asked to
  // create one or connect Google, so they can come back from any device.
  async function tarjetaAcceso(box) {
    if (!sb || !box) return;
    const u = await getUser(); if (!u) return;
    const md = u.user_metadata || {};
    if (!md.sin_clave) return;
    // came back from connecting Google: done
    if ((u.identities || []).some(i => i.provider === "google")) { sb.auth.updateUser({ data: { sin_clave: false } }).catch(() => {}); return; }
    box.hidden = false;
    box.innerHTML = `<span class="label">Guarda tu acceso</span>
      <h2>Crea tu contraseña</h2>
      <p class="hint">Así entras a tu reporte desde cualquier celular o computadora con <b>${String(u.email || "tu correo").replace(/[<>&"]/g, "")}</b>.</p>
      <form class="acceso-f" novalidate><input type="password" name="clave" autocomplete="new-password" minlength="8" placeholder="Contraseña (mínimo 8 caracteres)" required><button class="btn btn-primary" type="submit">Guardar</button></form>
      <div class="msg"></div>
      <button class="btn btn-google btn-block" type="button"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l8-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-8 6.2C6.6 42.6 14.6 48 24 48z"/></svg> O conecta tu Google</button>`;
    const f = box.querySelector("form"), m = box.querySelector(".msg");
    f.addEventListener("submit", async e => {
      e.preventDefault(); clearMsg(m);
      const clave = f.clave.value;
      if (clave.length < 8) return msg(m, "La contraseña debe tener al menos 8 caracteres.");
      const b = f.querySelector("button"); b.disabled = true; b.textContent = "Guardando…";
      const { error } = await sb.auth.updateUser({ password: clave, data: { sin_clave: false } });
      b.disabled = false; b.textContent = "Guardar";
      if (error) return msg(m, errES(error));
      box.innerHTML = '<p class="msg ok show" style="margin:0">Listo. Ya puedes entrar con tu correo y tu contraseña.</p>';
    });
    box.querySelector(".btn-google").addEventListener("click", async () => {
      clearMsg(m);
      const { error } = await sb.auth.linkIdentity({ provider: "google", options: { redirectTo: location.href } });
      if (error) msg(m, errES(error));
    });
  }

  // ---------- cuenta ----------
  if (page === "cuenta") {
    if (/^\/afiliados/.test(new URLSearchParams(location.search).get("next") || "")) {
      const t = $("#signupForm .onb-title"), sub = $("#signupForm .onb-sub");
      if (t) t.innerHTML = "Crea tu link<br><span>de afiliado</span>";
      if (sub) sub.textContent = "Gana 30% por cada análisis que recomiendes. Primero, ¿cómo te llamas?";
    }
    const params = new URLSearchParams(location.search);
    const next = safePath(params.get("next"), "/panel");
    const tabs = $$(".tabs button");
    function show(t) {
      tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === t));
      $$("[data-pane]").forEach(p => (p.hidden = p.dataset.pane !== t));
      const gb = $("#googleBox"), s1 = document.querySelector('.su-step[data-s="1"]');
      if (gb) gb.hidden = t === "nueva" || (t === "signup" && !!s1 && !s1.classList.contains("on"));
    }
    tabs.forEach(b => b.addEventListener("click", () => show(b.dataset.tab)));
    $$("[data-go]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); show(a.dataset.go); }));
    if (params.get("modo") === "entrar") show("login");

    // Password reset: the email link lands here with a recovery session, and they pick the new password.
    const esRecuperacion = params.get("modo") === "nueva" || /type=recovery/.test(location.hash);
    if (esRecuperacion) show("nueva");
    if (sb && sb.auth.onAuthStateChange) sb.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") show("nueva"); });
    const npF = $("#newPassForm");
    if (npF) {
      $("#np-ver").addEventListener("change", e => { npF.password.type = npF.password2.type = e.target.checked ? "text" : "password"; });
      npF.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const m = $("#newPassMsg"), b = npF.querySelector('button[type="submit"]'); clearMsg(m);
        const p1 = npF.password.value, p2 = npF.password2.value;
        if (p1.length < 8) return msg(m, "Usa al menos 8 caracteres.");
        if (p1 !== p2) return msg(m, "Las dos contraseñas no son iguales.");
        if (!sb) return notReady(m);
        b.disabled = true; b.textContent = "Guardando…";
        // the link's session can take a moment to be read from the address
        let sesion = null;
        for (let i = 0; i < 10 && !sesion; i++) { sesion = (await sb.auth.getSession()).data.session; if (!sesion) await new Promise(r => setTimeout(r, 300)); }
        if (!sesion) {
          b.disabled = false; b.textContent = "Guardar mi contraseña";
          return msg(m, "Este enlace ya caducó o ya se usó. Pide uno nuevo desde Entrar, en ¿Olvidaste tu contraseña?");
        }
        const { error } = await sb.auth.updateUser({ password: p1, data: { sin_clave: false } });
        if (error) { b.disabled = false; b.textContent = "Guardar mi contraseña"; return msg(m, errES(error)); }
        msg(m, "Listo, tu contraseña quedó guardada. Te llevamos a tu cuenta…", "ok");
        setTimeout(() => { location.href = next; }, 1200);
      });
    }

    $$("[data-google]").forEach(btn => btn.addEventListener("click", async () => {
      const m = $("#googleMsg"); clearMsg(m);
      if (!sb) return notReady(m);
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + next, queryParams: { prompt: "select_account" } }
      });
      if (error) msg(m, errES(error));
    }));

    // Sign-up asks only for the name and the email. The account starts without a password (an anonymous
    // session that takes the email right away), so everything they do is saved; the password comes after paying.
    let suPaso = 1;
    const suF = $("#signupForm");
    function suIr(n) {
      suPaso = n;
      $$(".su-step", suF).forEach(st => st.classList.toggle("on", +st.dataset.s === n));
      $$("[data-su-name]").forEach(e => { e.textContent = suF.nombre.value.trim().split(/\s+/)[0] || ""; });
      suF.querySelector('[data-su="atras"]').hidden = n === 1;
      suF.querySelector('[data-su="sig"]').textContent = n === 2 ? (next.startsWith("/afiliados") ? "Crear mi link" : "Empezar mi análisis") : "Continuar";
      const gb = $("#googleBox"); if (gb) gb.hidden = n !== 1;
      clearMsg($("#signupMsg"));
      const inp = suF.querySelector(`.su-step[data-s="${n}"] input`);
      if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 60);
    }
    suF.querySelector('[data-su="atras"]').addEventListener("click", () => suIr(suPaso - 1));
    // coming from the free rating: name and email are already known
    try {
      const ld = JSON.parse(sessionStorage.getItem("resalta_lead") || "null");
      if (ld && ld.nombre && ld.email) { suF.nombre.value = ld.nombre; suF.email.value = ld.email; suIr(2); }
    } catch (e) {}
    // a lead is kept as soon as we have the email, even if they stop right after
    function guardarLead(email, nombre) {
      if (!sb) return;
      try { sb.from("leads").insert({ email, nombre, source: next.startsWith("/afiliados") ? "afiliado" : "registro" }).then(() => {}, () => {}); } catch (e) {}
    }
    suF.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, m = $("#signupMsg"); clearMsg(m);
      if (suPaso === 1) { if (!f.nombre.value.trim()) return msg(m, "Escribe tu nombre."); return suIr(2); }
      const email = f.email.value.trim().toLowerCase(), nombre = f.nombre.value.trim().slice(0, 60);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg(m, "Escribe un correo válido.");
      if (!sb) return notReady(m);
      guardarLead(email, nombre);
      const b = f.querySelector('[data-su="sig"]'); b.disabled = true; b.textContent = "Un momento…";
      const listo = () => { b.disabled = false; b.textContent = next.startsWith("/afiliados") ? "Crear mi link" : "Empezar mi análisis"; };
      try {
        const { error } = await sb.auth.signInAnonymously({ options: { data: { full_name: nombre, sin_clave: true } } });
        if (error) throw error;
        const { error: e2 } = await sb.auth.updateUser({ email });
        if (e2) {
          // the email already has an account: drop the temporary session and send them to sign in
          await sb.auth.signOut().catch(() => {});
          listo();
          if (/registered|already|exists/i.test(e2.message || "") || e2.code === "email_exists") {
            show("login"); $("#li-email").value = email;
            return msg($("#loginMsg"), "Ya tienes una cuenta con este correo. Entra con tu contraseña o con Google.", "info");
          }
          throw e2;
        }
        track("sign_up", { method: "correo" });
        location.href = next;
      } catch (e) { listo(); msg(m, errES(e)); }
    });

    $("#loginForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, m = $("#loginMsg"); clearMsg(m);
      if (!sb) return notReady(m);
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) return msg(m, errES(error));
      location.href = next;
    });

    $("#forgot").addEventListener("click", async (ev) => {
      ev.preventDefault();
      const m = $("#loginMsg"), id = $("#li-email").value.trim();
      if (!id.includes("@")) return msg(m, "Escribe tu correo arriba y vuelve a dar clic.");
      if (!sb) return notReady(m);
      await sb.auth.resetPasswordForEmail(id, { redirectTo: location.origin + "/cuenta?modo=nueva" });
      msg(m, "Si el correo existe, te mandamos un enlace para cambiar tu contraseña.", "ok");
    });
  }

  // ---------- analisis ----------
  if (page === "analisis") {
    // Came from an affiliate link: say so and show the discount that checkout will apply.
    if (getRef() && C.SUPABASE_URL) fetch(`${C.SUPABASE_URL}/functions/v1/afiliados`, { method: "POST", headers: { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY }, body: JSON.stringify({ accion: "info", codigo: getRef() }) })
      .then(r => r.json()).then(j => {
        const n = $("#refNota"); if (!n || !j.valido || !(j.descuento > 0)) return;
        n.innerHTML = `<b>${j.descuento}% de descuento</b>${j.nombre ? ` por la invitación de ${j.nombre.replace(/[<>&"]/g, "")}` : " por invitación"}. Se aplica al pagar.`;
        n.hidden = false;
      }).catch(() => {});
    // The first three are required; the other three are optional and only add precision.
    const SLOTS = [
      ["frente", "Frente", "Cara relajada, boca cerrada"],
      ["sonrisa", "Sonriendo", "Sonrisa natural, de frente"],
      ["perfil_izq", "Perfil", "90°, de cualquier lado"],
      ["perfil_der", "El otro perfil", "90°, del lado contrario", true],
      ["tres_cuartos_izq", "Tres cuartos", "Gira la cara 45°", true],
      ["tres_cuartos_der", "Tres cuartos, otro lado", "Gira la cara 45°", true]
    ];
    const REQUERIDAS = SLOTS.filter(s => !s[3]).map(s => s[0]);
    let user, order;
    const uploaded = new Set();

    function go(n) {
      $$(".wstep").forEach(s => s.classList.toggle("active", s.dataset.step == n));
      $$(".progress i").forEach((b, i) => b.classList.toggle("on", i < n));
      scrollTo({ top: 0, behavior: "smooth" });
    }
    $$("[data-back]").forEach(b => b.addEventListener("click", () => go(+b.dataset.back)));

    // The profile form is shown one question at a time, like a short quiz.
    const quiz = (() => {
      const f = $("#aboutForm"); if (!f || !f.classList.contains("quiz")) return null;
      const qs = $$(".q", f), bar = f.querySelector(".quiz-bar i"), qm = $("#quizMsg");
      const bAtras = f.querySelector('[data-q="atras"]'), bSig = f.querySelector('[data-q="sig"]'), bFin = f.querySelector('[data-q="fin"]');
      let i = 0;
      // each select becomes a list of tap targets; picking one moves on by itself
      qs.forEach(q => {
        const sel = q.querySelector("select"); if (!sel) return;
        sel.hidden = true;
        const box = document.createElement("div"), opsT = [...sel.options].filter(o => !o.disabled).map(o => o.textContent);
        box.className = "opts" + (sel.options.length > 5 ? " opts-2" : "") + (opsT.length > 5 && opsT.every(t => t.length <= 15) ? " cortas" : "");
        [...sel.options].filter(o => !o.disabled).forEach(o => {
          const b = document.createElement("button"); b.type = "button"; b.className = "opt"; b.textContent = o.textContent; b.dataset.v = o.value || o.textContent;
          b.addEventListener("click", () => {
            if (sel.multiple) { const op = [...sel.options].find(o => (o.value || o.textContent) === b.dataset.v); op.selected = !op.selected; sel.dataset.picked = "1"; pintar(q); clearMsg(qm); return; }
            sel.value = b.dataset.v; sel.dataset.picked = "1"; pintar(q);
            setTimeout(() => { if (qs[i] === q && i < qs.length - 1) mostrar(paso(i, 1)); }, 220);
          });
          box.appendChild(b);
        });
        sel.after(box);
      });
      function pintar(q) {
        const sel = q.querySelector("select"); if (!sel) return;
        const elegidas = [...sel.selectedOptions].map(o => o.value || o.textContent);
        $$(".opt", q).forEach(b => b.classList.toggle("on", !!sel.dataset.picked && elegidas.includes(b.dataset.v)));
      }
      function valido(q) {
        clearMsg(qm);
        const bad = [...q.querySelectorAll("input,select")].find(el => {
          if (el.type === "checkbox") return false;
          if (el.multiple) return el.required && !el.selectedOptions.length;
          if (el.required && !String(el.value || "").trim()) return true;
          if (el.type === "number" && el.value && ((el.min && +el.value < +el.min) || (el.max && +el.value > +el.max))) return true;
          return false;
        });
        if (!bad) return true;
        const t = bad.name === "edad" ? (bad.value && +bad.value < 18 ? "Este servicio es solo para mayores de 18 años." : "Escribe tu edad.")
          : bad.name === "nombre" ? "Escribe tu nombre." : bad.multiple ? "Elige por lo menos una." : bad.tagName === "SELECT" ? "Elige una opción." : "Revisa este dato.";
        msg(qm, t); return false;
      }
      // some questions only apply after certain answers (procedure budget only if they are open to procedures)
      const aplica = q => q.dataset.cond !== "proc" || (!!f.procedimientos.value && !/^Solo/.test(f.procedimientos.value));
      const paso = (desde, d) => { let k = desde + d; while (k > 0 && k < qs.length - 1 && !aplica(qs[k])) k += d; return k; };
      function mostrar(n, sinFoco) {
        i = Math.max(0, Math.min(qs.length - 1, n));
        qs.forEach((q, k) => q.classList.toggle("on", k === i));
        pintar(qs[i]); clearMsg(qm);
        const vis = qs.filter(aplica); if (bar) bar.style.width = Math.round((vis.indexOf(qs[i]) + 1) / vis.length * 100) + "%";
        bAtras.style.visibility = i === 0 ? "hidden" : "";
        const ultimo = i === qs.length - 1;
        bSig.hidden = ultimo; bFin.hidden = !ultimo;
        const inp = qs[i].querySelector("input:not([type=checkbox]),textarea");
        if (inp && !sinFoco && matchMedia("(pointer:fine)").matches) setTimeout(() => inp.focus({ preventScroll: true }), 60);
      }
      bSig.addEventListener("click", () => { if (valido(qs[i])) mostrar(paso(i, 1)); });
      bAtras.addEventListener("click", () => mostrar(paso(i, -1)));
      f.addEventListener("keydown", e => {
        if (e.key !== "Enter" || e.target.tagName === "TEXTAREA" || e.target.tagName === "BUTTON") return;
        e.preventDefault(); if (i < qs.length - 1) bSig.click(); else bFin.click();
      });
      mostrar(0, true);
      return {
        // after saved answers are filled in, mark them as chosen and skip what we already know
        refrescar(saltarNombre, guardadas) {
          qs.forEach(q => { const sel = q.querySelector("select"); if (sel && guardadas && guardadas[sel.name]) sel.dataset.picked = "1"; });
          mostrar(saltarNombre && i === 0 && f.nombre.value.trim() ? 1 : i, true);
        },
        alFinal() { mostrar(qs.length - 1); },
        atras() { if (i === 0) return false; mostrar(paso(i, -1)); return true; },
        ir(name) { const k = qs.findIndex(q => q.querySelector(`[name="${name}"]`)); if (k >= 0) mostrar(k); }
      };
    })();

    (async () => {
      if (!sb) return;
      user = await getUser();
      if (!user) { await toLogin("/cuenta?next=/analisis"); return; }
      // resume the latest draft order if there is one
      const { data } = await sb.from("orders").select("*").eq("status", "borrador").order("created_at", { ascending: false }).limit(1);
      if (data && data[0]) {
        order = data[0];
        const a = order.answers || {};
        const f = $("#aboutForm");
        Object.keys(a).forEach(k => {
          if (!f[k] || f[k].type === "checkbox") return;
          if (f[k].multiple) { const v = String(a[k] || "").split(", "); [...f[k].options].forEach(o => { o.selected = v.includes(o.textContent); }); }
          else f[k].value = a[k];
        });
        if (order.escaneo3d) escaneoListo("hecho");
        // a draft they came back to can be thrown away to start over
        const main = document.querySelector("main.onb");
        if (main && !main.querySelector(".onb-reset")) {
          const r = document.createElement("button"); r.type = "button"; r.className = "onb-reset"; r.textContent = "Empezar de cero";
          r.onclick = async () => {
            if (!(await confirmar({ titulo: "¿Empezar de cero?", texto: "Borramos tus respuestas y las fotos que ya subiste en este análisis, y empiezas otra vez desde la primera pregunta.", boton: "Sí, empezar de cero" }))) return;
            r.disabled = true; r.textContent = "Borrando…";
            try { await fnCall("delete-photos", { accion: "pedido", order_id: order.id }); location.reload(); }
            catch (e) { r.disabled = false; r.textContent = "Empezar de cero"; }
          };
          main.appendChild(r);
        }
      }
      const fn = $("#aboutForm").nombre;
      if (fn && !fn.value && user.user_metadata && user.user_metadata.full_name) fn.value = user.user_metadata.full_name;
      if (quiz) quiz.refrescar(false, order && order.answers); // stay on the name step, already filled in, so nothing flashes
    })();

    $("#aboutForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      if (!f.edad.value || +f.edad.value < 18) { if (quiz) quiz.ir("edad"); alertInline(f, "Este servicio es solo para mayores de 18 años."); return; }
      if (!f.mayor.checked) { alertInline(f, "Confirma que tienes 18 años o más para continuar."); return; }
      const nombre = f.nombre.value.trim().slice(0, 60);
      if (!nombre) { if (quiz) quiz.ir("nombre"); alertInline(f, "Escribe tu nombre."); return; }
      if (!f.sexo.value) { if (quiz) quiz.ir("sexo"); alertInline(f, "Elige si eres hombre o mujer."); return; }
      // the account keeps the name too, so the panel and the protocol greet them by it
      if (sb && nombre !== ((user && user.user_metadata) || {}).full_name) sb.auth.updateUser({ data: { full_name: nombre } }).catch(() => {});
      const answers = { nombre, edad: +f.edad.value, sexo: f.sexo.value, pais: f.pais.value, estatura: f.estatura.value || null, peso: f.peso.value || null, objetivo: [...f.objetivo.selectedOptions].map(o => o.textContent).join(", "), piel: f.piel.value, lentes: f.lentes.value, procedimientos: f.procedimientos.value, presupuesto_procedimientos: /^Solo/.test(f.procedimientos.value) ? null : (f.presupuesto_procedimientos.value || null), presupuesto: f.presupuesto.value, tiempo: f.tiempo.value, rutina: f.rutina.value, notas: f.notas.value.trim() };
      if (!sb) { go(2); return; }
      if (order) {
        await sb.from("orders").update({ answers }).eq("id", order.id); order.answers = answers;
      } else {
        const { data, error } = await sb.from("orders").insert({ user_id: user.id, answers, tier: plan }).select().single();
        if (error) { alertInline(f, "No pudimos guardar tus datos. Inténtalo de nuevo."); return; }
        order = data;
      }
      go(2);
    });
    function alertInline(form, text) {
      let m = form.querySelector("#quizMsg") || form.querySelector(".msg"); if (!m) { m = document.createElement("div"); form.insertBefore(m, form.lastElementChild); }
      msg(m, text);
    }

    import("/assets/js/medidas.js?v=20").then(m => m.precargar()).catch(() => {});
    import("/assets/js/perfil.js?v=20").then(m => m.precargarPerfil()).catch(() => {});

    const grid = $("#photoGrid"), gridOpc = $("#photoGridOpc") || grid;
    SLOTS.forEach(([key, title, sub, opcional]) => {
      const el = document.createElement("label");
      el.className = "slot"; el.dataset.key = key;
      el.innerHTML = `<span class="slot-guia" style="background-image:url(https://jxluabbugwdonqchbaxm.supabase.co/storage/v1/object/public/publico/poses/${key}.png)"></span><b>${title}</b><small>${sub}</small><input type="file" accept="image/*" aria-label="${title}">`;
      (opcional ? gridOpc : grid).appendChild(el);
      el.querySelector("input").addEventListener("change", (e) => handleFile(el, key, e.target.files[0]));
    });

    // 3D scan: a slow head turn read on the device; the mesh at each angle is saved next to the photos.
    // the 3D scan was taken out of the purchase flow; the code stays for a later optional extra
    let escaneo = true;
    const e3 = { btn: $("#esc3dBtn"), no: $("#esc3dNo"), txt: $("#esc3dEstado"), card: $("#esc3dCta") };
    function escaneoListo(como) {
      escaneo = como; check();
      if (!e3.card) return;
      e3.card.classList.toggle("hecho", como === "hecho");
      if (como === "hecho") { e3.txt.textContent = "Listo. Tu modelo 3D quedó guardado."; e3.btn.textContent = "Repetir escaneo"; e3.btn.className = "btn btn-ghost"; e3.no.hidden = true; }
      if (como === "sin_camara") { e3.txt.textContent = "Sin problema, seguimos solo con tus fotos."; e3.no.hidden = true; }
    }
    if (e3.card) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) escaneoListo("sin_camara");
      e3.no.addEventListener("click", () => escaneoListo("sin_camara"));
      e3.btn.addEventListener("click", async () => {
        e3.btn.disabled = true;
        try {
          const { escanear3d } = await import("/assets/js/escaneo3d.js?v=5");
          await escanear3d({ alTerminar: async (res) => {
            e3.btn.disabled = false;
            if (!res) return;
            e3.txt.textContent = "Guardando tu modelo 3D…";
            try {
              if (sb && order) {
                const path = `${user.id}/${order.id}/escaneo3d.json`;
                const { error } = await sb.storage.from("fotos").upload(path, new Blob([JSON.stringify(res)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
                if (error) throw error;
                await sb.from("orders").update({ escaneo3d: path }).eq("id", order.id);
              }
              escaneoListo("hecho"); miniMalla(res);
            } catch (e) { e3.txt.textContent = "No pudimos guardar el escaneo. Revisa tu conexión e inténtalo otra vez."; }
          } });
        } catch (e) { e3.btn.disabled = false; e3.txt.textContent = "No pudimos abrir el escaneo en este navegador. Prueba en Chrome o Safari actualizados."; }
      });
    }
    // a small turning copy of the mesh on the card once the scan is done
    async function miniMalla(res) {
      try {
        const { dibujarMalla, aristasMalla } = await import("/assets/js/escaneo3d.js?v=5");
        const f = (res.angulos || []).find(a => a && Math.abs(a.yaw) < 5) || (res.angulos || [])[5]; if (!f) return;
        const W = res.ancho || 1280, H = res.alto || 720;
        let P = f.puntos.map(q => [q[0] * W, q[1] * H, q[2] * W]);
        const c = P.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(v => v / P.length);
        P = P.map(p => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
        const cv = $("#esc3dMini"), ar = aristasMalla(), ctx = cv.getContext("2d");
        const giro = t => { dibujarMalla(ctx, P, ar, Math.sin(t / 1400) * 35, cv.width, cv.height); requestAnimationFrame(giro); };
        requestAnimationFrame(giro);
      } catch (e) {}
    }

    async function resize(file) {
      const img = await createImageBitmap(file);
      const max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return new Promise(r => c.toBlob(r, "image/jpeg", 0.9));
    }
    async function handleFile(el, key, file) {
      const m = $("#photoMsg"); clearMsg(m);
      if (!file) return;
      if (!/^image\//.test(file.type)) return msg(m, "Ese archivo no es una imagen.");
      const blob = await resize(file).catch(() => null);
      if (!blob) return msg(m, "No pudimos leer esa foto. Prueba con otra.");
      let img = el.querySelector("img"); if (!img) { img = document.createElement("img"); el.prepend(img); }
      img.src = URL.createObjectURL(blob); el.classList.remove("done");
      if (sb && order) {
        const path = `${user.id}/${order.id}/${key}.jpg`;
        const { error } = await sb.storage.from("fotos").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
        if (error) return msg(m, "No se pudo subir la foto. Revisa tu conexión e inténtalo de nuevo.");
      }
      el.classList.add("done"); uploaded.add(key); check();
      if (key === "frente") medir(blob, m);
      if (key === "perfil_izq" || key === "perfil_der") medirPerfil(key, blob);
    }

    // Everything measured so far for this order. Saved whole each time so one photo never erases another.
    const M = { frente: null, perfil: {} };
    async function guardarMedidas() {
      if (!M.frente) return;
      const perfil = M.perfil.perfil_izq || M.perfil.perfil_der || null;
      const medidas = perfil ? { ...M.frente, perfil: { ...perfil, foto: M.perfil.perfil_izq ? "perfil_izq" : "perfil_der" } } : M.frente;
      const { error } = await sb.from("orders").update({ medidas }).eq("id", order.id);
      if (error) console.warn(error);
    }
    async function medirPerfil(key, blob) {
      if (!sb || !order) return;
      try {
        const { analizarPerfil } = await import("/assets/js/perfil.js?v=20");
        const r = await analizarPerfil(await createImageBitmap(blob), (order.answers || {}).sexo);
        M.perfil[key] = compactarPerfil(r); await guardarMedidas();
      } catch (e) { delete M.perfil[key]; console.warn("perfil", e && e.message); }
    }

    // The front photo is measured here, in the browser, and the numbers travel with the order.
    let medidasListas = null, crudo = null, fotoFrente = null;
    async function medir(blob, m) {
      fotoFrente = blob;
      if (!sb || !order) return;
      try {
        const { analizar } = await import("/assets/js/medidas.js?v=20");
        const bmp = await createImageBitmap(blob);
        const r = await analizar(bmp, (order.answers || {}).sexo);
        crudo = { bmp, puntos: r.puntos, medidas: r.medidas, caja: r.caja };
        M.frente = compactar(r);
        await guardarMedidas();
        medidasListas = true; check();
      } catch (e) {
        medidasListas = false;
        const slot = document.querySelector('.slot[data-key="frente"]'); if (slot) slot.classList.remove("done");
        uploaded.delete("frente"); check();
        const texto = e && e.message === "varias_caras"
          ? "En la foto de frente aparece más de una cara. Sube una donde salgas solo."
          : "No pudimos leer bien tu cara en la foto de frente. Prueba con otra de frente, con buena luz y sin lentes.";
        if (m) msg(m, texto);
      }
    }
    const consent = $("#consent");
    consent.addEventListener("change", check);
    function check() { $("#toPay").disabled = !(REQUERIDAS.every(k => uploaded.has(k)) && consent.checked && escaneo); }

    // The Stripe page is prepared as soon as the payment step opens, so clicking Pagar goes straight to it.
    const payReady = {};
    function warmPay() {
      if (!sb || !order) return null;
      const p = plan;
      if (!payReady[p]) payReady[p] = fnCall("create-checkout", { order_id: order.id, tier: p, ref: getRef() }).catch(e => { delete payReady[p]; throw e; });
      return payReady[p];
    }

    // Subscribers spend their monthly rescan here instead of paying.
    let mensual = null;
    const subEstado = sb ? fnCall("suscripcion", { accion: "estado" }).catch(() => ({})) : Promise.resolve({});
    async function modoMensual() {
      const st = await subEstado;
      if (!st.activa || !st.disponible) return false;
      mensual = st;
      $$("[data-plan-name]").forEach(e => { e.textContent = "Escaneo del mes"; });
      $$('[data-price="plan"]').forEach(e => { e.textContent = "Incluido"; });
      const pp = $("#planPick"); if (pp) { pp.hidden = true; if (pp.nextElementSibling) pp.nextElementSibling.hidden = true; }
      $("#payBtn").textContent = "Usar mi escaneo del mes";
      const h = document.querySelector('[data-step="3"] h2'); if (h) h.textContent = "Confirma tu escaneo";
      const hint = document.querySelector('[data-step="3"] h2 + .hint'); if (hint) hint.textContent = "Tus fotos ya están guardadas. Este escaneo viene incluido en tu seguimiento mensual y lleva el reporte completo.";
      return true;
    }

    // A short, visible measuring pass over their own front photo before the plans appear.
    const espera = ms => new Promise(r => setTimeout(r, ms));
    async function animarMedicion() {
      const c = $("#mideCanvas"); if (!c) return;
      go(2.5);
      const items = $$("#midePasos li"); items.forEach(li => li.className = "");
      const nEl = $("#mideN"); nEl.textContent = "0";
      let src = crudo && crudo.bmp;
      if (!src && fotoFrente) src = await createImageBitmap(fotoFrente).catch(() => null);
      // crop to the face so the measuring is big and readable
      const iw = src ? src.width : 600, ih = src ? src.height : 600;
      let x0 = 0, y0 = 0, x1 = iw, y1 = ih;
      if (crudo && crudo.caja) {
        const k = crudo.caja, pw = (k.x1 - k.x0) * 0.35, ph = (k.y1 - k.y0) * 0.3;
        x0 = Math.max(0, k.x0 - pw); x1 = Math.min(iw, k.x1 + pw); y0 = Math.max(0, k.y0 - ph); y1 = Math.min(ih, k.y1 + ph * 0.6);
      }
      const W = Math.min(720, Math.round(x1 - x0)), esc = W / (x1 - x0), H = Math.round((y1 - y0) * esc);
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      const fondo = () => { if (src) g.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, W, H); else { g.fillStyle = "#1c232a"; g.fillRect(0, 0, W, H); } g.fillStyle = "rgba(22,25,29,.25)"; g.fillRect(0, 0, W, H); };
      const P = p => [(p.x - x0) * esc, (p.y - y0) * esc];
      fondo();
      const total = crudo ? crudo.medidas.length : 60;
      const contar = (a, b, ms) => { const t0 = performance.now(); const f = t => { const k = Math.min(1, (t - t0) / ms); nEl.textContent = Math.round(a + (b - a) * k); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); };
      const paso = async (i, fn, ms) => { items[i].className = "act"; await (fn ? fn() : espera(ms)); items[i].className = "ok"; };

      await paso(0, null, 700);
      await paso(1, async () => {
        if (!crudo) return espera(1100);
        g.fillStyle = "rgba(255,255,255,.85)"; const r = Math.max(1.2, W / 380);
        for (let k = 0; k < crudo.puntos.length; k++) { const [x, y] = P(crudo.puntos[k]); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); if (k % 24 === 0) await espera(14); }
      });
      await paso(2, async () => {
        contar(0, Math.round(total * 0.6), 1500);
        if (!crudo) return espera(1500);
        const ls = crudo.medidas.filter(m => m.zona !== "perfil").flatMap(m => m.lineas || []).filter(l => l.length > 1).slice(0, 28);
        g.lineWidth = Math.max(1.4, W / 420); g.strokeStyle = "#34e07a";
        for (const l of ls) { g.beginPath(); g.moveTo(...P(l[0])); l.slice(1).forEach(p => g.lineTo(...P(p))); g.stroke(); await espera(1500 / Math.max(1, ls.length)); }
      });
      await paso(3, async () => { contar(Math.round(total * 0.6), total, 1100); await espera(1200); });
      await paso(4, null, 800);
      await espera(350);
    }

    $("#toPay").addEventListener("click", async () => {
      const b = $("#toPay"); b.disabled = true;
      if (sb && order) await sb.from("orders").update({ photos_consent_at: new Date().toISOString() }).eq("id", order.id);
      const w0 = sb && order && !(await subEstado).activa ? warmPay() : null; if (w0) w0.catch(() => {}); // Stripe page gets ready while they watch
      try { await animarMedicion(); } catch (e) { console.warn(e); }
      b.disabled = false;
      go(3);
      if (await modoMensual()) return;
      const w = warmPay(); if (w) w.catch(() => {});
    });

    // Both plans are shown side by side at the end; the one they came in with starts selected.
    $$('[name="planSel"]').forEach(r => {
      r.checked = r.value === plan;
      r.addEventListener("change", () => {
        if (!r.checked) return;
        plan = r.value;
        try { sessionStorage.setItem("plan", plan); } catch (e) {}
        const w = warmPay(); if (w) w.catch(() => {});
      });
    });

    $("#payBtn").addEventListener("click", async () => {
      track("begin_checkout", { currency: "MXN", value: precio(plan), items: [{ item_id: plan, item_name: (C.PLAN_NAMES || {})[plan] }] });
      const m = $("#payMsg"), b = $("#payBtn"); clearMsg(m);
      if (!sb || !order) return notReady(m);
      if (mensual) {
        b.disabled = true; b.textContent = "Preparando tu escaneo…";
        try { const { url } = await fnCall("suscripcion", { accion: "usar", order_id: order.id }); location.href = url; }
        catch (e) { b.disabled = false; b.textContent = "Usar mi escaneo del mes"; msg(m, e.message === "Ya usaste el escaneo de este mes" ? "Ya usaste el escaneo de este mes. Puedes pagar este escaneo por separado." : "No pudimos usar tu escaneo del mes. Inténtalo de nuevo en un momento."); }
        return;
      }
      b.disabled = true; b.textContent = "Abriendo el pago…";
      try {
        const { url } = await warmPay();
        location.href = url;
      } catch (e) {
        b.disabled = false; b.textContent = "Pagar y empezar mi análisis";
        msg(m, "No pudimos abrir el pago. Inténtalo de nuevo en un momento.");
      }
    });
  }

  // ---------- panel ----------
  if (page === "gracias") {
    (async () => {
      const q = new URLSearchParams(location.search), id = q.get("pedido"), box = $("#upsell"), done = $("#upsellDone"), sub = $("#upsellSub");
      const U = C.UPSELL || {};
      if (U.was) $$("[data-upsell-was]").forEach(e => { e.textContent = U.was; });
      if (U.now) $$("[data-upsell-now]").forEach(e => { e.textContent = U.now; });
      if (C.SUB_PRICE) $$("[data-sub-price]").forEach(e => { e.textContent = C.SUB_PRICE; });
      tarjetaAcceso($("#acceso"));
      if (!sb || !id || !(await getUser())) return;

      // purchase event, once per order
      try {
        const k = "resalta_compra_" + id;
        if (!localStorage.getItem(k)) {
          const { data: od } = await sb.from("orders").select("tier,status").eq("id", id).maybeSingle();
          if (od && (od.status === "pagado" || od.status === "listo")) {
            track("purchase", { transaction_id: id, currency: "MXN", value: precio(od.tier), items: [{ item_id: od.tier, item_name: (C.PLAN_NAMES || {})[od.tier] }] });
            localStorage.setItem(k, "1");
          }
        }
      } catch (e) {}

      // Second offer: the monthly follow-up, only for people who do not have it yet.
      async function ofrecerSeguimiento() {
        if (!sub) return;
        let st = {}; try { st = await fnCall("suscripcion", { accion: "estado" }); } catch (e) { return; }
        if (st.activa) return;
        const fecha = d => d.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
        const en30 = new Date(Date.now() + 30 * 864e5);
        $$("[data-sub-fecha]").forEach(e => { e.textContent = fecha(en30); });
        if (st.nuevo === false) { // already had a subscription before: no free month again
          sub.querySelector(".upsell-price").innerHTML = `<b class="mono">${C.SUB_PRICE || "$349"}</b> MXN al mes`;
          sub.querySelector(".hint").textContent = "Se cobra a la tarjeta que acabas de usar. Cancelas cuando quieras desde tu cuenta.";
        }
        sub.hidden = false;
        $("#subNo").onclick = () => { sub.hidden = true; };
        $("#subYes").onclick = async () => {
          const b = $("#subYes"), m = $("#subMsgG"); clearMsg(m);
          b.disabled = true; b.textContent = "Activando…";
          try {
            const r = await fnCall("suscripcion", { accion: "activar", order_id: id });
            if (r.url) { location.href = r.url; return; }
            sub.hidden = true;
            const pc = r.primer_cobro ? fecha(new Date(r.primer_cobro)) : "";
            msg(done, r.prueba ? `Listo. Tu seguimiento está activo. Tu primer cobro será el ${pc} y lo puedes cancelar antes desde tu cuenta.` : "Listo. Tu seguimiento está activo.", "ok");
          } catch (e) { b.disabled = false; b.textContent = "Sí, agregar mi seguimiento"; msg(m, "No pudimos activarlo. Inténtalo de nuevo en un momento."); }
        };
      }

      if (q.get("mejora") === "1") { msg(done, "Listo. Tu análisis ahora incluye la parte avanzada.", "ok"); return ofrecerSeguimiento(); }
      // The payment confirmation can take a few seconds to arrive, so check a few times.
      let o = null;
      for (let i = 0; i < 6; i++) {
        const { data } = await sb.from("orders").select("id,status,tier,origen").eq("id", id).maybeSingle();
        o = data;
        if (!o || o.status !== "borrador") break;
        await new Promise(r => setTimeout(r, 2000));
      }
      if (!o || o.status === "borrador") return;
      if (o.origen === "suscripcion") return;
      if (o.tier !== "soft" || !box) return ofrecerSeguimiento();
      // First offer: the advanced part at a discount, one click on the same card.
      box.hidden = false;
      $("#upsellNo").addEventListener("click", () => { box.hidden = true; ofrecerSeguimiento(); });
      $("#upsellYes").addEventListener("click", async () => {
        const b = $("#upsellYes"), m = $("#upsellMsg"), label = b.innerHTML; clearMsg(m);
        b.disabled = true; b.textContent = "Procesando…";
        try {
          const r = await fnCall("upgrade-order", { order_id: id });
          if (r.url) { location.href = r.url; return; }
          box.hidden = true;
          msg(done, "Listo. Tu análisis ahora incluye la parte avanzada.", "ok");
          ofrecerSeguimiento();
        } catch (e) {
          b.disabled = false; b.innerHTML = label;
          msg(m, "No pudimos agregarlo. Inténtalo de nuevo en un momento.");
        }
      });
    })();
  }

  if (page === "afiliados") {
    const box = $("#afApp");
    const e = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const mx = n => "$" + Math.round(n || 0).toLocaleString("es-MX");
    const fecha = d => new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
    // what an affiliate earns per plan, from the prices shown on the site (10% buyer discount, 30% commission)
    $$("[data-af-gana]").forEach(b => { const p = precio(b.dataset.afGana); if (p) b.textContent = mx(p * 0.9 * 0.3); });
    const ESTADOS = { pendiente: ["Por liberar", ""], aprobada: ["Por pagar", "paid"], pagada: ["Pagada", "ready"], cancelada: ["Cancelada", ""] };
    const slug = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16);
    const pagoCampos = a => `
      <div class="field"><label for="af-met">Cómo quieres cobrar</label><select id="af-met" name="pago_metodo"><option value="paypal">PayPal</option><option value="transferencia">Transferencia bancaria</option><option value="otro">Otro</option></select></div>
      <div class="field"><label for="af-dat">Tus datos de pago</label><input id="af-dat" name="pago_datos" maxlength="200" placeholder="Tu correo de PayPal o tu CLABE y banco" value="${e(a && a.pago_datos)}"><span class="hint">Los usamos solo para pagarte. Puedes cambiarlos cuando quieras.</span></div>`;

    function sinSesion() {
      box.innerHTML = `<div class="card af-card"><h2 class="af-h">Crea tu link de afiliado</h2><p class="hint" style="margin:8px 0 18px">Entra con tu correo o con Google. Toma un minuto.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-primary" href="/cuenta?next=/afiliados">Crear mi link</a><a class="btn btn-ghost" href="/cuenta?modo=entrar&next=/afiliados">Ya tengo cuenta</a></div></div>`;
    }

    function unirme(d) {
      const u = d.usuario || {};
      box.innerHTML = `<form class="card af-card" id="afJoin" novalidate><h2 class="af-h">Crea tu link</h2><p class="hint" style="margin:8px 0 18px">Entraste como ${e(d.email)}.</p>
        <div class="field"><label for="af-nom">Tu nombre o el de tu marca</label><input id="af-nom" name="nombre" maxlength="80" required value="${e(u.nombre)}"></div>
        <div class="field"><label for="af-cod">Tu código</label><input id="af-cod" name="codigo" maxlength="24" required autocapitalize="none" spellcheck="false" value="${e(slug(u.nombre))}"><span class="hint">Tu link: <b class="mono" id="afPrev">resalta.co/?ref=${e(slug(u.nombre))}</b></span></div>
        <div class="field"><label for="af-red">Dónde vas a compartirlo <span class="muted">(opcional)</span></label><input id="af-red" name="redes" maxlength="300" placeholder="@tucuenta en TikTok, Instagram, YouTube…"></div>
        ${pagoCampos(null)}
        <div class="msg" id="afMsg"></div>
        <button class="btn btn-primary" type="submit">Crear mi link</button>
        <p class="hint" style="margin-top:14px">Al crearlo aceptas las reglas del programa de abajo y los <a href="/terminos">términos</a>.</p></form>`;
      const f = $("#afJoin"), cod = f.codigo;
      cod.addEventListener("input", () => { cod.value = cod.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""); $("#afPrev").textContent = "resalta.co/?ref=" + cod.value; });
      f.addEventListener("submit", async ev => {
        ev.preventDefault(); const m = $("#afMsg"); clearMsg(m);
        if (!f.nombre.value.trim()) return msg(m, "Escribe tu nombre.");
        if (cod.value.length < 3) return msg(m, "Tu código necesita al menos 3 letras o números.");
        const b = f.querySelector('[type="submit"]'); b.disabled = true; b.textContent = "Creando…";
        try {
          await fnCall("afiliados", { accion: "unirme", nombre: f.nombre.value, codigo: cod.value, redes: f.redes.value, pago_metodo: f.pago_metodo.value, pago_datos: f.pago_datos.value });
          track("afiliado_alta"); cargar();
        } catch (err) { b.disabled = false; b.textContent = "Crear mi link"; msg(m, err.message); }
      });
    }

    function panelAfiliado(d) {
      const a = d.afiliado, link = `https://resalta.co/?ref=${a.codigo}`;
      const filas = (d.lista || []).map(c => {
        const [t, cls] = ESTADOS[c.estado] || [c.estado, ""];
        return `<div class="order"><div><b>${c.concepto === "mejora" ? "Subió a plan Completo" : "Venta"}</b><p class="hint">${fecha(c.created_at)} · venta de ${mx(c.venta_mxn)}${c.estado === "pendiente" ? ` · se libera el ${fecha(c.disponible_at)}` : ""}</p></div><div class="af-row-r"><b class="mono">${mx(c.comision_mxn)}</b><span class="status ${cls}">${t}</span></div></div>`;
      }).join("");
      box.innerHTML = `
        ${a.activo ? "" : `<div class="card af-card"><p class="hint">Tu link está en pausa. Escríbenos si crees que es un error.</p></div>`}
        <div class="card af-card"><p class="label">Tu link</p>
          <div class="af-link"><input readonly value="${e(link)}" aria-label="Tu link de afiliado"><button class="btn btn-primary" type="button" id="afCopy">Copiar</button></div>
          <p class="hint" style="margin-top:10px">También funciona en cualquier página: agrega <span class="mono">?ref=${e(a.codigo)}</span> al final, por ejemplo resalta.co/calificacion?ref=${e(a.codigo)}</p></div>
        <div class="strip af-strip af-kpis">
          <div class="stat"><b>${(a.clics || 0).toLocaleString("es-MX")}</b><span>visitas con tu link</span></div>
          <div class="stat"><b>${d.ventas || 0}</b><span>ventas</span></div>
          <div class="stat"><b>${mx(d.pendiente)}</b><span>por liberar</span></div>
          <div class="stat"><b>${mx(d.por_pagar)}</b><span>listo para pago</span></div>
          <div class="stat"><b>${mx(d.pagado)}</b><span>pagado</span></div>
        </div>
        <div class="card af-card"><p class="label" style="margin-bottom:6px">Tus comisiones</p>${filas || `<p class="hint" style="padding:14px 0">Aún no hay ventas. En cuanto alguien compre con tu link aparece aquí.</p>`}</div>
        <form class="card af-card" id="afEdit" novalidate><p class="label" style="margin-bottom:12px">Tus datos de pago</p>
          <div class="field"><label for="af-nom">Nombre</label><input id="af-nom" name="nombre" maxlength="80" value="${e(a.nombre)}"></div>
          <div class="field"><label for="af-red">Dónde lo compartes</label><input id="af-red" name="redes" maxlength="300" value="${e(a.redes)}"></div>
          ${pagoCampos(a)}
          <div class="msg" id="afMsg"></div><button class="btn btn-ghost" type="submit">Guardar</button></form>`;
      const f = $("#afEdit"); if (a.pago_metodo) f.pago_metodo.value = a.pago_metodo;
      $("#afCopy").onclick = async () => {
        try { await navigator.clipboard.writeText(link); } catch (err) { const i = box.querySelector(".af-link input"); i.select(); document.execCommand("copy"); }
        $("#afCopy").textContent = "Copiado"; setTimeout(() => { const c = $("#afCopy"); if (c) c.textContent = "Copiar"; }, 1800);
      };
      f.addEventListener("submit", async ev => {
        ev.preventDefault(); const m = $("#afMsg"); clearMsg(m);
        try { await fnCall("afiliados", { accion: "editar", nombre: f.nombre.value, redes: f.redes.value, pago_metodo: f.pago_metodo.value, pago_datos: f.pago_datos.value }); msg(m, "Guardado.", "ok"); }
        catch (err) { msg(m, err.message); }
      });
    }

    async function admin() {
      const sec = document.createElement("div"); sec.className = "card af-card af-admin"; sec.innerHTML = `<p class="label">Administrar afiliados</p><p class="hint">Solo tú ves esta parte.</p><div id="afAdm"><p class="hint" style="padding:14px 0">Cargando…</p></div>`;
      box.appendChild(sec);
      const pintar = async () => {
        const { afiliados = [] } = await fnCall("afiliados", { accion: "admin_lista" });
        const total = afiliados.reduce((t, a) => t + a.por_pagar, 0);
        $("#afAdm").innerHTML = `<p style="margin:10px 0 4px"><b>${mx(total)}</b> <span class="hint">listos para pagar en total</span></p>` + (afiliados.map(a => `
          <div class="order"><div><b>${e(a.nombre || a.codigo)}</b> <span class="mono hint">?ref=${e(a.codigo)}</span>
            <p class="hint">${e(a.email)}${a.redes ? " · " + e(a.redes) : ""}</p>
            <p class="hint">${a.clics} visitas · ${a.ventas} ventas · ${a.comision_pct}% · por liberar ${mx(a.pendiente)} · pagado ${mx(a.pagado)}</p>
            <p class="hint">Cobro: ${e(a.pago_metodo || "sin elegir")}${a.pago_datos ? " · " + e(a.pago_datos) : ""}</p></div>
            <div class="af-row-r"><b class="mono">${mx(a.por_pagar)}</b>
              ${a.por_pagar > 0 ? `<button class="btn btn-primary" data-pagar="${a.id}" data-monto="${a.por_pagar}" data-nom="${e(a.nombre || a.codigo)}">Marcar pagado</button>` : ""}
              <button class="btn btn-ghost" data-activo="${a.id}" data-v="${a.activo ? 0 : 1}">${a.activo ? "Pausar" : "Activar"}</button></div></div>`).join("") || `<p class="hint" style="padding:14px 0">Aún no hay afiliados.</p>`);
      };
      sec.addEventListener("click", async ev => {
        const p = ev.target.closest("[data-pagar]"), t = ev.target.closest("[data-activo]");
        if (p) {
          if (!(await confirmar({ titulo: `¿Ya le pagaste a ${p.dataset.nom}?`, texto: `Marcamos ${mx(+p.dataset.monto)} como pagados. Hazlo después de mandar el pago.`, boton: "Sí, ya pagué" }))) return;
          p.disabled = true; await fnCall("afiliados", { accion: "admin_pagar", afiliado_id: p.dataset.pagar }).catch(() => {}); pintar();
        }
        if (t) { t.disabled = true; await fnCall("afiliados", { accion: "admin_estado", afiliado_id: t.dataset.activo, activo: t.dataset.v === "1" }).catch(() => {}); pintar(); }
      });
      pintar().catch(() => { $("#afAdm").innerHTML = `<p class="hint">No se pudo cargar.</p>`; });
    }

    async function cargar() {
      if (!sb) return sinSesion();
      const u = await getUser();
      if (!u) return sinSesion();
      let d;
      try { d = await fnCall("afiliados", { accion: "panel" }); }
      catch (err) { return sinSesion(); }
      d.usuario = { nombre: (u.user_metadata || {}).full_name || "" };
      if (d.afiliado) panelAfiliado(d); else unirme(d);
      if (d.admin) admin();
    }
    cargar();
  }

  if (page === "panel") {
    tarjetaAcceso($("#acceso"));
    const LABEL = { borrador: ["Sin pagar", ""], pagado: ["En análisis", "paid"], listo: ["Listo", "ready"] };
    const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const fecha = d => new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
    const pausa = ms => new Promise(r => setTimeout(r, ms));
    let user, abierto = null, todos = [], prog = null;

    (async () => {
      if (!sb) { $("#orders").innerHTML = '<p class="hint" style="padding:18px 0">Estamos terminando de preparar tu cuenta.</p>'; return; }
      user = await getUser();
      if (!user) { await toLogin("/cuenta?modo=entrar&next=/panel"); return; }
      $("#who").textContent = ((user.user_metadata && user.user_metadata.full_name) || String(user.email || "").split("@")[0]).split(" ")[0];

      const { data: orders } = await sb.from("orders").select("id,status,tier,created_at,paid_at,medidas,answers").order("created_at", { ascending: false });
      todos = orders || [];
      const conNombre = todos.find(o => o.answers && o.answers.nombre);
      if (conNombre) $("#who").textContent = conNombre.answers.nombre.split(" ")[0];
      const box = $("#orders");
      if (!orders || !orders.length) {
        box.innerHTML = '<p class="hint" style="padding:18px 0">Todavía no tienes análisis. <a href="/analisis">Empieza el tuyo</a>.</p>';
        return;
      }
      box.innerHTML = "";
      for (const o of orders) {
        const [txt, cls] = LABEL[o.status] || [o.status, ""];
        const row = document.createElement("div"); row.className = "order"; row.dataset.order = o.id;
        row.innerHTML = `<div><b>${esc((C.PLAN_NAMES || {})[o.tier] || "Análisis Resalta")}</b><div class="hint">${fecha(o.created_at)}</div></div><div style="display:flex;gap:10px;align-items:center"><span class="status ${cls}">${txt}</span></div>`;
        const act = row.lastElementChild;
        if (o.status === "borrador") {
          act.insertAdjacentHTML("beforeend", '<a class="btn btn-ghost" style="height:40px" href="/analisis">Continuar</a>');
          const del = document.createElement("button"); del.className = "order-del"; del.type = "button"; del.textContent = "Borrar";
          del.setAttribute("aria-label", "Borrar este análisis sin pagar");
          del.onclick = async () => {
            if (!(await confirmar({ titulo: "¿Borrar este análisis?", texto: "Se borran tus respuestas y las fotos que subiste en este análisis. Puedes empezar uno nuevo cuando quieras.", boton: "Sí, borrar" }))) return;
            del.disabled = true; del.textContent = "Borrando…";
            try {
              await fnCall("delete-photos", { accion: "pedido", order_id: o.id });
              row.remove(); todos = todos.filter(x => x.id !== o.id);
              if (!box.querySelector(".order")) box.innerHTML = '<p class="hint" style="padding:18px 0">Todavía no tienes análisis. <a href="/analisis">Empieza el tuyo</a>.</p>';
            } catch (e) { del.disabled = false; del.textContent = "Borrar"; msg($("#privMsg"), "No pudimos borrar ese análisis. Inténtalo de nuevo en un momento."); }
          };
          act.appendChild(del);
        }
        if (o.status === "pagado" || o.status === "listo") {
          const btn = document.createElement("button"); btn.className = "btn btn-primary"; btn.style.height = "40px"; btn.textContent = "Ver reporte";
          btn.onclick = () => abrir(o, true); act.appendChild(btn);
        }
        box.appendChild(row);
      }
      const pagado = orders.find(o => o.status === "pagado" || o.status === "listo");
      if (pagado) abrir(pagado, false);
      if (pagado && new URLSearchParams(location.search).get("suscripcion") === "ok") {
        history.replaceState(null, "", "/panel");
        setTimeout(() => { irA("progreso"); msg($("#subMsg"), "Listo, tu seguimiento mensual está activo. Ya puedes hacer tu escaneo de este mes.", "ok"); }, 300);
      }
    })();

    async function leerReporte(id) {
      const { data } = await sb.from("reports").select("data").eq("order_id", id).maybeSingle();
      return data ? data.data : null;
    }
    // a section saved as text instead of an object still displays
    function parsear(v) {
      if (typeof v !== "string") return v;
      const t = v.trim(); try { return JSON.parse(t); } catch (e) {}
      if (t[0] !== "{" && t[0] !== "[") return v;
      let d = 0, str = false, es = false;
      for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (str) { if (es) es = false; else if (c === "\\") es = true; else if (c === '"') str = false; continue; }
        if (c === '"') str = true; else if (c === "{" || c === "[") d++;
        else if (c === "}" || c === "]") { d--; if (!d) { try { return JSON.parse(t.slice(0, i + 1)); } catch (e) { return v; } } }
      }
      return v;
    }
    const completo = (r, o) => r && r.resumen && r.v === 2 && !(o.tier === "hard" && r.tier !== "hard");

    async function abrir(o, scroll) {
      abierto = o.id;
      $("#reportArea").hidden = false;
      $("#repPlan").textContent = (C.PLAN_NAMES || {})[o.tier] || "Tu reporte";
      $("#repDate").textContent = fecha(o.paid_at || o.created_at);
      clearMsg($("#repMsg"));
      if (scroll) $("#reportArea").scrollIntoView({ behavior: "smooth", block: "start" });
      let r = await leerReporte(o.id);
      if (r && r.resumen && r.v === 2) await pintar(r, o);
      if (completo(r, o) && r.estado !== "generando") { esperando(false); return; }
      generar(o);
    }

    function esperando(si, titulo, sub) {
      $("#repWait").hidden = !si;
      $("#repStatus").textContent = si ? "Preparando" : "Listo";
      $("#repStatus").className = "status " + (si ? "paid" : "ready");
      if (titulo) $("#repWaitT").textContent = titulo;
      if (sub) $("#repWaitS").textContent = sub;
    }

    // Orders paid before the front photo was measured at upload get measured here, once.
    async function medirGuardada(o) {
      const { data: s } = await sb.storage.from("fotos").createSignedUrl(`${o.user_id || user.id}/${o.id}/frente.jpg`, 600);
      if (!s) throw new Error("sin_foto");
      const [{ analizar }, img] = await Promise.all([
        import("/assets/js/medidas.js?v=20"),
        new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = s.signedUrl; })
      ]);
      return compactar(await analizar(img, (o.answers || {}).sexo));
    }
    const cargarFoto = async (o, key) => {
      const { data: s } = await sb.storage.from("fotos").createSignedUrl(`${user.id}/${o.id}/${key}.jpg`, 3600);
      if (!s) throw new Error("sin_foto");
      return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = s.signedUrl; });
    };
    async function medirPerfilGuardado(o) {
      const { analizarPerfil } = await import("/assets/js/perfil.js?v=20");
      for (const key of ["perfil_izq", "perfil_der"]) {
        try { return { ...compactarPerfil(await analizarPerfil(await cargarFoto(o, key), (o.answers || {}).sexo)), foto: key }; } catch (e) {}
      }
      return null;
    }

    async function generar(o) {
      const id = o.id;
      esperando(true, "Estamos preparando tu análisis", "Tarda uno o dos minutos. Puedes quedarte aquí o volver más tarde, se guarda en tu cuenta.");
      try {
        const body = { order_id: id };
        if (!o.medidas || !o.medidas.medidas) { body.medidas = await medirGuardada(o); o.medidas = body.medidas; }
        if (!o.medidas.perfil) { const pf = await medirPerfilGuardado(o).catch(() => null); if (pf) { o.medidas.perfil = pf; body.perfil = pf; if (body.medidas) body.medidas.perfil = pf; } }
        let r = await fnCall("generar-reporte", body);
        // another tab may be writing it already: wait for that one
        // the report is written in the background: look for it every few seconds
        for (let i = 0; r.generando && i < 50; i++) {
          await pausa(5000);
          if (abierto !== id) return;
          const d = await leerReporte(id);
          if (d && d.estado === "error") throw new Error("fallo");
          if (completo(d, o) && d.estado !== "generando") r = { data: d };
        }
        if (abierto !== id) return;
        if (!r.data || !r.data.resumen) throw new Error("tarde");
        o.status = "listo";
        const fila = document.querySelector(`[data-order="${id}"] .status`);
        if (fila) { fila.textContent = LABEL.listo[0]; fila.className = "status " + LABEL.listo[1]; }
        await pintar(r.data, o);
        esperando(false);
      } catch (e) {
        if (abierto !== id) return;
        esperando(false);
        $("#repStatus").textContent = "Pendiente"; $("#repStatus").className = "status paid";
        const m = $("#repMsg");
        if (["sin_cara", "varias_caras", "sin_iris", "sin_foto", "No encontramos tus fotos"].includes(e.message)) {
          fotoNueva(o, e.message === "varias_caras"
            ? "En tu foto de frente aparece más de una cara. Sube una donde salgas solo y armamos tu reporte."
            : "No pudimos leer bien tu cara en la foto de frente. Sube otra de frente, con buena luz y sin lentes, y armamos tu reporte.");
          return;
        }
        msg(m, "Tu reporte está tardando más de lo normal. Vuelve a intentarlo en un momento.");
        const b = document.createElement("button"); b.className = "btn btn-ghost"; b.style.cssText = "height:38px;margin-top:10px;display:flex";
        b.textContent = "Intentar de nuevo"; b.onclick = () => generar(o); m.appendChild(b);
      }
    }

    // Lets the customer replace an unreadable front photo from the panel and try again.
    function fotoNueva(o, texto) {
      const m = $("#repMsg"); msg(m, texto);
      const lab = document.createElement("label"); lab.className = "btn btn-primary"; lab.style.cssText = "height:40px;margin-top:12px;display:inline-flex;cursor:pointer";
      lab.innerHTML = '<span>Subir foto de frente</span><input type="file" accept="image/*" hidden>';
      m.appendChild(lab);
      lab.querySelector("input").addEventListener("change", async ev => {
        const f = ev.target.files[0]; if (!f) return;
        lab.querySelector("span").textContent = "Subiendo…";
        try {
          const img = await createImageBitmap(f), s2 = Math.min(1, 1600 / Math.max(img.width, img.height));
          const c = document.createElement("canvas"); c.width = Math.round(img.width * s2); c.height = Math.round(img.height * s2);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.9));
          const { error } = await sb.storage.from("fotos").upload(`${user.id}/${o.id}/frente.jpg`, blob, { upsert: true, contentType: "image/jpeg" });
          if (error) throw error;
          o.medidas = null; clearMsg(m); generar(o);
        } catch (err) { lab.querySelector("span").textContent = "Subir foto de frente"; msg(m, "No se pudo subir la foto. Revisa tu conexión e inténtalo de nuevo."); m.appendChild(lab); }
      });
    }

    let sim = null, actual = null;
    function irA(tab) {
      $$("#dashNav button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
      $$("#repBody .dash-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
      // always land at the top of the section: on a phone the bar is far from the content it changes
      scrollTo({ top: $("#reportArea").getBoundingClientRect().top + scrollY - 84 });
      if (tab === "simular") abrirSim();
      if (tab === "progreso") progreso();
      if (tab === "chat") abrirChat();
      const ab = $("#dashNav button.active"); if (ab && ab.scrollIntoView && innerWidth <= 900) ab.scrollIntoView({ inline: "nearest", block: "nearest" });
    }

    // ---- progress over time and side-by-side compare
    const PIL = [["general", "General"], ["armonia", "Armonía"], ["angularidad", "Angularidad"], ["dimorfismo", "Dimorfismo"], ["rasgos", "Rasgos"]];
    const corta = d => new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
    const sg1 = x => (x > 0 ? "+" : "") + x.toFixed(1);
    function progreso() {
      suscripcionUI();
      if (!prog) prog = cargarProgreso().catch(e => { prog = null; $("#progNota").textContent = "No pudimos cargar tu historial. Vuelve a intentarlo en un momento."; });
      return prog;
    }
    async function cargarProgreso() {
      const hechos = todos.filter(o => o.status === "listo" || o.status === "pagado");
      const ids = hechos.map(o => o.id);
      const { data } = ids.length ? await sb.from("reports").select("order_id, puntajes:data->puntajes").in("order_id", ids) : { data: [] };
      const pts = Object.fromEntries((data || []).map(r => [r.order_id, r.puntajes]));
      const serie = hechos.filter(o => pts[o.id] && pts[o.id].general != null)
        .map(o => ({ o, p: pts[o.id], t: new Date(o.paid_at || o.created_at) })).sort((a, b) => a.t - b.t);
      if (!serie.length) { $("#progNota").textContent = "Tu primer reporte todavía se está preparando."; return; }
      const ult = serie[serie.length - 1], pri = serie[0];
      const dl = ult.p.general - pri.p.general;
      $("#progNow").innerHTML = `${(+ult.p.general).toFixed(1)}<small>/ 10</small>` + (serie.length > 1 ? ` <em class="sim-d ${Math.abs(dl) < .05 ? "" : dl > 0 ? "sube" : "baja"}">${sg1(dl)}</em>` : "");
      $("#progPils").innerHTML = PIL.slice(1).map(([k, n]) => `<span>${n}</span><b>${ult.p[k] != null ? (+ult.p[k]).toFixed(1) : "–"}</b>`).join("");
      $("#progChart").innerHTML = grafica(serie);
      $("#progNota").textContent = serie.length > 1
        ? `${serie.length} escaneos desde el ${corta(pri.t)}.`
        : "Este es tu punto de partida. Cuando hagas otro escaneo, aquí vas a ver la línea de tu avance y podrás comparar las dos fotos.";
      if (serie.length > 1) comparar(serie);
    }
    // ---- chat about the customer's own results
    let chatDe = null, chatOcupado = false;
    // the assistant may answer with **bold** and "- " lists: show those, escape everything else
    const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^\s*[-*•] /gm, "• ").replace(/^#+ /gm, "");
    // the assistant can end with a "SIM {...}" line: that becomes a button that renders the change on the customer's photo
    const sacarSim = (t) => {
      const m = /\n?\s*SIM\s*(\{[\s\S]*\})\s*$/.exec(t || "");
      if (!m) return [t, null];
      try { return [t.slice(0, m.index).trim(), JSON.parse(m[1])]; } catch (e) { return [t.slice(0, m.index).trim(), null]; }
    };
    const botonSim = (d, sim) => {
      const w = document.createElement("div"); w.className = "chat-sim";
      w.innerHTML = '<button type="button" class="btn btn-primary">Ver cómo me vería</button><div class="chat-sim-r" hidden></div>';
      const b = w.querySelector("button"), r = w.querySelector(".chat-sim-r");
      b.onclick = async () => {
        b.disabled = true; b.textContent = "Generando, tarda unos 20 segundos…";
        try {
          const vista = sim.vista === "perfil" ? "perfil" : "frente";
          const o = (typeof actual !== "undefined" && actual) || {};
          const res = await fnCall("proyeccion", { tipo: "sim", order_id: abierto, vista, foto: o.fotoPerfil || "perfil_izq", claves: sim.claves || {}, magro: !!sim.magro, extras: sim.extras || [], etiquetas: ["Desde Preguntar"] });
          r.hidden = false; r.innerHTML = `<img src="${res.imagen}" alt="Tu foto con el cambio aplicado"><p class="hint">Imagen generada con IA. Se guardó en Simular.</p>`;
          b.hidden = true;
        } catch (e) {
          b.disabled = false; b.textContent = "Ver cómo me vería";
          r.hidden = false; r.innerHTML = `<p class="hint">${e.message === "limite" ? "Llegaste al límite de imágenes de hoy." : "No pudimos generar la imagen ahorita."}</p>`;
        }
        $("#chatLog").scrollTop = 1e6;
      };
      d.appendChild(w);
    };
    const poner = (d, t, quien) => {
      if (!quien.startsWith("re")) { d.textContent = t; return; }
      const [txt, sim] = sacarSim(t); d.innerHTML = md(txt);
      if (sim && !quien.includes("pensando")) botonSim(d, sim);
    };
    const burbuja = (t, quien) => { const d = document.createElement("div"); d.className = "chat-m " + quien; poner(d, t, quien); $("#chatLog").appendChild(d); $("#chatLog").scrollTop = 1e6; return d; };
    async function abrirChat() {
      if (chatDe === abierto) return;
      chatDe = abierto; $("#chatLog").innerHTML = "";
      try {
        const { mensajes } = await fnCall("chat", { order_id: abierto, accion: "historial" });
        if (chatDe !== abierto) return;
        (mensajes || []).forEach(m => burbuja(m.texto, m.rol === "user" ? "yo" : "re"));
        $("#chatSug").hidden = (mensajes || []).length > 0;
      } catch (e) {}
    }
    async function preguntar(texto) {
      texto = (texto || "").trim(); if (!texto || chatOcupado || !abierto) return;
      chatOcupado = true; $("#chatBtn").disabled = true; $("#chatSug").hidden = true;
      burbuja(texto, "yo"); $("#chatIn").value = ""; $("#chatIn").style.height = "";
      const espera = burbuja("Pensando…", "re pensando");
      try {
        const r = await fnCall("chat", { order_id: abierto, mensaje: texto });
        espera.classList.remove("pensando"); poner(espera, r.respuesta, "re");
      } catch (e) {
        espera.classList.remove("pensando");
        espera.textContent = /l[ií]mite/i.test(e.message) || e.message === "limite" ? "Llegaste al límite de preguntas por hoy. Mañana puedes seguir." : "No pude responder ahorita. Inténtalo de nuevo en un momento.";
      }
      $("#chatLog").scrollTop = 1e6; chatOcupado = false; $("#chatBtn").disabled = false;
    }
    if ($("#chatForm")) {
      $("#chatForm").addEventListener("submit", ev => { ev.preventDefault(); preguntar($("#chatIn").value); });
      $("#chatIn").addEventListener("keydown", ev => { if (ev.key === "Enter" && !ev.shiftKey && innerWidth > 900) { ev.preventDefault(); preguntar($("#chatIn").value); } });
      $("#chatIn").addEventListener("input", () => { const t = $("#chatIn"); t.style.height = ""; t.style.height = Math.min(140, t.scrollHeight) + "px"; });
      $$("#chatSug button").forEach(b => b.addEventListener("click", () => preguntar(b.textContent)));
    }

    let subCargando = false;
    async function suscripcionUI(forzar) {
      if (subCargando && !forzar) return; subCargando = true;
      const box = $("#progAccion"), precio = C.SUB_PRICE || "$349";
      $$("[data-sub-price]").forEach(e => { e.textContent = precio; });
      const boton = (txt, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = txt; b.onclick = fn; box.appendChild(b); return b; };
      const enlace = (txt, href, cls) => { const a = document.createElement("a"); a.className = cls; a.href = href; a.textContent = txt; box.appendChild(a); };
      let st;
      try { st = await fnCall("suscripcion", { accion: "estado" }); }
      catch (e) { st = { activa: false }; }
      box.innerHTML = "";
      const fin = st.periodo_fin ? new Date(st.periodo_fin).toLocaleDateString("es-MX", { day: "numeric", month: "long" }) : "";
      const accion = async (b, a, ok) => {
        const t = b.textContent; b.disabled = true; b.textContent = "Un momento…"; clearMsg($("#subMsg"));
        try { const r = await fnCall("suscripcion", { accion: a }); if (r.url) { location.href = r.url; return; } if (ok) ok(r); suscripcionUI(true); }
        catch (e) { b.disabled = false; b.textContent = t; msg($("#subMsg"), "No se pudo completar. Inténtalo de nuevo en un momento."); }
      };
      if (!st.activa) {
        $("#subL").textContent = "Seguimiento mensual"; $("#subT").textContent = "Mide tu avance cada mes";
        $("#subX").innerHTML = `Un escaneo completo cada mes con reporte nuevo, tu línea de progreso y la comparación entre fotos. ${st.nuevo === false ? "" : "El primer mes es gratis, después "}<b class="mono">${esc(precio)}</b> MXN al mes y cancelas cuando quieras.`;
        boton("Activar seguimiento", "btn btn-primary", function () { accion(this, "suscribir"); });
        enlace("Un escaneo suelto", "/analisis", "btn btn-ghost");
      } else {
        $("#subL").textContent = "Tu seguimiento mensual";
        if (st.prueba) {
          $("#subT").textContent = "Tu mes gratis está activo";
          $("#subX").textContent = st.cancela ? `Cancelaste tu seguimiento. No se te va a cobrar y termina el ${fin}.` : `Tu primer cobro es el ${fin}. Ese mismo día se libera tu primer escaneo del seguimiento para comparar tu avance.`;
        } else if (st.disponible) {
          $("#subT").textContent = "Tu escaneo de este mes está disponible";
          $("#subX").textContent = "Sube tus fotos nuevas y te armamos un reporte completo para comparar con el anterior.";
          enlace("Hacer mi escaneo del mes", "/analisis?seguimiento=1", "btn btn-primary");
        } else {
          $("#subT").textContent = "Ya hiciste tu escaneo de este mes";
          $("#subX").textContent = st.cancela ? `Tu suscripción termina el ${fin}.` : `El siguiente se libera el ${fin}, cuando se renueva tu suscripción.`;
        }
        if (st.cancela) {
          if (st.disponible) $("#subX").textContent += ` Tu suscripción termina el ${fin}.`;
          if (st.prueba) $("#subX").textContent = `Cancelaste tu seguimiento. No se te va a cobrar y termina el ${fin}.`;
          boton("Seguir con mi suscripción", "btn btn-ghost", function () { accion(this, "reactivar"); });
        } else {
          boton("Cancelar suscripción", "prog-link", function () {
            if (this.dataset.ok !== "1") { this.dataset.ok = "1"; this.textContent = `Confirmar: cancelar al terminar el periodo (${fin})`; return; }
            accion(this, "cancelar");
          });
        }
      }
      subCargando = false;
    }
    function grafica(serie) {
      const W = Math.max(300, Math.min(760, $("#progChart").clientWidth || 640)), H = W < 500 ? 180 : 210, pl = 30, pr = 22, pt = 18, pb = 26;
      const t0 = +serie[0].t, t1 = +serie[serie.length - 1].t, span = Math.max(1, t1 - t0);
      const X = t => serie.length === 1 ? (pl + W - pr) / 2 : pl + 18 + (W - pl - pr - 36) * ((+t - t0) / span);
      const vals = serie.map(s => +s.p.general), lo = Math.max(0, Math.floor(Math.min(...vals) - 1)), hi = Math.min(10, Math.ceil(Math.max(...vals) + 1));
      const Y = v => pt + (H - pt - pb) * (1 - (v - lo) / Math.max(1, hi - lo));
      let g = "";
      for (let v = lo; v <= hi; v++) g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
      const pts = serie.map(s => [X(s.t), Y(+s.p.general)]);
      if (pts.length > 1) g += `<polyline fill="none" stroke="var(--ink)" stroke-width="2" points="${pts.map(p => p.join(",")).join(" ")}"/>`;
      serie.forEach((s, i) => {
        const [x, y] = pts[i];
        g += `<circle cx="${x}" cy="${y}" r="5" fill="var(--ink)" stroke="var(--surface-raised)" stroke-width="2"/><text x="${x}" y="${y - 11}" text-anchor="middle" style="fill:var(--ink);font-weight:500">${(+s.p.general).toFixed(1)}</text>`;
        if (serie.length <= 6 || i === 0 || i === serie.length - 1) g += `<text x="${x}" y="${H - 6}" text-anchor="middle">${new Date(s.t).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</text>`;
      });
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tu calificación general en cada escaneo">${g}</svg>`;
    }
    function comparar(serie) {
      $("#progCmp").hidden = false;
      const opt = serie.map((s, i) => `<option value="${i}">${new Date(s.t).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "2-digit" })} · ${(+s.p.general).toFixed(1)}</option>`).join("");
      const a = $("#cmpA"), b = $("#cmpB"); a.innerHTML = opt; b.innerHTML = opt;
      a.value = 0; b.value = serie.length - 1;
      const firmar = (o) => sb.storage.from("fotos").createSignedUrl(`${user.id}/${o.id}/frente.jpg`, 3600).then(x => x.data ? x.data.signedUrl : "").catch(() => "");
      const fila = (n, va, vb, sub, d) => `<div class="sim-row"><span>${esc(n)}${sub ? `<small class="mono">${sub}</small>` : ""}</span><em class="sim-d ${Math.abs(d) < .05 ? "" : d > 0 ? "sube" : "baja"}">${sg1(d)}</em><b class="mono">${vb}</b></div>`;
      const pintarCmp = async () => {
        const A = serie[+a.value], B = serie[+b.value];
        $("#cmpLA").textContent = corta(A.t); $("#cmpLB").textContent = corta(B.t);
        $("#cmpPils").innerHTML = PIL.filter(([k]) => A.p[k] != null && B.p[k] != null)
          .map(([k, n]) => fila(n, A.p[k], B.p[k], `${(+A.p[k]).toFixed(1)} → ${(+B.p[k]).toFixed(1)}`, B.p[k] - A.p[k])).join("");
        const lista = o => [...((o.medidas || {}).medidas || []), ...(((o.medidas || {}).perfil || {}).medidas || [])];
        const ma = Object.fromEntries(lista(A.o).map(m => [m.id, m]));
        const ch = lista(B.o).filter(m => ma[m.id]).map(m => ({ m, o: ma[m.id], d: (m.puntaje - ma[m.id].puntaje) / 10 }))
          .filter(x => Math.abs(x.d) >= 0.2).sort((p, q) => Math.abs(q.d) - Math.abs(p.d)).slice(0, 10);
        $("#cmpMed").innerHTML = ch.length ? ch.map(x => fila(x.m.nombre, 0, (x.m.puntaje / 10).toFixed(1), `${x.o.valor}${x.o.unidad || ""} → ${x.m.valor}${x.m.unidad || ""}`, x.d)).join("")
          : '<p class="hint" style="padding:8px 0">Tus medidas casi no cambiaron entre estos dos escaneos.</p>';
        const [fa, fb] = await Promise.all([firmar(A.o), firmar(B.o)]);
        $("#cmpFA").style.backgroundImage = fa ? `url("${fa}")` : ""; $("#cmpFB").style.backgroundImage = fb ? `url("${fb}")` : "";
      };
      a.onchange = b.onchange = pintarCmp; pintarCmp();
    }
    function abrirSim() {
      if (!sim && actual) {
        sim = import("/assets/js/simular.js?v=25").then(m => m.iniciar(actual)).then(() => { $("#simWait").hidden = true; $("#simBox").hidden = false; })
          .catch(e => { sim = null; $("#simWait").hidden = true; msg($("#simMsg"), e && e.message === "sin_foto" ? "No encontramos tu foto de frente para simular." : "No pudimos preparar el simulador. Vuelve a intentarlo en un momento."); });
      }
    }
    $$("#dashNav button").forEach(b => b.addEventListener("click", () => irA(b.dataset.tab)));

    const li = arr => (arr || []).map(x => `<li>${esc(x)}</li>`).join("");
    const NIVEL = { alto: "Impacto alto", medio: "Impacto medio", bajo: "Impacto bajo" };
    const ESF = { bajo: "poco esfuerzo", medio: "esfuerzo medio", alto: "mucho esfuerzo" };

    // ---- the customer's protocol card, same look as the sample on the home page
    const radar = (ejes, W = 240, H = 200) => {
      const cx = W / 2, cy = H / 2 + 4, R = 70, n = ejes.length;
      const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * v / 10, cy + Math.sin(a) * R * v / 10]; };
      const poly = (f) => ejes.map((e, i) => pt(i, f(e)).map(x => x.toFixed(1)).join(",")).join(" ");
      let g = '<g fill="none" stroke="#DDE2E6">' + [10, 7, 4].map(v => `<polygon points="${poly(() => v)}"/>`).join("") + "</g>";
      g += `<polygon points="${poly(e => e.pot)}" fill="#B9C9C2" fill-opacity=".45" stroke="#9FB3AB"/><polygon points="${poly(e => e.hoy)}" fill="#6E7E8E" fill-opacity=".4" stroke="#6E7E8E"/>`;
      g += '<g class="t2">' + ejes.map((e, i) => { const [x, y] = pt(i, 11.8); return `<text x="${x.toFixed(1)}" y="${(y + 2).toFixed(1)}" text-anchor="${Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end"}">${esc(e.n.toUpperCase())}</text>`; }).join("") + "</g>";
      return `<svg viewBox="-40 -6 ${W + 80} ${H + 8}" class="radar" role="img" aria-label="Tus valores actuales y tu potencial">${g}</svg>`;
    };
    function protocolo(r, o) {
      const box = $("#protoCard"); if (!box) return;
      const a = o.answers || {}, P = r.puntajes || {}, pot = r.potencial || {}, lon = r.longevidad || {};
      const nombre = (a.nombre || (user.user_metadata || {}).full_name || "").split(" ")[0];
      const pid = "RS-" + String(o.id).replace(/[^0-9a-f]/gi, "").slice(0, 4).toUpperCase();
      const g = Object.fromEntries((r.grupos || []).map(x => [x.id, x]));
      const ejes = (pot.grupos || []).filter(x => g[x.id] && g[x.id].puntaje != null).map(x => ({ n: (t => t.charAt(0).toUpperCase() + t.slice(1))(g[x.id].titulo.replace(/^Zona de /, "")), hoy: g[x.id].puntaje, pot: Math.max(g[x.id].puntaje, x.valor) }));
      const foto = (actual && actual.url) || "", proy = null;
      const dd = (k, v) => v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : "";
      const f1 = v => (typeof v === "number" ? v.toFixed(1) : "–");
      box.innerHTML = `<div class="rp rp-live">
        <div class="rp-main">
          <div class="rp-top"><img src="/assets/img/mark-ink.svg" alt=""><span>PROTOCOLO / #${pid}</span></div>
          <h3>Protocolo de <span>${esc(nombre || "tu cara")}</span></h3>
          <div class="rp-photos">
            <figure>${foto ? `<img src="${foto}" alt="Hoy">` : ""}<figcaption>HOY</figcaption></figure>
            <figure class="${proy ? "" : "rp-pend"}">${proy ? `<img src="${proy}" alt="Tu proyección">` : `<div><b>Tu proyección</b><span>Se está preparando. Aparece aquí en cuanto esté lista.</span></div>`}<figcaption>PROYECCIÓN</figcaption></figure>
          </div>
          <div class="rp-cols">
            <div><h4>Potencial proyectado</h4><p>Hoy tienes <b>${f1(P.general)}</b>. Siguiendo tu plan sin procedimientos podrías llegar a <b>${f1(pot.general_soft)}</b>${pot.general_hard ? `, y a <b>${f1(pot.general_hard)}</b> sumando procedimientos` : ""}.</p>
              <ul>${ejes.map(e => `<li>${esc(e.n)}</li>`).join("")}</ul></div>
            <div>${ejes.length >= 3 ? radar(ejes) : ""}<div class="rp-legend"><span><i style="background:#B9C9C2"></i>POTENCIAL</span><span><i style="background:#6E7E8E"></i>HOY</span></div></div>
          </div>
          ${lon.edad_visual ? `<p class="rp-line">${lon.edad_visual === a.edad ? "Hoy aparentas <span>tu edad</span>" : lon.edad_visual < a.edad ? `Hoy aparentas <span>${a.edad - lon.edad_visual} años menos</span> que tu edad real` : `Hoy aparentas <span>${lon.edad_visual - a.edad} años más</span> que tu edad real`}.</p>
          <div class="rp-ages three"><div><small>Edad real</small><b>${esc(a.edad)}</b></div><div><small>Edad visual hoy</small><b>${esc(lon.edad_visual)}</b></div><div class="dark"><small>Con tu plan</small><b>${esc(lon.edad_visual_meta)}</b></div></div>` : ""}
        </div>
        <div class="rp-side">
          <div class="rp-card"><h4>Perfil</h4>
            <div class="rp-user">${foto ? `<img src="${foto}" alt="">` : ""}<div><b>${esc(nombre || "Tú")}</b><span>Protocolo ID: #${pid}</span></div></div>
            <dl>${dd("País", a.pais)}${dd("Edad", a.edad ? a.edad + " años" : "")}${dd("Sexo", a.sexo ? a.sexo.charAt(0).toUpperCase() + a.sexo.slice(1) : "")}${dd("Objetivo", a.objetivo)}${dd("Piel", a.piel)}${dd("Rutina", a.rutina)}${dd("Presupuesto", a.presupuesto)}${dd("Tiempo al día", a.tiempo)}</dl></div>
          ${lon.lectura ? `<div class="rp-card"><h4>Edad visual</h4><p>${esc(lon.lectura)}</p></div>` : ""}
        </div>
      </div>`;
      box.hidden = false;
      traerProyeccion(o, "soft", box.querySelector(".rp-pend"));
    }
    // asks for the projection; the first time it is made (some seconds), after that it comes back at once
    async function traerProyeccion(o, tipo, fig, intento = 0) {
      if (!fig) return;
      try {
        const x = await fnCall("proyeccion", { order_id: o.id, tipo });
        if (x.generando) { if (intento < 12) setTimeout(() => traerProyeccion(o, tipo, fig, intento + 1), 10000); return; }
        if (!x.url) return;
        const cap = fig.querySelector("figcaption"); fig.classList.remove("rp-pend");
        fig.innerHTML = `<img src="${x.url}" alt="Tu proyección">`; if (cap) fig.appendChild(cap);
        fig.querySelector("img").onclick = () => window.open(x.url, "_blank");
      } catch (e) { /* not configured yet or failed: the card keeps saying it is being prepared */ }
    }

    async function pintar(r0, o) {
      const r = {}; Object.keys(r0 || {}).forEach(k => { r[k] = parsear(r0[k]); });
      $("#repBody").hidden = false;
      $("#repResumen").textContent = r.resumen || "";
      const pdf = $("#repPdf"); if (pdf) { pdf.href = "/reporte?pedido=" + encodeURIComponent(o.id); pdf.hidden = false; }

      if (o.medidas && o.medidas.medidas) {
        const firmar = k => sb.storage.from("fotos").createSignedUrl(`${user.id}/${o.id}/${k}.jpg`, 3600).then(x => x.data ? x.data.signedUrl : "").catch(() => "");
        const pf = o.medidas.perfil;
        const [{ montarAnalisis }, foto, fotoP] = await Promise.all([import("/assets/js/analisis-ui.js?v=3"), firmar("frente"), pf ? firmar(pf.foto || "perfil_izq") : ""]);
        const pun = (r.puntajes || {}).armonia;
        montarAnalisis($("#fqRoot"), {
          frente: { data: o.medidas, src: foto }, perfil: pf ? { data: pf, src: fotoP } : null,
          armonia: typeof pun === "number" ? pun : null,
          nivel: v => v < 4.5 ? "Por debajo del promedio" : v < 5.5 ? "En el promedio" : v < 6.5 ? "Arriba del promedio" : v < 7.5 ? "Muy buena armonía" : v < 8.5 ? "Excelente armonía" : "Excepcional"
        });
        const peB = $("#peBtns");
        if (peB) {
          peB.hidden = false;
          const bP = peB.querySelector('[data-pe="perfil"]'); bP.hidden = !pf;
          peB.querySelectorAll("[data-pe]").forEach(b => b.onclick = async () => {
            const vista = b.dataset.pe, key = vista === "perfil" ? (pf.foto || "perfil_izq") : "frente";
            b.disabled = true; clearMsg($("#peMsg"));
            try {
              const [img, { editarPuntos }] = await Promise.all([cargarFoto(o, key), import("/assets/js/puntos.js?v=2")]);
              const res = await editarPuntos({ vista, img, sexo: (o.answers || {}).sexo });
              if (res) {
                const datos = vista === "perfil" ? { ...compactarPerfil(res), foto: key } : compactar(res);
                await fnCall("generar-reporte", { order_id: o.id, accion: "ajustar", vista, datos });
                msg($("#peMsg"), "Listo. Guardamos tus puntos y recalculamos tus medidas.", "ok");
                setTimeout(() => location.reload(), 900);
              }
            } catch (e) { msg($("#peMsg"), "No pudimos guardar tus puntos. Inténtalo de nuevo en un momento."); }
            b.disabled = false;
          });
        }
        const n = o.medidas.medidas.length + (pf ? pf.medidas.length : 0);
        $("#repCuenta").textContent = n + " medidas en " + (pf ? "frente y perfil" : "tu foto de frente");
        if (foto) $("#dFoto").style.backgroundImage = `url("${foto}")`;
        const otra = !actual || actual.id !== o.id;
        actual = { id: o.id, url: foto, urlPerfil: fotoP || null, fotoPerfil: pf ? (pf.foto || "perfil_izq") : null, sexo: (o.answers || {}).sexo, ia: b => fnCall("proyeccion", b) };
        if (otra) { sim = null; $("#simBox").hidden = true; $("#simWait").hidden = false; }
        // someone may have opened Simular before the photo was ready
        if ($('.dash-tab[data-tab="simular"]').classList.contains("active")) abrirSim();
      }

      // ---- inicio
      const P = r.puntajes || {}, f1 = v => (typeof v === "number" ? v.toFixed(1) : "–");
      const nivel = v => v == null ? "" : v < 4.5 ? "Por debajo del promedio" : v < 5.5 ? "En el promedio" : v < 6.5 ? "Arriba del promedio" : v < 7.5 ? "Atractivo" : v < 8.5 ? "Muy atractivo" : "Excepcional";
      $("#dScore").textContent = f1(P.general);
      $("#dNivel").textContent = nivel(P.general) + (P.general != null ? ". 5 es el promedio de la población." : "");
      const PIL = [["armonia", "Armonía", "medidas"], ["angularidad", "Angularidad", "rasgos"], ["dimorfismo", "Dimorfismo", "rasgos"], ["rasgos", "Rasgos", "rasgos"]];
      $("#dPilares").innerHTML = PIL.filter(x => P[x[0]] != null).map(([k, n, t]) => `<button type="button" class="visor-zone" data-ir="${t}"><span>${n}</span><i><b style="width:${P[k] * 10}%"></b></i><em class="mono">${f1(P[k])}</em></button>`).join("");
      $("#dEval").textContent = (r.evaluaciones || "") + " evaluaciones";
      const arq = r.arquetipo; $("#dArqCard").hidden = !(arq && arq.nombre);
      if (arq && arq.nombre) { $("#dArqN").textContent = arq.nombre.charAt(0).toUpperCase() + arq.nombre.slice(1); $("#dArqT").textContent = arq.texto || ""; }
      $("#dTop").innerHTML = (r.prioridades || []).slice(0, 3).map((p, i) => `<div class="rep-item"><b><span class="mono rep-n">${i + 1}</span>${esc(p.titulo)}</b><p class="rep-tags"><span class="rep-tag rep-${esc(p.impacto)}">${esc(NIVEL[p.impacto] || p.impacto)}</span><span class="rep-tag">${esc(ESF[p.esfuerzo] || p.esfuerzo)}</span></p></div>`).join("");

      protocolo(r, o);

      // ---- rasgos
      const TIT = { angularidad: ["Angularidad", "Qué tan definida se ve tu estructura: pómulos, mandíbula, mentón y cuello. Depende mucho de la grasa corporal, la retención de líquidos y la postura."], dimorfismo: ["Dimorfismo", "Qué tanto cada rasgo se acerca a lo que se percibe como atractivo para tu sexo."], rasgos: ["Rasgos", "La calidad de cada rasgo por separado: piel, ojos, cejas, nariz, cabello, labios y sonrisa."] };
      $("#pilaresBox").innerHTML = Object.keys(TIT).map(k => {
        const gs = (r.grupos || []).filter(g => g.pilar === k); if (!gs.length) return "";
        return `<div class="pil"><div class="pil-top"><div><h3>${TIT[k][0]}</h3><p class="hint">${TIT[k][1]}</p></div><p class="mono pil-n">${f1(P[k])}<span> / 10</span></p></div><div class="pil-grupos">${gs.map(g =>
          `<div class="card pil-g"><div class="rep-zona-top"><b>${esc(g.titulo)}</b><span class="mono">${f1(g.puntaje)}</span></div>${g.items.map(x =>
            `<div class="pil-row"><div class="pil-row-t"><span>${esc(x.nombre)}</span><i><b class="${x.puntaje < 4.5 ? "bajo" : x.puntaje >= 6.5 ? "alto" : ""}" style="width:${x.puntaje * 10}%"></b></i><em class="mono">${f1(x.puntaje)}</em></div><p class="hint">${esc(x.nota)}</p></div>`).join("")}</div>`).join("")}</div></div>`;
      }).join("");
      $$("#reportArea [data-ir]").forEach(b => { b.onclick = () => irA(b.dataset.ir); });

      $("#repFortalezas").innerHTML = (r.fortalezas || []).map(f => `<div class="rep-item"><b>${esc(f.titulo)}</b><p class="hint">${esc(f.texto)}</p></div>`).join("");
      $("#repPrioridades").innerHTML = (r.prioridades || []).map((p, i) => `<div class="rep-item"><b><span class="mono rep-n">${i + 1}</span>${esc(p.titulo)}</b><p class="hint">${esc(p.texto)}</p><p class="rep-tags"><span class="rep-tag rep-${esc(p.impacto)}">${esc(NIVEL[p.impacto] || p.impacto)}</span><span class="rep-tag">${esc(ESF[p.esfuerzo] || p.esfuerzo)}</span></p></div>`).join("");

      const zonas = Object.fromEntries((o.medidas && o.medidas.resumen ? o.medidas.resumen.zonas : []).map(z => [z.id, z]));
      $("#repZonas").innerHTML = (r.zonas || []).map(z => {
        const s = zonas[z.id];
        return `<div class="card rep-zona"><div class="rep-zona-top"><b>${esc(s ? s.nombre : z.id)}</b>${s ? `<span class="mono">${s.puntaje}</span>` : ""}</div><p class="hint">${esc(z.lectura)}</p><ul class="rep-list">${li(z.acciones)}</ul></div>`;
      }).join("");

      const bloque = (x) => x && x.lectura ? `<p class="hint">${esc(x.lectura)}</p><ul class="rep-list">${li(x.acciones)}</ul>` : "";
      const extra = [["Perfil", r.perfil], ["Sonrisa", r.sonrisa], ["Tres cuartos", r.tres_cuartos]].filter(x => x[1] && x[1].lectura);
      $("#repAngulos").innerHTML = extra.map(([t, x]) => `<div class="card rep-zona"><div class="rep-zona-top"><b>${t}</b></div>${bloque(x)}</div>`).join("");
      $("#repAngulosH").hidden = !extra.length;
      const piel = r.piel || {};
      $("#repPiel").innerHTML = `<p class="hint">${esc(piel.lectura)}</p><ul class="rep-list">${li(piel.acciones)}</ul>`;

      const col = r.color || {};
      const sw = arr => (arr || []).map(c => `<span class="rep-sw" title="${esc(c.nombre)}"><i style="background:${/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#ccc"}"></i>${esc(c.nombre)}</span>`).join("");
      $("#repColor").innerHTML = `<p class="rep-sub-t">Subtono <b>${esc(col.subtono)}</b>${col.contraste ? ` · contraste <b>${esc(col.contraste)}</b>` : ""}</p><p class="hint">${esc(col.lectura)}</p><p class="label rep-mini">Te favorecen</p><div class="rep-sws">${sw(col.paleta)}</div><p class="label rep-mini">Mejor evitar</p><div class="rep-sws">${sw(col.evitar)}</div>`;

      const cb = r.cabello_barba || {};
      $("#repCabello").innerHTML = `<p class="label rep-mini">Cortes</p><ul class="rep-list">${li(cb.cortes)}</ul><p class="label rep-mini">${(o.answers || {}).sexo === "mujer" ? "Contorno" : "Barba"}</p><ul class="rep-list">${li(cb.barba)}</ul><p class="label rep-mini">Cejas</p><ul class="rep-list">${li(cb.cejas)}</ul>${(cb.lentes || []).length ? `<p class="label rep-mini">Lentes</p><ul class="rep-list">${li(cb.lentes)}</ul>` : ""}`;

      $("#repPlanFases").innerHTML = (r.plan || []).map(f => `<div class="card rep-fase"><p class="label">${esc(f.fase)}</p>${(f.pasos || []).map(p => `<div class="rep-paso"><b>${esc(p.accion)}</b><p class="hint">${esc(p.porque)}</p></div>`).join("")}</div>`).join("");

      const av = $("#repAvanzado");
      if (o.tier === "hard" && (r.avanzado || []).length) {
        av.innerHTML = `<h3 class="rep-h">Procedimientos a considerar</h3><p class="hint rep-sub">Información general para que llegues mejor preparado a una consulta. Cada caso lo debe evaluar un médico certificado.</p><div class="rp rp-live rp-hard"><div class="rp-main"><div class="rp-photos"><figure>${actual && actual.url ? `<img src="${actual.url}" alt="Hoy">` : ""}<figcaption>HOY</figcaption></figure><figure class="rp-pend"><div><b>Tu proyección con procedimientos</b><span>Se está preparando. Aparece aquí en cuanto esté lista.</span></div><figcaption>HARDMAXING</figcaption></figure></div><p class="hint" style="margin-top:10px">Simulación ilustrativa de un resultado sutil y realista. No es una promesa de resultado.</p></div></div><div class="rep-zonas">${r.avanzado.map(a => `<div class="card rep-zona"><b>${esc(a.nombre)}</b><p class="hint" style="margin-top:8px">${esc(a.que_hace)}</p><p class="hint" style="margin-top:8px"><b>Antes de decidir.</b> ${esc(a.considerar)}</p></div>`).join("")}</div>`;
        traerProyeccion(o, "hard", av.querySelector(".rp-hard .rp-pend"));
      } else if (o.tier === "soft") {
        const U = C.UPSELL || {};
        av.innerHTML = `<div class="card rep-lock"><div><p class="label">Plan Completo</p><h3 class="rep-lock-h">La parte de procedimientos</h3><p class="hint">Qué procedimientos se suelen considerar para un rostro con tus proporciones, qué hace cada uno y qué pensar antes de una consulta.</p></div><div class="rep-lock-r"><p class="mono rep-lock-p">${U.was ? `<s>${esc(U.was)}</s> ` : ""}${esc(U.now || "")} MXN</p><button class="btn btn-primary" id="repUp">Agregar a mi reporte</button><div class="msg" id="repUpMsg"></div></div></div>`;
        $("#repUp").onclick = async () => {
          const b = $("#repUp"), m = $("#repUpMsg"); clearMsg(m); b.disabled = true; b.textContent = "Procesando…";
          try {
            const x = await fnCall("upgrade-order", { order_id: o.id });
            if (x.url) { location.href = x.url; return; }
            o.tier = "hard"; $("#repPlan").textContent = (C.PLAN_NAMES || {}).hard || "Plan Completo";
            av.innerHTML = ""; generar(o);
          } catch (e) { b.disabled = false; b.textContent = "Agregar a mi reporte"; msg(m, "No pudimos agregarlo. Inténtalo de nuevo en un momento."); }
        };
      } else av.innerHTML = "";
    }

    // someone without a password who logs out could not get back in, so warn them once
    let avisoSalir = false;
    $("#logout").addEventListener("click", async () => {
      const u = await getUser(), ac = $("#acceso");
      if (u && (u.user_metadata || {}).sin_clave && !avisoSalir && ac && !ac.hidden) {
        avisoSalir = true; ac.scrollIntoView({ behavior: "smooth", block: "center" });
        const m = ac.querySelector(".msg"); if (m) msg(m, "Antes de salir, crea tu contraseña. Si no, no vas a poder volver a entrar a tu reporte.");
        $("#logout").textContent = "Salir de todos modos";
        return;
      }
      if (sb) await sb.auth.signOut(); location.href = "/";
    });

    $("#deletePhotos").addEventListener("click", async () => {
      const m = $("#privMsg"); clearMsg(m);
      if (!sb) return notReady(m);
      if (!(await confirmar({ titulo: "¿Borrar todas tus fotos?", texto: "Tus reportes se quedan en tu cuenta, pero ya no vamos a tener tus fotos para nuevos análisis. Esto no se puede deshacer.", boton: "Sí, borrar mis fotos" }))) return;
      try { const r = await fnCall("delete-photos", {}); msg(m, `Listo. Borramos ${r.deleted} fotos.`, "ok"); }
      catch (e) { msg(m, "No pudimos borrar tus fotos. Escríbenos a contacto@resalta.co."); }
    });

    $("#deleteAccount").addEventListener("click", async () => {
      const m = $("#privMsg"), b = $("#deleteAccount"); clearMsg(m);
      if (!sb) return notReady(m);
      const st = await fnCall("suscripcion", { accion: "estado" }).catch(() => ({}));
      const extra = st.activa ? " También cancelamos tu seguimiento mensual y ya no se te cobra." : "";
      if (!(await confirmar({ titulo: "¿Borrar tu cuenta?", texto: "Se borra todo: tus reportes, tus fotos, tus medidas y tu acceso. No lo podemos recuperar después." + extra, boton: "Borrar mi cuenta", palabra: "BORRAR" }))) return;
      b.disabled = true; b.textContent = "Borrando tu cuenta…";
      try {
        await fnCall("delete-photos", { accion: "cuenta", confirmar: "BORRAR" });
        try { sessionStorage.clear(); } catch (e) {}
        await sb.auth.signOut().catch(() => {});
        location.href = "/?cuenta=borrada";
      } catch (e) {
        b.disabled = false; b.textContent = "Borrar mi cuenta";
        msg(m, e.message === "No pudimos cancelar tu suscripción" ? "No pudimos cancelar tu suscripción, así que no borramos nada. Inténtalo de nuevo o escríbenos a contacto@resalta.co." : "No pudimos borrar tu cuenta. Inténtalo de nuevo o escríbenos a contacto@resalta.co.");
      }
    });
  }
})();

// home: how-it-works video. Put the video URL in data-video and it plays in place.
document.querySelectorAll(".how-video").forEach(box => {
  const btn = box.querySelector(".how-play");
  btn && btn.addEventListener("click", () => {
    const src = box.dataset.video;
    if (!src) { const t = box.querySelector(".how-pronto"); if (t) { t.textContent = "El video sale muy pronto"; } return; }
    const v = document.createElement("video");
    v.src = src; v.controls = true; v.playsInline = true; v.autoplay = true;
    box.appendChild(v); v.play().catch(() => {});
  });
});

// after deleting an account they land on the home page with a short confirmation
if (new URLSearchParams(location.search).get("cuenta") === "borrada") {
  const t = document.createElement("div"); t.className = "aviso-top"; t.setAttribute("role", "status");
  t.textContent = "Listo, borramos tu cuenta y todo lo que tenía.";
  document.body.appendChild(t); history.replaceState(null, "", location.pathname);
  setTimeout(() => t.remove(), 6000);
}

// mobile menu: the burger turns into an X, taps outside or on a link close it, and the page behind doesn't scroll
(() => {
  const btn = document.getElementById("menuBtn"), nav = document.getElementById("navLinks");
  if (!btn || !nav) return;
  const poner = abierto => {
    nav.classList.toggle("open", abierto);
    btn.setAttribute("aria-expanded", String(abierto));
    btn.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
    document.documentElement.classList.toggle("menu-abierto", abierto);
  };
  btn.addEventListener("click", e => { e.stopPropagation(); poner(!nav.classList.contains("open")); });
  document.addEventListener("click", e => { if (nav.classList.contains("open") && !nav.contains(e.target)) poner(false); });
  nav.addEventListener("click", e => { if (e.target.closest("a")) poner(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && nav.classList.contains("open")) { poner(false); btn.focus(); } });
  matchMedia("(min-width:861px)").addEventListener("change", m => { if (m.matches) poner(false); });
})();
