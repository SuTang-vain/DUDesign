drop index if exists artifacts_variation_kind_version_idx;

create unique index if not exists artifacts_variation_html_version_idx
  on artifacts (variation_id, version)
  where variation_id is not null and kind = 'html';

create unique index if not exists artifacts_parent_asset_entry_path_idx
  on artifacts (variation_id, parent_artifact_id, entry_path)
  where variation_id is not null
    and parent_artifact_id is not null
    and kind = 'asset'
    and entry_path is not null;
