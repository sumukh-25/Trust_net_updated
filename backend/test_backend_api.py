"""Focused API contract tests for the TrustNet demo backend."""

import importlib
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient
import jwt

_TEST_DATABASE_DIR = tempfile.TemporaryDirectory(prefix="trustnet-tests-")
os.environ["TRUSTNET_DB_PATH"] = str(Path(_TEST_DATABASE_DIR.name) / "trustnet-test.db")

import main
import models.device_registry as device_registry
import models.incident_store as incident_store
import models.database as database
import models.login_detector as login_detector
import models.network_monitor as network_monitor
import models.risk_engine as risk_engine
import models.security_auth as security_auth
from models.device_registry import register_login_device, reset_devices
from models.incident_store import reset_incidents
from models.login_detector import reset_all_baselines
from models.risk_engine import record_signals, reset_risk_state
from models.security_auth import create_user, get_user_by_id, issue_access_token, list_users, reset_auth_state
from models.network_monitor import list_network_events, network_score_for_user, record_auth_failure, record_request, reset_network_state
from models.database import get_db_connection
from models.security_events import persist_security_event, validate_security_event, verify_audit_chain
from models.risk_engine import calculate_centralized_risk, get_restrict_threshold, risk_tier_for_score


class BackendApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(main.app)
        cls.client = cls.client_context.__enter__()
        reset_auth_state()
        list_users()
        admin = get_user_by_id("sumukh")
        cls.admin_token = issue_access_token(admin)
        cls.client.headers.update({"Authorization": f"Bearer {cls.admin_token}"})

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)

    def setUp(self):
        reset_all_baselines()
        reset_devices()
        reset_risk_state()
        reset_incidents()
        reset_network_state()
        main.reset_live_threat()

    def test_health_reports_ready_after_model_startup(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "healthy")

    def test_risk_score_increases_for_large_behavior_deviations(self):
        normal = {
            "normal_login_time": 9, "actual_login_time": 9,
            "normal_session_duration": 4, "actual_session_duration": 4,
            "normal_data_volume": 100, "actual_data_volume": 100,
            "normal_api_calls": 40, "actual_api_calls": 40,
            "normal_geo_distance": 0, "actual_geo_distance": 0,
        }
        attack = {**normal, "actual_login_time": 23, "actual_data_volume": 900,
                  "actual_api_calls": 300, "actual_geo_distance": 9000}
        normal_response = self.client.post("/api/risk-score", json={
            "user_id": "user-test", "behavior_metrics": normal, "anomaly_score": 0.05,
        })
        attack_response = self.client.post("/api/risk-score", json={
            "user_id": "user-test", "behavior_metrics": attack, "anomaly_score": 0.9,
        })
        self.assertEqual(normal_response.status_code, 200)
        self.assertEqual(attack_response.status_code, 200)
        self.assertGreater(attack_response.json()["overall_score"], normal_response.json()["overall_score"])
        self.assertLessEqual(attack_response.json()["overall_score"], 100)

    def test_anomaly_endpoint_accepts_training_feature_shape_and_rejects_wrong_shape(self):
        valid_records = [{
            "session_duration": 4.5,
            "data_volume": 150.0,
            "api_calls": 200.0,
            "geo_distance": 50.0,
            "login_hour": 10.0,
        }, {
            "session_duration": 0.2,
            "data_volume": 850.0,
            "api_calls": 450.0,
            "geo_distance": 200.0,
            "login_hour": 23.0,
        }]
        valid_response = self.client.post("/api/anomaly-detection", json={"records": valid_records})
        self.assertEqual(valid_response.status_code, 200)
        self.assertEqual(len(valid_response.json()["results"]), 2)

        wrong_shape = self.client.post("/api/anomaly-detection", json={"records": [{"duration": 3.0}]})
        self.assertEqual(wrong_shape.status_code, 422)

        inconsistent = self.client.post("/api/anomaly-detection", json={"records": [
            valid_records[0], {**valid_records[1], "extra_feature": 1.0},
        ]})
        self.assertEqual(inconsistent.status_code, 422)

    def test_retraining_rejects_data_that_would_break_live_predictions(self):
        response = self.client.post("/api/train-anomaly-detector", json={
            "data": [[1.0, 2.0, 3.0]], "features": ["a", "b", "c"],
        })
        self.assertEqual(response.status_code, 422)

        rows = [[float(i % 8) + j for j in range(5)] for i in range(60)]
        trained = self.client.post("/api/train-anomaly-detector", json={
            "data": rows,
            "features": ["session_duration", "data_volume", "api_calls", "geo_distance", "login_hour"],
        })
        self.assertEqual(trained.status_code, 200, trained.text)
        self.assertEqual(trained.json()["status"], "success")

    def test_network_propagation_response_has_all_nodes(self):
        payload = {
            "nodes": [
                {"id": "a", "label": "Endpoint", "type": "device", "x": 0, "y": 0,
                 "compromised": True, "propagationRisk": 80},
                {"id": "b", "label": "Server", "type": "server", "x": 1, "y": 1,
                 "compromised": False, "propagationRisk": 20},
            ],
            "edges": [{"from": "a", "to": "b", "active": True, "attackPath": True}],
        }
        response = self.client.post("/api/propagation-analysis", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["all_nodes"]), 2)
        self.assertGreater(response.json()["total_network_risk"], 0)
        self.assertGreater(response.json()["all_nodes"][0]["propagation_risk"], 0)
        self.assertEqual(
            response.json()["critical_count"],
            sum(node["criticality"] in {"critical", "high"} for node in response.json()["all_nodes"]),
        )

        empty_graph = self.client.post("/api/propagation-analysis", json={"nodes": [], "edges": []})
        self.assertEqual(empty_graph.status_code, 200)
        self.assertEqual(empty_graph.json()["all_nodes"], [])

        invalid_link = self.client.post("/api/propagation-analysis", json={
            "nodes": payload["nodes"],
            "edges": [{"from": "a", "to": "missing", "active": True, "attackPath": True}],
        })
        self.assertEqual(invalid_link.status_code, 422)

    def test_network_topology_uses_registered_devices_and_protected_assets(self):
        device = register_login_device("sumukh", {
            "userAgent": "topology-test", "platform": "test-os", "screenResolution": "1280x720",
            "timezone": "UTC", "canvasHash": "topology-hash", "webglRenderer": "gpu",
            "hardwareConcurrency": 8, "colorDepth": 24, "deviceType": "desktop", "language": "en-US",
        })
        response = self.client.get("/api/network/topology")
        self.assertEqual(response.status_code, 200)
        topology = response.json()
        node_ids = {node["id"] for node in topology["nodes"]}
        self.assertIn("user:sumukh", node_ids)
        self.assertIn(f"device:{device['device_id']}", node_ids)
        self.assertIn("asset:asset-identity-vault", node_ids)
        self.assertTrue(any(
            edge["from"] == f"device:{device['device_id']}" and edge["to"] == "asset:asset-identity-vault"
            for edge in topology["edges"]
        ))
        self.assertEqual(topology["policy_default"], "deny")

    def test_protected_asset_routes_enforce_seeded_role_policy(self):
        viewer = create_user("asset-viewer@trustnet.local", "a-long-viewer-password", "viewer")
        viewer_token = issue_access_token(viewer)
        viewer_headers = {"Authorization": f"Bearer {viewer_token}"}
        allowed = self.client.get("/api/protected-assets/asset-people-api", headers=viewer_headers)
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.json()["access"], "allowed")
        denied = self.client.get("/api/protected-assets/asset-identity-vault", headers=viewer_headers)
        self.assertEqual(denied.status_code, 403)
        admin = self.client.get("/api/protected-assets/asset-identity-vault")
        self.assertEqual(admin.status_code, 200)
        missing = self.client.get("/api/protected-assets/not-configured")
        self.assertEqual(missing.status_code, 404)

    def test_login_baseline_rejects_different_device_then_can_be_reset(self):
        fingerprint = {
            "userAgent": "test-agent", "platform": "test-os", "language": "en-US",
            "screenResolution": "1280x720", "timezone": "UTC", "canvasHash": "canvas-a",
            "webglRenderer": "gpu-a", "hardwareConcurrency": 8, "colorDepth": 24,
            "deviceType": "desktop",
        }
        credentials = {"username": "sumukh", "password": "sumukh@123", "fingerprint": fingerprint,
                       "fingerprint_id": "test-fingerprint-a"}
        first = self.client.post("/api/login", json=credentials)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["login_status"], "allowed")
        self.assertEqual(first.json()["prediction"]["prediction"], "BENIGN")
        self.assertFalse(first.json()["ml_result"]["isolation_forest_anomaly"])

        changed = {**fingerprint, "canvasHash": "canvas-b", "webglRenderer": "gpu-b"}
        second = self.client.post("/api/login", json={**credentials, "fingerprint": changed})
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["login_status"], "denied")

        devices = self.client.get("/api/devices/sumukh").json()["devices"]
        changed_device = next(item for item in devices if item["fingerprint_hash"] != first.json()["device"]["fingerprint_hash"])
        trusted = self.client.post(f"/api/devices/{changed_device['device_id']}/trust")
        self.assertEqual(trusted.status_code, 200)
        trusted_login = self.client.post("/api/login", json={**credentials, "fingerprint": changed})
        self.assertEqual(trusted_login.status_code, 200)
        self.assertEqual(trusted_login.json()["login_status"], "allowed")

        reset = self.client.post("/api/baselines/reset", json={"username": "sumukh"})
        self.assertEqual(reset.status_code, 200)
        self.assertEqual(reset.json()["status"], "reset")
        self.assertEqual(self.client.get("/api/baselines").json()["count"], 0)

    def test_device_registry_requires_manual_trust_and_updates_risk(self):
        fingerprint = {
            "userAgent": "test-agent", "platform": "test-os", "language": "en-US",
            "screenResolution": "1280x720", "timezone": "UTC", "canvasHash": "canvas-registry",
            "webglRenderer": "gpu-registry", "hardwareConcurrency": 8, "colorDepth": 24,
            "deviceType": "desktop",
        }
        login = self.client.post("/api/login", json={
            "username": "sumukh", "password": "sumukh@123", "fingerprint": fingerprint,
        })
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json()["device"]["trust_status"], "unknown")
        self.assertEqual(self.client.get("/api/devices/sumukh").json()["count"], 1)

        device_id = login.json()["device"]["device_id"]
        trusted = self.client.post(f"/api/devices/{device_id}/trust")
        self.assertEqual(trusted.status_code, 200)
        self.assertEqual(trusted.json()["device"]["trust_status"], "trusted")
        risk = self.client.get("/api/risk/sumukh")
        self.assertEqual(risk.status_code, 200)
        self.assertEqual(risk.json()["breakdown"]["device_trust"]["status"], "trusted")

    def test_high_risk_auto_creates_incident_and_approval_quarantines_device(self):
        fingerprint = {
            "userAgent": "risk-test", "platform": "test-os", "language": "en-US",
            "screenResolution": "1280x720", "timezone": "UTC", "canvasHash": "risk-device",
            "webglRenderer": "risk-gpu", "hardwareConcurrency": 8, "colorDepth": 24,
            "deviceType": "desktop",
        }
        enrolled = self.client.post("/api/login", json={
            "username": "sumukh", "password": "sumukh@123", "fingerprint": fingerprint,
        }).json()
        device_id = enrolled["device"]["device_id"]
        device_token = enrolled["access_token"]
        record_signals(
            "sumukh", behavioral_score=95, anomaly_score=95,
            classifier_label="credential_theft", classifier_confidence=99,
            device_id=device_id, device_trust_status="unknown",
        )
        risk_response = self.client.get("/api/risk/sumukh")
        self.assertEqual(risk_response.status_code, 200)
        self.assertGreaterEqual(risk_response.json()["score"], 50)

        incident = self.client.get("/api/incidents").json()["incidents"][0]
        self.assertEqual(incident["status"], "open")
        approved = self.client.post(f"/api/incidents/{incident['id']}/approve")
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(approved.json()["device"]["trust_status"], "flagged")
        self.assertTrue(approved.json()["device"]["quarantined"])
        importlib.reload(device_registry)
        persisted_device = device_registry.get_device(device_id)
        self.assertEqual(persisted_device["trust_status"], "flagged")
        self.assertTrue(persisted_device["quarantined"])
        blocked_session = self.client.get("/api/auth/me", headers={
            "Authorization": f"Bearer {device_token}",
        })
        self.assertEqual(blocked_session.status_code, 403)

        dismissed = self.client.post(f"/api/incidents/{incident['id']}/dismiss")
        self.assertEqual(dismissed.status_code, 200)
        self.assertEqual(dismissed.json()["incident"]["status"], "dismissed")

        summary = self.client.get("/api/dashboard/summary").json()
        self.assertEqual(summary["device_counts"]["flagged"], 1)
        self.assertGreaterEqual(len(summary["recent_incidents"]), 1)

    def test_device_registry_manual_trust_and_risk_breakdown(self):
        device = register_login_device("operator-1", {
            "userAgent": "registry-test", "platform": "test-os", "screenResolution": "1280x720",
            "timezone": "UTC", "canvasHash": "hash-1", "webglRenderer": "gpu-1",
            "hardwareConcurrency": 8, "colorDepth": 24, "deviceType": "desktop", "language": "en-US",
        }, first_login=True)
        record_signals(
            "operator-1", behavioral_score=10, anomaly_score=5, classifier_label="benign",
            classifier_confidence=99, device_id=device["device_id"], device_trust_status="unknown",
        )

        listed = self.client.get("/api/devices/operator-1")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["devices"][0]["trust_status"], "unknown")

        risk_before = self.client.get("/api/risk/operator-1").json()
        self.assertEqual(risk_before["breakdown"]["network"]["score"], 0.0)
        self.assertEqual(risk_before["breakdown"]["physical"]["score"], None)
        self.assertEqual(risk_before["breakdown"]["device_trust"]["status"], "unknown")

        trusted = self.client.post(f"/api/devices/{device['device_id']}/trust")
        self.assertEqual(trusted.status_code, 200)
        self.assertEqual(trusted.json()["device"]["trust_status"], "trusted")
        risk_after = self.client.get("/api/risk/operator-1").json()
        self.assertLess(risk_after["score"], risk_before["score"])

    def test_incident_lifecycle_endpoints_change_persisted_state(self):
        device = register_login_device("incident-user", {
            "userAgent": "incident-test", "platform": "test-os", "screenResolution": "1280x720",
            "timezone": "UTC", "canvasHash": "hash-2", "webglRenderer": "gpu-2",
            "hardwareConcurrency": 4, "colorDepth": 24, "deviceType": "desktop", "language": "en-US",
        })
        record_signals(
            "incident-user", behavioral_score=100, anomaly_score=100,
            classifier_label="credential_theft", classifier_confidence=100,
            device_id=device["device_id"], device_trust_status="unknown",
        )
        risk = self.client.get("/api/risk/incident-user").json()
        incident = risk["incident"]
        self.assertIsNotNone(incident)
        self.assertEqual(self.client.get(f"/api/incidents/{incident['id']}").status_code, 200)

        approved = self.client.post(f"/api/incidents/{incident['id']}/approve")
        self.assertEqual(approved.status_code, 200)
        self.assertTrue(approved.json()["device"]["quarantined"])
        self.assertEqual(approved.json()["incident"]["status"], "investigating")

        dismissed = self.client.post(f"/api/incidents/{incident['id']}/dismiss")
        self.assertEqual(dismissed.status_code, 200)
        self.assertEqual(dismissed.json()["incident"]["status"], "dismissed")

        record_signals(
            "resolve-user", behavioral_score=100, anomaly_score=100,
            classifier_label="credential_theft", classifier_confidence=100,
            device_id=None, device_trust_status="unknown",
        )
        resolve_incident = self.client.get("/api/risk/resolve-user").json()["incident"]
        resolved = self.client.post(f"/api/incidents/{resolve_incident['id']}/resolve")
        self.assertEqual(resolved.status_code, 200)
        self.assertEqual(resolved.json()["incident"]["status"], "resolved")

        summary = self.client.get("/api/dashboard/summary").json()
        self.assertEqual(summary["device_counts"]["flagged"], 1)
        self.assertEqual(summary["active_incident_count"], 0)

    def test_incident_data_survives_store_reload(self):
        event = persist_security_event({
            "user_id": "durable-incident-user",
            "request_path": "/api/investigation/test",
            "http_method": "GET",
            "event_category": "investigation",
        })
        incident = incident_store.maybe_create_risk_incident({
            "score": 85,
            "level": "critical",
            "user_id": "durable-incident-user",
            "device_id": "durable-device",
            "breakdown": {"behavioral": {"score": 70}},
        }, evidence=["unrecognized device"], event_ids=[event["id"]])
        self.assertIsNotNone(incident)

        importlib.reload(incident_store)
        restored = incident_store.get_incident(incident["id"])
        self.assertEqual(restored["evidence"], ["unrecognized device"])
        self.assertEqual(restored["risk_breakdown"], {"behavioral": {"score": 70}})
        self.assertEqual(restored["event_ids"], [event["id"]])
        self.assertEqual(incident_store.get_incident_events(incident["id"])[0]["id"], event["id"])
        response = self.client.get(f"/api/incidents/{incident['id']}/events")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["events"][0]["id"], event["id"])

    def test_risk_signals_and_baselines_survive_cache_reload(self):
        fingerprint = {
            "userAgent": "persistent-agent", "platform": "test-os", "language": "en-US",
            "screenResolution": "1280x720", "timezone": "UTC", "canvasHash": "persistent-canvas",
            "webglRenderer": "persistent-gpu", "hardwareConcurrency": 8, "colorDepth": 24,
            "deviceType": "desktop",
        }
        geo = {"city": "Demo City", "country": "ZZ", "lat": 12.0, "lon": 34.0}
        original_baseline = login_detector.get_or_create_baseline("durable-risk-user", fingerprint, geo, 11)
        original_risk = risk_engine.record_signals(
            "durable-risk-user", behavioral_score=65, anomaly_score=40,
            classifier_label="credential_theft", classifier_confidence=80,
            device_id=None, device_trust_status="trusted",
        )

        login_detector.user_baselines.clear()
        login_detector._BASELINES_DATABASE_PATH = None
        risk_engine._latest_signals.clear()
        risk_engine._SIGNALS_DATABASE_PATH = None

        restored_baseline = login_detector.get_or_create_baseline(
            "durable-risk-user", {**fingerprint, "canvasHash": "different"}, geo, 23,
        )
        restored_risk = risk_engine.compute_risk("durable-risk-user")
        self.assertEqual(restored_baseline["created_at"], original_baseline["created_at"])
        self.assertEqual(restored_baseline["fingerprint"], fingerprint)
        self.assertEqual(restored_risk["score"], original_risk["score"])

    def test_batch_risk_analysis_returns_each_submitted_user(self):
        response = self.client.post("/api/batch-risk-analysis", json=[
            {"id": "user-a", "actual_data_volume": 100},
            {"id": "user-b", "actual_data_volume": 900},
        ])
        self.assertEqual(response.status_code, 200)
        results = response.json()["user_risk_scores"]
        self.assertEqual([item["user_id"] for item in results], ["user-a", "user-b"])
        self.assertGreater(results[1]["overall_score"], results[0]["overall_score"])

    def test_threat_injection_validates_payload_and_runs_models(self):
        invalid = self.client.post("/api/inject-threat", json={"behavior_metrics": {}})
        self.assertEqual(invalid.status_code, 422)

        metrics = {
            "normal_login_time": 9.2, "actual_login_time": 23.8,
            "normal_session_duration": 4.5, "actual_session_duration": 0.2,
            "normal_data_volume": 120, "actual_data_volume": 850,
            "normal_api_calls": 45, "actual_api_calls": 500,
            "normal_geo_distance": 0, "actual_geo_distance": 9847,
        }
        valid = self.client.post("/api/inject-threat", json={
            "phase": "exfiltration", "behavior_metrics": metrics, "anomaly_score": 0.92,
            "anomalies": ["simulated exfiltration"], "compromised_nodes": ["n1", "n4"],
        })
        self.assertEqual(valid.status_code, 200)
        self.assertEqual(valid.json()["status"], "injected")
        self.assertTrue(valid.json()["live_threat"]["active"])

    def test_attack_chain_start_status_stop(self):
        started = self.client.post("/api/attack-chain/start")
        self.assertEqual(started.status_code, 200)
        self.assertIn(started.json()["status"], {"started", "already_running"})

        stopped = self.client.post("/api/attack-chain/stop")
        self.assertEqual(stopped.status_code, 200)
        self.assertEqual(stopped.json()["status"], "stopped")
        self.assertFalse(self.client.get("/api/attack-chain/status").json()["running"])

    def test_invalid_login_does_not_create_baseline(self):
        response = self.client.post("/api/login", json={
            "username": "unknown-user", "password": "wrong", "fingerprint": {
                "userAgent": "test-agent", "platform": "test-os", "language": "en-US",
                "screenResolution": "1280x720", "timezone": "UTC", "canvasHash": "canvas-a",
                "webglRenderer": "gpu-a", "hardwareConcurrency": 8, "colorDepth": 24,
                "deviceType": "desktop",
            },
        })
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["login_status"], "denied")
        self.assertEqual(self.client.get("/api/baselines").json()["count"], 0)

    def test_invalid_password_is_not_attributed_to_registered_device(self):
        fingerprint = {
            "userAgent": "owner-agent", "platform": "test-os", "language": "en-US",
            "screenResolution": "1280x720", "timezone": "UTC", "canvasHash": "owner-canvas",
            "webglRenderer": "owner-gpu", "hardwareConcurrency": 8, "colorDepth": 24,
            "deviceType": "desktop",
        }
        enrolled = self.client.post("/api/login", json={
            "username": "sumukh", "password": "sumukh@123", "fingerprint": fingerprint,
        })
        self.assertEqual(enrolled.status_code, 200)
        device_id = enrolled.json()["device"]["device_id"]

        failed = self.client.post("/api/login", json={
            "username": "sumukh", "password": "wrong", "fingerprint": fingerprint,
        })
        self.assertEqual(failed.status_code, 401)
        self.assertEqual(self.client.get("/api/risk/sumukh").json()["device_id"], None)
        device = self.client.get("/api/devices/sumukh").json()["devices"][0]
        self.assertEqual(device["device_id"], device_id)
        self.assertFalse(device["quarantined"])
        self.assertEqual(device["trust_status"], "unknown")

    def test_rbac_blocks_anonymous_and_limits_viewer_permissions(self):
        anonymous = self.client.get("/api/dashboard/summary", headers={"Authorization": ""})
        self.assertEqual(anonymous.status_code, 401)

        viewer = create_user("viewer-test@trustnet.local", "a-long-viewer-password", "viewer")
        viewer_token = issue_access_token(viewer)
        headers = {"Authorization": f"Bearer {viewer_token}"}
        self.assertEqual(self.client.get("/api/dashboard/summary", headers=headers).status_code, 200)
        self.assertEqual(self.client.post("/api/baselines/reset", json={}, headers=headers).status_code, 403)
        self.assertEqual(self.client.post("/api/auth/register", json={
            "email": "blocked-create@trustnet.local", "password": "another-long-password", "role": "analyst",
        }, headers=headers).status_code, 403)

    def test_admin_registers_hashed_account_and_logout_revokes_jwt(self):
        registered = self.client.post("/api/auth/register", json={
            "email": "new-analyst@trustnet.local", "password": "correct-horse-battery", "role": "analyst",
        })
        self.assertEqual(registered.status_code, 200, registered.text)
        self.assertEqual(registered.json()["user"]["role"], "analyst")
        self.assertNotIn("password_hash", registered.json()["user"])

        login = self.client.post("/api/auth/login", json={
            "email": "new-analyst@trustnet.local", "password": "correct-horse-battery", "fingerprint": {
                "userAgent": "registered-agent", "platform": "test-os", "language": "en-US",
                "screenResolution": "1280x720", "timezone": "UTC", "canvasHash": "registered-canvas",
                "webglRenderer": "registered-gpu", "hardwareConcurrency": 8, "colorDepth": 24,
                "deviceType": "desktop",
            },
        })
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()["login_status"], "allowed")
        analyst_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        current = self.client.get("/api/auth/me", headers=analyst_headers).json()
        self.assertEqual(current["user"]["role"], "analyst")
        self.assertNotIn("manage_users", current["permissions"])
        history = self.client.get(f"/api/users/{registered.json()['user']['id']}/login-history")
        self.assertEqual(history.status_code, 200)
        self.assertTrue(any(item["success"] for item in history.json()["attempts"]))

        malformed_fingerprint = self.client.post("/api/auth/login", json={
            "username": "sumukh", "password": "sumukh@123", "fingerprint": {},
        })
        self.assertEqual(malformed_fingerprint.status_code, 422)
        admin_history = self.client.get("/api/users/sumukh/login-history")
        self.assertTrue(any(item["reason"] == "invalid_fingerprint" for item in admin_history.json()["attempts"]))

        headers = {"Authorization": f"Bearer {self.admin_token}"}
        logged_out = self.client.post("/api/auth/logout", headers=headers)
        self.assertEqual(logged_out.status_code, 200)
        self.assertEqual(self.client.get("/api/dashboard/summary", headers=headers).status_code, 401)
        self.admin_token = issue_access_token(get_user_by_id("sumukh"))
        self.client.headers.update({"Authorization": f"Bearer {self.admin_token}"})

    def test_auth_state_survives_cache_reload(self):
        email = "persistent-user@trustnet.local"
        password = "a-very-long-persistent-password"
        user = security_auth.create_user(email, password, "viewer", user_id="persistent-user")
        for _ in range(5):
            failed_user, reason, _ = security_auth.authenticate(email, "wrong-password", ip="192.0.2.80")
            self.assertIsNone(failed_user)
            self.assertEqual(reason, "invalid_credentials")
        token = security_auth.issue_access_token(user)
        security_auth.revoke_access_token(security_auth.decode_access_token(token))

        security_auth._AUTH_DATABASE_PATH = None
        security_auth._ensure_auth_state_loaded()
        restored = security_auth.find_user(email)
        self.assertEqual(restored["id"], "persistent-user")
        self.assertEqual(len(security_auth.login_history("persistent-user")), 5)
        with self.assertRaises(jwt.InvalidTokenError):
            security_auth.decode_access_token(token)
        locked_user, reason, _ = security_auth.authenticate(email, password, ip="192.0.2.80")
        self.assertIsNone(locked_user)
        self.assertEqual(reason, "account_locked")

    def test_login_attempt_history_and_temporary_lockout(self):
        for _ in range(5):
            attempt = self.client.post("/api/auth/login", json={
                "username": "lockout-probe", "password": "wrong", "fingerprint": {
                    "userAgent": "test-agent", "platform": "test-os", "language": "en-US",
                    "screenResolution": "1280x720", "timezone": "UTC", "canvasHash": "canvas-a",
                    "webglRenderer": "gpu-a", "hardwareConcurrency": 8, "colorDepth": 24,
                    "deviceType": "desktop",
                },
            })
            self.assertEqual(attempt.status_code, 401)
        locked = self.client.post("/api/auth/login", json={
            "username": "lockout-probe", "password": "wrong", "fingerprint": {
                "userAgent": "test-agent", "platform": "test-os", "language": "en-US",
                "screenResolution": "1280x720", "timezone": "UTC", "canvasHash": "canvas-a",
                "webglRenderer": "gpu-a", "hardwareConcurrency": 8, "colorDepth": 24,
                "deviceType": "desktop",
            },
        })
        self.assertEqual(locked.status_code, 401)
        self.assertEqual(locked.json()["login_attempt_reason"], "account_locked")
        history = self.client.get("/api/users/lockout-probe/login-history")
        self.assertEqual(history.status_code, 200)
        self.assertGreaterEqual(len(history.json()["attempts"]), 6)
        self.assertTrue(all(item["success"] is False for item in history.json()["attempts"]))

    def test_unknown_username_failures_do_not_lock_real_account(self):
        for _ in range(5):
            self.client.post("/api/auth/login", json={
                "username": "sumukh-typo", "password": "wrong", "fingerprint": {},
            })
        correct_password_wrong_fingerprint = self.client.post("/api/auth/login", json={
            "username": "sumukh", "password": "sumukh@123", "fingerprint": {},
        })
        self.assertEqual(correct_password_wrong_fingerprint.status_code, 422)
        self.assertTrue(any(
            item["reason"] == "invalid_fingerprint"
            for item in self.client.get("/api/users/sumukh/login-history").json()["attempts"]
        ))

    def test_network_events_are_logged_and_anomaly_flags_feed_risk(self):
        self.client.get("/api/health")
        logged_health = list_network_events(limit=1)[0]
        self.assertEqual(logged_health["endpoint"], "/api/health")
        self.assertEqual(logged_health["status_code"], 200)

        first, flags = record_request(
            ip="203.0.113.10", user_id="network-user", endpoint="/api/auth/login",
            method="POST", status_code=200, response_time_ms=12.5,
        )
        self.assertEqual(flags, [])
        self.assertEqual(first["status_code"], 200)
        for _ in range(9):
            _, flags = record_request(
                ip="203.0.113.10", user_id="network-user", endpoint="/api/auth/login",
                method="POST", status_code=200, response_time_ms=10,
            )
        self.assertIn("repeated_requests", flags[-1]["anomaly_types"])
        self.assertGreater(network_score_for_user("network-user"), 0)

        response = self.client.get("/api/network/events?ip=203.0.113.10&limit=20")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.json()["count"], 10)
        anomalies = self.client.get("/api/network/anomalies?user_id=network-user")
        self.assertEqual(anomalies.status_code, 200)
        self.assertTrue(any("repeated_requests" in item["anomaly_types"] for item in anomalies.json()["anomalies"]))

    def test_network_activity_and_recent_detector_window_survive_cache_reload(self):
        for _ in range(10):
            event, _ = record_request(
                ip="192.0.2.99", user_id="durable-network-user", endpoint="/api/auth/login",
                method="POST", status_code=200, response_time_ms=8,
            )
        self.assertIn("repeated_requests", event["anomaly_types"])
        original_score = network_score_for_user("durable-network-user")

        network_monitor._EVENTS.clear()
        network_monitor._ACTIVITY_DATABASE_PATH = None
        restored = list_network_events(user_id="durable-network-user", limit=20)
        restored_score = network_score_for_user("durable-network-user")
        self.assertTrue(any("repeated_requests" in item["anomaly_types"] for item in restored))
        self.assertEqual(restored_score, original_score)

    def test_credential_stuffing_pattern_raises_network_score_for_affected_users(self):
        record_signals(
            "target-0", behavioral_score=10, anomaly_score=0,
            classifier_label="benign", classifier_confidence=0,
            device_id=None, device_trust_status="trusted",
        )
        event = None
        for index in range(5):
            event = record_auth_failure("198.51.100.7", f"target-{index}")
        self.assertIsNotNone(event)
        self.assertEqual(event["anomaly_types"], ["credential_stuffing_pattern"])
        self.assertGreater(network_score_for_user("target-0"), 0)
        affected = self.client.get("/api/network/anomalies?user_id=target-0")
        self.assertTrue(any("credential_stuffing_pattern" in item["anomaly_types"] for item in affected.json()["anomalies"]))

    def test_security_event_validation_and_persistence(self):
        event = {
            "user_id": "event-user",
            "ip_address": "203.0.113.42",
            "device_fingerprint_hash": "abc123",
            "request_path": "/api/login",
            "http_method": "POST",
            "status_code": 200,
            "session_id": "sess-100",
            "event_category": "authentication",
            "risk_indicators": ["geo_mismatch", "new_device"],
        }
        original_db_path = database._DB_PATH
        with tempfile.TemporaryDirectory() as temp_dir:
            database._DB_PATH = str(Path(temp_dir) / "audit-test.db")
            try:
                database.initialize_database()
                valid = validate_security_event(event)
                self.assertTrue(valid["valid"])
                saved = persist_security_event(valid["event"])
                self.assertIsNotNone(saved)
                self.assertEqual(saved["user_id"], "event-user")
                self.assertEqual(saved["event_category"], "authentication")
                self.assertTrue(verify_audit_chain()["valid"])

                connection = get_db_connection()
                try:
                    original_event_payload = connection.execute(
                        "SELECT event_payload FROM security_events WHERE id = ?", (saved["id"],)
                    ).fetchone()["event_payload"]
                    connection.execute(
                        "UPDATE security_events SET event_payload = '{\"tampered\":true}' WHERE id = ?",
                        (saved["id"],),
                    )
                    connection.commit()
                finally:
                    connection.close()
                self.assertFalse(verify_audit_chain()["valid"])

                connection = get_db_connection()
                try:
                    connection.execute(
                        "UPDATE security_events SET event_payload = ? WHERE id = ?",
                        (original_event_payload, saved["id"]),
                    )
                    connection.execute("DROP TRIGGER audit_entries_no_update")
                    connection.execute(
                        "UPDATE audit_entries SET payload_json = '{}' WHERE event_id = ?", (saved["id"],)
                    )
                    connection.execute(
                        """CREATE TRIGGER audit_entries_no_update BEFORE UPDATE ON audit_entries
                           BEGIN SELECT RAISE(ABORT, 'audit entries are append-only'); END"""
                    )
                    connection.commit()
                finally:
                    connection.close()
                self.assertFalse(verify_audit_chain()["valid"])
            finally:
                database._DB_PATH = original_db_path

        verified = self.client.get("/api/audit/verify")
        self.assertEqual(verified.status_code, 200)
        self.assertTrue(verified.json()["valid"])

        with self.assertRaises(ValueError):
            validate_security_event({"request_path": "", "http_method": "PATCH"})

    def test_centralized_risk_formula_and_csf_score_route(self):
        score = calculate_centralized_risk({
            "csf": 0.9,
            "network": 0.7,
            "deviceUntrusted": 0.8,
            "geoFlag": 0.2,
        })
        self.assertGreaterEqual(score, 0)
        self.assertLessEqual(score, 100)
        self.assertTrue(score > 70)

        response = self.client.post("/api/csf/score", json={
            "user_id": "csf-user",
            "features": {"csf": 0.9, "network": 0.7, "deviceUntrusted": 0.8, "geoFlag": 0.2},
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("risk_score", response.json())
        self.assertIn("tier", response.json())

    def test_restrict_threshold_creates_incident_at_boundary(self):
        self.assertEqual(risk_tier_for_score(59.99), "MFA")
        self.assertEqual(risk_tier_for_score(60.0), "Restrict")
        risk = {
            "level": "high", "user_id": "threshold-user", "device_id": None,
            "breakdown": {}, "thresholds": {"restrict": 60.0},
        }
        self.assertIsNone(incident_store.maybe_create_risk_incident({**risk, "score": 59.99}))
        incident = incident_store.maybe_create_risk_incident({**risk, "score": 60.0})
        self.assertIsNotNone(incident)
        self.assertEqual(incident["risk_score"], 60.0)

    def test_admin_can_persist_restrict_threshold_and_viewer_cannot_change_it(self):
        updated = self.client.put("/api/policies/restrict-threshold", json={"restrict_threshold": 65})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["restrict_threshold"], 65.0)
        self.assertEqual(risk_tier_for_score(64.99), "MFA")
        self.assertEqual(risk_tier_for_score(65), "Restrict")

        risk_engine._POLICY_DATABASE_PATH = None
        self.assertEqual(get_restrict_threshold(), 65.0)

        viewer = create_user("policy-viewer@trustnet.local", "a-long-viewer-password", "viewer")
        viewer_headers = {"Authorization": f"Bearer {issue_access_token(viewer)}"}
        denied = self.client.put(
            "/api/policies/restrict-threshold", json={"restrict_threshold": 55}, headers=viewer_headers,
        )
        self.assertEqual(denied.status_code, 403)
        invalid = self.client.put("/api/policies/restrict-threshold", json={"restrict_threshold": 90})
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(self.client.put(
            "/api/policies/restrict-threshold", json={"restrict_threshold": 60},
        ).status_code, 200)


if __name__ == "__main__":
    unittest.main()
