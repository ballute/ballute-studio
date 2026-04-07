create table if not exists public.generation_batches (
  batch_id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  mode text not null check (mode in ('dig', 'fusion', 'refrun')),
  status text not null check (status in ('queued', 'active', 'completed', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create unique index if not exists generation_batches_one_open_batch_per_user_idx
  on public.generation_batches (user_id)
  where status in ('queued', 'active');

create index if not exists generation_batches_status_created_at_idx
  on public.generation_batches (status, created_at);

create index if not exists generation_batches_updated_at_idx
  on public.generation_batches (updated_at);

create or replace function public.reserve_generation_slot(
  p_user_id uuid,
  p_batch_id text,
  p_mode text,
  p_max_active integer default 5,
  p_stale_after_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_stale_before timestamptz :=
    v_now - make_interval(mins => greatest(p_stale_after_minutes, 1));
  v_max_active integer := greatest(p_max_active, 1);
  v_existing record;
  v_other_open_batch_id text;
  v_other_open_status text;
  v_active_count integer;
  v_waiting_ahead integer;
begin
  if coalesce(trim(p_batch_id), '') = '' then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_batch',
      'message', 'batchId가 필요합니다.'
    );
  end if;

  if p_mode not in ('dig', 'fusion', 'refrun') then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_mode',
      'message', 'mode가 올바르지 않습니다.'
    );
  end if;

  perform pg_advisory_xact_lock(4172302);

  update public.generation_batches
     set status = 'canceled',
         updated_at = v_now,
         finished_at = coalesce(finished_at, v_now)
   where status in ('queued', 'active')
     and updated_at < v_stale_before;

  select batch_id, status
    into v_other_open_batch_id, v_other_open_status
    from public.generation_batches
   where user_id = p_user_id
     and status in ('queued', 'active')
     and batch_id <> p_batch_id
   order by created_at asc
   limit 1;

  if v_other_open_batch_id is not null then
    return jsonb_build_object(
      'success', false,
      'code', 'user_busy',
      'message', '이미 다른 생성 작업이 진행 또는 대기 중입니다. 현재 배치가 끝난 뒤 다시 시도해 주세요.'
    );
  end if;

  insert into public.generation_batches (
    batch_id,
    user_id,
    mode,
    status,
    created_at,
    updated_at
  )
  values (
    p_batch_id,
    p_user_id,
    p_mode,
    'queued',
    v_now,
    v_now
  )
  on conflict (batch_id) do update
    set mode = excluded.mode,
        updated_at = v_now
  returning *
  into v_existing;

  if v_existing.user_id <> p_user_id then
    return jsonb_build_object(
      'success', false,
      'code', 'batch_conflict',
      'message', '이미 사용 중인 batchId입니다.'
    );
  end if;

  if v_existing.status = 'active' then
    update public.generation_batches
       set updated_at = v_now
     where batch_id = p_batch_id;

    select count(*)
      into v_active_count
      from public.generation_batches
     where status = 'active';

    return jsonb_build_object(
      'success', true,
      'status', 'active',
      'queue_position', 0,
      'active_count', v_active_count,
      'max_active', v_max_active
    );
  end if;

  select count(*)
    into v_active_count
    from public.generation_batches
   where status = 'active';

  select count(*)
    into v_waiting_ahead
    from public.generation_batches
   where status = 'queued'
     and created_at < v_existing.created_at;

  if v_active_count < v_max_active and v_waiting_ahead = 0 then
    update public.generation_batches
       set status = 'active',
           started_at = coalesce(started_at, v_now),
           updated_at = v_now,
           finished_at = null
     where batch_id = p_batch_id;

    select count(*)
      into v_active_count
      from public.generation_batches
     where status = 'active';

    return jsonb_build_object(
      'success', true,
      'status', 'active',
      'queue_position', 0,
      'active_count', v_active_count,
      'max_active', v_max_active
    );
  end if;

  update public.generation_batches
     set status = 'queued',
         updated_at = v_now
   where batch_id = p_batch_id;

  select count(*)
    into v_waiting_ahead
    from public.generation_batches
   where status = 'queued'
     and created_at < v_existing.created_at;

  return jsonb_build_object(
    'success', true,
    'status', 'queued',
    'queue_position', v_waiting_ahead + 1,
    'active_count', v_active_count,
    'max_active', v_max_active,
    'message', '현재 작업량이 많아 대기열에서 자동으로 순서를 기다리는 중입니다.'
  );
end;
$$;

create or replace function public.release_generation_slot(
  p_user_id uuid,
  p_batch_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_batch_id), '') = '' then
    return jsonb_build_object('success', true);
  end if;

  perform pg_advisory_xact_lock(4172302);

  update public.generation_batches
     set status = 'completed',
         updated_at = now(),
         finished_at = now()
   where batch_id = p_batch_id
     and user_id = p_user_id
     and status in ('queued', 'active');

  return jsonb_build_object('success', true);
end;
$$;
