alter table design_variations
  add column if not exists runtime_lane_id text,
  add column if not exists runtime_backend_id text,
  add column if not exists runtime_lease_id text,
  add column if not exists runtime_attempt integer not null default 0,
  add column if not exists runtime_last_error_code text;

create index if not exists design_variations_runtime_lane_idx on design_variations (runtime_lane_id);
