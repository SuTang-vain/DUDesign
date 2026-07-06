#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
mcp_port="${DUDESIGN_STAGING_MCP_SMOKE_PORT:-4517}"
unavailable_port="${DUDESIGN_STAGING_MCP_UNAVAILABLE_SMOKE_PORT:-4518}"
real_smoke="${DUDESIGN_STAGING_MCP_REAL_SMOKE:-0}"
real_base_url="${DUDESIGN_STAGING_MCP_REAL_BASE_URL:-}"
real_endpoint_path="${DUDESIGN_STAGING_MCP_REAL_ENDPOINT_PATH:-/v1/mcp/invocations}"
real_api_key="${DUDESIGN_STAGING_MCP_REAL_API_KEY:-}"
real_auth_header="${DUDESIGN_STAGING_MCP_REAL_AUTH_HEADER:-}"
real_timeout_ms="${DUDESIGN_STAGING_MCP_REAL_TIMEOUT_MS:-30000}"

ssh "$remote" "BASE_DIR='$base_dir' MCP_PORT='$mcp_port' MCP_UNAVAILABLE_PORT='$unavailable_port' MCP_REAL_SMOKE='$real_smoke' MCP_REAL_BASE_URL='$real_base_url' MCP_REAL_ENDPOINT_PATH='$real_endpoint_path' MCP_REAL_API_KEY='$real_api_key' MCP_REAL_AUTH_HEADER='$real_auth_header' MCP_REAL_TIMEOUT_MS='$real_timeout_ms' bash -s" <<'REMOTE'
set -euo pipefail

cd "$BASE_DIR/dudesign/current"

if ! command -v python3 >/dev/null 2>&1; then
  echo 'mcp-http-smoke:python3 is required' >&2
  exit 1
fi

compose_profile_args=''
if grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  compose_profile_args='--profile babel-o'
fi

cleanup() {
  set +e
  if [ -n "${MCP_SERVER_PID:-}" ]; then
    kill "$MCP_SERVER_PID" >/dev/null 2>&1 || true
    wait "$MCP_SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [ -f /tmp/dudesign-mcp-smoke.env.backup ]; then
    cp /tmp/dudesign-mcp-smoke.env.backup deploy/staging/.env
    docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env up -d api >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cp deploy/staging/.env /tmp/dudesign-mcp-smoke.env.backup

env_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" deploy/staging/.env | tail -n 1 | cut -d= -f2- || true)"
  printf '%s' "$value"
}

