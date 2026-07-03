alter table encyclopedia_entry_guidances
  drop constraint if exists encyclopedia_entry_guidances_status_check;

alter table encyclopedia_entry_guidances
  add constraint encyclopedia_entry_guidances_status_check
  check (status in ('draft', 'needs_confirmation', 'confirmed'));
