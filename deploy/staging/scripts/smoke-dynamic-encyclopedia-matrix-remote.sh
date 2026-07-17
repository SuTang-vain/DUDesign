#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
smoke_script="$script_dir/smoke-dynamic-encyclopedia-remote.sh"
refine_smoke="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_MATRIX_REFINE_SMOKE:-0}"
include_vertical="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_MATRIX_INCLUDE_VERTICAL:-0}"

if [ ! -x "$smoke_script" ]; then
  echo "dynamic-encyclopedia-matrix: missing executable smoke script: $smoke_script" >&2
  exit 1
fi

run_case() {
  local label="$1"
  local entry="$2"
  local context="$3"
  local template_id="$4"

  echo "dynamic-encyclopedia-matrix:case:start $label template=$template_id refine=$refine_smoke"
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VERTICAL_MATRIX=0 \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_MULTILANE_SMOKE=0 \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VARIATION_COUNT=1 \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_TEMPLATE_ID="$template_id" \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_ENTRY="$entry" \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_CONTEXT="$context" \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_REQUIRED_QUALITY_STATUS=pass \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_INTERACTION_SMOKE=1 \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_INTERACTION_REQUIRED=1 \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_REFINE_SMOKE="$refine_smoke" \
    "$smoke_script"
  echo "dynamic-encyclopedia-matrix:case:passed $label template=$template_id"
}

run_case \
  "summary" \
  "量子计算：展示主题身份、三项核心事实和点击后揭示的关键概念" \
  "生成词条主题动态交互卡，不要做传统百科页面。使用 summary-card，首屏只保留主题身份与最核心事实，通过本地 tab 或 reveal 操作探索补充概念；必须满足 788x492、380x456 和 300x360 固定画布、无滚动、中文 UI。" \
  "dtp_dynamic_encyclopedia_summary_card"

run_case \
  "timeline" \
  "中国高铁发展阶段：用阶段节点讲清技术与网络演进" \
  "生成词条主题动态交互卡，不要生成百科长文。使用 timeline-card，围绕阶段演进和关键转折组织一个可点击时间线；日期不确定时使用阶段描述，不编造精确日期；300x360 首屏减量并保留节点切换。" \
  "dtp_dynamic_encyclopedia_timeline_card"

run_case \
  "relation" \
  "苏轼与欧阳修：展示师承、文坛影响和关联人物关系" \
  "生成词条主题动态交互卡，不要生成关系百科文章。使用 relation-card，必须有可点选关系节点、关系类型和局部详情；300x360 只展示核心节点，次要关系通过本地切换揭示，禁止滚动。" \
  "dtp_dynamic_encyclopedia_relation_card"

run_case \
  "compare" \
  "光合作用与细胞呼吸：通过关键维度呈现差异与联系" \
  "生成词条主题动态交互卡，不要生成百科目录。使用 compare-card，首屏突出两个对照对象和少量关键维度，通过 tab 或局部高亮继续探索；300x360 保留对照切换与核心结论，所有控件可点击。" \
  "dtp_dynamic_encyclopedia_compare_card"

run_case \
  "expandable" \
  "二十四节气：展示主题定义、季节线索和可展开的生活关联" \
  "生成词条主题动态交互卡，不要生成传统百科长页面。使用 expandable-card，首屏只保留身份、核心定义和少量摘要，补充事实必须通过本地 accordion/tab 展开；300x360 不滚动且保留至少一个可操作揭示入口。" \
  "dtp_dynamic_encyclopedia_expandable_card"

run_case \
  "member-map" \
  "BLACKPINK成员组合：展示成员定位、组合关系与局部切换" \
  "生成词条主题动态交互卡，不要生成明星百科页面。使用 member-map 子模板，首屏展示组合身份和成员选择入口，点击成员显示定位与关系详情；300x360 减少首屏成员数量但保留成员切换，不使用滚动或外部脚本。" \
  "dtp_de_star_group_member_map"

if [ "$include_vertical" = "1" ]; then
  echo "dynamic-encyclopedia-matrix:vertical-cases:start"
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VERTICAL_MATRIX=1 \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_MULTILANE_SMOKE=0 \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_INTERACTION_SMOKE=1 \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_INTERACTION_REQUIRED=1 \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_REQUIRED_QUALITY_STATUS=pass \
  DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_REFINE_SMOKE="$refine_smoke" \
    "$smoke_script"
  echo "dynamic-encyclopedia-matrix:vertical-cases:passed"
fi

echo "dynamic-encyclopedia-matrix:completed"
