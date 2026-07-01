create table if not exists design_events (
  id bigserial primary key,
  job_id text not null references design_jobs(id) on delete cascade,
  session_id text references design_sessions(id),
  variation_id text references design_variations(id),
  type text not null,
  schema_version text not null,
  payload jsonb not null default '{}'::jsonb,
  event jsonb not null,
  created_at timestamptz not null
);

create index if not exists design_events_job_created_idx
  on design_events (job_id, created_at, id);

create index if not exists design_events_variation_created_idx
  on design_events (variation_id, created_at, id);
