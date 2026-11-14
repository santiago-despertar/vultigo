-- Affiliate program, built in-house (no third-party SaaS).
create table if not exists public.afiliados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[a-z0-9_-]{3,24}$'),
  nombre text check (char_length(nombre) <= 80),
  redes text check (char_length(redes) <= 300),
  pago_metodo text check (pago_metodo in ('paypal','transferencia','otro')),
  pago_datos text check (char_length(pago_datos) <= 200),
  comision_pct numeric not null default 50,
  descuento_pct numeric not null default 0,
  activo boolean not null default true,
  clics integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.afiliados enable row level security;
create policy "own affiliate read" on public.afiliados for select using (auth.uid() = user_id);

create table if not exists public.comisiones (
  id uuid primary key default gen_random_uuid(),
  afiliado_id uuid not null references public.afiliados(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  concepto text not null default 'venta',
  venta_mxn integer not null,
  comision_mxn integer not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','pagada','cancelada')),
  disponible_at timestamptz not null default (now() + interval '30 days'),
  pagada_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, concepto)
);
alter table public.comisiones enable row level security;
create policy "own commissions read" on public.comisiones for select
  using (exists (select 1 from public.afiliados a where a.id = afiliado_id and a.user_id = auth.uid()));

alter table public.orders add column if not exists afiliado_id uuid references public.afiliados(id) on delete set null;

create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;

-- Atomic click counter used by the edge function.
create or replace function public.sumar_clic(c text) returns void language sql security definer set search_path = public as
$$ update public.afiliados set clics = clics + 1 where codigo = c and activo $$;
revoke all on function public.sumar_clic(text) from public, anon, authenticated;
