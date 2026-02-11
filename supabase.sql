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

-- Make restaurant location optional
alter table public.restaurants
  alter column location drop not null;

alter table public.ratings
  add column if not exists interior int not null default 5 check (interior between 1 and 10);

-- Update rating constraints to 1..10
alter table public.ratings drop constraint if exists ratings_location_check;
alter table public.ratings drop constraint if exists ratings_service_check;
alter table public.ratings drop constraint if exists ratings_menu_check;
alter table public.ratings drop constraint if exists ratings_food_check;
alter table public.ratings drop constraint if exists ratings_alcohol_check;
alter table public.ratings drop constraint if exists ratings_prices_check;
alter table public.ratings drop constraint if exists ratings_interior_check;

alter table public.ratings add constraint ratings_location_check check (location between 1 and 10);
alter table public.ratings add constraint ratings_service_check check (service between 1 and 10);
alter table public.ratings add constraint ratings_menu_check check (menu between 1 and 10);
alter table public.ratings add constraint ratings_food_check check (food between 1 and 10);
alter table public.ratings add constraint ratings_alcohol_check check (alcohol between 1 and 10);
alter table public.ratings add constraint ratings_prices_check check (prices between 1 and 10);
alter table public.ratings add constraint ratings_interior_check check (interior between 1 and 10);

create table if not exists public.space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  unique (space_id, email)
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  unique (requester_id, recipient_id)
);

create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, friend_id)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_users_distinct check (user_a <> user_b),
  constraint friendships_pair_order check (user_a < user_b),
  constraint friendships_requested_by_participant check (requested_by = user_a or requested_by = user_b),
  unique (user_a, user_b)
);

create index if not exists friendships_user_a_idx on public.friendships(user_a);
create index if not exists friendships_user_b_idx on public.friendships(user_b);
create index if not exists friendships_status_idx on public.friendships(status);

-- Backfill from legacy tables (safe to re-run)
insert into public.friendships (user_a, user_b, requested_by, status)
select
  least(f.user_id, f.friend_id) as user_a,
  greatest(f.user_id, f.friend_id) as user_b,
  least(f.user_id, f.friend_id) as requested_by,
  'accepted' as status
from public.friends f
where exists (
  select 1
  from public.friends r
  where r.user_id = f.friend_id and r.friend_id = f.user_id
)
on conflict (user_a, user_b) do update set
  status = 'accepted',
  updated_at = now();

insert into public.friendships (user_a, user_b, requested_by, status)
select
  least(fr.requester_id, fr.recipient_id) as user_a,
  greatest(fr.requester_id, fr.recipient_id) as user_b,
  fr.requester_id as requested_by,
  'pending' as status
from public.friend_requests fr
where fr.status = 'pending'
on conflict (user_a, user_b) do nothing;

