#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
real_smoke="${DUDESIGN_STAGING_GUIDANCE_GOLDEN_SMOKE:-0}"
fixture_limit="${DUDESIGN_GUIDANCE_EVAL_LIMIT:-100}"
concurrency="${DUDESIGN_GUIDANCE_EVAL_CONCURRENCY:-3}"
timeout_ms="${DUDESIGN_GUIDANCE_ANALYSIS_TIMEOUT_MS:-210000}"
report="${DUDESIGN_GUIDANCE_EVAL_REPORT:-/app/.dudesign/artifacts/reports/guidance-golden-report.json}"
fixture_ids="${DUDESIGN_GUIDANCE_EVAL_FIXTURE_IDS:-}"

ssh "$remote" "BASE_DIR='$base_dir' REAL_SMOKE='$real_smoke' FIXTURE_LIMIT='$fixture_limit' FIXTURE_IDS='$fixture_ids' CONCURRENCY='$concurrency' GUIDANCE_TIMEOUT_MS='$timeout_ms' REPORT='$report' LOCAL_REAL_SMOKE_SET='${DUDESIGN_STAGING_GUIDANCE_GOLDEN_SMOKE+x}' bash -s" <<'REMOTE'
set -euo pipefail

cd "$BASE_DIR/dudesign/current"

env_value() {
  local key="$1"
  grep -E "^${key}=" deploy/staging/.env | tail -n 1 | cut -d= -f2- || true
}

if [ -z "${LOCAL_REAL_SMOKE_SET:-}" ]; then
  remote_real_smoke="$(env_value DUDESIGN_STAGING_GUIDANCE_GOLDEN_SMOKE)"
  REAL_SMOKE="${remote_real_smoke:-$REAL_SMOKE}"
fi

remote_fixture_limit="$(env_value DUDESIGN_GUIDANCE_EVAL_LIMIT)"
remote_concurrency="$(env_value DUDESIGN_GUIDANCE_EVAL_CONCURRENCY)"
remote_timeout_ms="$(env_value DUDESIGN_GUIDANCE_ANALYSIS_TIMEOUT_MS)"
remote_report="$(env_value DUDESIGN_GUIDANCE_EVAL_REPORT)"
FIXTURE_LIMIT="${remote_fixture_limit:-$FIXTURE_LIMIT}"
CONCURRENCY="${remote_concurrency:-$CONCURRENCY}"
GUIDANCE_TIMEOUT_MS="${remote_timeout_ms:-$GUIDANCE_TIMEOUT_MS}"
REPORT="${remote_report:-$REPORT}"

threshold_value() {
  local key="$1"
  local fallback="$2"
  local configured
  configured="$(env_value "$key")"
  printf '%s' "${configured:-$fallback}"
}

MIN_COVERAGE="$(threshold_value DUDESIGN_GUIDANCE_EVAL_MIN_COVERAGE 0.98)"
MIN_L1_ACCURACY="$(threshold_value DUDESIGN_GUIDANCE_EVAL_MIN_L1_ACCURACY 0.90)"
MIN_L2_ACCURACY="$(threshold_value DUDESIGN_GUIDANCE_EVAL_MIN_L2_ACCURACY 0.82)"
MIN_TAXONOMY_ACCURACY="$(threshold_value DUDESIGN_GUIDANCE_EVAL_MIN_TAXONOMY_ACCURACY 0.78)"
MIN_INTENT_ACCURACY="$(threshold_value DUDESIGN_GUIDANCE_EVAL_MIN_INTENT_ACCURACY 0.75)"
MIN_TEMPLATE_RECALL="$(threshold_value DUDESIGN_GUIDANCE_EVAL_MIN_TEMPLATE_RECALL 0.85)"
MIN_CLARIFICATION_PRECISION="$(threshold_value DUDESIGN_GUIDANCE_EVAL_MIN_CLARIFICATION_PRECISION 0.70)"
MIN_CLARIFICATION_RECALL="$(threshold_value DUDESIGN_GUIDANCE_EVAL_MIN_CLARIFICATION_RECALL 0.70)"

