# TrustNet AI — canonical implementation and verification status

**Updated:** 19 October 2026  
**Scope:** software project only; CSI hardware integration is excluded.  
**Release label:** implementation checkpoint; **not yet a verified production release**.

This is the only canonical status file. Other legacy status/handoff files point here. Percentages are deliberately not presented as precise facts: completion is measured by implemented scope and verified acceptance checks, not by counting files or generated code.

## Session update — 19 October 2026 (risk policy, verdict feedback, event ingest)

Implemented and tested in this session (backend + frontend wiring):

- **Saved, versioned risk policy** (`backend/models/risk_policy.py`, `GET/PUT /api/risk-policy`, admin-only writes, audited). Weights, Detection Sensitivity (score multiplier 0.5-1.5), device-trust toggle, geo toggle and verdict learning rate are read by the one risk engine (`compute_risk`) on every evaluation; every score reports `policy.version`, `computed_at`, and its adjustments. Geo weight defaults to 0, so default scores are unchanged.
- **Analyst-verdict feedback with before/after score**: a verdict adds a bounded per-user score adjustment (learning rate x 20 points, capped at +/-15), replaced (not stacked) when an analyst corrects a verdict, and ignored when a duplicate is re-sent. This is a controlled rule adjustment; **no ML model is retrained**, and the API says so.
- **Validated, idempotent event ingest** `POST /api/events/ingest` (analyst/admin): required idempotency key `event_id`, `source` label (`runtime` / `synthetic` / `external`; `external` is refused unless `TRUSTNET_ALLOW_EXTERNAL_INGEST=1`), score fields range-checked, missing scores are never invented (previous signal kept, else 0), event persisted to the hash-chained audit log, correlated into one incident, and pushed live over the WebSocket.
- **Frontend**: WebSocket state (LIVE / RECONNECTING / OFFLINE) with exponential backoff and jitter drives the top-bar badge; Admin Panel sliders and toggles save to the backend policy; the verdict card shows before/after score; fixed two pre-existing TypeScript errors.
- `scripts/demo_pipeline.py` reproduces event -> risk -> incident -> agent view -> verdict -> audit-chain check on a temporary database (all events labelled synthetic).

Verification (this sandbox): backend 214 tests pass (103 + 20 + 46 + 45); `tsc` passes; Vitest 9/9; production build succeeds; `pip-audit` clean. **Not passing/not verified:** ESLint reports 65 errors (pre-existing `no-explicit-any` etc.; not fixed or suppressed), `npm audit` reports 16 vulnerabilities (2 critical, 6 high, mostly dev tooling), no browser/E2E test was run, Docker was not available, and real SMTP/GeoIP/external telemetry could not be exercised. See `docs/REQUIREMENT_TRACEABILITY.md` (19 PASS, 32 PARTIAL, 2 FAIL of 53) and `verification-report.txt`.

## Changes implemented in this continuation

- Added database-backed MFA step-up state (`backend/models/mfa.py`): salted scrypt hash only, five-minute challenge expiry, constant-time digest comparison, one-use codes, five failed attempts allowed and lockout on the sixth wrong attempt, 15-minute lockout, audit events, email delivery through configured SMTP, and a demo-only code returned only when `DEMO_MODE` is enabled outside production.
- Added MFA-required gating to authenticated API requests and a frontend OTP dialog that reacts to `MFA_REQUIRED`. The Response agent now applies a `require_mfa` action when evidence includes a successful login classified as stolen credentials, the target is a viewer account, and no registered device is available for containment; the user must retry the original action after verification. Where a registered device exists, the current single-action response priority still chooses device containment instead of combining actions.
- Added `block` and `read_only` account restriction modes with migration for existing SQLite databases. Read-only sessions may use ordinary dashboard GETs but cannot mutate state or read sensitive endpoints. A read-only restriction does not prevent login.
- Added admin account update API (`PATCH /api/users/{user_id}`) for role, active state and password changes, with self-demotion/self-disable prevention, password length checks, last-active-admin protection, audit events and WebSocket closure after disable.
- Added persistent device revocation; revoked devices are denied on their next authenticated request. The SOC WebSocket room is restricted to admin/analyst accounts and closes after a connected analyst is demoted.
- Added protected demo assets (`admin-db`, `finance-db`, `hr-records`, `file-export-log`). The API returns metadata only, records allowed and denied attempts, sends sensitive asset access through risk fusion, links the event to an incident, and overlays denied device-to-asset attempts as attack edges in the topology.
- Added the Admin Panel audit-chain verification button and backend-connected synthetic scenario/reset controls. Existing autonomy settings are explicitly described as browser-local where they do not change backend enforcement.
- Removed preloaded mock users/incidents from the shared security store so the main dashboard does not start by presenting invented users/incidents as live backend records.
- Added `backend/seed.py` for opt-in fictional 21-day synthetic history, `backend/scenarios.py` for paced scenario API calls, `backend/client.py` for trusted/rogue token-based demo clients, `.env.example`, `.npmrc`, `Dockerfile.frontend`, Nginx SPA config, and `docker-compose.yml`.
- Added configurable country allow-list enforcement to the real login pipeline. `TRUSTNET_ALLOWED_COUNTRIES` accepts ISO alpha-2 country codes; private/reserved addresses bypass country checks; `X-Demo-Country` overrides are accepted only outside production with `DEMO_MODE=1`; denials return `GEO_POLICY_DENIED` and append an audit event. This uses the existing GeoIP provider, not a bundled offline GeoIP database.
- Corrected the successful-login `expires_in` response to match the actual 15-minute access-token lifetime.
- Implemented database-backed refresh-token sessions with SHA-256 token digests, seven-day expiry, HttpOnly/SameSite cookie delivery, rotation on `/api/auth/refresh`, logout family revocation, and reuse detection that revokes all still-active tokens in the family. Frontend API requests now include cookies and attempt one refresh/retry after an access-token 401. Added unit tests and an API-level targeted test for rotation and reuse.
- Reduced access token lifetime to 15 minutes. When `bcrypt` is absent in a minimal local test environment, password hashes use an explicitly tagged stdlib scrypt fallback; production installs the declared `bcrypt` dependency and uses bcrypt. Existing bcrypt hashes remain verifiable when bcrypt is installed.
- Fixed the request telemetry regression test to match the intentional exclusion of routine `/api/health` polling.

