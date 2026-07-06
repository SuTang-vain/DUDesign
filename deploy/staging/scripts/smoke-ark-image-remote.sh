#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
real_smoke="${DUDESIGN_STAGING_ARK_REAL_SMOKE:-0}"
ark_api_key_override="${DUDESIGN_STAGING_ARK_API_KEY:-${ARK_API_KEY:-${DUDESIGN_ARK_API_KEY:-}}}"
ark_generation_url="${DUDESIGN_STAGING_ARK_IMAGE_GENERATION_URL:-${ARK_IMAGE_GENERATION_URL:-https://ark.cn-beijing.volces.com/api/v3/images/generations}}"
ark_model="${DUDESIGN_STAGING_ARK_IMAGE_MODEL:-${ARK_IMAGE_MODEL:-doubao-seedream-5-0-260128}}"
ark_timeout_ms="${DUDESIGN_STAGING_ARK_IMAGE_TIMEOUT_MS:-${ARK_IMAGE_TIMEOUT_MS:-90000}}"
ark_prompt="${DUDESIGN_STAGING_ARK_IMAGE_PROMPT:-Original blue abstract knowledge-card illustration, geometric layers, clean editorial visual, no logo, no copyrighted character.}"
ark_size="${DUDESIGN_STAGING_ARK_IMAGE_SIZE:-2K}"

ssh "$remote" "BASE_DIR=$(printf '%q' "$base_dir") ARK_REAL_SMOKE=$(printf '%q' "$real_smoke") ARK_API_KEY_OVERRIDE=$(printf '%q' "$ark_api_key_override") ARK_IMAGE_GENERATION_URL_OVERRIDE=$(printf '%q' "$ark_generation_url") ARK_IMAGE_MODEL_OVERRIDE=$(printf '%q' "$ark_model") ARK_IMAGE_TIMEOUT_MS_OVERRIDE=$(printf '%q' "$ark_timeout_ms") ARK_IMAGE_PROMPT=$(printf '%q' "$ark_prompt") ARK_IMAGE_SIZE=$(printf '%q' "$ark_size") bash -s" <<'REMOTE'
set -euo pipefail

cd "$BASE_DIR/dudesign/current"

if [ "$ARK_REAL_SMOKE" != "1" ]; then
  echo 'ark-image-smoke:skipped DUDESIGN_STAGING_ARK_REAL_SMOKE is not 1'
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo 'ark-image-smoke:python3 is required' >&2
  exit 1
fi

compose_profile_args=''
if grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  compose_profile_args='--profile babel-o'
fi

cleanup() {
  set +e
  if [ -f /tmp/dudesign-ark-image.env.backup ]; then
    cp /tmp/dudesign-ark-image.env.backup deploy/staging/.env
    docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env up -d api >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cp deploy/staging/.env /tmp/dudesign-ark-image.env.backup

env_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" deploy/staging/.env | tail -n 1 | cut -d= -f2- || true)"
  printf '%s' "$value"
}

ark_api_key="${ARK_API_KEY_OVERRIDE:-$(env_value ARK_API_KEY)}"
if [ -z "$ark_api_key" ]; then
  ark_api_key="$(env_value DUDESIGN_ARK_API_KEY)"
fi
if [ -z "$ark_api_key" ]; then
  ark_api_key="$(env_value DUDESIGN_STAGING_ARK_API_KEY)"
fi
if [ -z "$ark_api_key" ]; then
  echo 'ark-image-smoke:DUDESIGN_STAGING_ARK_REAL_SMOKE=1 requires ARK_API_KEY in local env, DUDESIGN_STAGING_ARK_API_KEY, or staging .env' >&2
  exit 1
fi

