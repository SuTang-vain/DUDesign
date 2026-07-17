#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
timeout_seconds="${DUDESIGN_STAGING_PROMPT_SMOKE_TIMEOUT_SECONDS:-420}"
variation_count="${DUDESIGN_STAGING_PROMPT_SMOKE_VARIATION_COUNT:-1}"
smoke_prompt="${DUDESIGN_STAGING_PROMPT_SMOKE_PROMPT:-Create a tiny valid HTML landing page for DUDesign staging smoke. Write the complete page to index.html. Include the phrase DUDesign staging smoke.}"
exploration_smoke="${DUDESIGN_STAGING_PROMPT_SMOKE_EXPLORATION:-0}"
exploration_level="${DUDESIGN_STAGING_PROMPT_SMOKE_EXPLORATION_LEVEL:-65}"

ssh "$remote" "BASE_DIR='$base_dir' SMOKE_TIMEOUT_SECONDS='$timeout_seconds' SMOKE_PROMPT='$smoke_prompt' VARIATION_COUNT='$variation_count' EXPLORATION_SMOKE='$exploration_smoke' EXPLORATION_LEVEL='$exploration_level' LOCAL_TIMEOUT_SET='${DUDESIGN_STAGING_PROMPT_SMOKE_TIMEOUT_SECONDS+x}' bash -s" <<'REMOTE'
set -euo pipefail

cd "$BASE_DIR/dudesign/current"

if ! grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  echo 'babelo-prompt-smoke:skipped provider is not babel-o'
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo 'babelo-prompt-smoke:python3 is required for JSON parsing' >&2
  exit 1
fi

env_value() {
  local key="$1"
  grep -E "^${key}=" deploy/staging/.env | tail -n 1 | cut -d= -f2- || true
}

if [ -z "${LOCAL_TIMEOUT_SET:-}" ]; then
  remote_timeout_seconds="$(env_value DUDESIGN_STAGING_PROMPT_SMOKE_TIMEOUT_SECONDS)"
  SMOKE_TIMEOUT_SECONDS="${remote_timeout_seconds:-$SMOKE_TIMEOUT_SECONDS}"
fi

case "$VARIATION_COUNT" in
  1|2|3|4|5|6) ;;
  *)
    echo "babelo-prompt-smoke:invalid VARIATION_COUNT=$VARIATION_COUNT; expected 1..6" >&2
    exit 1
    ;;
esac

case "$EXPLORATION_SMOKE" in
  0|1) ;;
  *)
    echo "babelo-prompt-smoke:invalid EXPLORATION_SMOKE=$EXPLORATION_SMOKE; expected 0 or 1" >&2
    exit 1
    ;;
esac

if [ "$EXPLORATION_SMOKE" = "1" ]; then
  if [ "$VARIATION_COUNT" -lt 3 ]; then
    echo 'babelo-prompt-smoke:exploration smoke requires VARIATION_COUNT>=3' >&2
    exit 1
  fi
  case "$EXPLORATION_LEVEL" in
    ''|*[!0-9]*)
      echo "babelo-prompt-smoke:invalid EXPLORATION_LEVEL=$EXPLORATION_LEVEL; expected 0..100" >&2
      exit 1
      ;;
  esac
  if [ "$EXPLORATION_LEVEL" -gt 100 ]; then
    echo "babelo-prompt-smoke:invalid EXPLORATION_LEVEL=$EXPLORATION_LEVEL; expected 0..100" >&2
    exit 1
  fi
fi

curl -fsS -o /tmp/dudesign-smoke-bootstrap.json http://127.0.0.1/api/dev/bootstrap
workspace_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["workspace"]["id"])' /tmp/dudesign-smoke-bootstrap.json)"

WORKSPACE_ID="$workspace_id" python3 -c 'import json,os; print(json.dumps({"workspaceId": os.environ["WORKSPACE_ID"], "title": "Staging BabeL-O prompt smoke"}))' \
  > /tmp/dudesign-smoke-session-payload.json
curl -fsS -o /tmp/dudesign-smoke-session.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-smoke-session-payload.json \
  http://127.0.0.1/api/sessions
session_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["session"]["id"])' /tmp/dudesign-smoke-session.json)"

SESSION_ID="$session_id" SMOKE_PROMPT="$SMOKE_PROMPT" VARIATION_COUNT="$VARIATION_COUNT" EXPLORATION_SMOKE="$EXPLORATION_SMOKE" EXPLORATION_LEVEL="$EXPLORATION_LEVEL" python3 - <<'PY' \
  > /tmp/dudesign-smoke-job-payload.json
import json
import os

payload = {
    "sessionId": os.environ["SESSION_ID"],
    "prompt": os.environ["SMOKE_PROMPT"],
    "sourceMode": "new_html",
    "variationCount": int(os.environ["VARIATION_COUNT"]),
    "templateRequirements": {
        "styles": ["staging-smoke", "multi-direction"],
        "deviceTargets": ["desktop", "mobile"],
    },
}
if os.environ["EXPLORATION_SMOKE"] == "1":
    payload.update({
        "productMode": "dynamic_encyclopedia_card",
        "requirementModuleGraphId": "requirement_graph_dynamic_encyclopedia_star_group",
        "exploration": {"level": int(os.environ["EXPLORATION_LEVEL"])},
        "explorationDataContext": {
            "units": [{"id": "staging-unit-a"}],
            "members": {"current": [{"id": "member-a"}], "former": [{"id": "member-b"}]},
            "membershipEvents": [{"year": 2024, "type": "verified-change"}],
            "works": {"group": [{"id": "work-a"}]},
        },
    })
