-- DUDesign Application Service baseline schema.
-- SQL-first draft for the future PostgreSQL repository implementation.

create table if not exists users (
  id text primary key,
  email text not null unique,
  name text,
  avatar_url text,
  status text not null check (status in ('active', 'disabled')),
  memory_namespace text not null unique,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists users_email_idx on users (email);
create index if not exists users_memory_namespace_idx on users (memory_namespace);

create table if not exists workspaces (
  id text primary key,
  owner_id text not null references users(id),
  team_id text,
  name text not null,
  mode text not null check (mode in ('hosted')),
  visibility text not null check (visibility in ('private', 'team', 'public')),
  storage_key text not null unique,
  status text not null check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists workspaces_owner_id_idx on workspaces (owner_id);
create index if not exists workspaces_team_id_idx on workspaces (team_id);

create table if not exists workspace_members (
  workspace_id text not null references workspaces(id),
  user_id text not null references users(id),
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  status text not null check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, user_id)
);

create table if not exists design_sessions (
  id text primary key,
  user_id text not null references users(id),
  workspace_id text not null references workspaces(id),
  title text not null,
  mode text not null check (mode in ('new_html', 'from_existing_html')),
  source_artifact_id text,
  runtime_session_id text,
  status text not null check (status in ('active', 'archived')),
  last_prompt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists design_sessions_user_updated_idx on design_sessions (user_id, updated_at desc);
create index if not exists design_sessions_workspace_idx on design_sessions (workspace_id);
create index if not exists design_sessions_runtime_session_idx on design_sessions (runtime_session_id);

create table if not exists session_messages (
  id text primary key,
  session_id text not null references design_sessions(id),
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create index if not exists session_messages_session_created_idx on session_messages (session_id, created_at);

create table if not exists design_jobs (
  id text primary key,
  session_id text not null references design_sessions(id),
  user_id text not null references users(id),
  workspace_id text not null references workspaces(id),
  prompt text not null,
  source_mode text not null check (source_mode in ('new_html', 'from_existing_html')),
  source_artifact_id text,
  variation_count integer not null check (variation_count between 1 and 6),
  template_requirements jsonb not null default '{}'::jsonb,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  total_input_tokens integer not null default 0,
  total_output_tokens integer not null default 0,
  total_cost_cents integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists design_jobs_session_created_idx on design_jobs (session_id, created_at desc);
create index if not exists design_jobs_user_updated_idx on design_jobs (user_id, updated_at desc);
create index if not exists design_jobs_status_idx on design_jobs (status);

create table if not exists design_variations (
  id text primary key,
  job_id text not null references design_jobs(id),
  session_id text not null references design_sessions(id),
  index integer not null,
  title text,
  runtime_child_session_id text,
  runtime_agent_job_id text,
  status text not null check (status in ('queued', 'running', 'streaming', 'rendering_preview', 'completed', 'failed', 'cancelled')),
  current_artifact_id text,
  preview_url text,
  screenshot_artifact_id text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_cents integer not null default 0,
  error_code text,
  error_message text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (job_id, index)
);

create index if not exists design_variations_job_idx on design_variations (job_id);
create index if not exists design_variations_runtime_session_idx on design_variations (runtime_child_session_id);

create table if not exists artifacts (
  id text primary key,
  workspace_id text not null references workspaces(id),
  session_id text not null references design_sessions(id),
  variation_id text references design_variations(id),
  parent_artifact_id text references artifacts(id),
  kind text not null check (kind in ('html', 'asset', 'screenshot', 'export_zip')),
  version integer not null,
  storage_key text not null unique,
  entry_path text,
  content_hash text not null,
  size_bytes bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create unique index if not exists artifacts_variation_kind_version_idx
  on artifacts (variation_id, kind, version)
  where variation_id is not null;
create index if not exists artifacts_workspace_created_idx on artifacts (workspace_id, created_at desc);
create index if not exists artifacts_variation_version_idx on artifacts (variation_id, version desc);
create index if not exists artifacts_parent_idx on artifacts (parent_artifact_id);

alter table design_sessions
  add constraint design_sessions_source_artifact_fk
  foreign key (source_artifact_id) references artifacts(id);

alter table design_jobs
  add constraint design_jobs_source_artifact_fk
  foreign key (source_artifact_id) references artifacts(id);

alter table design_variations
  add constraint design_variations_current_artifact_fk
  foreign key (current_artifact_id) references artifacts(id);

alter table design_variations
  add constraint design_variations_screenshot_artifact_fk
  foreign key (screenshot_artifact_id) references artifacts(id);

create table if not exists annotation_batches (
  id text primary key,
  variation_id text not null references design_variations(id),
  artifact_id text not null references artifacts(id),
  user_id text not null references users(id),
  shapes jsonb not null,
  prompt_suffix text not null,
  created_at timestamptz not null
);

create index if not exists annotation_batches_variation_created_idx on annotation_batches (variation_id, created_at desc);

create table if not exists shares (
  id text primary key,
  artifact_id text not null references artifacts(id),
  variation_id text not null references design_variations(id),
  owner_id text not null references users(id),
  token text not null unique,
  visibility text not null check (visibility in ('public', 'private', 'password')),
  password_hash text,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null
);

create index if not exists shares_token_idx on shares (token);
create index if not exists shares_owner_created_idx on shares (owner_id, created_at desc);
create index if not exists shares_artifact_idx on shares (artifact_id);

create table if not exists usage_events (
  id text primary key,
  kind text not null check (kind in ('variation.completed', 'variation.refined', 'export.created', 'share.created')),
  user_id text not null references users(id),
  workspace_id text not null references workspaces(id),
  session_id text references design_sessions(id),
  job_id text references design_jobs(id),
  variation_id text references design_variations(id),
  artifact_id text references artifacts(id),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_cents integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create index if not exists usage_events_user_created_idx on usage_events (user_id, created_at desc);
create index if not exists usage_events_workspace_created_idx on usage_events (workspace_id, created_at desc);
create index if not exists usage_events_job_idx on usage_events (job_id);
create index if not exists usage_events_variation_idx on usage_events (variation_id);
create index if not exists usage_events_kind_created_idx on usage_events (kind, created_at desc);

create table if not exists audit_logs (
  id text primary key,
  request_id text not null,
  operator_user_id text not null references users(id),
  operator_role text not null check (operator_role in ('support', 'operator', 'developer')),
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create index if not exists audit_logs_created_idx on audit_logs (created_at desc);
create index if not exists audit_logs_operator_created_idx on audit_logs (operator_user_id, created_at desc);
create index if not exists audit_logs_target_idx on audit_logs (target_type, target_id);
