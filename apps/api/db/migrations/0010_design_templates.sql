create table if not exists design_templates (
  id text primary key,
  source text not null check (source in ('official', 'user', 'workspace', 'imported')),
  format text not null check (format in ('dudesign-template-v1', 'design-md')),
  visibility text not null check (visibility in ('private', 'workspace', 'public')),
  status text not null check (status in ('draft', 'published', 'archived', 'disabled')),
  name text not null,
  description text,
  current_version text not null,
  schema_version text not null,
  preview_artifact_id text,
  lint_status text not null check (lint_status in ('unknown', 'passed', 'warning', 'failed')),
  sort_key text not null default '',
  created_by_user_id text references users(id),
  workspace_id text references workspaces(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists design_templates_owner_updated_idx on design_templates (created_by_user_id, updated_at desc);
create index if not exists design_templates_workspace_updated_idx on design_templates (workspace_id, updated_at desc);
create index if not exists design_templates_visibility_status_idx on design_templates (visibility, status);

create table if not exists design_template_versions (
  id text primary key,
  template_id text not null references design_templates(id) on delete cascade,
  version text not null,
  schema_version text not null,
  pack jsonb not null,
  design_tokens jsonb not null default '{}'::jsonb,
  rationale jsonb not null default '{}'::jsonb,
  content_hash text not null,
  created_by_user_id text references users(id),
  created_at timestamptz not null,
  unique (template_id, version)
);

create index if not exists design_template_versions_template_created_idx on design_template_versions (template_id, created_at desc);

alter table user_preferences
  add column if not exists design_template_pack_id text,
  add column if not exists skill_id text,
  add column if not exists mcp_tool_id text,
  add column if not exists brand_style_reference_id text,
  add column if not exists advanced_constraints jsonb not null default '{}'::jsonb;

alter table usage_events
  drop constraint if exists usage_events_kind_check;

alter table usage_events
  add constraint usage_events_kind_check
  check (kind in (
    'variation.completed',
    'variation.refined',
    'export.created',
    'share.created',
    'capability.template.selected',
    'capability.plugin.selected',
    'capability.preference.updated'
  ));
