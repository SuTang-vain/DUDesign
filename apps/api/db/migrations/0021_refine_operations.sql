create table if not exists refine_operations (
  request_id text primary key,
  kind text not null check (kind in ('prompt', 'annotations')),
  prompt text not null,
  variation_id text not null references design_variations(id) on delete cascade,
  job_id text not null references design_jobs(id) on delete cascade,
  session_id text not null references design_sessions(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  base_artifact_id text not null references artifacts(id),
  base_preview_url text,
  runtime_child_session_id text,
  runtime_agent_job_id text,
  status text not null check (status in ('starting', 'running', 'cancelling', 'cancelled', 'completed', 'failed')),
  cancel_requested boolean not null default false,
  cancel_reason text,
  runtime_cancel_result jsonb,
  cancellation_recorded boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz
);

create index if not exists refine_operations_variation_created_idx
  on refine_operations (variation_id, created_at desc, request_id);

create index if not exists refine_operations_user_created_idx
  on refine_operations (user_id, created_at desc, request_id);

create unique index if not exists refine_operations_active_variation_idx
  on refine_operations (variation_id)
  where status in ('starting', 'running', 'cancelling');
