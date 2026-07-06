#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
mcp_port="${DUDESIGN_STAGING_MCP_SMOKE_PORT:-4517}"

ssh "$remote" "BASE_DIR='$base_dir' MCP_PORT='$mcp_port' bash -s" <<'REMOTE'
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
HTTPServer(("127.0.0.1", port), Handler).serve_forever()
PY

MCP_PORT="$MCP_PORT" python3 /tmp/dudesign-mcp-smoke-server.py &
MCP_SERVER_PID=$!
sleep 1
curl -fsS -o /tmp/dudesign-mcp-smoke-probe.json \
  -H 'content-type: application/json' \
  --data '{"request":{"invocationId":"probe","mcpToolId":"mcp_accessibility_validate","serverName":"quality-tools","toolName":"validateAccessibility","scopes":["validation_only"],"input":{}}}' \
  "http://127.0.0.1:$MCP_PORT/v1/mcp/invocations"

python3 - <<PY
from pathlib import Path
path = Path("deploy/staging/.env")
lines = path.read_text().splitlines()
updates = {
    "DUDESIGN_MCP_EXECUTOR": "http",
    "DUDESIGN_MCP_BASE_URL": f"http://host.docker.internal:$MCP_PORT",
    "DUDESIGN_MCP_ENDPOINT_PATH": "/v1/mcp/invocations",
    "DUDESIGN_MCP_TIMEOUT_MS": "10000",
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

docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env up -d api

for attempt in 1 2 3 4 5; do
  if curl -fsS -o /tmp/dudesign-mcp-bootstrap.json http://127.0.0.1/api/dev/bootstrap; then
    break
  fi
  sleep "$attempt"
done

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

python3 - /tmp/dudesign-mcp-job.json <<'PY' > /tmp/dudesign-mcp-invoke-payload.json
import json
import sys
job_response = json.load(open(sys.argv[1]))
job = job_response["job"]
variation = job_response["variations"][0]
print(json.dumps({
    "userId": job["userId"],
    "workspaceId": job["workspaceId"],
    "sessionId": job["sessionId"],
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
if data.get("result", {}).get("summary") != "Staging MCP HTTP smoke executed.":
    raise SystemExit(f"unexpected MCP execute result: {data}")
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
if data.get("result", {}).get("summary") != "Staging MCP HTTP smoke executed.":
    raise SystemExit(f"unexpected MCP replay result: {data}")
if "Source: quality-tools.validateAccessibility" not in (data.get("toolContext") or {}).get("contextText", ""):
    raise SystemExit(f"unexpected MCP replay toolContext: {data.get('toolContext')}")
PY

echo 'mcp-http-smoke:completed'
REMOTE
