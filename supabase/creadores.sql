-- Applications from the creators program page (resalta.co/creadores).
-- Anyone can apply; only admins can read or update them.
create table if not exists public.creadores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null check (char_length(nombre) between 1 and 80),
  whatsapp text not null check (char_length(whatsapp) between 6 and 30),
  email text not null check (char_length(email) between 5 and 120),
  pais text not null check (char_length(pais) between 1 and 80),
  instagram text check (char_length(instagram) <= 80),
  tiktok text check (char_length(tiktok) <= 80),
  moneda text check (char_length(moneda) <= 3),
  ref text check (char_length(ref) <= 24),
  estado text not null default 'nueva' check (estado in ('nueva','contactada','aceptada','rechazada')),
  notas text
);
alter table public.creadores enable row level security;
drop policy if exists "creadores aplicar" on public.creadores;
create policy "creadores aplicar" on public.creadores for insert to anon, authenticated
  with check (estado = 'nueva' and notas is null);
drop policy if exists "creadores admin" on public.creadores;
create policy "creadores admin" on public.creadores for all to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
grant insert on public.creadores to anon, authenticated;
grant select, update, delete on public.creadores to authenticated;
