-- ENERGY BATTLE 統計用テーブル
-- Supabase の SQL Editor にそのまま貼り付けて実行してください。

create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  player_id text not null,
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard', 'oni')),
  result text not null check (result in ('start', 'win', 'loss')),
  created_at timestamptz not null default now()
);

create index if not exists game_events_difficulty_idx
  on public.game_events (difficulty);

create index if not exists game_events_player_idx
  on public.game_events (player_id, difficulty);

alter table public.game_events enable row level security;

-- 匿名ユーザーが統計イベントを書き込めるようにする
-- 読み取りは集計用RPC経由だけにします。
drop policy if exists game_events_insert_anon on public.game_events;
create policy game_events_insert_anon
on public.game_events
for insert
to anon
with check (true);

create or replace function public.get_game_stats()
returns table (
  difficulty text,
  players bigint,
  wins bigint,
  losses bigint
)
language sql
security definer
set search_path = public
as $$
  with diffs(difficulty) as (
    values ('easy'), ('normal'), ('hard'), ('oni')
  ),
  players as (
    select
      ge.difficulty,
      count(distinct ge.player_id) as players
    from public.game_events ge
    where ge.result = 'start'
    group by ge.difficulty
  ),
  results as (
    select
      ge.difficulty,
      count(*) filter (where ge.result = 'win') as wins,
      count(*) filter (where ge.result = 'loss') as losses
    from public.game_events ge
    group by ge.difficulty
  )
  select
    d.difficulty,
    coalesce(p.players, 0)::bigint,
    coalesce(r.wins, 0)::bigint,
    coalesce(r.losses, 0)::bigint
  from diffs d
  left join players p using (difficulty)
  left join results r using (difficulty)
  order by case d.difficulty
    when 'easy' then 1
    when 'normal' then 2
    when 'hard' then 3
    when 'oni' then 4
  end;
$$;

grant execute on function public.get_game_stats() to anon;
