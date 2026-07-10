#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
timeout_seconds="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_TIMEOUT_SECONDS:-720}"
variation_count="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VARIATION_COUNT:-1}"
entry="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_ENTRY:-百度百科：一家以搜索、人工智能和知识服务为核心的互联网公司，需要展示企业身份、发展节点、知识服务能力和移动端 iframe 兼容。}"
context="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_CONTEXT:-请生成一张动态百科词条卡片，使用时间线子模板，突出关键事实、阶段演进、固定视口、no-scroll-frame、tab/page-switcher/modal 溢出策略和触摸兼容。}"
selected_template_id="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_TEMPLATE_ID:-dtp_dynamic_encyclopedia_timeline_card}"
expected_primary_category="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_EXPECTED_PRIMARY_CATEGORY:-}"
expected_secondary_category="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_EXPECTED_SECONDARY_CATEGORY:-}"
forbidden_finding_ids="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_FORBIDDEN_FINDING_IDS:-}"
multilane_smoke="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_MULTILANE_SMOKE:-0}"
completion_lane_required="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_COMPLETION_LANE_REQUIRED:-0}"
interaction_smoke="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_INTERACTION_SMOKE:-0}"
interaction_required="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_INTERACTION_REQUIRED:-0}"

if [ "${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VERTICAL_MATRIX:-0}" = "1" ]; then
  script_path="${BASH_SOURCE[0]}"
  run_vertical_case() {
    local label="$1"
    local case_entry="$2"
    local case_context="$3"
    local template_id="$4"
    local primary_category="$5"
    local secondary_category="$6"
    local forbidden_findings="$7"

    echo "dynamic-encyclopedia-smoke:vertical-case:start $label template=$template_id"
    DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VERTICAL_MATRIX=0 \
    DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_ENTRY="$case_entry" \
    DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_CONTEXT="$case_context" \
    DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_TEMPLATE_ID="$template_id" \
    DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_EXPECTED_PRIMARY_CATEGORY="$primary_category" \
    DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_EXPECTED_SECONDARY_CATEGORY="$secondary_category" \
    DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_FORBIDDEN_FINDING_IDS="$forbidden_findings" \
      "$script_path"
    echo "dynamic-encyclopedia-smoke:vertical-case:completed $label"
  }

  run_vertical_case \
    "film" \
    "电影《飞驰人生3》主演、角色、系列电影和相似电影推荐" \
    "生成电影动态百科卡片，重点展示主演-角色网络、系列/IP 导航、相似影片推荐；禁止播放、下载、网盘、磁力、盗版资源入口，评分/票房/上映信息必须有来源或不确定性提示。" \
    "dtp_de_film_cast_role_network" \
    "影视作品" \
    "电影" \
    "encyclopedia.media_resource_link_blocked,encyclopedia.media_fact_source_required"

  run_vertical_case \
    "tv" \
    "电视剧《庆余年》角色关系、分集剧情、伏笔和系列季播导航" \
    "生成电视剧动态百科卡片，重点展示角色关系和分集剧情链；集数、剧情节点、伏笔、结局必须基于已知资料或标注资料不足，剧透内容需要显式隐藏或标注。" \
    "dtp_de_tv_episode_chain" \
    "影视作品" \
    "电视剧" \
    "encyclopedia.tv_episode_fabrication_risk,encyclopedia.spoiler_control_required,encyclopedia.media_resource_link_blocked"

  run_vertical_case \
    "history_person" \
    "苏轼人物关系、师承、政治阵营与重要事件链" \
    "生成历史人物动态百科卡片，重点展示人物关系和事件因果链；亲属、师承、阵营、对手关系必须有来源、不确定性或资料不足说明，事件链需要起因/经过/结果/影响结构。" \
    "dtp_de_history_person_relationship" \
    "名人" \
    "历史人物" \
    "encyclopedia.history_relation_source_required"

  run_vertical_case \
    "cultural_phrase" \
    "成语“悬梁刺股”的意思、出处典故、近义词反义词和关联词语" \
    "生成文化类词语动态百科卡片，重点展示出处典故、寓意和关联词图谱；没有可靠出处时必须标注暂无可靠出处或隐藏出处模块，关联词必须标注关系类型。" \
    "dtp_de_cultural_phrase_origin_story" \
    "知识术语" \
    "文化类词语" \
    "encyclopedia.cultural_origin_source_required,encyclopedia.related_phrase_type_required"

  echo "dynamic-encyclopedia-smoke:vertical-matrix:completed"
  exit 0
