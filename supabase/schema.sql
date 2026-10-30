-- Run once in a new Supabase project's SQL Editor. No private keys go in the app.
begin;

create table if not exists public.learning_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 250),
  sequence bigint generated always as identity,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['id', 'schedulerVersion', 'action', 'at', 'cardId', 'deckId', 'mode']
    and payload ->> 'id' = id
    and payload ->> 'schedulerVersion' = '1'
    and payload ->> 'action' in ('introduce', 'again', 'hard', 'good', 'easy', 'import')
    and jsonb_typeof(payload -> 'at') = 'number'
    and jsonb_typeof(payload -> 'cardId') = 'string'
    and octet_length(payload::text) < 4096
  ),
  received_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists learning_events_sync on public.learning_events(user_id, sequence);
alter table public.learning_events enable row level security;
create policy "Read own events" on public.learning_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "Append own events" on public.learning_events for insert to authenticated with check ((select auth.uid()) = user_id);
-- Events cannot be edited or overwritten, including by another signed-in client.
revoke all on public.learning_events from anon, authenticated;
grant select, insert on public.learning_events to authenticated;
grant usage on sequence public.learning_events_sequence_seq to authenticated;

create table if not exists public.deck_selections (
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null check (length(deck_id) between 1 and 250),
  selected boolean not null,
  updated_at bigint not null,
  primary key (user_id, deck_id)
);
alter table public.deck_selections enable row level security;
create policy "Read own deck choices" on public.deck_selections for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own deck choices" on public.deck_selections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own deck choices" on public.deck_selections for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.deck_selections from anon, authenticated;
grant select, insert, update on public.deck_selections to authenticated;

create or replace function public.save_deck_selections(owner_id uuid, changes jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> owner_id then
    raise exception 'Not authorized';
  end if;
  insert into public.deck_selections(user_id, deck_id, selected, updated_at)
  select owner_id, x.deck_id, x.selected, x.updated_at
  from jsonb_to_recordset(changes) as x(deck_id text, selected boolean, updated_at bigint)
  on conflict (user_id, deck_id) do update
  set selected = excluded.selected, updated_at = excluded.updated_at
  where excluded.updated_at > public.deck_selections.updated_at
    or (excluded.updated_at = public.deck_selections.updated_at and not excluded.selected);
end;
$$;
revoke all on function public.save_deck_selections(uuid, jsonb) from public, anon;
grant execute on function public.save_deck_selections(uuid, jsonb) to authenticated;

commit;
