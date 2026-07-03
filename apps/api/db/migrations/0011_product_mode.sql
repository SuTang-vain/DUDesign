alter table design_jobs
  add column if not exists product_mode text not null default 'web_app';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'design_jobs_product_mode_check'
  ) then
    alter table design_jobs
      add constraint design_jobs_product_mode_check
      check (product_mode in ('web_app', 'dynamic_encyclopedia_card'));
  end if;
end $$;
