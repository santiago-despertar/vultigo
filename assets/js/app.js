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

    $("#signupForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, m = $("#signupMsg"); clearMsg(m);
      if (!f.email.value.includes("@")) return msg(m, "Escribe un correo válido.");
      if (f.password.value.length < 8) return msg(m, "La contraseña debe tener al menos 8 caracteres.");
      if (!f.terms.checked) return msg(m, "Necesitas aceptar los términos y el aviso de privacidad.");
      if (!sb) return notReady(m);
      const { data, error } = await sb.auth.signUp({
        email: f.email.value.trim(), password: f.password.value,
        options: { emailRedirectTo: location.origin + next }
      });
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
    })();

    $("#aboutForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      if (!f.mayor.checked || !f.edad.value || +f.edad.value < 18) { alertInline(f, "Este servicio es solo para mayores de 18 años."); return; }
      const answers = { edad: +f.edad.value, pais: f.pais.value, estatura: f.estatura.value || null, peso: f.peso.value || null, objetivo: f.objetivo.value, notas: f.notas.value.trim() };
      if (!sb) { go(2); return; }
      if (order) {
        await sb.from("orders").update({ answers }).eq("id", order.id);
      } else {
        const { data, error } = await sb.from("orders").insert({ user_id: user.id, answers, tier: plan }).select().single();
        if (error) { alertInline(f, "No pudimos guardar tus datos. Inténtalo de nuevo."); return; }
        order = data;
      }
      go(2);
    });
    function alertInline(form, text) {
      let m = form.querySelector(".msg"); if (!m) { m = document.createElement("div"); form.insertBefore(m, form.lastElementChild); }
      msg(m, text);
    }

    const grid = $("#photoGrid");
    SLOTS.forEach(([key, title, sub]) => {
      const el = document.createElement("label");
      el.className = "slot"; el.dataset.key = key;
      el.innerHTML = `<b>${title}</b><small>${sub}</small><input type="file" accept="image/*" aria-label="${title}">`;
      grid.appendChild(el);
      el.querySelector("input").addEventListener("change", (e) => handleFile(el, key, e.target.files[0]));
    });

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

    $("#toPay").addEventListener("click", async () => {
      if (sb && order) await sb.from("orders").update({ photos_consent_at: new Date().toISOString() }).eq("id", order.id);
      go(3);
      const w = warmPay(); if (w) w.catch(() => {});
    });

    const bump = $("#bumpHard");
    if (bump) {
      const num = v => +String(v || "").replace(/[^0-9.]/g, "");
      const paintPlan = () => {
        $$('[data-price="plan"]').forEach(e => { if (PRICES[plan]) e.textContent = PRICES[plan]; });
        $$("[data-plan-name]").forEach(e => { if (C.PLAN_NAMES && C.PLAN_NAMES[plan]) e.textContent = C.PLAN_NAMES[plan]; });
      };
      const diff = num(PRICES.hard) - num(PRICES.soft);
      if (diff > 0) $$("[data-bump-diff]").forEach(e => { e.textContent = "$" + diff.toLocaleString("en-US"); });
      bump.checked = plan === "hard";
      bump.addEventListener("change", () => {
        plan = bump.checked ? "hard" : "soft";
        try { sessionStorage.setItem("plan", plan); } catch (e) {}
        paintPlan();
        const w = warmPay(); if (w) w.catch(() => {});
      });
    }

    $("#payBtn").addEventListener("click", async () => {
      const m = $("#payMsg"), b = $("#payBtn"); clearMsg(m);
      if (!sb || !order) return notReady(m);
      b.disabled = true; b.textContent = "Abriendo el pago…";
      try {
        const { url } = await warmPay();
        location.href = url;
      } catch (e) {
        b.disabled = false; b.textContent = "Pagar";
        msg(m, "No pudimos abrir el pago. Inténtalo de nuevo en un momento.");
      }
    });
  }

  // ---------- panel ----------
  if (page === "gracias") {
    (async () => {
      const q = new URLSearchParams(location.search), id = q.get("pedido"), box = $("#upsell"), done = $("#upsellDone");
      const U = C.UPSELL || {};
      if (U.was) $$("[data-upsell-was]").forEach(e => { e.textContent = U.was; });
      if (U.now) $$("[data-upsell-now]").forEach(e => { e.textContent = U.now; });
      if (q.get("mejora") === "1") { msg(done, "Listo. Tu análisis ahora incluye la parte avanzada.", "ok"); return; }
      if (!sb || !id || !box || !(await getUser())) return;
      // The payment confirmation can take a few seconds to arrive, so check a few times.
      let o = null;
      for (let i = 0; i < 6; i++) {
        const { data } = await sb.from("orders").select("id,status,tier").eq("id", id).maybeSingle();
        o = data;
        if (!o || o.status !== "borrador") break;
        await new Promise(r => setTimeout(r, 2000));
      }
      if (!o || o.status !== "pagado" || o.tier !== "soft") return;
      box.hidden = false;
      $("#upsellNo").addEventListener("click", () => { box.hidden = true; });
      $("#upsellYes").addEventListener("click", async () => {
        const b = $("#upsellYes"), m = $("#upsellMsg"), label = b.innerHTML; clearMsg(m);
        b.disabled = true; b.textContent = "Procesando…";
        try {
          const r = await fnCall("upgrade-order", { order_id: id });
          if (r.url) { location.href = r.url; return; }
          box.hidden = true;
          msg(done, "Listo. Tu análisis ahora incluye la parte avanzada.", "ok");
        } catch (e) {
          b.disabled = false; b.innerHTML = label;
          msg(m, "No pudimos agregarlo. Inténtalo de nuevo en un momento.");
        }
      });
    })();
  }

  if (page === "panel") {
    const LABEL = { borrador: ["Sin pagar", ""], pagado: ["En análisis", "paid"], listo: ["Listo", "ready"] };
    (async () => {
      if (!sb) { $("#orders").innerHTML = '<p class="hint" style="padding:18px 0">Estamos terminando de preparar tu cuenta.</p>'; return; }
      const user = await getUser();
      if (!user) { await toLogin("/cuenta.html?modo=entrar&next=/panel.html"); return; }
      $("#who").textContent = (user.user_metadata && user.user_metadata.full_name) || user.email;

      const { data: orders } = await sb.from("orders").select("id,status,created_at,paid_at").order("created_at", { ascending: false });
      const box = $("#orders");
      if (!orders || !orders.length) {
        box.innerHTML = '<p class="hint" style="padding:18px 0">Todavía no tienes análisis. <a href="/analisis.html">Empieza el tuyo</a>.</p>';
        return;
      }
      box.innerHTML = "";
      for (const o of orders) {
        const [txt, cls] = LABEL[o.status] || [o.status, ""];
        const d = new Date(o.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
        const row = document.createElement("div"); row.className = "order";
        row.innerHTML = `<div><b>Análisis Resalta</b><div class="hint">${d}</div></div><div style="display:flex;gap:10px;align-items:center"><span class="status ${cls}">${txt}</span></div>`;
        const act = row.lastElementChild;
        if (o.status === "borrador") act.insertAdjacentHTML("beforeend", '<a class="btn btn-ghost" style="height:40px" href="/analisis.html">Continuar</a>');
        if (o.status === "listo") {
          const btn = document.createElement("button"); btn.className = "btn btn-primary"; btn.style.height = "40px"; btn.textContent = "Ver reporte";
          btn.onclick = () => showReport(o.id); act.appendChild(btn);
        }
        box.appendChild(row);
      }
      const ready = orders.find(o => o.status === "listo"); if (ready) showReport(ready.id);
    })();

    async function showReport(orderId) {
      const { data } = await sb.from("reports").select("data").eq("order_id", orderId).single();
      if (!data) return;
      const r = data.data || {}, out = $("#report");
      const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      let html = "";
      if (r.resumen) html += `<p class="lead" style="margin:18px 0 8px">${esc(r.resumen)}</p>`;
      if (r.puntaje != null) html += `<div class="report-row"><span>Armonía facial</span><b class="mono">${esc(r.puntaje)} / 10</b></div>`;
      (r.medidas || []).forEach(m => {
        html += `<div class="report-row"><span>${esc(m.nombre)}</span><b class="mono">${esc(m.valor)}${m.ideal ? " · ideal " + esc(m.ideal) : ""}</b></div>`;
        if (m.nota) html += `<p class="hint" style="margin:-6px 0 10px">${esc(m.nota)}</p>`;
      });
      if ((r.plan || []).length) {
        html += `<h3 style="margin:28px 0 8px">Tu plan</h3>`;
        r.plan.forEach((p, i) => { html += `<div class="report-row" style="display:block"><b>${i + 1}. ${esc(p.titulo)}</b> <span class="mono" style="color:var(--ink-muted)">· ${esc(p.prioridad || "")}</span><p class="hint" style="margin-top:6px">${esc(p.detalle)}</p></div>`; });
      }
      out.innerHTML = html; $("#reportCard").hidden = false;
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
