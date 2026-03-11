create extension if not exists pgcrypto;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  venue_name text not null default 'Teatro di Carbonia',
  event_start timestamptz not null,
  is_active boolean not null default true,
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists venue_sections (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  sort_order integer not null default 0
);

create table if not exists venue_seats (
  id uuid primary key default gen_random_uuid(),
  section_code text not null,
  row_label text not null,
  seat_number integer not null,
  seat_label text not null,
  x_coord numeric(10,2),
  y_coord numeric(10,2),
  seat_radius integer not null default 10,
  physical_block text,
  is_active boolean not null default true,
  unique(section_code, row_label, seat_number)
);

create table if not exists event_seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  venue_seat_id uuid not null references venue_seats(id) on delete restrict,
  status text not null default 'available' check (status in ('available','locked','reserved','sold','disabled','checked_in')),
  price_cents integer not null default 0,
  lock_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, venue_seat_id)
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  order_code text unique not null,
  session_token text,
  status text not null default 'pending' check (status in ('pending','payment_pending','paid','cancelled','expired','refunded')),
  total_cents integer not null default 0,
  currency text not null default 'EUR',
  stripe_session_id text,
  payment_url text,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists seat_locks (
  id uuid primary key default gen_random_uuid(),
  event_seat_id uuid not null unique references event_seats(id) on delete cascade,
  session_token text not null,
  order_id uuid references orders(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  event_seat_id uuid not null references event_seats(id) on delete restrict,
  ticket_code text unique not null,
  qr_payload text unique not null,
  unit_price_cents integer not null,
  status text not null default 'valid' check (status in ('valid','used','cancelled','refunded')),
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique(order_id, event_seat_id)
);

create table if not exists checkin_logs (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by text,
  method text not null default 'qr' check (method in ('qr','manual')),
  notes text
);

create index if not exists idx_event_seats_event_status on event_seats(event_id, status);
create index if not exists idx_seat_locks_exp on seat_locks(expires_at);
create index if not exists idx_orders_status on orders(status);

create or replace function release_expired_seat_locks()
returns integer
language plpgsql
as $$
declare
  released_count integer;
begin
  update event_seats es
  set status = 'available', lock_expires_at = null, updated_at = now()
  where es.status = 'locked'
    and es.lock_expires_at is not null
    and es.lock_expires_at < now();

  delete from seat_locks where expires_at < now();
  GET DIAGNOSTICS released_count = ROW_COUNT;
  return released_count;
end;
$$;

create or replace function lock_event_seats(
  p_event_id uuid,
  p_event_seat_ids uuid[],
  p_session_token text,
  p_lock_minutes integer default 10
)
returns table(success boolean, message text)
language plpgsql
as $$
declare
  seat_id uuid;
  seat_status text;
  v_exp timestamptz := now() + make_interval(mins => p_lock_minutes);
begin
  perform release_expired_seat_locks();

  foreach seat_id in array p_event_seat_ids loop
    select status into seat_status from event_seats where id = seat_id and event_id = p_event_id for update;
    if seat_status is null then
      return query select false, 'Seat not found';
      return;
    end if;
    if seat_status <> 'available' then
      return query select false, 'One or more seats are not available';
      return;
    end if;
  end loop;

  update event_seats
  set status = 'locked', lock_expires_at = v_exp, updated_at = now()
  where id = any(p_event_seat_ids) and event_id = p_event_id;

  insert into seat_locks (event_seat_id, session_token, expires_at)
  select unnest(p_event_seat_ids), p_session_token, v_exp
  on conflict (event_seat_id) do update
  set session_token = excluded.session_token,
      expires_at = excluded.expires_at;

  return query select true, 'Seats locked';
end;
$$;
