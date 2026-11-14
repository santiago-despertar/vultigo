-- Body check-ins for subscribers: the answers and photos they send each month, and the
-- nutrition and training plan written for them (by the plan-fisico edge function).
create table if not exists public.fisico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  datos jsonb not null,
  fotos text[] not null default '{}',
  peso_kg numeric(5,1) check (peso_kg between 30 and 300),
  estado text not null default 'nuevo' check (estado in ('nuevo','generando','listo','error')),
  plan jsonb,
  plan_at timestamptz
);
create index if not exists fisico_user_idx on public.fisico (user_id, created_at desc);
alter table public.fisico enable row level security;
drop policy if exists "fisico propio leer" on public.fisico;
create policy "fisico propio leer" on public.fisico for select to authenticated using (auth.uid() = user_id);
drop policy if exists "fisico propio crear" on public.fisico;
create policy "fisico propio crear" on public.fisico for insert to authenticated
  with check (auth.uid() = user_id and estado = 'nuevo' and plan is null and plan_at is null);
drop policy if exists "fisico propio borrar" on public.fisico;
create policy "fisico propio borrar" on public.fisico for delete to authenticated using (auth.uid() = user_id);
grant select, insert, delete on public.fisico to authenticated;
