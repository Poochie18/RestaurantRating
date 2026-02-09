-- Supabase schema additions and RLS updates for Spaces

create extension if not exists "pgcrypto";

-- New tables only
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz default now(),
  unique (space_id, user_id)
);

-- Existing tables: adjust restaurants to support spaces
alter table public.restaurants
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

-- RLS enable (safe to re-run)
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.restaurants enable row level security;

-- Drop old policies if they exist (to avoid duplicates)
drop policy if exists "spaces_read_members" on public.spaces;
drop policy if exists "spaces_insert" on public.spaces;
drop policy if exists "spaces_update_owner" on public.spaces;

drop policy if exists "space_members_read" on public.space_members;
drop policy if exists "space_members_insert_owner" on public.space_members;
drop policy if exists "space_members_delete_owner" on public.space_members;

drop policy if exists "restaurants_read" on public.restaurants;
drop policy if exists "restaurants_insert" on public.restaurants;
drop policy if exists "restaurants_update_own" on public.restaurants;
drop policy if exists "restaurants_delete_own" on public.restaurants;

-- Spaces policies
create policy "spaces_read_members" on public.spaces
  for select using (
    auth.role() = 'authenticated'
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.space_members sm
        where sm.space_id = id and sm.user_id = auth.uid()
      )
    )
  );

create policy "spaces_insert" on public.spaces
  for insert with check (auth.uid() = created_by);

create policy "spaces_update_owner" on public.spaces
  for update using (auth.uid() = created_by);

-- Space members policies
create policy "space_members_read" on public.space_members
  for select using (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "space_members_insert_owner" on public.space_members
  for insert with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.spaces s
      where s.id = space_id and s.created_by = auth.uid()
    )
  );

create policy "space_members_delete_owner" on public.space_members
  for delete using (
    exists (
      select 1 from public.spaces s
      where s.id = space_id and s.created_by = auth.uid()
    )
  );

-- Restaurants policies updated for spaces
create policy "restaurants_read" on public.restaurants
  for select using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.space_members sm
      where sm.space_id = restaurants.space_id and sm.user_id = auth.uid()
    )
  );

create policy "restaurants_insert" on public.restaurants
  for insert with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.space_members sm
      where sm.space_id = space_id and sm.user_id = auth.uid()
    )
  );

create policy "restaurants_update_own" on public.restaurants
  for update using (auth.uid() = created_by);

create policy "restaurants_delete_own" on public.restaurants
  for delete using (auth.uid() = created_by);
