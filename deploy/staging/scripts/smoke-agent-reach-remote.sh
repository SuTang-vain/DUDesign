#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
agent_reach_port="${DUDESIGN_STAGING_AGENT_REACH_MCP_PORT:-4520}"
agent_reach_query="${DUDESIGN_STAGING_AGENT_REACH_QUERY:-dynamic encyclopedia card iframe interaction references}"
agent_reach_search_command="${DUDESIGN_STAGING_AGENT_REACH_SEARCH_COMMAND:-}"
agent_reach_mcporter_config="${DUDESIGN_STAGING_AGENT_REACH_MCPORTER_CONFIG:-}"

ssh "$remote" "BASE_DIR=$(printf '%q' "$base_dir") AGENT_REACH_MCP_PORT=$(printf '%q' "$agent_reach_port") AGENT_REACH_QUERY=$(printf '%q' "$agent_reach_query") AGENT_REACH_SEARCH_COMMAND=$(printf '%q' "$agent_reach_search_command") AGENT_REACH_MCPORTER_CONFIG=$(printf '%q' "$agent_reach_mcporter_config") bash -s" <<'REMOTE'
set -euo pipefail

cd "$BASE_DIR/dudesign/current"

if ! command -v python3 >/dev/null 2>&1; then
  echo 'agent-reach-smoke:python3 is required' >&2
  exit 1
fi

if ! command -v mcporter >/dev/null 2>&1 && [ -z "${AGENT_REACH_SEARCH_COMMAND:-}" ]; then
  echo 'agent-reach-smoke:mcporter is required unless AGENT_REACH_SEARCH_COMMAND is set' >&2
  exit 1
fi

if [ -z "${AGENT_REACH_SEARCH_COMMAND:-}" ] && [ -z "${AGENT_REACH_MCPORTER_CONFIG:-}" ]; then
  if [ -f "$HOME/config/mcporter.json" ]; then
    AGENT_REACH_MCPORTER_CONFIG="$HOME/config/mcporter.json"
  elif [ -f "$HOME/.mcporter/mcporter.json" ]; then
    AGENT_REACH_MCPORTER_CONFIG="$HOME/.mcporter/mcporter.json"
  fi
fi

compose_profile_args=''
if grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  compose_profile_args='--profile babel-o'
fi

cleanup() {
  set +e
  if [ -n "${AGENT_REACH_ADAPTER_PID:-}" ]; then
    kill "$AGENT_REACH_ADAPTER_PID" >/dev/null 2>&1 || true
    wait "$AGENT_REACH_ADAPTER_PID" >/dev/null 2>&1 || true
  fi
  if [ -f /tmp/dudesign-agent-reach.env.backup ]; then
    cp /tmp/dudesign-agent-reach.env.backup deploy/staging/.env
    docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env up -d api >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cp deploy/staging/.env /tmp/dudesign-agent-reach.env.backup

AGENT_REACH_MCP_PORT="$AGENT_REACH_MCP_PORT" AGENT_REACH_MCPORTER_CONFIG="${AGENT_REACH_MCPORTER_CONFIG:-}" python3 deploy/staging/scripts/agent-reach-mcp-adapter.py &
AGENT_REACH_ADAPTER_PID=$!
sleep 1

python3 - <<'PY' > /tmp/dudesign-agent-reach-probe.json
import json
print(json.dumps({
    "request": {
        "invocationId": "probe",
        "mode": "authorized_invocation",
        "userId": "usr_dev",
        "workspaceId": "ws_dev",
        "sessionId": "sess_probe",
        "jobId": "job_probe",
        "mcpToolId": "mcp_agent_reach_search",
        "serverName": "agent-reach",
        "toolName": "search",
        "scopes": ["readonly_context"],
        "input": {"query": "DUDesign staging Agent-Reach probe", "limit": 1},
        "reason": "Probe Agent-Reach MCP adapter.",
        "requestedAt": "2026-07-06T00:00:00.000Z",
    }
}))
PY

curl -fsS -o /tmp/dudesign-agent-reach-probe-result.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-agent-reach-probe.json \
  "http://127.0.0.1:$AGENT_REACH_MCP_PORT/v1/mcp/invocations"

python3 - /tmp/dudesign-agent-reach-probe-result.json <<'PY'
import json
import sys
data = json.load(open(sys.argv[1]))
result = data.get("result", {})
if result.get("status") != "ok":
    raise SystemExit(f"agent-reach probe failed: {data}")
research = (result.get("data") or {}).get("researchContext") or {}
if research.get("schemaVersion") != "2026-07-06.dudesign-research-context.v1":
    raise SystemExit(f"invalid research context probe: {data}")
PY

python3 - <<'PY'
from pathlib import Path

path = Path("deploy/staging/.env")
lines = path.read_text().splitlines()
updates = {
    "DUDESIGN_MCP_EXECUTOR": "http",
    "DUDESIGN_MCP_BASE_URL": f"http://host.docker.internal:{__import__('os').environ['AGENT_REACH_MCP_PORT']}",
    "DUDESIGN_MCP_ENDPOINT_PATH": "/v1/mcp/invocations",
    "DUDESIGN_MCP_API_KEY": "",
    "DUDESIGN_MCP_AUTH_HEADER": "",
    "DUDESIGN_MCP_TIMEOUT_MS": "90000",
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

docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env up -d api >/dev/null
for attempt in 1 2 3 4 5; do
  if curl -fsS -o /tmp/dudesign-agent-reach-bootstrap.json http://127.0.0.1/api/dev/bootstrap \
    && python3 - /tmp/dudesign-agent-reach-bootstrap.json <<'PY'
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
    break
  fi
  sleep "$attempt"
done
curl -fsS -o /tmp/dudesign-agent-reach-bootstrap.json http://127.0.0.1/api/dev/bootstrap

user_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["user"]["id"])' /tmp/dudesign-agent-reach-bootstrap.json)"
workspace_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["workspace"]["id"])' /tmp/dudesign-agent-reach-bootstrap.json)"

