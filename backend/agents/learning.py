"""Analyst-feedback learning with a measured, leave-one-out evaluation.

Learning only adjusts the Investigator's rule weights. It never changes enforcement
thresholds or autonomy settings. Learned weights are applied only when:
  * at least MIN_LABELS analyst verdicts exist, and
  * leave-one-out accuracy of the learned weights is not worse than the default weights.
Otherwise the default weights stay in force and the report says why.
"""

from __future__ import annotations

import json
from typing import Any

from models.database import get_db_connection

DEFAULT_WEIGHTS: dict[str, float] = {
    "credential_attack": 0.30,
    "untrusted_device": 0.20,
    "multi_ip_activity": 0.15,
    "model_consensus": 0.25,
    "suspicious_request_pattern": 0.10,
}
MALICIOUS_THRESHOLD = 0.5
SUSPICIOUS_THRESHOLD = 0.25
MIN_LABELS = 10
MIN_RULE_OBSERVATIONS = 3


def latest_labels() -> list[dict[str, Any]]:
    """Most recent analyst verdict per incident."""
    connection = get_db_connection()
    try:
        rows = connection.execute(
            """SELECT f.* FROM analyst_feedback f
               WHERE f.rowid = (SELECT MAX(rowid) FROM analyst_feedback WHERE incident_id = f.incident_id)
               ORDER BY f.created_at"""
        ).fetchall()
    finally:
        connection.close()
    labels = []
    for row in rows:
        item = dict(row)
        item["rules_fired"] = json.loads(item["rules_fired"] or "[]")
        labels.append(item)
    return labels


def _weights_from(labels: list[dict[str, Any]]) -> dict[str, float]:
    adjusted = dict(DEFAULT_WEIGHTS)
    for rule_id in DEFAULT_WEIGHTS:
        tp = sum(1 for l in labels if rule_id in l["rules_fired"] and l["verdict"] == "true_positive")
        fp = sum(1 for l in labels if rule_id in l["rules_fired"] and l["verdict"] == "false_positive")
        if tp + fp < MIN_RULE_OBSERVATIONS:
            continue
        precision = (tp + 1) / (tp + fp + 2)
        adjusted[rule_id] = DEFAULT_WEIGHTS[rule_id] * min(2.0, max(0.25, precision / 0.5))
    total = sum(adjusted.values())
    return {key: value / total for key, value in adjusted.items()}


def confidence_for(fired: list[str], weights: dict[str, float]) -> float:
    return round(sum(weights.get(rule_id, 0.0) for rule_id in set(fired)), 4)


def _accuracy(labels: list[dict[str, Any]], weights_for: Any) -> float:
    correct = 0
    for index, label in enumerate(labels):
        weights = weights_for(index)
        predicted_malicious = confidence_for(label["rules_fired"], weights) >= SUSPICIOUS_THRESHOLD
        correct += predicted_malicious == (label["verdict"] == "true_positive")
    return correct / len(labels)


def evaluate() -> dict[str, Any]:
    """Return the measured learning result (leave-one-out accuracy, default vs learned weights)."""
    labels = latest_labels()
    n = len(labels)
    positives = sum(1 for l in labels if l["verdict"] == "true_positive")
    report: dict[str, Any] = {
        "labeled_incidents": n, "true_positives": positives, "false_positives": n - positives,
        "min_labels_required": MIN_LABELS, "default_weights": DEFAULT_WEIGHTS,
        "learned_weights": None, "active_weights": dict(DEFAULT_WEIGHTS),
        "default_accuracy": None, "learned_accuracy": None, "accuracy_delta": None,
        "applied": False, "status": "insufficient_data",
        "method": "leave-one-out over analyst-labeled incidents; prediction is 'malicious' when confidence >= suspicious threshold",
    }
    if n == 0:
        report["note"] = "No analyst verdicts yet."
        return report
    default_acc = _accuracy(labels, lambda _i: DEFAULT_WEIGHTS)
    report["default_accuracy"] = round(default_acc, 4)
    if n < MIN_LABELS:
        report["note"] = f"{n}/{MIN_LABELS} verdicts; default weights remain active."
        return report
    learned_acc = _accuracy(labels, lambda i: _weights_from(labels[:i] + labels[i + 1:]))
    full = _weights_from(labels)
    report.update({
        "learned_weights": {k: round(v, 4) for k, v in full.items()},
        "learned_accuracy": round(learned_acc, 4),
        "accuracy_delta": round(learned_acc - default_acc, 4),
    })
    if learned_acc >= default_acc:
        report.update({"applied": True, "status": "applied", "active_weights": report["learned_weights"],
                       "note": "Learned weights are not worse than defaults on leave-one-out evaluation."})
    else:
        report.update({"status": "rejected",
                       "note": "Learned weights scored worse than defaults on leave-one-out evaluation; defaults kept."})
    return report


def active_weights() -> dict[str, float]:
    return evaluate()["active_weights"]


def latest_feedback_for_incident(incident_id: str) -> dict[str, Any] | None:
    """Return the most recent persisted verdict for an incident, if any."""
    items = list_feedback(incident_id)
    return items[-1] if items else None


def is_duplicate_verdict(existing: dict[str, Any] | None, verdict: str) -> bool:
    """A repeated identical verdict is idempotent; a different verdict can correct it."""
    return bool(existing and existing.get("verdict") == verdict)


def record_feedback(feedback: dict[str, Any]) -> None:
    connection = get_db_connection()
    try:
        connection.execute(
            "INSERT INTO analyst_feedback (id, incident_id, verdict, notes, analyst_id, rules_fired, investigator_confidence, created_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (feedback["id"], feedback["incident_id"], feedback["verdict"], feedback["notes"], feedback["analyst_id"],
             json.dumps(feedback["rules_fired"]), feedback["investigator_confidence"], feedback["created_at"]),
        )
        connection.commit()
    finally:
        connection.close()


def list_feedback(incident_id: str) -> list[dict[str, Any]]:
    connection = get_db_connection()
    try:
        rows = connection.execute(
            "SELECT * FROM analyst_feedback WHERE incident_id = ? ORDER BY created_at, rowid", (incident_id,)
        ).fetchall()
    finally:
        connection.close()
    items = []
    for row in rows:
        item = dict(row)
        item["rules_fired"] = json.loads(item["rules_fired"] or "[]")
        items.append(item)
    return items
