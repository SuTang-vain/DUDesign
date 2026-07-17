alter table refine_operations
  add column if not exists reconcile_owner text,
  add column if not exists reconcile_lease_until timestamptz,
  add column if not exists reconcile_attempts integer not null default 0,
  add column if not exists last_reconcile_error text;

create index if not exists refine_operations_reconcile_idx
  on refine_operations (status, reconcile_lease_until, updated_at)
  where status in ('starting', 'running', 'cancelling');
