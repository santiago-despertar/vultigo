-- Resalta database. Run once in Supabase > SQL Editor.

-- Profiles: one per user (email or Google sign-in, no username)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Orders: borrador (draft) -> pagado (paid, set only by the Stripe webhook) -> listo (report delivered)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'borrador' check (status in ('borrador','pagado','listo','reembolsado')),
  tier text not null default 'soft' check (tier in ('soft','hard')),
  answers jsonb not null default '{}',
  photos_consent_at timestamptz,
  stripe_session_id text,
  amount_mxn integer,
  paid_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;
create policy "own orders read" on public.orders for select using (auth.uid() = user_id);
create policy "own orders create" on public.orders for insert with check (auth.uid() = user_id and status = 'borrador');
create policy "own draft update" on public.orders for update
  using (auth.uid() = user_id and status = 'borrador')
  with check (auth.uid() = user_id and status = 'borrador');
-- Customers can only change answers and consent; payment fields are written by the webhook (service role)
revoke update on public.orders from authenticated;
-- measurements of the front photo, taken in the browser while the order is a draft
alter table public.orders add column if not exists medidas jsonb;
grant update (answers, photos_consent_at, medidas) on public.orders to authenticated;

-- Reports: written by Resalta (service role), readable by the owner
create table if not exists public.reports (
  order_id uuid primary key references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy "own reports read" on public.reports for select using (auth.uid() = user_id);

-- Private photo bucket: each user can only touch files under their own folder  <user_id>/<order_id>/<slot>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "own photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos update" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos read" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Free rating leads (email + score only, never the photo)
create table if not exists public.leads (
  id bigint generated always as identity primary key,
  email text not null check (position('@' in email) > 1),
  score integer,
  metrics jsonb,
  source text,
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
create policy "anyone can leave their email" on public.leads for insert to anon, authenticated with check (true);

-- Monthly follow-up plan (one rescan per billing period)
create table if not exists public.suscripciones (
  user_id uuid primary key references auth.users on delete cascade,
  stripe_customer text,
  stripe_subscription text unique,
  estado text,
  periodo_inicio timestamptz,
  periodo_fin timestamptz,
  cancela boolean default false,
  creado timestamptz default now(),
  actualizado timestamptz default now()
);
alter table public.suscripciones enable row level security;
create policy "own subscription read" on public.suscripciones for select using (auth.uid() = user_id);
alter table public.orders add column if not exists origen text;

-- Chat about the customer's results (written only by the chat function)
create table if not exists public.chat (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  order_id uuid not null references public.orders on delete cascade,
  rol text not null,
  texto text not null,
  creado timestamptz default now()
);
create index if not exists chat_orden on public.chat (order_id, creado);
create index if not exists chat_usuario on public.chat (user_id, creado);
alter table public.chat enable row level security;
create policy "own chat read" on public.chat for select using (auth.uid() = user_id);

-- Sign-up keeps the email as a lead as soon as it is typed, before the password.
alter table public.leads add column if not exists nombre text check (char_length(nombre) <= 60);

-- Free rating: when the result email went out (empty = still to send)
alter table public.leads add column if not exists enviado_at timestamptz;
