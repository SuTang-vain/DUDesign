alter table usage_events
  add column if not exists idempotency_key text;

update usage_events
set idempotency_key = id
where idempotency_key is null;

alter table usage_events
  alter column idempotency_key set not null;

create unique index if not exists usage_events_idempotency_key_idx
  on usage_events (idempotency_key);
