create table if not exists capability_authoring_drafts (
  id text primary key,
  owner_user_id text not null references users(id),
  workspace_id text not null references workspaces(id),
  source_type text not null check (source_type in ('design_md', 'product_spec_markdown', 'template_pack_json', 'variation_artifact', 'manual')),
  source_artifact_id text references artifacts(id),
  source_content_hash text not null,
  source jsonb not null,
  status text not null check (status in (
    'analyzing',
    'needs_confirmation',
    'lint_failed',
    'preview_pending',
    'ready',
    'published_private',
    'submitted_for_review',
    'rejected',
    'archived'
  )),
  draft_bundle jsonb not null,
  findings jsonb not null default '[]'::jsonb,
  confirmed_paths jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists capability_authoring_drafts_owner_workspace_updated_idx
  on capability_authoring_drafts (owner_user_id, workspace_id, updated_at desc);

create index if not exists capability_authoring_drafts_workspace_status_updated_idx
  on capability_authoring_drafts (workspace_id, status, updated_at desc);

create index if not exists capability_authoring_drafts_source_artifact_idx
  on capability_authoring_drafts (source_artifact_id)
  where source_artifact_id is not null;
