(function () {
  "use strict";
  const C = window.RESALTA || {};
  const configured = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  const sb = configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
  const page = document.body.dataset.page;
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

  const errES = (e) => {
    const m = (e && e.message) || "";
    if (/Invalid login/i.test(m)) return "Correo o contraseña incorrectos.";
    if (/already registered|already exists/i.test(m)) return "Ya existe una cuenta con ese correo.";
    if (/Email not confirmed/i.test(m)) return "Confirma tu correo: te mandamos un enlace al registrarte.";
    if (/Password/i.test(m)) return "La contraseña debe tener al menos 8 caracteres.";
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

  // ---------- cuenta ----------
  if (page === "cuenta") {
    const params = new URLSearchParams(location.search);
    const next = safePath(params.get("next"), "/panel.html");
    const tabs = $$(".tabs button");
    function show(t) {
      tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === t));
      $$("[data-pane]").forEach(p => (p.hidden = p.dataset.pane !== t));
      const gb = $("#googleBox"), s1 = document.querySelector('.su-step[data-s="1"]');
      if (gb) gb.hidden = t === "signup" && !!s1 && !s1.classList.contains("on");
    }
    tabs.forEach(b => b.addEventListener("click", () => show(b.dataset.tab)));
    if (params.get("modo") === "entrar") show("login");

    $$("[data-google]").forEach(btn => btn.addEventListener("click", async () => {
      const m = $("#googleMsg"); clearMsg(m);
      if (!sb) return notReady(m);
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + next, queryParams: { prompt: "select_account" } }
      });
      if (error) msg(m, errES(error));
    }));

    // Sign-up goes one thing at a time: name, then email, then password.
    let suPaso = 1;
    const suF = $("#signupForm");
    function suIr(n) {
      suPaso = n;
      $$(".su-step", suF).forEach(st => st.classList.toggle("on", +st.dataset.s === n));
      $$("[data-su-name]").forEach(e => { e.textContent = suF.nombre.value.trim().split(/\s+/)[0] || ""; });
      suF.querySelector('[data-su="atras"]').hidden = n === 1;
      suF.querySelector('[data-su="sig"]').textContent = n === 3 ? "Crear cuenta" : "Continuar";
      const gb = $("#googleBox"); if (gb) gb.hidden = n !== 1;
      clearMsg($("#signupMsg"));
      const inp = suF.querySelector(`.su-step[data-s="${n}"] input`);
      if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 60);
    }
    suF.querySelector('[data-su="atras"]').addEventListener("click", () => suIr(suPaso - 1));
    // a lead is kept as soon as we have the email, even if they stop before the password
    function guardarLead(email, nombre) {
      if (!sb) return;
      try { sb.from("leads").insert({ email, nombre, source: "registro" }).then(() => {}, () => {}); } catch (e) {}
    }
    suF.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, m = $("#signupMsg"); clearMsg(m);
      if (suPaso === 1) { if (!f.nombre.value.trim()) return msg(m, "Escribe tu nombre."); return suIr(2); }
      if (suPaso === 2) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) return msg(m, "Escribe un correo válido.");
        guardarLead(f.email.value.trim().toLowerCase(), f.nombre.value.trim().slice(0, 60));
        return suIr(3);
      }
      if (f.password.value.length < 8) return msg(m, "La contraseña debe tener al menos 8 caracteres.");
      if (!f.terms.checked) return msg(m, "Necesitas aceptar los términos y el aviso de privacidad.");
      if (!sb) return notReady(m);
      const b = f.querySelector('[data-su="sig"]'); b.disabled = true; b.textContent = "Creando tu cuenta…";
      const { data, error } = await sb.auth.signUp({
        email: f.email.value.trim(), password: f.password.value,
        options: { emailRedirectTo: location.origin + next, data: { full_name: f.nombre.value.trim().slice(0, 60) } }
      });
      b.disabled = false; b.textContent = "Crear cuenta";
      if (error) return msg(m, errES(error));
      if (data.session) location.href = next;
      else msg(m, "Listo. Te mandamos un correo para confirmar tu cuenta.", "ok");
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
      await sb.auth.resetPasswordForEmail(id, { redirectTo: location.origin + "/cuenta.html" });
      msg(m, "Si el correo existe, te mandamos un enlace para cambiar tu contraseña.", "ok");
    });
  }

  // ---------- analisis ----------
  if (page === "analisis") {
    const SLOTS = [
      ["frente", "Frente", "Cara relajada, boca cerrada"],
      ["sonrisa", "Frente sonriendo", "Sonrisa natural"],
      ["perfil_izq", "Perfil izquierdo", "90°, mirando al frente"],
      ["perfil_der", "Perfil derecho", "90°, mirando al frente"],
      ["tres_cuartos_izq", "Tres cuartos izq.", "Gira la cara 45°"],
      ["tres_cuartos_der", "Tres cuartos der.", "Gira la cara 45°"]
    ];
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
        const box = document.createElement("div"); box.className = "opts" + (sel.options.length > 5 ? " opts-2" : "");
        [...sel.options].filter(o => !o.disabled).forEach(o => {
          const b = document.createElement("button"); b.type = "button"; b.className = "opt"; b.textContent = o.textContent; b.dataset.v = o.value || o.textContent;
          b.addEventListener("click", () => {
            sel.value = b.dataset.v; sel.dataset.picked = "1"; pintar(q);
            setTimeout(() => { if (qs[i] === q && i < qs.length - 1) mostrar(paso(i, 1)); }, 220);
          });
          box.appendChild(b);
        });
        sel.after(box);
      });
      function pintar(q) {
        const sel = q.querySelector("select"); if (!sel) return;
        $$(".opt", q).forEach(b => b.classList.toggle("on", !!sel.dataset.picked && b.dataset.v === sel.value));
      }
      function valido(q) {
        clearMsg(qm);
        const bad = [...q.querySelectorAll("input,select")].find(el => {
          if (el.type === "checkbox") return false;
          if (el.required && !String(el.value || "").trim()) return true;
          if (el.type === "number" && el.value && ((el.min && +el.value < +el.min) || (el.max && +el.value > +el.max))) return true;
          return false;
        });
        if (!bad) return true;
        const t = bad.name === "edad" ? (bad.value && +bad.value < 18 ? "Este servicio es solo para mayores de 18 años." : "Escribe tu edad.")
          : bad.name === "nombre" ? "Escribe tu nombre." : bad.name === "sexo" ? "Elige una opción." : "Revisa este dato.";
        msg(qm, t); return false;
      }
      // some questions only apply after certain answers (procedure budget only if they are open to procedures)
      const aplica = q => q.dataset.cond !== "proc" || !/^Solo/.test(f.procedimientos.value || "Solo");
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
        ir(name) { const k = qs.findIndex(q => q.querySelector(`[name="${name}"]`)); if (k >= 0) mostrar(k); }
      };
    })();

    (async () => {
      if (!sb) return;
      user = await getUser();
      if (!user) { await toLogin("/cuenta.html?next=/analisis.html"); return; }
      // resume the latest draft order if there is one
      const { data } = await sb.from("orders").select("*").eq("status", "borrador").order("created_at", { ascending: false }).limit(1);
      if (data && data[0]) {
        order = data[0];
        const a = order.answers || {};
        const f = $("#aboutForm");
        Object.keys(a).forEach(k => { if (f[k] && f[k].type !== "checkbox") f[k].value = a[k]; });
      }
      const fn = $("#aboutForm").nombre;
      if (fn && !fn.value && user.user_metadata && user.user_metadata.full_name) fn.value = user.user_metadata.full_name;
      if (quiz) quiz.refrescar(true, order && order.answers);
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
      const answers = { nombre, edad: +f.edad.value, sexo: f.sexo.value, pais: f.pais.value, estatura: f.estatura.value || null, peso: f.peso.value || null, objetivo: f.objetivo.value, piel: f.piel.value, lentes: f.lentes.value, procedimientos: f.procedimientos.value, presupuesto_procedimientos: /^Solo/.test(f.procedimientos.value) ? null : f.presupuesto_procedimientos.value, presupuesto: f.presupuesto.value, tiempo: f.tiempo.value, rutina: f.rutina.value, notas: f.notas.value.trim() };
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

    import("/assets/js/medidas.js?v=18").then(m => m.precargar()).catch(() => {});
    import("/assets/js/perfil.js?v=19").then(m => m.precargarPerfil()).catch(() => {});

    const grid = $("#photoGrid");
    SLOTS.forEach(([key, title, sub]) => {
      const el = document.createElement("label");
      el.className = "slot"; el.dataset.key = key;
      el.innerHTML = `<b>${title}</b><small>${sub}</small><input type="file" accept="image/*" aria-label="${title}">`;
      grid.appendChild(el);
      el.querySelector("input").addEventListener("change", (e) => handleFile(el, key, e.target.files[0]));
    });

    // guided scan: the photos it takes go through the same upload as a picked file
    const escBtn = $("#escBtn");
    if (escBtn) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) $("#escCta").hidden = true;
      escBtn.addEventListener("click", async () => {
        escBtn.disabled = true;
        try {
          const { iniciar } = await import("/assets/js/escaneo.js?v=3");
          await iniciar({
            hechas: [...uploaded],
            onFoto: (key, blob) => { const el = grid.querySelector(`[data-key="${key}"]`); if (el) handleFile(el, key, blob); },
            alTerminar: () => { escBtn.disabled = false; grid.scrollIntoView({ behavior: "smooth", block: "center" }); },
          });
        } catch (e) { escBtn.disabled = false; msg($("#photoMsg"), "No pudimos abrir el escaneo. Sube tus fotos una por una."); }
      });
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
        const { analizarPerfil } = await import("/assets/js/perfil.js?v=19");
        const r = await analizarPerfil(await createImageBitmap(blob), (order.answers || {}).sexo);
        M.perfil[key] = compactarPerfil(r); await guardarMedidas();
      } catch (e) { delete M.perfil[key]; console.warn("perfil", e && e.message); }
    }

    // The front photo is measured here, in the browser, and the numbers travel with the order.
    let medidasListas = null;
    async function medir(blob, m) {
      if (!sb || !order) return;
      try {
        const { analizar } = await import("/assets/js/medidas.js?v=18");
        const bmp = await createImageBitmap(blob);
        M.frente = compactar(await analizar(bmp, (order.answers || {}).sexo));
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
    function check() { $("#toPay").disabled = !(uploaded.size === SLOTS.length && consent.checked); }

    // The Stripe page is prepared as soon as the payment step opens, so clicking Pagar goes straight to it.
    const payReady = {};
    function warmPay() {
      if (!sb || !order) return null;
      const p = plan;
      if (!payReady[p]) payReady[p] = fnCall("create-checkout", { order_id: order.id, tier: p }).catch(e => { delete payReady[p]; throw e; });
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

    $("#toPay").addEventListener("click", async () => {
      if (sb && order) await sb.from("orders").update({ photos_consent_at: new Date().toISOString() }).eq("id", order.id);
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
      if (!sb || !id || !(await getUser())) return;

      // Second offer: the monthly follow-up, only for people who do not have it yet.
      async function ofrecerSeguimiento() {
        if (!sub) return;
        let st = {}; try { st = await fnCall("suscripcion", { accion: "estado" }); } catch (e) { return; }
        if (st.activa) return;
        sub.hidden = false;
        $("#subNo").onclick = () => { sub.hidden = true; };
        $("#subYes").onclick = async () => {
          const b = $("#subYes"), m = $("#subMsgG"); clearMsg(m);
          b.disabled = true; b.textContent = "Abriendo el pago…";
          try { const { url } = await fnCall("suscripcion", { accion: "suscribir" }); location.href = url; }
          catch (e) { b.disabled = false; b.textContent = "Activar mi seguimiento"; msg(m, "No pudimos abrir el pago. Inténtalo de nuevo en un momento."); }
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

  if (page === "panel") {
    const LABEL = { borrador: ["Sin pagar", ""], pagado: ["En análisis", "paid"], listo: ["Listo", "ready"] };
    const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const fecha = d => new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
    const pausa = ms => new Promise(r => setTimeout(r, ms));
    let user, abierto = null, todos = [], prog = null;

    (async () => {
      if (!sb) { $("#orders").innerHTML = '<p class="hint" style="padding:18px 0">Estamos terminando de preparar tu cuenta.</p>'; return; }
      user = await getUser();
      if (!user) { await toLogin("/cuenta.html?modo=entrar&next=/panel.html"); return; }
      $("#who").textContent = ((user.user_metadata && user.user_metadata.full_name) || String(user.email || "").split("@")[0]).split(" ")[0];

      const { data: orders } = await sb.from("orders").select("id,status,tier,created_at,paid_at,medidas,answers").order("created_at", { ascending: false });
      todos = orders || [];
      const conNombre = todos.find(o => o.answers && o.answers.nombre);
      if (conNombre) $("#who").textContent = conNombre.answers.nombre.split(" ")[0];
      const box = $("#orders");
      if (!orders || !orders.length) {
        box.innerHTML = '<p class="hint" style="padding:18px 0">Todavía no tienes análisis. <a href="/analisis.html">Empieza el tuyo</a>.</p>';
        return;
      }
      box.innerHTML = "";
      for (const o of orders) {
        const [txt, cls] = LABEL[o.status] || [o.status, ""];
        const row = document.createElement("div"); row.className = "order"; row.dataset.order = o.id;
        row.innerHTML = `<div><b>${esc((C.PLAN_NAMES || {})[o.tier] || "Análisis Resalta")}</b><div class="hint">${fecha(o.created_at)}</div></div><div style="display:flex;gap:10px;align-items:center"><span class="status ${cls}">${txt}</span></div>`;
        const act = row.lastElementChild;
        if (o.status === "borrador") act.insertAdjacentHTML("beforeend", '<a class="btn btn-ghost" style="height:40px" href="/analisis.html">Continuar</a>');
        if (o.status === "pagado" || o.status === "listo") {
          const btn = document.createElement("button"); btn.className = "btn btn-primary"; btn.style.height = "40px"; btn.textContent = "Ver reporte";
          btn.onclick = () => abrir(o, true); act.appendChild(btn);
        }
        box.appendChild(row);
      }
      const pagado = orders.find(o => o.status === "pagado" || o.status === "listo");
      if (pagado) abrir(pagado, false);
      if (pagado && new URLSearchParams(location.search).get("suscripcion") === "ok") {
        history.replaceState(null, "", "/panel.html");
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
        import("/assets/js/medidas.js?v=18"),
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
      const { analizarPerfil } = await import("/assets/js/perfil.js?v=19");
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
    const poner = (d, t, quien) => { if (quien.startsWith("re")) d.innerHTML = md(t); else d.textContent = t; };
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
        $("#subX").innerHTML = `Un escaneo completo cada mes con reporte nuevo, tu línea de progreso y la comparación entre fotos. <b class="mono">${esc(precio)}</b> MXN al mes y cancelas cuando quieras.`;
        boton("Activar seguimiento", "btn btn-primary", function () { accion(this, "suscribir"); });
        enlace("Un escaneo suelto", "/analisis.html", "btn btn-ghost");
      } else {
        $("#subL").textContent = "Tu seguimiento mensual";
        if (st.disponible) {
          $("#subT").textContent = "Tu escaneo de este mes está disponible";
          $("#subX").textContent = "Sube tus fotos nuevas y te armamos un reporte completo para comparar con el anterior.";
          enlace("Hacer mi escaneo del mes", "/analisis.html?seguimiento=1", "btn btn-primary");
        } else {
          $("#subT").textContent = "Ya hiciste tu escaneo de este mes";
          $("#subX").textContent = st.cancela ? `Tu suscripción termina el ${fin}.` : `El siguiente se libera el ${fin}, cuando se renueva tu suscripción.`;
        }
        if (st.cancela) {
          if (st.disponible) $("#subX").textContent += ` Tu suscripción termina el ${fin}.`;
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
        sim = import("/assets/js/simular.js?v=22").then(m => m.iniciar(actual)).then(() => { $("#simWait").hidden = true; $("#simBox").hidden = false; })
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
      const pdf = $("#repPdf"); if (pdf) { pdf.href = "/reporte.html?pedido=" + encodeURIComponent(o.id); pdf.hidden = false; }

      if (o.medidas && o.medidas.medidas) {
        const firmar = k => sb.storage.from("fotos").createSignedUrl(`${user.id}/${o.id}/${k}.jpg`, 3600).then(x => x.data ? x.data.signedUrl : "").catch(() => "");
        const pf = o.medidas.perfil;
        const [{ montar }, foto, fotoP] = await Promise.all([import("/assets/js/visor-ui.js?v=17"), firmar("frente"), pf ? firmar(pf.foto || "perfil_izq") : ""]);
        const vistas = $("#vVistas");
        const ver = (v) => {
          $$("#vVistas button").forEach(b => b.classList.toggle("active", b.dataset.v === v));
          if (v === "perfil") montar(pf, fotoP, { scroll: false }); else montar(o.medidas, foto, { scroll: false });
        };
        vistas.hidden = !pf;
        $$("#vVistas button").forEach(b => { b.onclick = () => ver(b.dataset.v); });
        ver("frente");
        const n = o.medidas.medidas.length + (pf ? pf.medidas.length : 0);
        $("#repCuenta").textContent = n + " medidas en " + (pf ? "frente y perfil" : "tu foto de frente");
        if (foto) $("#dFoto").style.backgroundImage = `url("${foto}")`;
        const otra = !actual || actual.id !== o.id;
        actual = { id: o.id, url: foto, urlPerfil: fotoP || null, sexo: (o.answers || {}).sexo };
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

    $("#logout").addEventListener("click", async () => { if (sb) await sb.auth.signOut(); location.href = "/"; });

    $("#deletePhotos").addEventListener("click", async () => {
      const m = $("#privMsg"); clearMsg(m);
      if (!sb) return notReady(m);
      if (!confirm("¿Borrar todas tus fotos? Esto no se puede deshacer.")) return;
      try { const r = await fnCall("delete-photos", {}); msg(m, `Listo. Borramos ${r.deleted} fotos.`, "ok"); }
      catch (e) { msg(m, "No pudimos borrar tus fotos. Escríbenos a contacto@resalta.co."); }
    });
  }
})();
