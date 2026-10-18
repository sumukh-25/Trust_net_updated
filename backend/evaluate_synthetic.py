"""Reproducible holdout evaluation on fictional synthetic behavior records."""

from __future__ import annotations

import contextlib
import io
import json

from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

from models.optimized_models import OptimizedAnomalyDetector

SEED = 42
FEATURES = [
    "session_duration",
    "data_volume",
    "api_calls",
    "geo_distance",
    "login_hour",
]


def main() -> None:
    detector = OptimizedAnomalyDetector()
    samples, labels = detector.generate_training_data(5000)
    train_samples, test_samples, train_labels, test_labels = train_test_split(
        samples,
        labels,
        test_size=0.2,
        random_state=SEED,
        stratify=labels,
    )

    with contextlib.redirect_stdout(io.StringIO()):
        training = detector.train(
            X=train_samples,
            y=train_labels,
            feature_names=FEATURES,
        )
    if training.get("status") != "success":
        raise RuntimeError(training.get("message", "Synthetic anomaly model training failed."))

    predictions, anomaly_scores = detector.predict(test_samples)
    expected_anomaly = (test_labels == -1).astype(int)
    predicted_anomaly = (predictions == -1).astype(int)
    matrix = confusion_matrix(expected_anomaly, predicted_anomaly, labels=[0, 1])
    result = {
        "evaluation": "synthetic_holdout",
        "data_notice": "Fictional generated records only; not an estimate of operational detection accuracy.",
        "seed": SEED,
        "sample_count": len(samples),
        "train_count": len(train_samples),
        "test_count": len(test_samples),
        "feature_order": FEATURES,
        "split": "stratified 80/20; random_state=42",
        "anomaly_class_definition": "label -1",
        "metrics": {
            "accuracy": round(float(accuracy_score(expected_anomaly, predicted_anomaly)), 4),
            "precision": round(float(precision_score(expected_anomaly, predicted_anomaly, zero_division=0)), 4),
            "recall": round(float(recall_score(expected_anomaly, predicted_anomaly, zero_division=0)), 4),
            "f1": round(float(f1_score(expected_anomaly, predicted_anomaly, zero_division=0)), 4),
            "confusion_matrix_labels_0_1": matrix.tolist(),
            "mean_anomaly_score": round(float(anomaly_scores.mean()), 4),
        },
        "training_parameters": training["best_params"],
    }
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