fi

ssh "$remote" "BASE_DIR='$base_dir' SMOKE_TIMEOUT_SECONDS='$timeout_seconds' ENTRY='$entry' ENTRY_CONTEXT='$context' VARIATION_COUNT='$variation_count' SELECTED_TEMPLATE_ID='$selected_template_id' EXPECTED_PRIMARY_CATEGORY='$expected_primary_category' EXPECTED_SECONDARY_CATEGORY='$expected_secondary_category' FORBIDDEN_FINDING_IDS='$forbidden_finding_ids' MULTILANE_SMOKE='$multilane_smoke' COMPLETION_LANE_REQUIRED='$completion_lane_required' INTERACTION_SMOKE='$interaction_smoke' INTERACTION_REQUIRED='$interaction_required' LOCAL_VARIATION_COUNT_SET='${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VARIATION_COUNT+x}' LOCAL_MULTILANE_SMOKE_SET='${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_MULTILANE_SMOKE+x}' LOCAL_TIMEOUT_SET='${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_TIMEOUT_SECONDS+x}' bash -s" <<'REMOTE'
set -euo pipefail

cd "$BASE_DIR/dudesign/current"

env_value() {
  local key="$1"
  if [ ! -f deploy/staging/.env ]; then
    return 0
  fi
  grep -E "^${key}=" deploy/staging/.env | tail -n 1 | cut -d= -f2-
}

if [ -z "${LOCAL_VARIATION_COUNT_SET:-}" ]; then
  remote_variation_count="$(env_value DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VARIATION_COUNT)"
  VARIATION_COUNT="${remote_variation_count:-$VARIATION_COUNT}"
fi
if [ -z "${LOCAL_MULTILANE_SMOKE_SET:-}" ]; then
  remote_multilane_smoke="$(env_value DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_MULTILANE_SMOKE)"
  MULTILANE_SMOKE="${remote_multilane_smoke:-$MULTILANE_SMOKE}"
fi
if [ -z "${LOCAL_TIMEOUT_SET:-}" ]; then
  remote_timeout_seconds="$(env_value DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_TIMEOUT_SECONDS)"
  SMOKE_TIMEOUT_SECONDS="${remote_timeout_seconds:-$SMOKE_TIMEOUT_SECONDS}"
fi

if ! grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  echo 'dynamic-encyclopedia-smoke:skipped provider is not babel-o'
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo 'dynamic-encyclopedia-smoke:python3 is required for JSON parsing' >&2
  exit 1
fi

compose_profile_args=''
if grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  compose_profile_args='--profile babel-o'
  if grep -Eq '^DUDESIGN_RUNTIME_LANE_MODE=static$' deploy/staging/.env \
    || grep -Eq '^DUDESIGN_RUNTIME_LANES_JSON=.+$' deploy/staging/.env; then
    compose_profile_args='--profile babel-o-multilane'
  fi
fi

case "$VARIATION_COUNT" in
  1|2|3|4|5|6) ;;
  *)
    echo "dynamic-encyclopedia-smoke:invalid VARIATION_COUNT=$VARIATION_COUNT; expected 1..6" >&2
    exit 1
    ;;
esac

if [ "${MULTILANE_SMOKE:-0}" = "1" ] && [ "$VARIATION_COUNT" -lt 3 ]; then
  echo "dynamic-encyclopedia-smoke: MULTILANE_SMOKE=1 requires VARIATION_COUNT>=3" >&2
  exit 1
fi

if [ "${INTERACTION_SMOKE:-0}" = "1" ]; then
  docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env exec -T api \
    node --input-type=module -e "await import('playwright')" </dev/null
fi

run_interaction_smoke() {
  local variation_id="$1"
  docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env exec -T \
    -e SMOKE_VARIATION_ID="$variation_id" \
    -e SMOKE_INTERACTION_REQUIRED="${INTERACTION_REQUIRED:-0}" \
    -e PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-/usr/bin/chromium}" \
    api node --input-type=module <<'NODE'
import { chromium } from 'playwright'

