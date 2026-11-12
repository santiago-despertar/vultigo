// Resalta public configuration. These values are safe to publish (publishable keys only).
// Never put the Stripe secret key or the Supabase service_role key here.
window.RESALTA = {
  SUPABASE_URL: "https://jxluabbugwdonqchbaxm.supabase.co",        // e.g. https://xxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: "sb_publishable_WPce-iugGd2zyglAsGfnLQ_nR-JUXYI",   // Supabase "anon public" key
  // Shown on the site. The real charge comes from the Stripe prices.
  PRICES: { soft: "$1,499", hard: "$2,999" },
  PLAN_NAMES: { soft: "Plan Esencial", hard: "Plan Completo" }
};
