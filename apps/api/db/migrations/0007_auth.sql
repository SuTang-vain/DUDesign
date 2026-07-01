create table if not exists auth_identities (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  provider text not null check (provider in ('password')),
  provider_subject text not null,
  password_hash text,
  verified_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (provider, provider_subject)
);

create index if not exists auth_identities_user_idx
  on auth_identities (user_id);

create table if not exists auth_sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip_hash text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null,
  last_seen_at timestamptz not null
);

create index if not exists auth_sessions_user_created_idx
  on auth_sessions (user_id, created_at desc);

create index if not exists auth_sessions_token_hash_idx
  on auth_sessions (token_hash);

create index if not exists auth_sessions_expires_idx
  on auth_sessions (expires_at);