write_ark_env() {
  ARK_API_KEY_VALUE="$ark_api_key" \
  ARK_IMAGE_GENERATION_URL_VALUE="${ARK_IMAGE_GENERATION_URL_OVERRIDE:-https://ark.cn-beijing.volces.com/api/v3/images/generations}" \
  ARK_IMAGE_MODEL_VALUE="${ARK_IMAGE_MODEL_OVERRIDE:-doubao-seedream-5-0-260128}" \
  ARK_IMAGE_TIMEOUT_MS_VALUE="${ARK_IMAGE_TIMEOUT_MS_OVERRIDE:-90000}" \
  python3 - <<'PY'
from pathlib import Path
import os

path = Path("deploy/staging/.env")
lines = path.read_text().splitlines()
updates = {
    "DUDESIGN_MCP_EXECUTOR": "mock",
    "DUDESIGN_IMAGE_GENERATION_PROVIDER": "ark_seedream",
    "ARK_API_KEY": os.environ["ARK_API_KEY_VALUE"],
    "ARK_IMAGE_GENERATION_URL": os.environ["ARK_IMAGE_GENERATION_URL_VALUE"],
    "ARK_IMAGE_MODEL": os.environ["ARK_IMAGE_MODEL_VALUE"],
    "ARK_IMAGE_TIMEOUT_MS": os.environ["ARK_IMAGE_TIMEOUT_MS_VALUE"],
}
seen = set()
out = []
for line in lines:
    key = line.split("=", 1)[0] if "=" in line and not line.startswith("#") else None
    if key in updates:
        out.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out) + "\n")
PY
}

restart_api() {
  docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env up -d api >/dev/null
  for attempt in 1 2 3 4 5 6 7 8; do
    if curl -fsS -o /tmp/dudesign-ark-bootstrap.json http://127.0.0.1/api/dev/bootstrap \
      && python3 - /tmp/dudesign-ark-bootstrap.json <<'PY'
import json
import sys

try:
    data = json.load(open(sys.argv[1]))
except Exception:
    raise SystemExit(1)

if not data.get("user", {}).get("id") or not data.get("workspace", {}).get("id"):
    raise SystemExit(1)
PY
    then
      return 0
    fi
    sleep "$attempt"
  done
  curl -fsS -o /tmp/dudesign-ark-bootstrap.json http://127.0.0.1/api/dev/bootstrap
  echo 'ark-image-smoke:bootstrap-not-ready' >&2
  cat /tmp/dudesign-ark-bootstrap.json >&2
  exit 1
}

write_ark_env
restart_api

user_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["user"]["id"])' /tmp/dudesign-ark-bootstrap.json)"
workspace_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["workspace"]["id"])' /tmp/dudesign-ark-bootstrap.json)"

WORKSPACE_ID="$workspace_id" python3 - <<'PY' > /tmp/dudesign-ark-session-payload.json
import json
import os
print(json.dumps({"workspaceId": os.environ["WORKSPACE_ID"], "mode": "new_html", "title": "Ark Seedream image smoke"}))
PY

curl -fsS -o /tmp/dudesign-ark-session.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-ark-session-payload.json \
  http://127.0.0.1/api/sessions
session_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["session"]["id"])' /tmp/dudesign-ark-session.json)"

SESSION_ID="$session_id" python3 - <<'PY' > /tmp/dudesign-ark-job-payload.json
import json
import os
print(json.dumps({
    "sessionId": os.environ["SESSION_ID"],
    "prompt": "Ark Seedream image artifact staging smoke.",
    "sourceMode": "new_html",
    "productMode": "dynamic_encyclopedia_card",
    "variationCount": 1,
    "capabilityRequirements": {
        "template": {"domainTemplateId": "tpl_dynamic_encyclopedia_entry"},
        "plugins": {
            "skillIds": ["sk_visual_asset_brief"],
            "mcpToolIds": ["mcp_image_generation_ark_seedream"],
        },
    },
}))
PY

curl -fsS -o /tmp/dudesign-ark-job.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-ark-job-payload.json \
  http://127.0.0.1/api/design-jobs

