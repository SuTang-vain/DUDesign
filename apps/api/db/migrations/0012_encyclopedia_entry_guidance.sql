create table if not exists encyclopedia_entry_guidances (
  id text primary key,
  user_id text not null references users(id),
  workspace_id text not null references workspaces(id),
  product_mode text not null check (product_mode in ('dynamic_encyclopedia_card')),
  entry_title text not null,
  raw_input text not null,
  context text,
  primary_category text not null,
  secondary_category text not null,
  confidence numeric not null,
  signals jsonb not null default '[]'::jsonb,
  recommended_template_ids jsonb not null default '[]'::jsonb,
  selected_template_ids jsonb not null default '[]'::jsonb,
  interaction_paradigm_id text not null default 'ip_entity_summary',
  automation_mode text not null check (automation_mode in ('off', 'semi_auto', 'auto')),
  status text not null check (status in ('draft', 'needs_confirmation', 'confirmed')),
  confirmed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists encyclopedia_entry_guidances_user_updated_idx
  on encyclopedia_entry_guidances (user_id, updated_at desc);

create index if not exists encyclopedia_entry_guidances_workspace_updated_idx
  on encyclopedia_entry_guidances (workspace_id, updated_at desc);
