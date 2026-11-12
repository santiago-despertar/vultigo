// Resalta public configuration. These values are safe to publish (publishable keys only).
// Never put the Stripe secret key or the Supabase service_role key here.
window.RESALTA = {
  SUPABASE_URL: "",        // e.g. https://xxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: "",   // Supabase "anon public" key
  PRICE_LABEL: "$1,499"    // Shown on the site. The real charge comes from the Stripe price.
};
