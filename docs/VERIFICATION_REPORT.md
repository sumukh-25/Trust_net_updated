# TrustNet AI — verification report

**Updated:** 19 October 2026

This report records checks actually run for this ZIP. It does not certify production readiness.

## Passed in this environment

- `python -m compileall -q backend` — passed.
- `cd backend && python -m unittest test_core_security test_mfa test_geo_policy test_attack_classifier test_demo_scenarios test_demo_replay test_request_policy test_incident_correlation test_learning_idempotency -q` — **89 tests passed**.
- `cd backend && python -m unittest test_backend_api -q` — **44 tests passed** after correcting business-timezone handling in deterministic attack classification.
- `cd backend && python -m unittest test_agents -q` — command exited with status 0; this test module did not print a unittest summary in the captured output, so no test count is asserted here.
- `python -m json.tool docs/DEMO_SCENARIOS.json` — passed.
- `python -m json.tool docs/SYNTHETIC_EVALUATION.json` — passed.
- `bash -n scripts/verify_all.sh` — passed.
- ZIP archive integrity — checked after packaging.

## Not verified

- Frontend dependency installation, semantic TypeScript check, lint, Vitest and production build.
- Dependency vulnerability audit (`pip-audit`, `npm audit`).
- Docker Compose build/run, clean-checkout CI, or hosted deployment.
- Full browser-to-backend end-to-end flow.
- Refresh-token rotation/reuse detection and family revocation.
- Bundled offline GeoIP database (the existing GeoIP lookup may use an external provider for public IPs).
- Integrated API test proving a country-policy denial and its audit record.
- Full learning before/after score proof and multi-action response orchestration.

## New changes in this continuation

- Country allow-list login policy using `TRUSTNET_ALLOWED_COUNTRIES` (comma-separated ISO alpha-2 codes). Empty list disables the policy. Private/reserved addresses bypass the country check. `X-Demo-Country` is accepted only when `DEMO_MODE=1` outside production. A denial returns `GEO_POLICY_DENIED` and is audited.
- Successful-login `expires_in` now reflects the actual 15-minute access token.
- Deterministic after-hours attack classification converts stored UTC timestamps into `TRUSTNET_BUSINESS_TIMEZONE` (default `Asia/Kolkata`) rather than treating UTC as the business local time.
- Added five isolated unit tests for the country policy.

Synthetic model metrics are based on synthetic data and are not proof of real-world detection accuracy. Do not expose this project to the public internet until outstanding release gates are closed.


## Addendum — 19 October 2026

Refresh-token rotation was added after the previous report: hashed token storage, seven-day expiry, HttpOnly/SameSite cookie, one-time rotation, reuse detection and refresh-family revocation. Unit suite: 2/2 passed. Focused API test: passed. Backend compileall: passed. The latest full API suite rerun timed out, so no all-green API-suite claim is made for this exact tree. Frontend release checks, dependency audits, Docker build and live deployment remain unverified.

## Session 19 Oct 2026 (offline sandbox) — actual results
Environment: no network; fastapi, pydantic, starlette, httpx, bcrypt and node_modules NOT installable.
- Passed (python3 -m unittest <suite>): test_refresh_tokens 2, test_geo_policy 5, test_attack_classifier 5, test_demo_scenarios 4, test_demo_replay 5, test_request_policy 4, test_incident_correlation 3, test_learning_idempotency 3 (31 total).
- test_ml_models.py: passed (synthetic smoke). compileall backend: passed.
- Could not run (ModuleNotFoundError: fastapi): test_core_security, test_mfa, test_backend_api, test_agents.
- NOT run: npm ci, tsc, eslint, vitest, build, pip-audit, npm audit, docker compose.
- Bug fixed: CORS allow_methods lacked PATCH, breaking cross-origin PATCH /api/users/{id}. Regression test added (test_cors_preflight_allows_patch_for_admin_user_update) — written but UNVERIFIED (could not execute).
- Static scan: no hardcoded real secrets found (seed.py derives fictional demo passwords); JWT secret required >=32 chars in production; no localStorage use in src besides a test asserting it stays empty.