print(json.dumps(payload))
PY
curl -fsS -o /tmp/dudesign-smoke-job.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-smoke-job-payload.json \
  http://127.0.0.1/api/design-jobs
job_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["job"]["id"])' /tmp/dudesign-smoke-job.json)"

deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
while [ "$SECONDS" -lt "$deadline" ]; do
  curl -fsS -o /tmp/dudesign-smoke-job-detail.json "http://127.0.0.1/api/design-jobs/$job_id"
  job_status="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["job"]["status"])' /tmp/dudesign-smoke-job-detail.json)"
  if [ "$job_status" = "completed" ]; then
    break
  fi
  if [ "$job_status" = "failed" ] || [ "$job_status" = "cancelled" ]; then
    echo "babelo-prompt-smoke:job $job_id ended as $job_status" >&2
    cat /tmp/dudesign-smoke-job-detail.json >&2
    exit 1
  fi
  sleep 2
done

if [ "${job_status:-}" != "completed" ]; then
  echo "babelo-prompt-smoke:timed out waiting for job $job_id" >&2
  cat /tmp/dudesign-smoke-job-detail.json >&2
  exit 1
fi

python3 - "$VARIATION_COUNT" "$EXPLORATION_SMOKE" /tmp/dudesign-smoke-job-detail.json <<'PY'
import json
import sys

expected = int(sys.argv[1])
exploration_smoke = sys.argv[2] == "1"
path = sys.argv[3]
data = json.load(open(path))
variations = data.get("variations", [])
artifacts = data.get("artifacts", [])
if len(variations) != expected:
    raise SystemExit(f"expected {expected} variations, got {len(variations)}")
bad = [item for item in variations if item.get("status") != "completed"]
if bad:
    rate_limited = [
        item for item in bad
        if "429" in str(item.get("errorMessage") or "") or item.get("errorCode") == "RATE_LIMITED"
    ]
    if rate_limited:
        print("babelo-prompt-smoke:runtime/provider rate limit detected during multi-variation smoke", file=sys.stderr)
    raise SystemExit(f"not all variations completed: {bad}")
missing_preview = [item.get("id") for item in variations if not item.get("previewUrl")]
if missing_preview:
    raise SystemExit(f"variations missing previewUrl: {missing_preview}")
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
if exploration_smoke:
    job = data.get("job", {})
    graph = job.get("requirementModuleGraph")
    plan = job.get("explorationPlan")
    if not graph or graph.get("id") != "requirement_graph_dynamic_encyclopedia_star_group":
        raise SystemExit(f"missing or unexpected requirement module graph: {graph}")
    if not plan or len(plan.get("variations", [])) != expected:
        raise SystemExit(f"missing exploration plan or unexpected variation count: {plan}")
    if plan.get("profile", {}).get("factCreativity") != 0:
        raise SystemExit(f"exploration plan factCreativity drifted: {plan.get('profile')}")
    focuses = [item.get("explorationPlan", {}).get("focusId") for item in variations]
    if any(not focus for focus in focuses):
        raise SystemExit(f"variation exploration focus missing: {focuses}")
    if len(set(focuses)) < min(expected, 3):
        raise SystemExit(f"variation exploration focuses are not sufficiently distinct: {focuses}")
    print(f"babelo-prompt-smoke:exploration focuses={focuses}")
PY

python3 -c 'import json,sys; data=json.load(open(sys.argv[1])); print("\n".join(item["id"] for item in data["variations"]))' /tmp/dudesign-smoke-job-detail.json \
  > /tmp/dudesign-smoke-variation-ids.txt

preview_count=0
while IFS= read -r variation_id; do
  [ -n "$variation_id" ] || continue
  preview_count=$((preview_count + 1))
  curl -fsS -o "/tmp/dudesign-smoke-preview-$preview_count.html" "http://127.0.0.1/api/variations/$variation_id/preview"

  if grep -Eqi 'Mock preview|mock runtime|BabeL-O completed without writing index.html' "/tmp/dudesign-smoke-preview-$preview_count.html"; then
    echo "babelo-prompt-smoke:preview for $variation_id still looks like mock or fallback output" >&2
    head -c 500 "/tmp/dudesign-smoke-preview-$preview_count.html" >&2
    echo >&2
    exit 1
  fi

  if ! grep -Eqi '<!doctype|<html' "/tmp/dudesign-smoke-preview-$preview_count.html"; then
    echo "babelo-prompt-smoke:preview for $variation_id does not look like HTML" >&2
    head -c 500 "/tmp/dudesign-smoke-preview-$preview_count.html" >&2
    echo >&2
    exit 1
  fi
done < /tmp/dudesign-smoke-variation-ids.txt

if [ "$preview_count" != "$VARIATION_COUNT" ]; then
  echo "babelo-prompt-smoke:expected $VARIATION_COUNT previews, checked $preview_count" >&2
  exit 1
fi

echo "babelo-prompt-smoke:completed job=$job_id variations=$preview_count"
REMOTE
