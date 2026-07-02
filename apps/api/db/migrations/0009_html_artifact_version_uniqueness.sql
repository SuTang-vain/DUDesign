drop index if exists artifacts_variation_kind_version_idx;

create unique index if not exists artifacts_variation_html_version_idx
  on artifacts (variation_id, version)
  where variation_id is not null
    and kind = 'html';
