-- Vultigo database. Run once in Supabase > SQL Editor.

-- Profiles: one per user, holds the public username
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._]{3,20}$'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);

-- Create the profile automatically from the username given at sign-up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(new.raw_user_meta_data->>'username'));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Username availability check (returns only true/false)
create or replace function public.username_available(u text) returns boolean
language sql security definer set search_path = public stable as $$
  select lower(u) ~ '^[a-z0-9._]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(u));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- Orders: borrador (draft) -> pagado (paid, set only by the Stripe webhook) -> listo (report delivered)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'borrador' check (status in ('borrador','pagado','listo','reembolsado')),
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
grant update (answers, photos_consent_at) on public.orders to authenticated;

-- Reports: written by Vultigo (service role), readable by the owner
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
  source text,
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
create policy "anyone can leave their email" on public.leads for insert to anon, authenticated with check (true);
