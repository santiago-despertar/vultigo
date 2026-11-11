(function () {
  "use strict";
  const C = window.VULTIGO || {};
  const configured = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  const sb = configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
  const page = document.body.dataset.page;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---------- shared ----------
  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();
  if (C.PRICE_LABEL) $$("[data-price]").forEach(e => (e.textContent = C.PRICE_LABEL));
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
  const errES = (e) => {
    const m = (e && e.message) || "";
    if (/Invalid login/i.test(m)) return "Correo, usuario o contraseña incorrectos.";
    if (/already registered|already exists/i.test(m)) return "Ya existe una cuenta con ese correo.";
    if (/Email not confirmed/i.test(m)) return "Confirma tu correo: te mandamos un enlace al registrarte.";
    if (/Password/i.test(m)) return "La contraseña debe tener al menos 8 caracteres.";
    return "Algo salió mal. Inténtalo de nuevo.";
  };

  // header state
  (async () => {
    const u = await getUser();
    $$('[data-auth="in"]').forEach(e => (e.hidden = !u));
    $$('[data-auth="out"]').forEach(e => (e.hidden = !!u));
  })();

  // ---------- cuenta ----------
  if (page === "cuenta") {
    const params = new URLSearchParams(location.search);
    const next = params.get("next") || "/panel.html";
    const tabs = $$(".tabs button");
    function show(t) {
      tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === t));
      $$("[data-pane]").forEach(p => (p.hidden = p.dataset.pane !== t));
    }
    tabs.forEach(b => b.addEventListener("click", () => show(b.dataset.tab)));
    if (params.get("modo") === "entrar") show("login");

    const userRe = /^[a-z0-9._]{3,20}$/;
    const userInput = $("#su-user"), userHint = $("#userHint");
    let userTimer;
    userInput.addEventListener("input", () => {
      userInput.value = userInput.value.toLowerCase().replace(/\s/g, "");
      clearTimeout(userTimer);
      const v = userInput.value;
      if (!userRe.test(v)) { userHint.textContent = "3 a 20 caracteres: letras, números, punto o guion bajo."; return; }
      if (!sb) return;
      userTimer = setTimeout(async () => {
        const { data } = await sb.rpc("username_available", { u: v });
        userHint.textContent = data ? `@${v} está disponible.` : `@${v} ya está en uso.`;
      }, 350);
    });

    $("#signupForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, m = $("#signupMsg"); clearMsg(m);
      const username = f.username.value.trim().toLowerCase();
      if (!userRe.test(username)) return msg(m, "Elige un nombre de usuario válido.");
      if (!f.email.value.includes("@")) return msg(m, "Escribe un correo válido.");
      if (f.password.value.length < 8) return msg(m, "La contraseña debe tener al menos 8 caracteres.");
      if (!f.terms.checked) return msg(m, "Necesitas aceptar los términos y el aviso de privacidad.");
      if (!sb) return notReady(m);
      const { data: free } = await sb.rpc("username_available", { u: username });
      if (!free) return msg(m, "Ese nombre de usuario ya está en uso.");
      const { data, error } = await sb.auth.signUp({
        email: f.email.value.trim(), password: f.password.value,
        options: { data: { username }, emailRedirectTo: location.origin + "/panel.html" }
      });
      if (error) return msg(m, errES(error));
      if (data.session) location.href = next;
      else msg(m, "Listo. Te mandamos un correo para confirmar tu cuenta.", "ok");
    });

    $("#loginForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, m = $("#loginMsg"); clearMsg(m);
      if (!sb) return notReady(m);
      const id = f.identifier.value.trim(), password = f.password.value;
      try {
        if (id.includes("@")) {
          const { error } = await sb.auth.signInWithPassword({ email: id, password });
          if (error) throw error;
        } else {
          const t = await fnCall("username-login", { username: id.toLowerCase(), password });
          const { error } = await sb.auth.setSession(t);
          if (error) throw error;
        }
        location.href = next;
      } catch (e) { msg(m, errES(e)); }
    });

    $("#forgot").addEventListener("click", async (ev) => {
      ev.preventDefault();
      const m = $("#loginMsg"), id = $("#li-id").value.trim();
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
      if (!user) { location.href = "/cuenta.html?next=/analisis.html"; return; }
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
        const { data, error } = await sb.from("orders").insert({ user_id: user.id, answers }).select().single();
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

    $("#toPay").addEventListener("click", async () => {
      if (sb && order) await sb.from("orders").update({ photos_consent_at: new Date().toISOString() }).eq("id", order.id);
      go(3);
    });

    $("#payBtn").addEventListener("click", async () => {
      const m = $("#payMsg"), b = $("#payBtn"); clearMsg(m);
      if (!sb || !order) return notReady(m);
      b.disabled = true; b.textContent = "Abriendo el pago…";
      try {
        const { url } = await fnCall("create-checkout", { order_id: order.id });
        location.href = url;
      } catch (e) {
        b.disabled = false; b.textContent = "Pagar con tarjeta u OXXO";
        msg(m, "No pudimos abrir el pago. Inténtalo de nuevo en un momento.");
      }
    });
  }

  // ---------- panel ----------
  if (page === "panel") {
    const LABEL = { borrador: ["Sin pagar", ""], pagado: ["En análisis", "paid"], listo: ["Listo", "ready"] };
    (async () => {
      if (!sb) { $("#orders").innerHTML = '<p class="hint" style="padding:18px 0">Estamos terminando de preparar tu cuenta.</p>'; return; }
      const user = await getUser();
      if (!user) { location.href = "/cuenta.html?modo=entrar&next=/panel.html"; return; }
      const { data: prof } = await sb.from("profiles").select("username").eq("id", user.id).single();
      $("#who").textContent = prof ? "@" + prof.username : user.email;

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
        row.innerHTML = `<div><b>Análisis Vultigo</b><div class="hint">${d}</div></div><div style="display:flex;gap:10px;align-items:center"><span class="status ${cls}">${txt}</span></div>`;
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
      catch (e) { msg(m, "No pudimos borrar tus fotos. Escríbenos a privacidad@vultigo.com."); }
    });
  }
})();
