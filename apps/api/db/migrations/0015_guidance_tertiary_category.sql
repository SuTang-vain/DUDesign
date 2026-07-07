alter table encyclopedia_entry_guidances
  add column if not exists tertiary_category text not null default '通用';
