create table if not exists capability_governance_overrides (
  plugin_id text primary key,
  status text not null check (status in ('active', 'disabled')),
  reason text,
  updated_by_user_id text references users(id),
  updated_by_role text check (updated_by_role in ('support', 'operator', 'developer')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists capability_governance_overrides_status_idx
  on capability_governance_overrides (status, updated_at desc);