if [ "$REAL_SMOKE" != "1" ]; then
  echo 'guidance-golden-smoke:skipped DUDESIGN_STAGING_GUIDANCE_GOLDEN_SMOKE is not 1'
  exit 0
fi

if ! grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  echo 'guidance-golden-smoke:requires BabeL-O runtime provider' >&2
  exit 1
fi

case "$FIXTURE_LIMIT" in
  ''|*[!0-9]*) echo "guidance-golden-smoke:invalid fixture limit $FIXTURE_LIMIT" >&2; exit 1 ;;
esac
case "$CONCURRENCY" in
  ''|*[!0-9]*) echo "guidance-golden-smoke:invalid concurrency $CONCURRENCY" >&2; exit 1 ;;
esac
if [ "$FIXTURE_LIMIT" -lt 1 ] || [ "$FIXTURE_LIMIT" -gt 100 ]; then
  echo 'guidance-golden-smoke:fixture limit must be 1..100' >&2
  exit 1
fi
if [ "$CONCURRENCY" -lt 1 ] || [ "$CONCURRENCY" -gt 12 ]; then
  echo 'guidance-golden-smoke:concurrency must be 1..12' >&2
  exit 1
fi

compose_profile_args='--profile babel-o'
if grep -Eq '^DUDESIGN_RUNTIME_LANE_MODE=static$' deploy/staging/.env \
  || grep -Eq '^DUDESIGN_RUNTIME_LANES_JSON=.+$' deploy/staging/.env; then
  compose_profile_args='--profile babel-o-multilane'
fi

echo "guidance-golden-smoke:running fixtures=$FIXTURE_LIMIT concurrency=$CONCURRENCY"
docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env exec -T \
  -e DUDESIGN_GUIDANCE_BABELO_BASE_URL=http://runtime-adapter:4100 \
  -e DUDESIGN_GUIDANCE_ANALYSIS_ENDPOINT=/v1/guidance/analyze \
  -e DUDESIGN_GUIDANCE_ANALYSIS_TIMEOUT_MS="$GUIDANCE_TIMEOUT_MS" \
  -e DUDESIGN_GUIDANCE_EVAL_LIMIT="$FIXTURE_LIMIT" \
  -e DUDESIGN_GUIDANCE_EVAL_FIXTURE_IDS="$FIXTURE_IDS" \
  -e DUDESIGN_GUIDANCE_EVAL_CONCURRENCY="$CONCURRENCY" \
  -e DUDESIGN_GUIDANCE_EVAL_REPORT="$REPORT" \
  -e DUDESIGN_GUIDANCE_EVAL_MIN_COVERAGE="$MIN_COVERAGE" \
  -e DUDESIGN_GUIDANCE_EVAL_MIN_L1_ACCURACY="$MIN_L1_ACCURACY" \
  -e DUDESIGN_GUIDANCE_EVAL_MIN_L2_ACCURACY="$MIN_L2_ACCURACY" \
  -e DUDESIGN_GUIDANCE_EVAL_MIN_TAXONOMY_ACCURACY="$MIN_TAXONOMY_ACCURACY" \
  -e DUDESIGN_GUIDANCE_EVAL_MIN_INTENT_ACCURACY="$MIN_INTENT_ACCURACY" \
  -e DUDESIGN_GUIDANCE_EVAL_MIN_TEMPLATE_RECALL="$MIN_TEMPLATE_RECALL" \
  -e DUDESIGN_GUIDANCE_EVAL_MIN_CLARIFICATION_PRECISION="$MIN_CLARIFICATION_PRECISION" \
  -e DUDESIGN_GUIDANCE_EVAL_MIN_CLARIFICATION_RECALL="$MIN_CLARIFICATION_RECALL" \
  api node apps/api/dist/encyclopediaGuidanceEvaluationRunner.js
echo "guidance-golden-smoke:passed report=$REPORT"
REMOTE
