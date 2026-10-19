# Remaining Release Gates — 19 October 2026

This file is deliberately explicit. A ZIP can be packaged without the application being release-complete.

## Implemented in this continuation
- Persistent refresh-session table with SHA-256 token digests.
- Seven-day refresh tokens in an HttpOnly, SameSite=Lax cookie; Secure is enabled in production.
- Refresh endpoint rotates tokens and returns a 15-minute access token.
- Reuse of a consumed token revokes its family; logout revokes the family associated with the presented cookie.
- Frontend API wrapper sends cookies and attempts one refresh/retry after an access-token 401.
- Regression coverage for refresh-token rotation/reuse (2 unit tests and a focused API test).

## Verification evidence
- Core/MFA/refresh/demo/risk focused group: 86 passed in one completed run.
- Geographic policy: 5 passed in a separate completed run.
- Refresh token unit tests: 2 passed.
- Focused API refresh rotation/reuse test: passed.
- Python compilation: passed before the final packaging step.
- ML smoke check: passed.

## Still not verified or not complete
- Latest full API suite timed out before producing a final summary. The pre-refresh tree previously passed 44 API tests; that result does not prove the current tree's full suite is green.
- Latest agent-suite rerun did not produce a final unittest summary; a previous checkpoint passed 45 tests.
- Frontend `tsc` currently stops because dependencies/types are absent (`vitest/globals` missing). Lint, Vitest and production build have not been run successfully in this environment.
- Browser-level refresh behavior after reload has not been tested; frontend code needs full typecheck/build and manual cookie/session validation.
- `npm audit`, `pip-audit`, secret-history scan, Docker Compose build, clean-checkout CI, and live deployment are not verified.
- Behavioral-learning before/after proof and complete end-to-end event → incident → response → verdict flow still require validation.

## Release decision
**Not 100% and not production-ready.** Do not claim industry-grade release until all P0 gates and the complete release script pass on a clean, network-enabled checkout. Metrics and scenarios are synthetic demonstration data only.