## Verification performed in this environment

| Check | Result | Evidence / limitation |
|---|---|---|
| Core + MFA + refresh-token + demo/risk feature unit suites | **86 passed** | `cd backend && python -m unittest test_core_security test_mfa test_refresh_tokens test_demo_replay test_demo_scenarios test_incident_correlation test_learning_idempotency test_request_policy test_attack_classifier -q` |
| Backend API integration suite | **44 passed** in the last completed run | `cd backend && python -m unittest test_backend_api -q` |
| Agent pipeline suite | **45 passed** in the last completed run | `cd backend && python -m unittest test_agents -q`; includes single-use approval and SOC WebSocket access checks |
| Python compilation | **Passed** | `python -m compileall -q backend` |
| ML smoke checks | **Passed** | `python test_ml_models.py` |
| Synthetic evaluation command | **Passed** | `cd backend && python evaluate_synthetic.py`; metrics are fictional-data metrics only |
| Scenario JSON | **Passed** | `python -m json.tool docs/DEMO_SCENARIOS.json` |
| Seed script | **Passed on isolated temp DB** | `DEMO_MODE=1 TRUSTNET_DB_PATH=/tmp/trustnet-seed-check/db.sqlite python backend/seed.py`; generated 20 fictional employees, 20 devices, 525 synthetic history events and corresponding audit entries |
| Modified frontend TS/TSX syntax | **Passed syntax transpilation** | Used the installed TypeScript compiler's `transpileModule` for `App.tsx`, `MFAChallengeDialog.tsx`, `AdminPanel.tsx`, `mlBackendService.ts`, and `securityStore.tsx`; this is not a semantic typecheck or production build. |
| `npm ci`, TypeScript, lint, Vitest, production build | **Not verified** | Offline `npm ci` stops because a required package tarball (`zod`) is not in the local npm cache and registry DNS is unavailable. `.npmrc` sets `legacy-peer-deps=true`; the unused `@testing-library/react` dependency was removed to avoid a stale peer requirement. |
| `pip-audit`, `npm audit`, Docker Compose build, live hosted demo | **Not run** | Tools or registry/network access are unavailable here. No claim of clean advisories, a successful container build, or a live deployment is made. |

## Still open before calling this 100% or release-ready

1. **Frontend release gate:** install dependencies on a network-enabled machine; run `npm ci`, `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm test`, and `npm run build`; fix every reported error. The edited UI has not had a full typecheck/build here.
2. **Dependency/security gate:** run `pip-audit -r backend/requirements.txt` and `npm audit --audit-level=high`; pin Python dependencies and document any unfixable advisories. A secret scan of Git history is still required.
3. **Refresh-token release validation:** refresh-cookie rotation, reuse detection, and family revocation are implemented with focused unit tests; the targeted API test passes. The complete API suite did not finish reliably in the latest rerun, and the frontend refresh/retry path still needs a full typecheck/build and browser-level session-reload test.
4. **Geographic policy:** country allow-list and private/LAN bypass are implemented and five unit tests pass. The real login route applies the policy and audits denials, but a dedicated API test for that denial path is still needed. An offline bundled GeoIP database is not included; the current provider may require network access for public IPs.
5. **Multi-action response and learning proof:** the current agent chooses one primary response per incident; it does not combine MFA step-up plus device quarantine in one response plan. Verdict-driven profile updates with before/after replay scores and a clear “no measurable change” result are not fully implemented/verified.
6. **Demo reset repeatability:** current reset clears demo activity while preserving identities and audit history; it does not fully reseed every synthetic baseline to a bit-for-bit identical state. Run `backend/seed.py` explicitly for the baseline.
7. **Live UX/observability:** scenario replay UI is API-connected, but a full real-time multi-step progress banner and a complete SOC room/agent-feed walkthrough have not been end-to-end verified. Some legacy, unrouted demo components still contain explicitly labelled illustrative charts.
8. **Operational proof:** run the updated `scripts/verify_all.sh` on a clean checkout, test restart durability, Docker Compose, health/degraded states, audit tamper detection, and the complete event → incident → investigation → restriction/approval → verdict pipeline. A single monolithic `unittest` invocation of all suites timed out after 300 seconds because the API and agent suites share module globals and temporary SQLite paths when imported into one process; the release script now runs those integration suites in separate Python processes. No hosted URL exists from this work.

