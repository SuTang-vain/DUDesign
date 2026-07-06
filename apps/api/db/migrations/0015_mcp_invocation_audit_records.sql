create table if not exists mcp_invocation_audit_records (
  invocation_id text primary key,
  user_id text not null references users(id),
  workspace_id text not null references workspaces(id),
  session_id text not null references design_sessions(id),
  job_id text not null references design_jobs(id),
  variation_id text references design_variations(id),
  mcp_tool_id text not null,
  request jsonb not null,
  result jsonb not null,
  policy_snapshot_hash text not null,
  runtime_contract_version text not null,
  replay_key text not null unique,
  created_at timestamptz not null,
  completed_at timestamptz not null
);

create index if not exists mcp_invocation_audit_job_created_idx
  on mcp_invocation_audit_records (job_id, created_at desc);

create index if not exists mcp_invocation_audit_variation_created_idx
  on mcp_invocation_audit_records (variation_id, created_at desc)
  where variation_id is not null;

create index if not exists mcp_invocation_audit_tool_created_idx
  on mcp_invocation_audit_records (mcp_tool_id, created_at desc);

create index if not exists mcp_invocation_audit_workspace_created_idx
  on mcp_invocation_audit_records (workspace_id, created_at desc);