WORKSPACE_ID="$workspace_id" python3 - <<'PY' > /tmp/dudesign-agent-reach-session-payload.json
import json
import os
print(json.dumps({"workspaceId": os.environ["WORKSPACE_ID"], "mode": "new_html", "title": "Agent-Reach research smoke"}))
PY

curl -fsS -o /tmp/dudesign-agent-reach-session.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-agent-reach-session-payload.json \
  http://127.0.0.1/api/sessions
session_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["session"]["id"])' /tmp/dudesign-agent-reach-session.json)"

SESSION_ID="$session_id" python3 - <<'PY' > /tmp/dudesign-agent-reach-job-payload.json
import json
import os
print(json.dumps({
    "sessionId": os.environ["SESSION_ID"],
    "prompt": "Agent-Reach research context staging smoke.",
    "sourceMode": "new_html",
    "productMode": "dynamic_encyclopedia_card",
    "variationCount": 1,
    "capabilityRequirements": {
        "template": {"domainTemplateId": "tpl_dynamic_encyclopedia_entry"},
        "plugins": {
            "skillIds": ["sk_research_brief_builder"],
            "mcpToolIds": ["mcp_agent_reach_search"],
        },
    },
}))
PY

curl -fsS -o /tmp/dudesign-agent-reach-job.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-agent-reach-job-payload.json \
  http://127.0.0.1/api/design-jobs

USER_ID="$user_id" WORKSPACE_ID="$workspace_id" SESSION_ID="$session_id" python3 - /tmp/dudesign-agent-reach-job.json <<'PY' > /tmp/dudesign-agent-reach-invoke-payload.json
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
    "mcpToolId": "mcp_agent_reach_search",
    "serverName": "agent-reach",
    "toolName": "search",
    "scopes": ["readonly_context"],
    "input": {"query": os.environ["AGENT_REACH_QUERY"], "limit": 3},
    "reason": "Staging Agent-Reach research context smoke.",
}))
PY

curl -fsS -o /tmp/dudesign-agent-reach-execute.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-agent-reach-invoke-payload.json \
  http://127.0.0.1/api/mcp/invocations/execute

python3 - /tmp/dudesign-agent-reach-execute.json <<'PY' > /tmp/dudesign-agent-reach-artifact-id.txt
import json
import sys
data = json.load(open(sys.argv[1]))
if data.get("status") != "authorized":
    raise SystemExit(f"expected authorized Agent-Reach invocation: {data}")
result = data.get("result", {})
if result.get("status") != "ok":
    raise SystemExit(f"expected ok Agent-Reach result: {data}")
artifact = ((result.get("data") or {}).get("researchContextArtifact") or {})
if not artifact.get("artifactId"):
    raise SystemExit(f"missing research context artifact reference: {data}")
if artifact.get("schemaVersion") != "2026-07-06.dudesign-research-context.v1":
    raise SystemExit(f"invalid research context artifact schema: {artifact}")
if artifact.get("sourceCount", 0) < 1:
    raise SystemExit(f"expected at least one source: {artifact}")
print(artifact["artifactId"])
PY

research_artifact_id="$(cat /tmp/dudesign-agent-reach-artifact-id.txt)"

SESSION_ID="$session_id" RESEARCH_ARTIFACT_ID="$research_artifact_id" python3 - <<'PY' > /tmp/dudesign-agent-reach-pinned-job-payload.json
import json
import os
print(json.dumps({
    "sessionId": os.environ["SESSION_ID"],
    "prompt": "Pinned Agent-Reach research context staging smoke.",
    "sourceMode": "new_html",
    "productMode": "dynamic_encyclopedia_card",
    "variationCount": 1,
    "capabilityRequirements": {
        "template": {"domainTemplateId": "tpl_dynamic_encyclopedia_entry"},
        "plugins": {
            "skillIds": ["sk_research_brief_builder", "sk_data_intake_analysis"],
            "mcpToolIds": ["mcp_agent_reach_search"],
        },
    },
    "templateRequirements": {
        "researchContextArtifactIds": [os.environ["RESEARCH_ARTIFACT_ID"]],
    },
}))
PY

curl -fsS -o /tmp/dudesign-agent-reach-pinned-job.json \
  -H 'content-type: application/json' \
  --data-binary @/tmp/dudesign-agent-reach-pinned-job-payload.json \
  http://127.0.0.1/api/design-jobs

pinned_job_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["job"]["id"])' /tmp/dudesign-agent-reach-pinned-job.json)"
curl -fsS -o /tmp/dudesign-agent-reach-pinned-snapshot.json "http://127.0.0.1/api/design-jobs/$pinned_job_id"

python3 - /tmp/dudesign-agent-reach-pinned-snapshot.json "$research_artifact_id" <<'PY'
import json
import sys
snapshot = json.load(open(sys.argv[1]))
artifact_id = sys.argv[2]
requirements = snapshot["job"].get("templateRequirements") or {}
if requirements.get("researchContextArtifactIds") != [artifact_id]:
    raise SystemExit(f"research artifact id not pinned: {requirements}")
contexts = requirements.get("researchContexts") or []
if not contexts or contexts[0].get("artifactId") != artifact_id:
    raise SystemExit(f"research context snapshot missing: {requirements}")
if contexts[0].get("schemaVersion") != "2026-07-06.dudesign-research-context.v1":
    raise SystemExit(f"research context schema not pinned: {contexts}")
PY

echo 'agent-reach-smoke:completed'
REMOTE