const variationId = process.env.SMOKE_VARIATION_ID
const interactionRequired = process.env.SMOKE_INTERACTION_REQUIRED === '1'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim()
if (!variationId) throw new Error('SMOKE_VARIATION_ID is required')

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
})
try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:4000/api/variations/${variationId}/preview`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  const result = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"], .tab-bar button')]
      .filter(element => element instanceof HTMLElement)
    if (tabs.length < 2) {
      return {
        skipped: true,
        reason: `no tab interaction found; tabCount=${tabs.length}`,
      }
    }
    const before = tabs.map(tab => tab.getAttribute('aria-selected') ?? '')
    tabs[1].click()
    const panels = [...document.querySelectorAll('[role="tabpanel"]')]
      .filter(element => element instanceof HTMLElement)
    const after = tabs.map(tab => tab.getAttribute('aria-selected') ?? '')
    const visiblePanelIds = panels
      .filter(panel => !panel.hidden && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden')
      .map(panel => panel.id || panel.getAttribute('aria-label') || panel.textContent?.slice(0, 24) || 'panel')
    const ariaChanged = before.join('|') !== after.join('|') && after[1] === 'true'
    const panelVisible = panels.length === 0 || visiblePanelIds.length > 0
    return {
      skipped: false,
      tabCount: tabs.length,
      panelCount: panels.length,
      ariaChanged,
      panelVisible,
      visiblePanelIds,
    }
  })
  if (result.skipped) {
    if (interactionRequired) {
      throw new Error(`required tab interaction was not found: ${result.reason}`)
    }
    console.log(`dynamic-encyclopedia-smoke:interaction:skipped variation=${variationId} ${result.reason}`)
    process.exit(0)
  }
  if (!result.ariaChanged || !result.panelVisible) {
    throw new Error(`tab interaction did not update accessible state or visible panel: ${JSON.stringify(result)}`)
  }
  console.log(`dynamic-encyclopedia-smoke:interaction:passed variation=${variationId} tabs=${result.tabCount} panels=${result.panelCount}`)
} finally {
  await browser.close()
}
NODE
}

curl -fsS -o /tmp/dudesign-dynamic-bootstrap.json http://127.0.0.1/api/dev/bootstrap
workspace_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["workspace"]["id"])' /tmp/dudesign-dynamic-bootstrap.json)"

WORKSPACE_ID="$workspace_id" python3 - <<'PY' > /tmp/dudesign-dynamic-session-payload.json
import json
import os

print(json.dumps({
    "workspaceId": os.environ["WORKSPACE_ID"],
    "mode": "new_html",
    "title": "Staging dynamic encyclopedia smoke",
}, ensure_ascii=False))
PY

curl -fsS -o /tmp/dudesign-dynamic-session.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-dynamic-session-payload.json \
  http://127.0.0.1/api/sessions
session_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["session"]["id"])' /tmp/dudesign-dynamic-session.json)"

WORKSPACE_ID="$workspace_id" ENTRY="$ENTRY" ENTRY_CONTEXT="$ENTRY_CONTEXT" python3 - <<'PY' > /tmp/dudesign-dynamic-guidance-payload.json
import json
import os

print(json.dumps({
    "workspaceId": os.environ["WORKSPACE_ID"],
    "entry": os.environ["ENTRY"],
    "context": os.environ["ENTRY_CONTEXT"],
    "maxTemplateRecommendations": 2,
    "automationMode": "semi_auto",
}, ensure_ascii=False))
PY

curl -fsS -o /tmp/dudesign-dynamic-guidance.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-dynamic-guidance-payload.json \
  http://127.0.0.1/api/encyclopedia/entry-guidance

guidance_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["guidanceId"])' /tmp/dudesign-dynamic-guidance.json)"

python3 - /tmp/dudesign-dynamic-guidance.json <<'PY'
import json
import os
import sys

data = json.load(open(sys.argv[1]))
if data.get("productMode") != "dynamic_encyclopedia_card":
    raise SystemExit(f"expected dynamic_encyclopedia_card guidance, got {data.get('productMode')}")
expected_primary = os.environ.get("EXPECTED_PRIMARY_CATEGORY", "").strip()
expected_secondary = os.environ.get("EXPECTED_SECONDARY_CATEGORY", "").strip()
classification = data.get("classification") or {}
if expected_primary and classification.get("primaryCategory") != expected_primary:
    raise SystemExit(f"expected primary category {expected_primary}, got {classification.get('primaryCategory')}")
if expected_secondary and classification.get("secondaryCategory") != expected_secondary:
    raise SystemExit(f"expected secondary category {expected_secondary}, got {classification.get('secondaryCategory')}")
skills = ((data.get("capabilityRequirements") or {}).get("plugins") or {}).get("skillIds") or []
tools = ((data.get("capabilityRequirements") or {}).get("plugins") or {}).get("mcpToolIds") or []
if "sk_encyclopedia_entry_guidance" not in skills:
    raise SystemExit(f"missing entry guidance skill: {skills}")
if "mcp_encyclopedia_democase_readonly" not in tools:
    raise SystemExit(f"missing democase MCP tool policy: {tools}")
template_requirements = data.get("templateRequirements") or {}
if not template_requirements.get("businessContext", {}).get("guidanceId"):
    raise SystemExit("guidance did not return businessContext.guidanceId")
if not template_requirements.get("interactionParadigm", {}).get("id"):
    raise SystemExit("guidance did not return interactionParadigm snapshot")
PY

SELECTED_TEMPLATE_ID="$SELECTED_TEMPLATE_ID" python3 - <<'PY' > /tmp/dudesign-dynamic-guidance-confirm-payload.json
import json
import os

print(json.dumps({
    "selectedTemplateIds": [os.environ["SELECTED_TEMPLATE_ID"]],
    "automationMode": "semi_auto",
}, ensure_ascii=False))
PY

curl -fsS -o /tmp/dudesign-dynamic-guidance-confirmed.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-dynamic-guidance-confirm-payload.json \
  "http://127.0.0.1/api/encyclopedia/entry-guidance/$guidance_id/confirm"

SESSION_ID="$session_id" VARIATION_COUNT="$VARIATION_COUNT" SELECTED_TEMPLATE_ID="$SELECTED_TEMPLATE_ID" python3 - /tmp/dudesign-dynamic-guidance-confirmed.json <<'PY' > /tmp/dudesign-dynamic-job-payload.json
import json
import os
import sys

guidance = json.load(open(sys.argv[1]))
template_requirements = guidance["templateRequirements"]
template_requirements["designTemplatePackIds"] = [os.environ["SELECTED_TEMPLATE_ID"]]
template_requirements["variationTemplateAssignments"] = []
capability_requirements = guidance["capabilityRequirements"]
capability_requirements.setdefault("template", {})["designTemplatePackIds"] = [os.environ["SELECTED_TEMPLATE_ID"]]
capability_requirements["template"]["autoDistributeTemplatePacks"] = False
entry_title = guidance["entry"]["title"]
print(json.dumps({
    "sessionId": os.environ["SESSION_ID"],
    "prompt": f"生成 {entry_title} 的动态百科词条卡片。必须输出完整 self-contained HTML/CSS/JS 到 index.html，符合动态百科固定视口、no-scroll-frame、tab/page-switcher/modal 溢出策略、触摸兼容、中文优先和事实中立要求。可见 tab、分页、展开或弹层控件必须使用本地 inline JavaScript 切换 aria-selected、hidden 或 aria-expanded 状态，不能只是静态视觉状态。",
    "sourceMode": "new_html",
    "productMode": "dynamic_encyclopedia_card",
    "variationCount": int(os.environ["VARIATION_COUNT"]),
    "capabilityRequirements": capability_requirements,
    "templateRequirements": template_requirements,
}, ensure_ascii=False))
PY

curl -fsS -o /tmp/dudesign-dynamic-job.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-dynamic-job-payload.json \
  http://127.0.0.1/api/design-jobs
job_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["job"]["id"])' /tmp/dudesign-dynamic-job.json)"

deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
while [ "$SECONDS" -lt "$deadline" ]; do
  curl -fsS -o /tmp/dudesign-dynamic-job-detail.json "http://127.0.0.1/api/design-jobs/$job_id"
  job_status="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["job"]["status"])' /tmp/dudesign-dynamic-job-detail.json)"
  if [ "$job_status" = "completed" ]; then
    break
  fi
  if [ "$job_status" = "failed" ] || [ "$job_status" = "cancelled" ]; then
    echo "dynamic-encyclopedia-smoke:job $job_id ended as $job_status" >&2
    cat /tmp/dudesign-dynamic-job-detail.json >&2
    exit 1
  fi
  sleep 2
done

if [ "${job_status:-}" != "completed" ]; then
  echo "dynamic-encyclopedia-smoke:timed out waiting for job $job_id" >&2
  cat /tmp/dudesign-dynamic-job-detail.json >&2
  exit 1
fi

printf '[]' > /tmp/dudesign-dynamic-lane-events.json
if [ "${MULTILANE_SMOKE:-0}" = "1" ]; then
  case "$job_id" in
    job_[a-zA-Z0-9]*) ;;
    *)
      echo "dynamic-encyclopedia-smoke:unexpected job id for lane diagnostics: $job_id" >&2
      exit 1
      ;;
  esac
  docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env exec -T \
    postgres psql -U dudesign -d dudesign_staging -At -c "
      select coalesce(jsonb_agg(jsonb_build_object(
        'type', type,
        'variationId', variation_id,
        'payload', payload,
        'createdAt', created_at
      ) order by created_at, id), '[]'::jsonb)
      from design_events
      where job_id = '$job_id'
        and type in (
          'design.runtime_lane_assigned',
          'design.runtime_lane_retry_started',
          'design.runtime_lane_retry_exhausted'
        );
    " > /tmp/dudesign-dynamic-lane-events.json
fi

python3 - "$VARIATION_COUNT" "$SELECTED_TEMPLATE_ID" "$FORBIDDEN_FINDING_IDS" "$MULTILANE_SMOKE" "$COMPLETION_LANE_REQUIRED" /tmp/dudesign-dynamic-job-detail.json /tmp/dudesign-dynamic-lane-events.json <<'PY'
import json
import sys

expected = int(sys.argv[1])
selected_template_id = sys.argv[2]
forbidden_finding_ids = [item.strip() for item in sys.argv[3].split(",") if item.strip()]
multilane_smoke = sys.argv[4] == "1"
completion_lane_required = sys.argv[5] == "1"
data = json.load(open(sys.argv[6]))
lane_events = json.load(open(sys.argv[7])) if len(sys.argv) > 7 else []
if data.get("job", {}).get("productMode") != "dynamic_encyclopedia_card":
    raise SystemExit(f"expected dynamic job productMode, got {data.get('job', {}).get('productMode')}")
if data.get("job", {}).get("capabilitySnapshot", {}).get("template", {}).get("domainTemplate", {}).get("id") != "tpl_dynamic_encyclopedia_entry":
    raise SystemExit("job capability snapshot did not use dynamic encyclopedia domain template")

variations = data.get("variations", [])
artifacts = data.get("artifacts", [])
if len(variations) != expected:
    raise SystemExit(f"expected {expected} variations, got {len(variations)}")
bad = [item for item in variations if item.get("status") != "completed"]
if bad:
    raise SystemExit(f"not all variations completed: {bad}")
missing_preview = [item.get("id") for item in variations if not item.get("previewUrl")]
if missing_preview:
    raise SystemExit(f"variations missing previewUrl: {missing_preview}")
wrong_template = [
    item.get("id") for item in variations
    if (item.get("designTemplatePack") or {}).get("id") != selected_template_id
]
if wrong_template:
    raise SystemExit(f"variations missing expected child template assignment {selected_template_id}: {wrong_template}")
artifact_variation_ids = {item.get("variationId") for item in artifacts if item.get("kind") == "html"}
missing_artifacts = [item.get("id") for item in variations if item.get("id") not in artifact_variation_ids]
if missing_artifacts:
    raise SystemExit(f"variations missing html artifacts: {missing_artifacts}")
failed_quality = [
    (item.get("id"), item.get("quality"))
    for item in artifacts
    if item.get("kind") == "html" and (item.get("quality") or {}).get("status") == "fail"
]
if failed_quality:
    raise SystemExit(f"html artifact quality failed: {failed_quality}")
if multilane_smoke:
    lanes = sorted({item.get("runtimeLaneId") for item in variations if item.get("runtimeLaneId")})
    scheduled_lanes = sorted({
        (event.get("payload") or {}).get("runtimeLaneId")
        for event in lane_events
        if event.get("type") == "design.runtime_lane_assigned"
        and (event.get("payload") or {}).get("runtimeLaneId")
    })
    retry_edges = [
        (
            (event.get("payload") or {}).get("previousRuntimeLaneId"),
            (event.get("payload") or {}).get("nextRuntimeLaneId"),
            (event.get("payload") or {}).get("reason"),
        )
        for event in lane_events
        if event.get("type") == "design.runtime_lane_retry_started"
    ]
    exhausted = [
        (
            event.get("variationId"),
            (event.get("payload") or {}).get("previousRuntimeLaneId"),
            (event.get("payload") or {}).get("errorCode"),
        )
        for event in lane_events
        if event.get("type") == "design.runtime_lane_retry_exhausted"
    ]
    if len(scheduled_lanes) < 2:
        raise SystemExit(f"expected multi-lane scheduling events to use at least two runtime lanes, got {scheduled_lanes}")
    if len(lanes) < 2 and completion_lane_required:
        raise SystemExit(f"expected multi-lane smoke to use at least two runtime lanes, got {lanes}")
    missing_lane = [item.get("id") for item in variations if not item.get("runtimeLaneId")]
    if missing_lane:
        raise SystemExit(f"multi-lane smoke variations missing runtimeLaneId: {missing_lane}")
    retry_summary = ",".join(f"{previous}->{next_lane}:{reason}" for previous, next_lane, reason in retry_edges) or "none"
    exhausted_summary = ",".join(f"{variation}:{lane}:{code}" for variation, lane, code in exhausted) or "none"
    print(
        "dynamic-encyclopedia-smoke:multilane-scheduled "
        f"scheduled_lanes={','.join(scheduled_lanes)} "
        f"retry_edges={retry_summary} "
        f"exhausted={exhausted_summary}"
    )
    if len(lanes) < 2:
        print(f"dynamic-encyclopedia-smoke:multilane-warning completed_lanes={','.join(lanes) or 'none'} completion_lane_required=0")
    else:
        print(f"dynamic-encyclopedia-smoke:multilane lanes={','.join(lanes)}")
if forbidden_finding_ids:
    matched = []
    for item in artifacts:
        if item.get("kind") != "html":
            continue
        quality = item.get("quality") or {}
        for finding in quality.get("specFindings") or []:
            finding_id = finding.get("id")
            if finding_id in forbidden_finding_ids:
                matched.append((item.get("id"), finding_id))
    if matched:
        raise SystemExit(f"html artifact triggered forbidden vertical spec findings: {matched}")
PY

python3 -c 'import json,sys; data=json.load(open(sys.argv[1])); print("\n".join(item["id"] for item in data["variations"]))' /tmp/dudesign-dynamic-job-detail.json \
  > /tmp/dudesign-dynamic-variation-ids.txt

preview_count=0
while IFS= read -r variation_id; do
  [ -n "$variation_id" ] || continue
  preview_count=$((preview_count + 1))
  curl -fsS -o "/tmp/dudesign-dynamic-preview-$preview_count.html" "http://127.0.0.1/api/variations/$variation_id/preview"
  curl -fsS -o "/tmp/dudesign-dynamic-export-$preview_count.json" \
    -H 'content-type: application/json' \
    --data-binary '{}' \
    "http://127.0.0.1/api/variations/$variation_id/export"

  if grep -Eqi 'Mock preview|mock runtime|BabeL-O completed without writing index.html' "/tmp/dudesign-dynamic-preview-$preview_count.html"; then
    echo "dynamic-encyclopedia-smoke:preview for $variation_id still looks like mock or fallback output" >&2
    head -c 500 "/tmp/dudesign-dynamic-preview-$preview_count.html" >&2
    echo >&2
    exit 1
  fi

  if ! grep -Eqi '<!doctype|<html' "/tmp/dudesign-dynamic-preview-$preview_count.html"; then
    echo "dynamic-encyclopedia-smoke:preview for $variation_id does not look like HTML" >&2
    head -c 500 "/tmp/dudesign-dynamic-preview-$preview_count.html" >&2
    echo >&2
    exit 1
  fi

  python3 - "/tmp/dudesign-dynamic-export-$preview_count.json" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1]))
artifact = data.get("exportArtifact") or {}
if artifact.get("kind") != "export_zip":
    raise SystemExit(f"expected export_zip artifact, got {artifact}")
if not artifact.get("downloadUrl"):
    raise SystemExit(f"export response missing downloadUrl: {data}")
PY

  if [ "${INTERACTION_SMOKE:-0}" = "1" ]; then
    run_interaction_smoke "$variation_id"
  fi
done < /tmp/dudesign-dynamic-variation-ids.txt

if [ "$preview_count" != "$VARIATION_COUNT" ]; then
  echo "dynamic-encyclopedia-smoke:expected $VARIATION_COUNT previews, checked $preview_count" >&2
  exit 1
fi

echo "dynamic-encyclopedia-smoke:completed job=$job_id variations=$preview_count guidance=$guidance_id"
REMOTE
