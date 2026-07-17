alter table capability_authoring_drafts
  drop constraint if exists capability_authoring_drafts_source_type_check;

alter table capability_authoring_drafts
  add constraint capability_authoring_drafts_source_type_check
  check (source_type in (
    'design_md',
    'product_spec_markdown',
    'template_pack_json',
    'capability_bundle_zip',
    'variation_artifact',
    'manual'
  ));

alter table capability_authoring_drafts
  add column if not exists published_template_id text references design_templates(id);

create table if not exists capability_authoring_assets (
  id text primary key,
  draft_id text not null references capability_authoring_drafts(id) on delete cascade,
  owner_user_id text not null references users(id),
  workspace_id text not null references workspaces(id),
  kind text not null check (kind in ('html_example')),
  storage_key text not null unique,
  entry_path text not null,
  content_type text not null check (content_type = 'text/html'),
  content_hash text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create index if not exists capability_authoring_assets_draft_idx
  on capability_authoring_assets (draft_id, created_at, id);

create index if not exists capability_authoring_assets_owner_workspace_idx
  on capability_authoring_assets (owner_user_id, workspace_id, created_at desc);