write_mcp_env() {
  local base_url="$1"
  local endpoint_path="$2"
  local api_key="$3"
  local auth_header="$4"
  local timeout_ms="$5"

  MCP_BASE_URL="$base_url" \
  MCP_ENDPOINT_PATH="$endpoint_path" \
  MCP_API_KEY="$api_key" \
  MCP_AUTH_HEADER="$auth_header" \
  MCP_TIMEOUT_MS="$timeout_ms" \
  python3 - <<'PY'
from pathlib import Path
import os

path = Path("deploy/staging/.env")
lines = path.read_text().splitlines()
updates = {
    "DUDESIGN_MCP_EXECUTOR": "http",
    "DUDESIGN_MCP_BASE_URL": os.environ["MCP_BASE_URL"],
    "DUDESIGN_MCP_ENDPOINT_PATH": os.environ["MCP_ENDPOINT_PATH"],
    "DUDESIGN_MCP_API_KEY": os.environ["MCP_API_KEY"],
    "DUDESIGN_MCP_AUTH_HEADER": os.environ["MCP_AUTH_HEADER"],
    "DUDESIGN_MCP_TIMEOUT_MS": os.environ["MCP_TIMEOUT_MS"],
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
    if curl -fsS -o /tmp/dudesign-mcp-bootstrap.json http://127.0.0.1/api/dev/bootstrap \
      && python3 - /tmp/dudesign-mcp-bootstrap.json <<'PY'
import json
import sys

try:
    data = json.load(open(sys.argv[1]))
except Exception:
    raise SystemExit(1)

if not data.get("workspace", {}).get("id"):
    raise SystemExit(1)
PY
    then
      return 0
    fi
    sleep "$attempt"
  done
  curl -fsS -o /tmp/dudesign-mcp-bootstrap.json http://127.0.0.1/api/dev/bootstrap
  echo 'mcp-http-smoke:bootstrap-not-ready' >&2
  cat /tmp/dudesign-mcp-bootstrap.json >&2
  exit 1
}

if [ "$MCP_REAL_SMOKE" = "1" ]; then
  mcp_base_url="${MCP_REAL_BASE_URL:-$(env_value DUDESIGN_MCP_BASE_URL)}"
  mcp_endpoint_path="${MCP_REAL_ENDPOINT_PATH:-$(env_value DUDESIGN_MCP_ENDPOINT_PATH)}"
  mcp_api_key="${MCP_REAL_API_KEY:-$(env_value DUDESIGN_MCP_API_KEY)}"
  mcp_auth_header="${MCP_REAL_AUTH_HEADER:-$(env_value DUDESIGN_MCP_AUTH_HEADER)}"
  mcp_timeout_ms="${MCP_REAL_TIMEOUT_MS:-$(env_value DUDESIGN_MCP_TIMEOUT_MS)}"
  mcp_endpoint_path="${mcp_endpoint_path:-/v1/mcp/invocations}"
  mcp_timeout_ms="${mcp_timeout_ms:-30000}"
  if [ -z "$mcp_base_url" ]; then
    echo 'mcp-http-smoke:DUDESIGN_STAGING_MCP_REAL_SMOKE=1 requires DUDESIGN_STAGING_MCP_REAL_BASE_URL or DUDESIGN_MCP_BASE_URL in staging .env' >&2
    exit 1
  fi
  echo "mcp-http-smoke:real-server base=$mcp_base_url endpoint=$mcp_endpoint_path"
else
  cat > /tmp/dudesign-mcp-smoke-server.py <<'PY'
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        request = payload["request"]
        result = {
            "invocationId": request["invocationId"],
            "status": "ok",
            "mcpToolId": request["mcpToolId"],
            "source": {
                "serverName": request["serverName"],
                "toolName": request["toolName"],
                "scopes": request["scopes"],
            },
            "summary": "Staging MCP HTTP smoke executed.",
            "references": [{"id": "staging_mcp_http_smoke", "title": "Staging MCP HTTP Smoke"}],
            "data": {"transport": "http", "receivedInput": request.get("input", {})},
            "completedAt": "2026-07-06T00:00:00.000Z",
        }
        body = json.dumps({"result": result}).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        return

port = int(os.environ["MCP_PORT"])
HTTPServer(("0.0.0.0", port), Handler).serve_forever()
PY

  MCP_PORT="$MCP_PORT" python3 /tmp/dudesign-mcp-smoke-server.py &
  MCP_SERVER_PID=$!
  sleep 1
  curl -fsS -o /tmp/dudesign-mcp-smoke-probe.json \
    -H 'content-type: application/json' \
    --data '{"request":{"invocationId":"probe","mcpToolId":"mcp_accessibility_validate","serverName":"quality-tools","toolName":"validateAccessibility","scopes":["validation_only"],"input":{}}}' \
    "http://127.0.0.1:$MCP_PORT/v1/mcp/invocations"
  mcp_base_url="http://host.docker.internal:$MCP_PORT"
  mcp_endpoint_path="/v1/mcp/invocations"
  mcp_api_key=""
  mcp_auth_header=""
  mcp_timeout_ms="10000"
  echo "mcp-http-smoke:mock-server port=$MCP_PORT"
fi

write_mcp_env "$mcp_base_url" "$mcp_endpoint_path" "$mcp_api_key" "$mcp_auth_header" "$mcp_timeout_ms"
restart_api

user_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["user"]["id"])' /tmp/dudesign-mcp-bootstrap.json)"
workspace_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["workspace"]["id"])' /tmp/dudesign-mcp-bootstrap.json)"

WORKSPACE_ID="$workspace_id" python3 - <<'PY' > /tmp/dudesign-mcp-session-payload.json
import json
import os
print(json.dumps({"workspaceId": os.environ["WORKSPACE_ID"], "mode": "new_html", "title": "Staging MCP HTTP smoke"}))
PY

curl -fsS -o /tmp/dudesign-mcp-session.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-mcp-session-payload.json \
  http://127.0.0.1/api/sessions
session_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["session"]["id"])' /tmp/dudesign-mcp-session.json)"

SESSION_ID="$session_id" python3 - <<'PY' > /tmp/dudesign-mcp-job-payload.json
import json
import os
print(json.dumps({
    "sessionId": os.environ["SESSION_ID"],
    "prompt": "MCP HTTP smoke placeholder job.",
    "sourceMode": "new_html",
    "variationCount": 1,
    "capabilityRequirements": {
        "plugins": {
            "skillIds": ["sk_static_export_safe", "sk_accessibility_first"],
            "mcpToolIds": ["mcp_accessibility_validate"],
        }
    },
    "templateRequirements": {
        "styles": ["mcp-http-smoke"],
        "deviceTargets": ["desktop"],
    },
}))
PY

curl -fsS -o /tmp/dudesign-mcp-job.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-mcp-job-payload.json \
  http://127.0.0.1/api/design-jobs

