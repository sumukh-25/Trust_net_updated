# Requirement traceability (PDF F-01..F-53)

Source of requirements: `TrustNet_AI_Software_Build_Guide.pdf` (53 features). Status values: PASS (implemented and covered by a named passing test), PARTIAL (implemented but unverified in a browser/real environment, or incomplete), FAIL (not implemented), BLOCKED (cannot be verified in this sandbox). Evidence names refer to tests in `backend/` and `src/test/`.

| ID | Requirement | Source files | Status | Evidence | Limitation |
|---|---|---|---|---|---|
| F-01 | Login, sign out, role badge | backend/main.py (/auth/*), src/store/authContext.tsx | PARTIAL | test_refresh_cookie_rotates_and_reuse_revokes_family, test_login_attempt_history_and_temporary_lockout | API verified; role badge UI not browser-tested |
| F-02 | Server-side RBAC | main.py require_permission, security_auth.PERMISSIONS | PASS | test_rbac_blocks_anonymous_and_limits_viewer_permissions, test_viewer_cannot_approve_or_judge, test_ingest_requires_auth_and_role, test_policy_defaults_and_permissions | - |
| F-03 | User management screen | AdminPanel.tsx, PATCH /api/users/{id} | PARTIAL | backend: test_core_security user-update tests; UI not browser-tested | UI unverified |
| F-04 | Rate limit, validation, refresh tokens, lockout | main.py middleware, models/rate_limit.py, refresh_tokens.py | PASS | test_rate_limiter_blocks_after_limit_and_recovers_after_window, test_login_rate_limit_returns_429_when_enabled, test_lockout_*, test_refresh_*, test_ingest_validation_errors | Rate limiting is opt-in via env |
| F-05 | Sidebar, top bar, LIVE badge, System Risk | components/Layout.tsx, mlBackendService.ts (WsState) | PARTIAL | src/test/wsState.test.ts (live/reconnecting state, exponential backoff, offline after logout) | Badge rendering not browser-tested |
| F-06 | Overview KPI cards | OverviewPage.tsx, GET /api/dashboard/summary | PARTIAL | test_summary_aliases_match_legacy_fields_and_follow_ingested_data | UI rendering not browser-tested |
| F-07 | Registered devices list with Trust button | GET/POST /api/devices, device_registry.py | PARTIAL | test_device_registry_requires_manual_trust_and_updates_risk | UI unverified |
| F-08 | Network topology on Overview | models/network_topology.py, NetworkGraph.tsx | PARTIAL | test_network_topology_uses_registered_devices_and_protected_assets | Built from registered records; seeded scenarios are synthetic |
| F-09 | One source of truth for risk numbers | dashboard_summary_payload(), risk_engine.compute_risk | PARTIAL | summary alias test; ingest path and login path both call record_signals->compute_risk | Some legacy pages (Overview.tsx) still use the in-store simulation state |
| F-10 | Loading/empty/error/degraded states | OverviewPage.tsx; summary mlStatus | PARTIAL | summary empty-state test | Stale-data indicator and degraded UI not tested |
| F-11 | Realtime updates for every event type | ws_manager, broadcast_dashboard_update, event_ingested push | PARTIAL | test_ingest_pushes_live_websocket_update, WebSocket auth tests | Push covers ingest, policy, verdict; not every event type |
| F-12 | Notification toasts and bell | agents/notifier.py, NotificationBell.tsx | PARTIAL | test_notifications_persist_and_are_not_reported_sent_without_smtp, test_notification_list_is_scoped_to_authenticated_recipient | Toasts UI unverified |
| F-13 | Anomaly score timeline with baseline overlay | BehaviorAnalytics*.tsx | PARTIAL | none | No automated or browser verification |
| F-14 | Access heatmap per entity | BehaviorAnalytics*.tsx | PARTIAL | none | No automated or browser verification |
| F-15 | Top anomalous entities ranking | BehaviorAnalytics*.tsx | PARTIAL | none | No automated or browser verification |
| F-16 | Event capture (device hash, IP, geo, sensitive path) | models/security_events.py, POST /api/events/ingest | PARTIAL | test_ingest_* (validation, idempotency, labelling), network event tests | Geo only via supplied geo_score or login GeoIP; no sensitive-path flag proven for ingest |
| F-17 | Per-user behaviour profile and cold start | models/login_detector.py baselines | PARTIAL | test_login_baseline_rejects_different_device_then_can_be_reset; test_missing_scores_keep_previous_signal_not_invented | Profiles come from login baselines, not rebuilt from ingested events |
| F-18 | Isolation Forest scoring service | models/ml_models.py, optimized_models.py, /api/csf/* | PARTIAL | test_ml_detector, test_ml_models.py smoke exit 0 | Trained on synthetic data; accuracy is synthetic only |
| F-19 | Plain-language reasons for every score | risk breakdown, models/explainability.py | PARTIAL | risk breakdown with per-signal contributions tested via policy tests | No top-3 deviation text for every score |
| F-20 | Retraining / Recalibrate Baselines wired | POST /api/baselines/reset, /csf/train | PARTIAL | test_login_baseline_rejects_different_device_then_can_be_reset | Retrain path not independently verified |
| F-21 | Live request monitor | models/network_monitor.py, NetworkActivityPage.tsx | PARTIAL | test_network_events_are_logged_and_anomaly_flags_feed_risk | UI unverified |
| F-22 | Four rule-based detections | models/threat_classifier.py, agents/investigator.py | PASS | test_attack_classifier tests | - |
| F-23 | Rule detections feed risk engine | record_signals classifier signal | PASS | test_credential_attack_with_success_and_unknown_device_is_stolen_credentials, policy tests | - |
| F-24 | Fusion formula with configurable weights | models/risk_policy.py, risk_engine.compute_risk | PASS | test_sensitivity_scales_score_*, test_geo_toggle_and_weight, test_policy_validation | - |
| F-25 | Sliders/toggles saved and read by the engine | AdminPanel.tsx -> PUT /api/risk-policy | PARTIAL | Backend: test_policy_change_bumps_version_and_is_audited, test_device_trust_toggle_changes_decision_path; UI wiring compiles | UI not exercised in a browser; Restrict threshold uses separate endpoint |
| F-26 | Propagation graph, gauge, shortest path | models/network_topology.py, /api/propagation-analysis | PARTIAL | test_network_propagation_response_has_all_nodes | UI unverified |
| F-27 | Graph from real users/devices/assets | network_topology.py | PARTIAL | test_network_topology_uses_registered_devices_and_protected_assets | Edges for demo assets are seeded |
| F-28 | Asset criticality editor | no editor found in UI/API | FAIL | none | Not implemented |
| F-29 | Incident Center list/filter/empty state | IncidentCenterPage.tsx, GET /api/incidents | PARTIAL | incident API tests | UI unverified |
| F-30 | Incident correlation and lifecycle | models/incident_store.py | PASS | test_incident_correlation, test_ingest_correlates_into_one_incident, test_restrict_threshold_creates_incident_at_boundary, test_threshold_boundary_creates_incident_only_at_restrict | - |
| F-31 | Incident detail: timeline, evidence, actions | /api/incidents/{id}, /events, /agent; AgentPanel.tsx | PARTIAL | test_event_to_incident_to_investigation_to_pending_approval_with_audit | UI unverified |
| F-32 | Incident report PDF export | none found | FAIL | none | Not implemented |
| F-33 | Export Security Report (JSON) | AdminPanel.tsx export | PARTIAL | none | No test |
| F-34 | Investigator agent | agents/investigator.py | PASS | test_agents suite (45 tests) | Deterministic rules, not an LLM |
| F-35 | Response agent with graduated policy | agents/response.py | PASS | test_agents suite | - |
| F-36 | Enforcement: MFA, restrict, block | response.py, account_restrictions.py, mfa.py | PASS | test_mfa_step_up_blocks_then_allows_after_one_time_code, test_human_approval_enforces_quarantine_and_blocks_session, test_account_block_requires_human_approval_enforces_and_expires | - |
| F-37 | Human approval queue | /incidents/{id}/responses/{id}/approve/reject | PASS | test_agent_response_cannot_be_self_approved, test_expired_approval_is_rejected_with_409_and_not_executed, test_reject_blocks_future_auto_execution | - |
| F-38 | Mail agent | agents/notifier.py | PARTIAL | test_mailer_sends_with_transport_*, test_without_smtp_rows_are_skipped_never_reported_sent | Real SMTP delivery not verifiable here (BLOCKED: no SMTP credentials) |
| F-39 | Agent activity log and live feed | /api/agents/activity, AgentPanel.tsx | PARTIAL | agent activity assertions in test_agents | Live-feed UI unverified |
| F-40 | Analyst verdict buttons | AgentPanel.tsx, POST /incidents/{id}/verdict | PASS | test_verdict_endpoint_validates_and_records, test_verdict_permissions_and_invalid | Button click not browser-tested |
| F-41 | Re-weighting from verdicts via learning rate | risk_policy.record_verdict_effect, agents/learning.py | PASS | test_verdict_changes_later_score_with_before_after, test_learning_rate_scales_and_zero_disables_effect, test_adjustment_is_bounded | Bounded per-user score adjustment; no model is retrained (documented) |
| F-42 | Before/after score card | AgentPanel.tsx scoreEffect card | PARTIAL | backend score_before/score_after tested; UI compiles | Card not browser-tested; only shown right after a new verdict |
| F-43 | Geo-location blocking | models/geo_policy.py, TRUSTNET_ALLOWED_COUNTRIES | PARTIAL | test_geo_policy, test_private_address_always_bypasses_geo_policy | Env-configured, not an Admin toggle; admin geo toggle controls geo risk signal only |
| F-44 | Device trust lifecycle | device_registry.py, /devices/{id}/trust/revoke | PASS | test_device_registry_requires_manual_trust_and_updates_risk, revocation tests | - |
| F-45 | Protected demo resources | /api/protected-assets/{id} | PASS | test_protected_asset_routes_enforce_seeded_role_policy, test_protected_demo_asset_access_is_audited_and_returns_metadata_only | - |
| F-46 | Audit log with SHA-256 hash chain | security_events.py, /api/audit/verify | PASS | test_valid_chain_verifies, test_tampering_with_event_row_is_detected, test_event_inserted_outside_the_chain_is_reported | - |
| F-47 | Seed script and Reset demo | backend/seed.py, POST /api/demo/reset | PASS | test_demo_reset_requires_admin_permission, test_demo_reset_preserves_users_and_audit_history | - |
| F-48 | Scenario engine behind Simulate Attack | demo_scenarios.py, attack_chain.py | PASS | test_demo_scenarios, test_demo_replay | - |
| F-49 | Trusted and rogue client tool | backend/client.py, simulate_attack.py | PARTIAL | none | Not run end to end here |
| F-50 | Evaluation vs rule-only baseline | backend/evaluate_synthetic.py, docs/SYNTHETIC_EVALUATION.json | PARTIAL | committed output; not re-run in this session | Synthetic data only; not real-world accuracy |
| F-51 | Automated tests (API and ML) | backend/test_*.py, src/test | PASS | 214 backend tests + 9 Vitest tests passing (see verification-report.txt) | ESLint still failing |
| F-52 | Docker Compose, .env.example, README, API docs | docker-compose.yml, .env.example, README.md | PARTIAL | files present | Docker build not run (BLOCKED: no Docker in sandbox) |
| F-53 | LSTM Autoencoder (listed Available) | AdminPanel.tsx label | PASS | UI states LSTM is planned and not active | Not implemented; correctly labelled Planned |

Totals: {'PARTIAL': 32, 'PASS': 19, 'FAIL': 2} (of 53).