## Session 19 Oct 2026, continuation (still offline)
- `python3 -m unittest test_refresh_tokens -v`: **6 passed** (was 2), repeated 5 more times with no flakiness. New tests: unknown/empty token rejected, tokens stored only as SHA-256 digests, expired token rejected then treated as replay, and 8-thread concurrent rotation allows exactly one winner (7 replays detected, whole family revoked afterwards).
- Behavioural note (by design, now documented): a genuine double-submit of the same refresh cookie revokes the whole session family, so the user must sign in again.
- Bug fixed (frontend, `src/services/mlBackendService.ts`): parallel 401s each called `/auth/refresh`; with rotation plus reuse detection that would revoke the session family and sign the user out. Refresh is now single-flight, with one retry per request and no retry loop.
- Added `src/test/refreshSingleFlight.test.ts` (concurrent 401s -> one refresh; failed refresh -> no loop). Syntax-checked with the TypeScript transpiler only; **not executed** (no node_modules).
- Known gap: the session is memory-only, so a page reload requires sign-in. There is no session-restoration call on load. The refresh cookie could support one, but it needs an endpoint or response shape that returns user and permissions. Not implemented.
- Still blocked/unrun: fastapi-dependent suites, npm ci/tsc/lint/vitest/build, pip-audit, npm audit, Docker.

## Session 19 Oct 2026, continuation 2 (still offline)
- New `backend/test_ml_detector.py`: **8 passed** (malformed input, untrained model, extreme values, determinism, save/load, and a documented low-and-slow evasion limitation). Synthetic data only.
- Offline totals this session: refresh 6, geo 5, classifier 5, demo scenarios 4, demo replay 5, request policy 4, correlation 3, learning 3, ML detector 8 = **43 passed, 0 failed**. `test_ml_models.py` smoke passed.
- `evaluate_synthetic.py` re-run: output identical to committed `docs/SYNTHETIC_EVALUATION.json` (reproducible, seed 42). Synthetic only; the rules baseline matches or beats the model, so scores are not evidence of real-world accuracy.
- Changes: `predict()` now validates shape, feature count, emptiness and NaN/inf (callers already did, so behaviour is unchanged); removed unsupported "real threat data" and "production-grade" claims in `models/optimized_models.py`.
- Deployment (static review only, NOT built): backend container now runs as non-root; compose defaults to `TRUSTNET_ENV=production` (was development) and passes bootstrap-admin variables; docker-compose.yml parses as valid YAML.
- README gained architecture, prerequisites, environment variables, DB init, ML limitations and known limitations.
- Still unrun: fastapi-dependent suites (test_core_security, test_mfa, test_backend_api, test_agents), npm ci/tsc/lint/vitest/build, pip-audit, npm audit, docker build.

## Session 19 Oct 2026, continuation 3 (still offline)
- Static contract check (script comparing `mlBackendService.ts` paths with `@router` routes in `main.py`): every frontend API path maps to an existing backend route (3 apparent mismatches were regex artifacts: approve/reject and account-restrictions routes exist). Methods and response shapes were not compared.
- Implemented session restoration after page reload: `mlBackendService.restoreSession()` (refresh cookie -> `/auth/me`), `AuthProvider` runs it once on first load, and `App.tsx` shows a "Restoring your session" status instead of redirecting immediately. Nothing is stored in localStorage/sessionStorage; failures return false with no retry loop.
- Added 2 Vitest cases for restoration (success; no valid cookie). Files only syntax-checked with the TypeScript transpiler (0 diagnostics); **not executed**, and the UI flow has not been exercised in a browser.
- Not done: redirect from /login to the dashboard when already authenticated (it would interrupt the login animation), so a signed-in user reloading /login still sees the login page.
- Still unrun: fastapi-dependent suites, npm ci/tsc/lint/vitest/build, pip-audit, npm audit, docker build, browser tests.