USER_ID="$user_id" WORKSPACE_ID="$workspace_id" SESSION_ID="$session_id" python3 - /tmp/dudesign-mcp-job.json <<'PY' > /tmp/dudesign-mcp-invoke-payload.json
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
    "mcpToolId": "mcp_accessibility_validate",
    "serverName": "quality-tools",
    "toolName": "validateAccessibility",
    "scopes": ["validation_only"],
    "input": {"artifactId": "staging-mcp-http-smoke"},
    "reason": "Staging MCP HTTP transport smoke.",
}))
PY

curl -fsS -o /tmp/dudesign-mcp-execute.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-mcp-invoke-payload.json \
  http://127.0.0.1/api/mcp/invocations/execute

python3 - /tmp/dudesign-mcp-execute.json <<'PY' > /tmp/dudesign-mcp-replay-url.txt
import json
import sys
from urllib.parse import quote
data = json.load(open(sys.argv[1]))
if data.get("status") != "authorized":
    raise SystemExit(f"expected authorized MCP invocation: {data}")
result = data.get("result", {})
if result.get("status") != "ok":
    raise SystemExit(f"expected ok MCP execute result: {data}")
if not result.get("summary"):
    raise SystemExit(f"missing MCP execute summary: {data}")
context = data.get("toolContext") or {}
if "Source: quality-tools.validateAccessibility" not in context.get("contextText", ""):
    raise SystemExit(f"missing source in toolContext: {context}")
print("/api/mcp/invocations/replay/" + quote(data["invocationAuditRecord"]["replayKey"], safe=""))
PY

replay_url="$(cat /tmp/dudesign-mcp-replay-url.txt)"
curl -fsS -o /tmp/dudesign-mcp-replay.json "http://127.0.0.1$replay_url"

python3 - /tmp/dudesign-mcp-replay.json <<'PY'
import json
import sys
data = json.load(open(sys.argv[1]))
if data.get("result", {}).get("status") != "ok":
    raise SystemExit(f"unexpected MCP replay result: {data}")
if "Source: quality-tools.validateAccessibility" not in (data.get("toolContext") or {}).get("contextText", ""):
    raise SystemExit(f"unexpected MCP replay toolContext: {data.get('toolContext')}")
PY

job_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["job"]["id"])' /tmp/dudesign-mcp-job.json)"
curl -fsS -o /tmp/dudesign-mcp-admin-audit-ok.json \
  -H 'x-dudesign-admin-role: support' \
  "http://127.0.0.1/api/admin/mcp/invocations?jobId=$job_id&status=ok"

python3 - /tmp/dudesign-mcp-admin-audit-ok.json /tmp/dudesign-mcp-execute.json <<'PY'
import json
import sys
audit = json.load(open(sys.argv[1]))
execute = json.load(open(sys.argv[2]))
invocation_id = execute["invocationId"]
records = audit.get("invocations", [])
if not any(record.get("invocationId") == invocation_id and record.get("replayKey") == execute["invocationAuditRecord"]["replayKey"] for record in records):
    raise SystemExit(f"missing admin MCP audit record for {invocation_id}: {audit}")
PY

write_mcp_env "http://host.docker.internal:$MCP_UNAVAILABLE_PORT" "/v1/mcp/invocations" "" "" "1200"
restart_api

curl -fsS -o /tmp/dudesign-mcp-unavailable.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-mcp-invoke-payload.json \
  http://127.0.0.1/api/mcp/invocations/execute

python3 - /tmp/dudesign-mcp-unavailable.json <<'PY'
import json
import sys
data = json.load(open(sys.argv[1]))
result = data.get("result", {})
if result.get("status") != "unavailable":
    raise SystemExit(f"expected MCP unavailable degradation: {data}")
if (result.get("error") or {}).get("code") != "MCP_UNAVAILABLE":
    raise SystemExit(f"expected MCP_UNAVAILABLE code: {data}")
PY

curl -fsS -o /tmp/dudesign-mcp-admin-audit-unavailable.json \
  -H 'x-dudesign-admin-role: support' \
  "http://127.0.0.1/api/admin/mcp/invocations?jobId=$job_id&status=unavailable"

python3 - /tmp/dudesign-mcp-admin-audit-unavailable.json /tmp/dudesign-mcp-unavailable.json <<'PY'
import json
import sys
audit = json.load(open(sys.argv[1]))
unavailable = json.load(open(sys.argv[2]))
invocation_id = unavailable["invocationId"]
if not any(record.get("invocationId") == invocation_id and record.get("status") == "unavailable" for record in audit.get("invocations", [])):
    raise SystemExit(f"missing unavailable admin audit record for {invocation_id}: {audit}")
PY

if [ "$MCP_REAL_SMOKE" = "1" ]; then
  echo 'mcp-http-smoke:real-completed'
else
  echo 'mcp-http-smoke:mock-completed'
fi
REMOTE
