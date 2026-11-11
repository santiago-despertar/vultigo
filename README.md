# vultigo.com

Static site (GitHub Pages) + Supabase (accounts, photos, orders, reports) + Stripe (payments).

## Pages
- `/` landing · `/cuenta.html` sign up and log in (email or Google) · `/analisis.html` questionnaire, 6 photos, consent, payment · `/panel.html` orders, report, delete photos · `/gracias.html` after payment · `/privacidad.html` · `/terminos.html`
- Edit content in `src/`, then run `python3 build.py` to rebuild the root HTML files.

## Setup, once
1. **Supabase**: new project → SQL Editor → run `supabase/schema.sql`.
   Auth → URL configuration: Site URL `https://vultigo.com`, add `https://vultigo.com/*` to redirect URLs.
2. **Stripe**: create the product "Análisis Vultigo", one-time price in MXN. Enable OXXO in Payment methods.
3. **Edge functions** (Supabase CLI):
   ```
   supabase functions deploy create-checkout
   supabase functions deploy delete-photos
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_PRICE_ID=price_... STRIPE_WEBHOOK_SECRET=whsec_... SITE_URL=https://vultigo.com
   ```
4. **Stripe webhook**: endpoint `https://<project>.supabase.co/functions/v1/stripe-webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
5. **Site config**: put the Supabase URL and anon key in `assets/js/config.js`.
6. **DNS (Porkbun)**: A records for `@` → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153; CNAME `www` → `<github-owner>.github.io`. Then in GitHub Pages settings set the custom domain `vultigo.com` and turn on HTTPS.

## Order flow
`borrador` (photos uploaded) → `pagado` (set by the Stripe webhook) → `listo` (report row inserted in `reports`, set status and `delivered_at`).

Report JSON shape (`reports.data`):
```json
{"resumen":"...","puntaje":7.8,
 "medidas":[{"nombre":"Ángulo mandibular","valor":"124°","ideal":"115–125°","nota":"..."}],
 "plan":[{"titulo":"Rutina de piel","prioridad":"alta","detalle":"..."}]}
```

## Google sign-in
Supabase > Authentication > Providers > Google: paste a Google Cloud OAuth client ID and secret (Web application, authorized redirect URI = https://<project>.supabase.co/auth/v1/callback). Authentication > URL Configuration: Site URL https://vultigo.com, redirect URLs https://vultigo.com/**.