USER_ID="$user_id" WORKSPACE_ID="$workspace_id" SESSION_ID="$session_id" python3 - /tmp/dudesign-ark-job.json <<'PY' > /tmp/dudesign-ark-invoke-payload.json
import json
import os
import sys

job_response = json.load(open(sys.argv[1]))
job = job_response["job"]
variation = job_response["variations"][0]
print(json.dumps({
    "userId": os.environ["USER_ID"],
    "workspaceId": os.environ["WORKSPACE_ID"],
    "sessionId": os.environ["SESSION_ID"],
    "jobId": job["id"],
    "variationId": variation["id"],
    "runtimeSessionId": None,
    "mcpToolId": "mcp_image_generation_ark_seedream",
    "serverName": "image-generation",
    "toolName": "generateArkSeedreamImage",
    "scopes": ["artifact_write", "readonly_context"],
    "input": {
        "prompt": os.environ["ARK_IMAGE_PROMPT"],
        "model": os.environ["ARK_IMAGE_MODEL_OVERRIDE"],
        "size": os.environ["ARK_IMAGE_SIZE"],
        "watermark": True,
        "usageContext": "dynamic_encyclopedia_card",
        "contentSafety": {"policy": "strict", "allowBrandReference": False},
    },
    "reason": "Staging Ark Seedream image generation smoke.",
}))
PY

curl -fsS -o /tmp/dudesign-ark-execute.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-ark-invoke-payload.json \
  http://127.0.0.1/api/mcp/invocations/execute

python3 - /tmp/dudesign-ark-execute.json <<'PY'
import json
import sys

data = json.load(open(sys.argv[1]))
if data.get("status") != "authorized":
    raise SystemExit(f"expected authorized Ark image invocation: {data}")
result = data.get("result", {})
if result.get("status") != "ok":
    raise SystemExit(f"expected ok Ark image result: {data}")
image_generation = (result.get("data") or {}).get("imageGeneration") or {}
artifact = (result.get("data") or {}).get("imageGenerationArtifact") or {}
if image_generation.get("provider") != "ark_seedream":
    raise SystemExit(f"expected ark_seedream provider: {data}")
if image_generation.get("imageUrl", "").startswith("http"):
    raise SystemExit(f"provider URL leaked instead of artifact-backed URL: {image_generation}")
if not image_generation.get("imageUrl", "").startswith("/api/capability-artifacts/"):
    raise SystemExit(f"missing artifact-backed image URL: {image_generation}")
if artifact.get("schemaVersion") != "2026-07-06.dudesign-image-generation-artifact.v1":
    raise SystemExit(f"invalid image artifact schema: {artifact}")
if artifact.get("provider") != "ark_seedream":
    raise SystemExit(f"invalid image artifact provider: {artifact}")
if artifact.get("contentSafetyStatus") != "passed":
    raise SystemExit(f"expected passed content safety status: {artifact}")
if not artifact.get("artifactId") or not artifact.get("storageKey") or not artifact.get("contentHash"):
    raise SystemExit(f"missing persisted artifact metadata: {artifact}")
PY

job_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["job"]["id"])' /tmp/dudesign-ark-job.json)"
curl -fsS -o /tmp/dudesign-ark-admin-audit-ok.json \
  -H 'x-dudesign-admin-role: support' \
  "http://127.0.0.1/api/admin/mcp/invocations?jobId=$job_id&status=ok&mcpToolId=mcp_image_generation_ark_seedream"

python3 - /tmp/dudesign-ark-admin-audit-ok.json /tmp/dudesign-ark-execute.json <<'PY'
import json
import sys

audit = json.load(open(sys.argv[1]))
execute = json.load(open(sys.argv[2]))
invocation_id = execute["invocationId"]
records = audit.get("invocations", [])
if not any(record.get("invocationId") == invocation_id and record.get("status") == "ok" for record in records):
    raise SystemExit(f"missing admin MCP audit record for {invocation_id}: {audit}")
PY

echo 'ark-image-smoke:completed'
REMOTE
