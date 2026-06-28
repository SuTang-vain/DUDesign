#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
timeout_seconds="${DUDESIGN_STAGING_PROMPT_SMOKE_TIMEOUT_SECONDS:-180}"
smoke_prompt="${DUDESIGN_STAGING_PROMPT_SMOKE_PROMPT:-Create a tiny valid HTML landing page for DUDesign staging smoke. Write the complete page to index.html. Include the phrase DUDesign staging smoke.}"

ssh "$remote" "BASE_DIR='$base_dir' SMOKE_TIMEOUT_SECONDS='$timeout_seconds' SMOKE_PROMPT='$smoke_prompt' bash -s" <<'REMOTE'
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

curl -fsS -o /tmp/dudesign-smoke-bootstrap.json http://127.0.0.1/api/dev/bootstrap
workspace_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["workspace"]["id"])' /tmp/dudesign-smoke-bootstrap.json)"

WORKSPACE_ID="$workspace_id" python3 -c 'import json,os; print(json.dumps({"workspaceId": os.environ["WORKSPACE_ID"], "title": "Staging BabeL-O prompt smoke"}))' \
  > /tmp/dudesign-smoke-session-payload.json
curl -fsS -o /tmp/dudesign-smoke-session.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-smoke-session-payload.json \
  http://127.0.0.1/api/sessions
session_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["session"]["id"])' /tmp/dudesign-smoke-session.json)"

SESSION_ID="$session_id" SMOKE_PROMPT="$SMOKE_PROMPT" python3 -c 'import json,os; print(json.dumps({"sessionId": os.environ["SESSION_ID"], "prompt": os.environ["SMOKE_PROMPT"], "sourceMode": "new_html", "variationCount": 1, "templateRequirements": {"styles": ["staging-smoke"], "deviceTargets": ["desktop"]}}))' \
  > /tmp/dudesign-smoke-job-payload.json
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

variation_id="$(python3 -c 'import json,sys; data=json.load(open(sys.argv[1])); print(data["variations"][0]["id"])' /tmp/dudesign-smoke-job-detail.json)"
curl -fsS -o /tmp/dudesign-smoke-preview.html "http://127.0.0.1/api/variations/$variation_id/preview"

if grep -Eqi 'Mock preview|mock runtime|BabeL-O completed without writing index.html' /tmp/dudesign-smoke-preview.html; then
  echo 'babelo-prompt-smoke:preview still looks like mock or fallback output' >&2
  head -c 500 /tmp/dudesign-smoke-preview.html >&2
  echo >&2
  exit 1
fi

if ! grep -Eqi '<!doctype|<html' /tmp/dudesign-smoke-preview.html; then
  echo 'babelo-prompt-smoke:preview does not look like HTML' >&2
  head -c 500 /tmp/dudesign-smoke-preview.html >&2
  echo >&2
  exit 1
fi

echo "babelo-prompt-smoke:completed job=$job_id variation=$variation_id"
REMOTE
