-- User-level product preferences.

create table if not exists user_preferences (
  user_id text primary key references users(id) on delete cascade,
  domain_template_id text,
  aesthetic_profile_id text,
  color_palette_id text,
  loop_profile_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
