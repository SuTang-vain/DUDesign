alter table encyclopedia_entry_guidances
  add column if not exists interaction_paradigm_id text not null default 'ip_entity_summary';
