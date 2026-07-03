#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
timeout_seconds="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_TIMEOUT_SECONDS:-720}"
variation_count="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VARIATION_COUNT:-1}"
entry="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_ENTRY:-百度百科：一家以搜索、人工智能和知识服务为核心的互联网公司，需要展示企业身份、发展节点、知识服务能力和移动端 iframe 兼容。}"
context="${DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_CONTEXT:-请生成一张动态百科词条卡片，使用时间线子模板，突出关键事实、阶段演进、固定视口、显式滚动容器和触摸兼容。}"

ssh "$remote" "BASE_DIR='$base_dir' SMOKE_TIMEOUT_SECONDS='$timeout_seconds' ENTRY='$entry' ENTRY_CONTEXT='$context' VARIATION_COUNT='$variation_count' bash -s" <<'REMOTE'
set -euo pipefail

cd "$BASE_DIR/dudesign/current"

if ! grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  echo 'dynamic-encyclopedia-smoke:skipped provider is not babel-o'
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo 'dynamic-encyclopedia-smoke:python3 is required for JSON parsing' >&2
  exit 1
fi

case "$VARIATION_COUNT" in
  1|2|3|4|5|6) ;;
  *)
    echo "dynamic-encyclopedia-smoke:invalid VARIATION_COUNT=$VARIATION_COUNT; expected 1..6" >&2
    exit 1
    ;;
esac

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
import sys

data = json.load(open(sys.argv[1]))
if data.get("productMode") != "dynamic_encyclopedia_card":
    raise SystemExit(f"expected dynamic_encyclopedia_card guidance, got {data.get('productMode')}")
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

python3 - <<'PY' > /tmp/dudesign-dynamic-guidance-confirm-payload.json
import json

print(json.dumps({
    "selectedTemplateIds": ["dtp_dynamic_encyclopedia_timeline_card"],
    "automationMode": "semi_auto",
}, ensure_ascii=False))
PY

curl -fsS -o /tmp/dudesign-dynamic-guidance-confirmed.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-dynamic-guidance-confirm-payload.json \
  "http://127.0.0.1/api/encyclopedia/entry-guidance/$guidance_id/confirm"

SESSION_ID="$session_id" VARIATION_COUNT="$VARIATION_COUNT" python3 - /tmp/dudesign-dynamic-guidance-confirmed.json <<'PY' > /tmp/dudesign-dynamic-job-payload.json
import json
import os
import sys

guidance = json.load(open(sys.argv[1]))
template_requirements = guidance["templateRequirements"]
capability_requirements = guidance["capabilityRequirements"]
entry_title = guidance["entry"]["title"]
print(json.dumps({
    "sessionId": os.environ["SESSION_ID"],
    "prompt": f"生成 {entry_title} 的动态百科词条卡片。必须输出完整静态 HTML 到 index.html，符合动态百科固定视口、显式滚动容器、触摸兼容和事实中立要求。",
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

python3 - "$VARIATION_COUNT" /tmp/dudesign-dynamic-job-detail.json <<'PY'
import json
import sys

expected = int(sys.argv[1])
data = json.load(open(sys.argv[2]))
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
    if (item.get("designTemplatePack") or {}).get("id") != "dtp_dynamic_encyclopedia_timeline_card"
]
if wrong_template:
    raise SystemExit(f"variations missing timeline child template assignment: {wrong_template}")
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
done < /tmp/dudesign-dynamic-variation-ids.txt

if [ "$preview_count" != "$VARIATION_COUNT" ]; then
  echo "dynamic-encyclopedia-smoke:expected $VARIATION_COUNT previews, checked $preview_count" >&2
  exit 1
fi

echo "dynamic-encyclopedia-smoke:completed job=$job_id variations=$preview_count guidance=$guidance_id"
REMOTE
