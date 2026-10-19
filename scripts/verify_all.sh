#!/usr/bin/env bash
# One-command verification of TrustNet AI. Run from the project root on a machine WITH network access.
# Each step prints PASS/FAIL; the script exits non-zero if any step fails. Results are also written to
# verification-report.txt so they can be pasted into docs/STATUS.md. Nothing here is mocked.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
REPORT="$ROOT/verification-report.txt"; : > "$REPORT"
FAILED=0
step() { # step "<name>" <command...>
  local name="$1"; shift
  echo "== $name"; echo "== $name" >> "$REPORT"
  if "$@" >> "$REPORT" 2>&1; then echo "PASS  $name"; echo "PASS  $name" >> "$REPORT"
  else echo "FAIL  $name (see verification-report.txt)"; echo "FAIL  $name" >> "$REPORT"; FAILED=1; fi
}
PY="${PYTHON:-python3}"
[ -d .venv ] || "$PY" -m venv .venv
# shellcheck disable=SC1091
. .venv/bin/activate
step "pip install backend requirements" pip install -q -r backend/requirements.txt pip-audit
step "npm ci"                           npm ci
step "backend: core/MFA/demo feature tests"  bash -c 'cd backend && python -m unittest test_core_security test_mfa test_refresh_tokens test_geo_policy test_attack_classifier test_demo_scenarios test_demo_replay test_request_policy test_incident_correlation test_learning_idempotency test_ml_detector test_risk_policy_ingest -v'
# Run API and agent suites in separate Python processes. They each create their own
# temporary SQLite database and FastAPI TestClient; importing both in one unittest
# process shares module globals and can hang during lifespan teardown.
step "backend: API integration suite"          bash -c 'cd backend && python -m unittest test_backend_api -v'
step "backend: agent pipeline suite"           bash -c 'cd backend && python -m unittest test_agents -v'
step "backend: ML smoke test"                 python test_ml_models.py
step "backend: synthetic evaluation"             bash -c 'cd backend && python demo_scenarios.py > ../docs/DEMO_SCENARIOS.json
python evaluate_synthetic.py > ../docs/SYNTHETIC_EVALUATION.json'
step "frontend: tsc"                          npx tsc -p tsconfig.app.json --noEmit
step "frontend: eslint"                       npm run lint
step "frontend: vitest"                       npm test
step "frontend: production build"             npm run build
step "audit: pip-audit (backend requirements)" pip-audit -r backend/requirements.txt
step "audit: npm audit (all deps, high+)"      npm audit --audit-level=high
echo; [ "$FAILED" = 0 ] && echo "ALL STEPS PASSED" || echo "SOME STEPS FAILED - see $REPORT"
exit "$FAILED"