drop function if exists public.remove_friend_pair(uuid, uuid);
create or replace function public.remove_friend_pair(p_user_id uuid, p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if auth.uid() <> p_user_id and auth.uid() <> p_friend_id then
    raise exception 'Not allowed to remove this friend pair';
  end if;

  v_a := least(p_user_id, p_friend_id);
  v_b := greatest(p_user_id, p_friend_id);

  -- Keep migration-safe consistency with the new single-row friendship model.
  delete from public.friendships
  where user_a = v_a and user_b = v_b and status = 'accepted';

  delete from public.friends
  where (user_id = p_user_id and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = p_user_id);
end;
$$;

revoke all on function public.remove_friend_pair(uuid, uuid) from public;
grant execute on function public.remove_friend_pair(uuid, uuid) to authenticated;

drop function if exists public.send_friend_invite(uuid, uuid);
create or replace function public.send_friend_invite(p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
  v_existing public.friendships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if auth.uid() <> p_from then
    raise exception 'Not allowed';
  end if;
  if p_from = p_to then
    raise exception 'Cannot invite yourself';
  end if;

  v_a := least(p_from, p_to);
  v_b := greatest(p_from, p_to);

  select * into v_existing
  from public.friendships
  where user_a = v_a and user_b = v_b
  for update;

  if not found then
    insert into public.friendships (user_a, user_b, requested_by, status)
    values (v_a, v_b, p_from, 'pending');
    return;
  end if;

  if v_existing.status = 'accepted' then
    -- Migration compatibility: if old friends rows are already removed,
    -- treat accepted friendship row as stale and allow re-invite.
    if not exists (
      select 1
      from public.friends f1
      join public.friends f2
        on f2.user_id = f1.friend_id
       and f2.friend_id = f1.user_id
      where f1.user_id = v_a and f1.friend_id = v_b
    ) then
      update public.friendships
      set status = 'pending',
          requested_by = p_from,
          updated_at = now()
      where user_a = v_a and user_b = v_b;
    end if;
    return;
  end if;

  if v_existing.status = 'pending' and v_existing.requested_by = p_from then
    return;
  end if;

  if v_existing.status = 'pending' and v_existing.requested_by = p_to then
    raise exception 'Incoming invite exists';
  end if;
end;
$$;

drop function if exists public.accept_friend_invite(uuid, uuid);
create or replace function public.accept_friend_invite(p_to uuid, p_from uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if auth.uid() <> p_to then
    raise exception 'Not allowed';
  end if;
  if p_from = p_to then
    raise exception 'Invalid users';
  end if;

  v_a := least(p_from, p_to);
  v_b := greatest(p_from, p_to);

  update public.friendships
  set status = 'accepted',
      updated_at = now()
  where user_a = v_a
    and user_b = v_b
    and status = 'pending'
    and requested_by = p_from;
end;
$$;

drop function if exists public.decline_friend_invite(uuid, uuid);
create or replace function public.decline_friend_invite(p_to uuid, p_from uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if auth.uid() <> p_to then
    raise exception 'Not allowed';
  end if;

  v_a := least(p_from, p_to);
  v_b := greatest(p_from, p_to);

  delete from public.friendships
  where user_a = v_a
    and user_b = v_b
    and status = 'pending'
    and requested_by = p_from;
end;
$$;

drop function if exists public.cancel_friend_invite(uuid, uuid);
create or replace function public.cancel_friend_invite(p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if auth.uid() <> p_from then
    raise exception 'Not allowed';
  end if;

  v_a := least(p_from, p_to);
  v_b := greatest(p_from, p_to);

  delete from public.friendships
  where user_a = v_a
    and user_b = v_b
    and status = 'pending'
    and requested_by = p_from;
end;
$$;

drop function if exists public.remove_friendship(uuid, uuid);
create or replace function public.remove_friendship(p_user uuid, p_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if auth.uid() <> p_user and auth.uid() <> p_other then
    raise exception 'Not allowed';
  end if;

  v_a := least(p_user, p_other);
  v_b := greatest(p_user, p_other);

  delete from public.friendships
  where user_a = v_a and user_b = v_b and status = 'accepted';
end;
$$;

drop function if exists public.add_friend_to_space(uuid, uuid, uuid);
create or replace function public.add_friend_to_space(p_owner uuid, p_friend uuid, p_space uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if auth.uid() <> p_owner then
    raise exception 'Not allowed';
  end if;
  if p_owner = p_friend then
    raise exception 'Cannot add yourself as friend member';
  end if;

  if not exists (
    select 1 from public.spaces s
    where s.id = p_space and s.created_by = p_owner
  ) then
    raise exception 'Space owner mismatch';
  end if;

  v_a := least(p_owner, p_friend);
  v_b := greatest(p_owner, p_friend);

  if not exists (
    select 1
    from public.friendships f
    where f.user_a = v_a and f.user_b = v_b and f.status = 'accepted'
  )
  and not exists (
    select 1
    from public.friends f1
    join public.friends f2
      on f2.user_id = f1.friend_id
     and f2.friend_id = f1.user_id
    where f1.user_id = v_a and f1.friend_id = v_b
  ) then
    raise exception 'Only friends can be added to space';
  end if;

  insert into public.space_members(space_id, user_id, role)
  values (p_space, p_friend, 'member')
  on conflict (space_id, user_id) do nothing;
end;
$$;

create or replace function public.is_space_owner(p_space uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.spaces s
    where s.id = p_space and s.created_by = p_user
  );
$$;

drop function if exists public.list_my_spaces();
create or replace function public.list_my_spaces()
returns setof public.spaces
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.spaces s
  join public.space_members sm on sm.space_id = s.id
  where sm.user_id = auth.uid()
  order by s.created_at desc;
$$;

revoke all on function public.send_friend_invite(uuid, uuid) from public;
revoke all on function public.accept_friend_invite(uuid, uuid) from public;
revoke all on function public.decline_friend_invite(uuid, uuid) from public;
revoke all on function public.cancel_friend_invite(uuid, uuid) from public;
revoke all on function public.remove_friendship(uuid, uuid) from public;
revoke all on function public.add_friend_to_space(uuid, uuid, uuid) from public;
revoke all on function public.is_space_owner(uuid, uuid) from public;
revoke all on function public.list_my_spaces() from public;

grant execute on function public.send_friend_invite(uuid, uuid) to authenticated;
grant execute on function public.accept_friend_invite(uuid, uuid) to authenticated;
grant execute on function public.decline_friend_invite(uuid, uuid) to authenticated;
grant execute on function public.cancel_friend_invite(uuid, uuid) to authenticated;
grant execute on function public.remove_friendship(uuid, uuid) to authenticated;
grant execute on function public.add_friend_to_space(uuid, uuid, uuid) to authenticated;
grant execute on function public.is_space_owner(uuid, uuid) to authenticated;
grant execute on function public.list_my_spaces() to authenticated;

-- Cleanup inconsistent one-way friend rows (safe to re-run)
delete from public.friends f
where not exists (
  select 1
  from public.friends r
  where r.user_id = f.friend_id and r.friend_id = f.user_id
);

-- RLS enable (safe to re-run)
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.restaurants enable row level security;
alter table public.space_invites enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friends enable row level security;
alter table public.friendships enable row level security;

-- Drop old policies if they exist (to avoid duplicates)
drop policy if exists "spaces_read_members" on public.spaces;
drop policy if exists "spaces_insert" on public.spaces;
drop policy if exists "spaces_update_owner" on public.spaces;
drop policy if exists "spaces_delete_owner" on public.spaces;

drop policy if exists "space_members_read" on public.space_members;
drop policy if exists "space_members_insert_owner" on public.space_members;
drop policy if exists "space_members_update_owner" on public.space_members;
drop policy if exists "space_members_delete_owner" on public.space_members;

drop policy if exists "restaurants_read" on public.restaurants;
drop policy if exists "restaurants_insert" on public.restaurants;
drop policy if exists "restaurants_update_own" on public.restaurants;
drop policy if exists "restaurants_delete_own" on public.restaurants;
drop policy if exists "ratings_read" on public.ratings;
drop policy if exists "ratings_insert_own" on public.ratings;
drop policy if exists "ratings_update_own" on public.ratings;
drop policy if exists "invites_read_owner" on public.space_invites;
drop policy if exists "invites_insert_owner" on public.space_invites;
drop policy if exists "invites_delete_owner" on public.space_invites;
drop policy if exists "friend_requests_read" on public.friend_requests;
drop policy if exists "friend_requests_insert" on public.friend_requests;
drop policy if exists "friend_requests_update" on public.friend_requests;
drop policy if exists "friend_requests_update_requester" on public.friend_requests;
drop policy if exists "friend_requests_update_recipient" on public.friend_requests;
drop policy if exists "friend_requests_delete" on public.friend_requests;
drop policy if exists "friends_read" on public.friends;
drop policy if exists "friends_delete" on public.friends;
drop policy if exists "friends_insert" on public.friends;
drop policy if exists "friendships_read_participants" on public.friendships;

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

create policy "spaces_delete_owner" on public.spaces
  for delete using (auth.uid() = created_by);

-- Space members policies
create policy "space_members_read" on public.space_members
  for select using (
    auth.role() = 'authenticated'
    and (
      user_id = auth.uid()
      or public.is_space_owner(space_id, auth.uid())
    )
  );

create policy "space_members_insert_owner" on public.space_members
  for insert with check (
    auth.uid() = user_id
    or public.is_space_owner(space_id, auth.uid())
  );

create policy "space_members_update_owner" on public.space_members
  for update using (public.is_space_owner(space_id, auth.uid()))
  with check (public.is_space_owner(space_id, auth.uid()));

create policy "space_members_delete_owner" on public.space_members
  for delete using (
    public.is_space_owner(space_id, auth.uid())
    or (auth.uid() = user_id and role = 'member')
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

-- Ratings read limited to space members
create policy "ratings_read" on public.ratings
  for select using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.restaurants r
      join public.space_members sm on sm.space_id = r.space_id
      where r.id = ratings.restaurant_id and sm.user_id = auth.uid()
    )
  );

create policy "ratings_insert_own" on public.ratings
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.restaurants r
      join public.space_members sm on sm.space_id = r.space_id
      where r.id = ratings.restaurant_id and sm.user_id = auth.uid()
    )
  );

create policy "ratings_update_own" on public.ratings
  for update using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.restaurants r
      join public.space_members sm on sm.space_id = r.space_id
      where r.id = ratings.restaurant_id and sm.user_id = auth.uid()
    )
  );

-- Space invites (owners only for now)
create policy "invites_read_owner" on public.space_invites
  for select using (
    exists (
      select 1 from public.spaces s
      where s.id = space_invites.space_id and s.created_by = auth.uid()
    )
  );

create policy "invites_insert_owner" on public.space_invites
  for insert with check (
    exists (
      select 1 from public.spaces s
      where s.id = space_id and s.created_by = auth.uid()
    )
  );

create policy "invites_delete_owner" on public.space_invites
  for delete using (
    exists (
      select 1 from public.spaces s
      where s.id = space_invites.space_id and s.created_by = auth.uid()
    )
  );

-- Friend requests
create policy "friend_requests_read" on public.friend_requests
  for select using (auth.uid() = requester_id or auth.uid() = recipient_id);

create policy "friend_requests_insert" on public.friend_requests
  for insert with check (auth.uid() = requester_id and requester_id <> recipient_id);

-- Allow recipient to accept/decline
create policy "friend_requests_update_recipient" on public.friend_requests
  for update using (auth.uid() = recipient_id);

-- Allow requester to re-send if previously declined
create policy "friend_requests_update_requester" on public.friend_requests
  for update using (auth.uid() = requester_id and status = 'declined');

create policy "friend_requests_delete" on public.friend_requests
  for delete using (auth.uid() = recipient_id or auth.uid() = requester_id);

-- Friends
create policy "friends_read" on public.friends
  for select using (auth.uid() = user_id);

create policy "friends_insert" on public.friends
  for insert with check (auth.uid() = user_id or auth.uid() = friend_id);

create policy "friends_delete" on public.friends
  for delete using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "friendships_read_participants" on public.friendships
  for select using (auth.uid() = user_a or auth.uid() = user_b);
