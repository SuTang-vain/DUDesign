-- DUDesign: encyclopedia entry language classification
-- Stage 1 of the "hard constraints" rollout (中文优先 + 禁内部滚动).
-- Two new columns on encyclopedia_entry_guidances:
--   * is_language_category  - marks entries that are foreign-language /
--                             linguistics / translation / dialect / language-
--                             research topics. These entries are exempted
--                             from the "Chinese-first" content policy.
--   * entry_content_language - the expected body script of the entry.
--                             Used by spec review and future i18n
--                             adaptation. Does not affect generation.
--
-- Both columns are non-null with safe defaults so existing rows remain
-- readable. Old guidance rows are treated as Chinese (the historical
-- default) and not language-category.

alter table encyclopedia_entry_guidances
  add column if not exists is_language_category boolean not null default false;

alter table encyclopedia_entry_guidances
  add column if not exists entry_content_language text not null default 'zh'
  check (entry_content_language in ('zh', 'en', 'fr', 'ja', 'ko', 'other', 'mixed'));

-- Optional lookup index for future admin "language category" filters.
create index if not exists encyclopedia_entry_guidances_language_idx
  on encyclopedia_entry_guidances (is_language_category, entry_content_language);