## Security and demo notes

- All seeded users, IP addresses, cities and activity are fictional. Synthetic evaluation scores are not evidence of real-world model accuracy.
- MFA codes are never returned to production clients. Production delivery requires valid SMTP configuration. `DEMO_MODE` must not be enabled in production.
- The audit chain is append-only within the local SQLite database but is **not externally anchored**; a privileged host/database attacker could rewrite the entire local store.
- Rate limiting remains in-memory/single-process. The project should not be exposed directly to the public internet before the open release gates are closed.
- No public deployment or hosted demo was created or verified during this continuation. The API suite initially exposed a timezone bug in deterministic attack classification; classification now converts UTC event timestamps into `TRUSTNET_BUSINESS_TIMEZONE` (default `Asia/Kolkata`) before applying after-hours rules, and the full 44-test API suite passes after the fix.


## Follow-up checkpoint — refresh-token rotation (19 October 2026)

- `python -m unittest test_refresh_tokens -v`: **2 passed**.
- `python -m unittest test_geo_policy -q`: **5 passed**.
- `python -m unittest test_core_security test_mfa test_refresh_tokens test_demo_replay test_demo_scenarios test_incident_correlation test_learning_idempotency test_request_policy test_attack_classifier -q`: **86 passed**.
- `python -m unittest test_agents -q`: **45 passed on the previous checkpoint**; the post-refresh rerun did not produce a final unittest summary before the environment timed out, so it is not counted as re-verified for this exact tree.
- `python test_ml_models.py`: **passed** (synthetic smoke check).
- The targeted API refresh rotation/reuse test passed. A full API-suite rerun timed out during this checkpoint, so the full suite is **not** claimed green for this exact tree. A prior tree passed 44 API tests before the new refresh endpoint/test was added.
- `python -m compileall -q backend`: **passed**.
- Frontend full typecheck, lint, Vitest, production build, dependency audits, Docker Compose, and live deployment remain unverified.


## Implementation update — 2026-10-19

### Completed in this update
- Aligned the default Restrict threshold to 61, matching the software build guide's recommended risk tiers (Monitor 0–30, MFA 31–60, Restrict 61–85, Block 86–100). Existing databases that still held the old default value `60` are migrated to `61`; explicitly configured thresholds other than `60` are preserved.
- Expanded `/api/dashboard/summary` with stable dashboard contract aliases: `systemRisk`, `avgUserRisk`, `openIncidents`, `anomalies`, `trustedDevices`, `devicesToReview`, `networkAnomalies`, `mlStatus`, and `dataSource`. Legacy response fields remain for compatibility.
- Added API regression assertions for the summary contract and the Restrict boundary.
- Kept LSTM labelled as planned rather than implemented; current evaluation remains synthetic.

### Verification for this update
- Focused risk-threshold tests: 2 passed.
- Summary response contract and role-protection test: passed.
- Full API suite and frontend build were not rerun as part of this focused change.

### Verification continuation — 2026-10-19

Re-ran the current backend test groups after the dashboard-summary contract and risk-threshold updates: 103 feature/security tests, 46 API integration tests, and 45 agent pipeline tests passed (194 total across separate invocations). Python compilation and the ML smoke check also passed. The smoke check trains/evaluates on synthetic demonstration data, not production traffic. `npm ci` did not finish within the available execution window, so frontend typecheck/lint/Vitest/build and dependency audits remain unverified. Docker, clean-checkout CI, browser-level session refresh, and full end-to-end learning/response proof also remain release gates. This is not a 100% or production-ready claim; see root `verification-report.txt` and `docs/REMAINING_RELEASE_GATES.md`.

### Verification rerun — 2026-10-19 (current packaged source)
- Core/security feature suites: 103 passed.
- API integration suite: 46 passed.
- Agent pipeline suite: 45 passed.
- Python compilation, synthetic ML smoke check and JSON artifact validation passed.
- Frontend remains blocked by missing local dependencies: `vitest/globals` types and ESLint are unavailable; no successful production build is claimed.
- See root `verification-report.txt` for the current release-gate summary. These backend results do not imply all 53 features are complete.
