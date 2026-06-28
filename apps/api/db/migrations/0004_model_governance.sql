-- Model service governance tables.

create table if not exists model_services (
  id text primary key,
  provider text not null check (provider in ('babel-o', 'openai-compatible', 'mock')),
  model_id text not null,
  display_name text not null,
  description text,
  enabled boolean not null default true,
  is_default boolean not null default false,
  capabilities jsonb not null default '[]'::jsonb,
  context_window integer,
  input_token_cost_cents integer not null default 0,
  output_token_cost_cents integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (provider, model_id)
);

create unique index if not exists model_services_single_default_idx
  on model_services ((is_default))
  where is_default;
create index if not exists model_services_enabled_default_idx on model_services (enabled, is_default desc, display_name);

create table if not exists user_model_access (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  model_service_id text not null references model_services(id) on delete cascade,
  enabled boolean not null default true,
  daily_token_limit integer,
  monthly_cost_limit_cents integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (user_id, model_service_id)
);

create index if not exists user_model_access_user_idx on user_model_access (user_id);
create index if not exists user_model_access_model_idx on user_model_access (model_service_id);
