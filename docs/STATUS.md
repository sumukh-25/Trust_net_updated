# TrustNet Implementation Status

Status date: 2026-10-18

## Implemented

- FastAPI startup trains the demo models and reports readiness only after training succeeds.
- Accounts, failed-login history, lockouts, token revocations, devices, incidents, security events, and local audit-chain records persist in SQLite.
- Login tokens are bound to their registered device. Quarantine/flag state is checked on authenticated requests, so approval blocks existing device sessions as well as future logins.
- Risk incidents are deduplicated per user/device, retain evidence and risk breakdown, and can be approved, dismissed, escalated, or resolved.
- Security events can be linked to incidents and viewed through the incident-events endpoint. `/api/audit/verify` reports hash-chain or event-record mismatches.
- `/api/network/topology` builds a graph from stored accounts and devices, current open incidents, seeded protected assets, and role-to-asset policy. Asset reads use deny-by-default role checks.
- The primary overview and risk-propagation graph consume backend topology/summary data; the what-if view re-runs the propagation analyzer after isolating the highest-risk user.
- Backend tests use a temporary SQLite database so request logging and mutation tests do not change the local demo database.

## Verification

- Backend: `python -m unittest test_backend_api -v` passed 29 tests on 2026-10-18.
- Frontend: `vitest run` passed 1 test on 2026-10-18.
- Frontend: Vite production build completed on 2026-10-18. Vite warned that the main JavaScript chunk exceeds 500 kB.
- Synthetic holdout: `python backend/evaluate_synthetic.py` used seed 42 and a stratified 80/20 split; held-out accuracy 0.9940, precision 0.9615, recall 1.0000, and F1 0.9804 (1,000 test rows).
- Language-server diagnostics reported no errors in the changed backend or frontend files.
- Repository-wide ESLint currently reports 60 errors and 10 warnings, largely pre-existing explicit-`any` violations in secondary pages/services and a Tailwind config import rule. The changed risk page has no lint errors.
- The default local audit ledger verified 1,142 events at the last check. The exact count grows as API activity is recorded.

## Demo Limits And Remaining Work

- Risk signals, login baselines, network history, and recent detector windows now reload from SQLite. Live threat broadcast state and model objects remain process-local; detector windows are recomputed from persisted request/login records after restart.
- Seeded assets and role policies are fictional examples. This is not connected to a real organization's inventory, identity provider, data plane, or production application resources.
- The local hash chain is not externally anchored. An attacker with database-file control can rewrite rows and recompute hashes; use an independent append-only service or signed external checkpoints for stronger evidence.
- Browser authentication state is intentionally memory-only, so a page reload requires signing in again.
- The model training and scripts use synthetic data. Their reported metrics are not validated operational accuracy or a reproducible field evaluation.
- Docker Compose was not added because Docker is unavailable in this environment, so a container configuration could not be validated. CI coverage, an external GeoIP service contract, and production-grade secret/bootstrap handling have not been validated here.
- The installed frontend dependency audit reported 16 advisories (8 moderate, 6 high, 2 critical); these require a deliberate dependency review before deployment.

This repository is suitable for a controlled local demonstration, not public or production deployment.