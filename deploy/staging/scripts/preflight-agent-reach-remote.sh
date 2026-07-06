#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
agent_reach_search_command="${DUDESIGN_STAGING_AGENT_REACH_SEARCH_COMMAND:-}"
agent_reach_mcporter_config="${DUDESIGN_STAGING_AGENT_REACH_MCPORTER_CONFIG:-}"

ssh "$remote" "BASE_DIR=$(printf '%q' "$base_dir") AGENT_REACH_SEARCH_COMMAND=$(printf '%q' "$agent_reach_search_command") AGENT_REACH_MCPORTER_CONFIG=$(printf '%q' "$agent_reach_mcporter_config") bash -s" <<'REMOTE'
set -euo pipefail

current="$BASE_DIR/dudesign/current"
echo "agent-reach-preflight:remote-ok"

if ! command -v python3 >/dev/null 2>&1; then
  echo "agent-reach-preflight:missing python3" >&2
  exit 1
fi
echo "agent-reach-preflight:python3 $(command -v python3)"

if ! command -v docker >/dev/null 2>&1; then
  echo "agent-reach-preflight:missing docker" >&2
  exit 1
fi
echo "agent-reach-preflight:docker $(command -v docker)"

if [ ! -d "$current" ]; then
  echo "agent-reach-preflight:missing $current" >&2
  exit 1
fi
echo "agent-reach-preflight:dudesign-current-ok"

if [ ! -f "$current/deploy/staging/scripts/agent-reach-mcp-adapter.py" ]; then
  echo "agent-reach-preflight:missing deployed agent-reach-mcp-adapter.py" >&2
  exit 2
fi
echo "agent-reach-preflight:adapter-present"

if [ ! -f "$current/deploy/staging/scripts/smoke-agent-reach-remote.sh" ]; then
  echo "agent-reach-preflight:missing deployed smoke-agent-reach-remote.sh" >&2
  exit 2
fi
echo "agent-reach-preflight:smoke-present"

if command -v mcporter >/dev/null 2>&1; then
  echo "agent-reach-preflight:mcporter $(command -v mcporter)"
  if [ -z "${AGENT_REACH_MCPORTER_CONFIG:-}" ]; then
    if [ -f "$HOME/config/mcporter.json" ]; then
      AGENT_REACH_MCPORTER_CONFIG="$HOME/config/mcporter.json"
    elif [ -f "$HOME/.mcporter/mcporter.json" ]; then
      AGENT_REACH_MCPORTER_CONFIG="$HOME/.mcporter/mcporter.json"
    fi
  fi
  if [ -n "${AGENT_REACH_MCPORTER_CONFIG:-}" ]; then
    if [ ! -f "$AGENT_REACH_MCPORTER_CONFIG" ]; then
      echo "agent-reach-preflight:missing mcporter config $AGENT_REACH_MCPORTER_CONFIG" >&2
      exit 3
    fi
    echo "agent-reach-preflight:mcporter-config $AGENT_REACH_MCPORTER_CONFIG"
  fi
elif [ -n "${AGENT_REACH_SEARCH_COMMAND:-}" ]; then
  echo "agent-reach-preflight:custom-search-command"
else
  echo "agent-reach-preflight:missing mcporter or AGENT_REACH_SEARCH_COMMAND" >&2
  exit 3
fi

agent_reach_cli=''
if command -v agent-reach >/dev/null 2>&1; then
  agent_reach_cli="$(command -v agent-reach)"
elif [ -x "$HOME/.agent-reach-venv/bin/agent-reach" ]; then
  agent_reach_cli="$HOME/.agent-reach-venv/bin/agent-reach"
fi

if [ -n "$agent_reach_cli" ]; then
  "$agent_reach_cli" doctor --json >/tmp/dudesign-agent-reach-doctor.json || true
  echo "agent-reach-preflight:agent-reach $agent_reach_cli"
else
  echo "agent-reach-preflight:agent-reach-cli-not-installed"
fi

echo "agent-reach-preflight:ready"
REMOTE
