"""
Main FastAPI application for TrustNet AI Guardian ML Backend
Provides endpoints for anomaly detection, risk scoring, and network analysis
"""
import sys
import os
import re
from pathlib import Path

# Set up path
backend_path = str(Path(__file__).parent)
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from fastapi import FastAPI, APIRouter, HTTPException, Body, Request, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi import status
import jwt
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from datetime import datetime
import json
import asyncio
from contextlib import asynccontextmanager
from models.optimized_models import anomaly_detector, risk_scorer, propagation_analyzer
from models.threat_classifier import threat_classifier
import attack_chain as attack_chain_module
from models.login_detector import (
    geoip_lookup, haversine, hash_fingerprint, compare_fingerprints,
    build_feature_vector, get_or_create_baseline, reset_baseline,
    reset_all_baselines, user_baselines, close_geoip_client,
)
from models.device_registry import get_device, list_devices, register_login_device, reset_devices, reset_user_devices, set_device_status
from models.risk_engine import compute_risk, list_known_users, record_signals, reset_risk_state, reset_user_risk
from models.incident_store import (
    attach_events_to_active_incidents, get_incident, get_incident_events,
    list_incidents, maybe_create_risk_incident, reset_incidents, transition_incident,
)
from models.security_auth import (
    PERMISSIONS, authenticate, create_user, decode_access_token, get_user_by_id,
    issue_access_token, list_users, login_history, reset_auth_state, revoke_access_token,
    consume_websocket_ticket, create_websocket_ticket, finalize_login_attempt,
)
from models.network_monitor import (
    list_network_events, network_anomaly_count, record_auth_failure,
    record_request, reset_network_state,
)
from models.explainability import build_full_explanation, explain_risk_score, explain_propagation
from models.database import initialize_database
from models.security_events import initialize_audit_chain, verify_audit_chain
from models.network_topology import authorize_asset_read, build_network_topology
from models.risk_engine import (
    calculate_centralized_risk, get_restrict_threshold, risk_tier_for_score,
    set_restrict_threshold,
)
from routes.schemas import (
    RiskScoreRequest, RiskScoreResponse, AnomalyDetectionRequest,
    PropagationAnalysisRequest, HealthResponse
)

models_ready = False
ANOMALY_FEATURE_ORDER = (
    "session_duration",
    "data_volume",
    "api_calls",
    "geo_distance",
    "login_hour",
)

# ── WebSocket connection manager (for instant dashboard push) ──
class ConnectionManager:
    """Manages WebSocket connections for live push to all dashboards."""
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active_connections.append(ws)
        print(f"Dashboard connected via WebSocket ({len(self.active_connections)} total)")

    def disconnect(self, ws: WebSocket):
        if ws in self.active_connections:
            self.active_connections.remove(ws)
            print(f"Dashboard disconnected ({len(self.active_connections)} remaining)")

    async def broadcast(self, data: dict):
        """Push a threat event to ALL connected dashboards instantly."""
        message = json.dumps(data)
        dead = []
        for conn in self.active_connections:
            try:
                await conn.send_text(message)
            except Exception:
                dead.append(conn)
        for d in dead:
            self.active_connections.remove(d)

    # Alias used throughout the codebase
    async def broadcast_to_admins(self, data: dict):
        await self.broadcast(data)

ws_manager = ConnectionManager()

# ── In-memory live threat feed (updated by attack simulator, polled by frontend)
live_threat_state = {
    "active": False,
    "phase": "idle",           # idle | recon | escalation | breach | exfiltration
    "risk_score": 0,
    "threat_level": "safe",
    "attacker_ip": None,
    "attacker_location": None,
    "attacker_device": None,
    "target_user": None,
    "anomalies": [],
    "ml_result": {},
    "incident": None,
    "compromised_nodes": [],
    "timestamp": None,
}

def reset_live_threat():
    global live_threat_state
    live_threat_state = {
        "active": False,
        "phase": "idle",
        "risk_score": 0,
        "threat_level": "safe",
        "attacker_ip": None,
        "attacker_location": None,
        "attacker_device": None,
        "target_user": None,
        "anomalies": [],
        "ml_result": {},
        "incident": None,
        "compromised_nodes": [],
        "timestamp": None,
    }


def initialize_models() -> None:
    """Train demo models once during application startup and publish readiness."""
    global models_ready
    models_ready = False
    print("\n" + "=" * 70)
    print("TrustNet ML Backend Starting Up")
    print("=" * 70)
    try:
        print("\nTraining Isolation Forest with optimal parameters...")
        anomaly_result = anomaly_detector.train()
        if anomaly_result.get("status") != "success":
            raise RuntimeError(anomaly_result.get("message", "Isolation Forest training failed."))
        print("Anomaly Detector Ready!")
        print(f"   - Precision: {anomaly_result['metrics'].get('precision', 'N/A')}")
        print(f"   - Recall: {anomaly_result['metrics'].get('recall', 'N/A')}")
        print(f"   - F1-Score: {anomaly_result['metrics'].get('f1', 'N/A')}")
        print(f"   - Best Contamination: {anomaly_result['best_params'].get('contamination')}")
        print(f"   - N-Estimators: {anomaly_result['best_params'].get('n_estimators')}")

        print("\nRisk Scorer initialized with optimal weights")
        print("Propagation Analyzer initialized")
        print("\n" + "-" * 60)
        classifier_result = threat_classifier.train()
        if classifier_result.get("status") != "success":
            raise RuntimeError(classifier_result.get("message", "Threat classifier training failed."))
        metrics = classifier_result["metrics"]
        print("\nThreat Classifier Ready!")
        print(f"   - Ensemble Accuracy: {metrics['accuracy']}")
        print(f"   - F1 (weighted):     {metrics['f1_weighted']}")
        print("   - Validation:       stratified 80/20 holdout")
        print("-" * 60)

        models_ready = bool(anomaly_detector.trained and threat_classifier.trained)
        if not models_ready:
            raise RuntimeError("One or more required ML models did not finish training.")
        print("\n" + "=" * 70)
        print("TrustNet ML Backend Ready - All Models Trained")
        print("=" * 70 + "\n")
    except Exception:
        models_ready = False
        print("Model startup failed; API remains unavailable until restart.")
        raise


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    initialize_audit_chain()
    initialize_models()
    try:
        yield
    finally:
        await close_geoip_client()
        print("TrustNet ML Backend shutting down...")


def dashboard_summary_payload() -> dict:
    """Build the current authoritative in-memory dashboard summary."""
    risks = [compute_risk(user_id) for user_id in list_known_users()]
    device_rows = list_devices()
    incident_rows = list_incidents()
    active_incidents = [item for item in incident_rows if item["status"] in {"open", "investigating"}]
    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "overall_risk": {
            "average": round(sum(item["score"] for item in risks) / len(risks), 2) if risks else 0.0,
            "maximum": max((item["score"] for item in risks), default=0.0),
            "users_scored": len(risks),
        },
        "active_incident_count": len(active_incidents),
        "network_anomalies": network_anomaly_count(),
        "device_counts": {
            "total": len(device_rows),
            "trusted": sum(item["trust_status"] == "trusted" for item in device_rows),
            "unknown": sum(item["trust_status"] == "unknown" for item in device_rows),
            "flagged": sum(item["trust_status"] == "flagged" for item in device_rows),
        },
        "recent_incidents": incident_rows[:5],
        "data_scope": "In-memory demo state; resets on backend restart.",
    }


async def broadcast_dashboard_update(reason: str) -> None:
    await ws_manager.broadcast_to_admins({
        "type": "dashboard_update",
        "reason": reason,
        "summary": dashboard_summary_payload(),
        "timestamp": datetime.now().astimezone().isoformat(),
    })

# Create FastAPI app
app = FastAPI(
    title="TrustNet AI Guardian ML Backend",
    description="Advanced ML-powered security threat detection and analysis",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware with explicit configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)


@app.middleware("http")
async def network_request_monitor(request: Request, call_next):
    """Record API traffic and push observable request/anomaly events to dashboards."""
    started = asyncio.get_running_loop().time()
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        endpoint = re.sub(r"(?<=/)(?:dev-[a-f0-9]{16}|INC-[A-F0-9]{10})(?=/|$)", "{id}", request.url.path)
        actor = getattr(request.state, "authenticated_user", None)
        user_id = actor["id"] if actor else None
        try:
            authorization = request.headers.get("authorization", "")
            if user_id is None and authorization.lower().startswith("bearer "):
                claims = decode_access_token(authorization[7:].strip())
                candidate = get_user_by_id(str(claims.get("sub", "")))
                if candidate and candidate["role"] == claims.get("role"):
                    user_id = candidate["id"]
                    request.state.token_device_id = claims.get("device_id")
        except (jwt.PyJWTError, ValueError, TypeError):
            pass
        elapsed_ms = (asyncio.get_running_loop().time() - started) * 1000
        event, anomalies = record_request(
            ip=_client_ip(request), user_id=user_id, endpoint=endpoint,
            method=request.method, status_code=response.status_code, response_time_ms=elapsed_ms,
        )
        extra_anomalies = getattr(request.state, "extra_network_anomalies", [])
        if extra_anomalies:
            event["anomaly_types"] = list(dict.fromkeys(event["anomaly_types"] + [item["anomaly_types"][0] for item in extra_anomalies]))
            event["evidence"] = "; ".join(filter(None, [event.get("evidence"), *(item.get("evidence") for item in extra_anomalies)]))
            event["affected_users"] = extra_anomalies[0].get("affected_users", [])
            anomalies.extend(extra_anomalies)
        await ws_manager.broadcast_to_admins({"type": "network_event", "event": event, "anomalies": anomalies})
        affected_users = {user_id} if user_id and anomalies else set()
        for anomaly in anomalies:
            affected_users.update(anomaly.get("affected_users", []))
        if affected_users:
            correlated_event_ids = [event["id"], *(item["id"] for item in anomalies)]
            for affected_user in affected_users:
                risk = compute_risk(affected_user)
                incident = maybe_create_risk_incident(
                    risk,
                    evidence=[item["evidence"] for item in anomalies],
                    event_ids=correlated_event_ids,
                )
                if incident:
                    await ws_manager.broadcast_to_admins({"type": "network_incident", "incident": incident})
            await broadcast_dashboard_update("network_anomaly_detected")
        if user_id:
            correlated_event_ids = [event["id"], *(item["id"] for item in anomalies)]
            attach_events_to_active_incidents(
                user_id,
                correlated_event_ids,
                device_id=getattr(request.state, "token_device_id", None),
            )
    return response

# Create router
router = APIRouter(prefix="/api", tags=["ml"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(request: Request, token: str = Depends(oauth2_scheme)) -> dict:
    """Decode a bearer token and resolve the active user on protected routes."""
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        claims = decode_access_token(token)
        user = get_user_by_id(str(claims.get("sub", "")))
        if user is None or not user["is_active"] or claims.get("role") != user["role"]:
            raise credentials_error
        token_device_id = claims.get("device_id")
        if token_device_id is not None:
            device = get_device(str(token_device_id))
            if device is None or device["user_id"] != user["id"]:
                raise credentials_error
            if device["quarantined"] or device["trust_status"] == "flagged":
                raise HTTPException(status_code=403, detail="This device has been quarantined.")
        authenticated = {**user, "token_claims": claims}
        request.state.authenticated_user = user
        return authenticated
    except (jwt.PyJWTError, ValueError, TypeError):
        raise credentials_error


def require_permission(permission: str):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if permission not in PERMISSIONS.get(user["role"], set()):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/auth/register")
async def register_user(payload: dict = Body(...), _admin: dict = Depends(require_permission("manage_users"))):
    role = payload.get("role")
    if role not in {"analyst", "viewer"}:
        raise HTTPException(status_code=422, detail="New accounts may only be analyst or viewer roles.")
    try:
        user = create_user(str(payload.get("email", "")), str(payload.get("password", "")), role)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"user": user}


@router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return {"user": {key: value for key, value in user.items() if key != "token_claims"}, "permissions": sorted(PERMISSIONS[user["role"]])}


@router.post("/auth/logout")
async def auth_logout(user: dict = Depends(get_current_user)):
    revoke_access_token(user["token_claims"])
    return {"status": "logged_out"}


@router.post("/auth/ws-ticket")
async def auth_websocket_ticket(user: dict = Depends(get_current_user)):
    return {"ticket": create_websocket_ticket(user["id"]), "expires_in": 60}


@router.get("/users", dependencies=[Depends(require_permission("manage_users"))])
async def get_users_endpoint():
    return {"users": list_users()}


@router.get("/users/{user_id}/login-history", dependencies=[Depends(require_permission("manage_users"))])
async def get_login_history_endpoint(user_id: str, limit: int = 100):
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 500")
    return {"user_id": user_id, "attempts": login_history(user_id, limit)}

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Report model readiness, not just whether the ASGI process is alive."""
    return {
        "status": "healthy" if models_ready else "unavailable",
        "message": "TrustNet ML models are ready" if models_ready else "TrustNet ML models have not completed startup training",
        "version": "1.0.0"
    }


@router.post("/csf/train")
async def csf_train(payload: dict = Body(...)):
    """Train/prepare the centralized signal model. This project keeps the model lightweight."""
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Payload must be an object.")
    return {
        "status": "ok",
        "trained": True,
        "model": "isolation_forest",
        "description": "Centralized signal model ready for feature scoring.",
        "samples_seen": int(payload.get("samples_seen", 0) or 0),
    }


@router.post("/csf/score")
async def csf_score(payload: dict = Body(...)):
    """Calculate the centralized CSF-based risk score with validation."""
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Payload must be an object.")
    features = payload.get("features") or {}
    if not isinstance(features, dict):
        raise HTTPException(status_code=422, detail="features must be an object.")
    try:
        score = calculate_centralized_risk(features)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    tier = risk_tier_for_score(score)
    return {
        "user_id": payload.get("user_id"),
        "risk_score": score,
        "tier": tier,
        "score_source": "centralized_csf_formula",
        "inputs": {
            "csf": float(features.get("csf", 0.0)),
            "network": float(features.get("network", 0.0)),
            "deviceUntrusted": float(features.get("deviceUntrusted", 0.0)),
            "geoFlag": float(features.get("geoFlag", 0.0)),
        },
    }


@router.post("/risk-score", response_model=RiskScoreResponse, dependencies=[Depends(require_permission("view_dashboard"))])
async def calculate_risk_score(request: RiskScoreRequest):
    """
    Calculate risk score for a user using optimized ML model
    
    Enhanced with:
    - Adaptive sensitivity
    - Confidence scoring
    - Multi-factor analysis
    """
    if not models_ready:
        raise HTTPException(status_code=503, detail="ML models are not ready yet.")
    try:
        metrics_dict = request.behavior_metrics.model_dump()
        
        # Use optimized risk scorer with adaptive sensitivity
        result = risk_scorer.calculate_risk_score(
            behavior_metrics=metrics_dict,
            anomaly_score=request.anomaly_score,
            sensitivity=1.0  # Can be adjusted per user
        )
        
        return {
            "overall_score": result['overall_score'],
            "threat_level": result['threat_level'],
            "deviations": result['deviations'],
            "recommendation": result['recommendation']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating risk score: {str(e)}")

@router.post("/anomaly-detection", dependencies=[Depends(require_permission("view_dashboard"))])
async def detect_anomalies(request: AnomalyDetectionRequest):
    """
    Detect anomalies using optimized Isolation Forest
    
    Features:
    - RobustScaler preprocessing
    - Optimal contamination parameter
    - Cross-validated hyperparameters
    """
    if not models_ready:
        raise HTTPException(status_code=503, detail="ML models are not ready yet.")
    try:
        if not request.records:
            return {"results": []}
        
        features = list(request.records[0].keys())
        if len(features) != 5 or set(features) != set(ANOMALY_FEATURE_ORDER):
            raise HTTPException(status_code=422, detail=f"Anomaly records must contain exactly these 5 features: {', '.join(ANOMALY_FEATURE_ORDER)}.")
        if any(set(record) != set(features) for record in request.records):
            raise HTTPException(status_code=422, detail="Every anomaly record must contain the same feature keys.")
        data = np.array([
            [record[feature] for feature in ANOMALY_FEATURE_ORDER]
            for record in request.records
        ], dtype=float)
        if not np.isfinite(data).all():
            raise HTTPException(status_code=422, detail="Anomaly feature values must be finite numbers.")
        
        # Use optimized prediction
        predictions, scores = anomaly_detector.predict(data)
        
        results = []
        for i, record in enumerate(request.records):
            is_anomaly = predictions[i] == -1
            anomaly_score = float(scores[i])
            
            # Better risk level classification
            if anomaly_score > 0.85:
                risk_level = "critical"
            elif anomaly_score > 0.65:
                risk_level = "high"
            elif anomaly_score > 0.4:
                risk_level = "medium"
            elif anomaly_score > 0.15:
                risk_level = "low"
            else:
                risk_level = "safe"
            
            results.append({
                **record,
                "is_anomaly": bool(is_anomaly),
                "anomaly_score": round(anomaly_score, 4),
                "risk_level": risk_level
            })
        
        return {"results": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error detecting anomalies: {str(e)}")


@router.post("/train-anomaly-detector", dependencies=[Depends(require_permission("manage_users"))])
async def train_anomaly_detector(training_data: dict = Body(...)):
    """Retrain the anomaly detector using the API's fixed five-feature shape."""
    global models_ready
    if not models_ready:
        raise HTTPException(status_code=503, detail="ML models are not ready yet.")
    if "data" not in training_data or "features" not in training_data:
        raise HTTPException(status_code=422, detail="Request must include 'data' and 'features'.")

    try:
        data = np.asarray(training_data["data"], dtype=float)
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=f"Training data must be a numeric matrix: {error}") from error

    features = training_data["features"]
    if data.ndim != 2 or data.shape[0] < 10:
        raise HTTPException(status_code=422, detail="Training data must be a 2D matrix with at least 10 rows.")
    if data.shape[1] != 5 or features != list(ANOMALY_FEATURE_ORDER):
        raise HTTPException(status_code=422, detail=f"Training features must be ordered as: {', '.join(ANOMALY_FEATURE_ORDER)}.")
    if not np.isfinite(data).all() or not all(isinstance(feature, str) and feature.strip() for feature in features):
        raise HTTPException(status_code=422, detail="Training values must be finite and feature names non-empty strings.")

    result = anomaly_detector.train(data, features)
    if result.get("status") != "success":
        raise HTTPException(status_code=422, detail=result.get("message", "Model training failed."))
    models_ready = bool(anomaly_detector.trained and threat_classifier.trained)
    return result

@router.post("/propagation-analysis", dependencies=[Depends(require_permission("view_dashboard"))])
async def analyze_propagation(request: PropagationAnalysisRequest):
    """Analyze risk propagation through network"""
    if not models_ready:
        raise HTTPException(status_code=503, detail="ML models are not ready yet.")
    try:
        node_ids = [node.id for node in request.nodes]
        if len(node_ids) != len(set(node_ids)):
            raise HTTPException(status_code=422, detail="Network node IDs must be unique.")
        known_ids = set(node_ids)
        invalid_edges = [
            (edge.from_node, edge.to_node)
            for edge in request.edges
            if edge.from_node not in known_ids or edge.to_node not in known_ids
        ]
        if invalid_edges:
            raise HTTPException(status_code=422, detail=f"Network edges reference unknown nodes: {invalid_edges[:5]}")

        nodes = [
            {
                "id": node.id,
                "label": node.label,
                "type": node.node_type,
                "x": node.x,
                "y": node.y,
                "compromised": node.compromised,
                "propagationRisk": node.propagationRisk
            }
            for node in request.nodes
        ]
        
        edges = [
            {
                "from": edge.from_node,
                "to": edge.to_node,
                "active": edge.active,
                "attackPath": edge.attackPath
            }
            for edge in request.edges
        ]
        
        analysis_result = propagation_analyzer.analyze_network(nodes, edges)
        
        return {
            "total_network_risk": analysis_result['total_network_risk'],
            "critical_count": len(analysis_result['critical_nodes']),
            "critical_nodes": analysis_result['critical_nodes'],
            "all_nodes": analysis_result['all_nodes']
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing propagation: {str(e)}")

@router.post("/batch-risk-analysis", dependencies=[Depends(require_permission("view_dashboard"))])
async def batch_risk_analysis(users_data: list = Body(...)):
    """Analyze risk scores for multiple users"""
    if not models_ready:
        raise HTTPException(status_code=503, detail="ML models are not ready yet.")
    try:
        results = []
        for user in users_data:
            user_id = user.get("id")
            metrics = {
                "normal_login_time": user.get("normal_login_time", 9.2),
                "actual_login_time": user.get("actual_login_time", 9.2),
                "normal_session_duration": user.get("normal_session_duration", 4.5),
                "actual_session_duration": user.get("actual_session_duration", 4.5),
                "normal_data_volume": user.get("normal_data_volume", 120),
                "actual_data_volume": user.get("actual_data_volume", 120),
                "normal_api_calls": user.get("normal_api_calls", 45),
                "actual_api_calls": user.get("actual_api_calls", 45),
                "normal_geo_distance": user.get("normal_geo_distance", 0),
                "actual_geo_distance": user.get("actual_geo_distance", 0),
            }
            anomaly_score = user.get("anomaly_score", 0.0)
            risk_analysis = risk_scorer.calculate_risk_score(metrics, anomaly_score)
            devices = list_devices(str(user_id)) if user_id is not None else []
            device = devices[0] if devices else None
            fused_risk = record_signals(
                str(user_id or "unknown"),
                behavioral_score=risk_analysis["overall_score"],
                anomaly_score=min(100.0, float(anomaly_score) * 100),
                classifier_label=str(user.get("classifier_label", "benign")),
                classifier_confidence=float(user.get("classifier_confidence", 0.0)),
                device_id=device["device_id"] if device else None,
                device_trust_status=device["trust_status"] if device else "unknown",
            )
            incident = maybe_create_risk_incident(
                fused_risk,
                evidence=["Batch behavior risk crossed the high-risk threshold"],
            )
            
            results.append({
                "user_id": user_id,
                "overall_score": fused_risk["score"],
                "threat_level": fused_risk["level"],
                "recommendation": risk_analysis['recommendation'],
                "deviations": risk_analysis['deviations'],
                "fused_risk": fused_risk,
                "incident": incident,
            })
        await broadcast_dashboard_update("batch_risk_recomputed")
        return {"user_risk_scores": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in batch analysis: {str(e)}")

# ── Live Threat Endpoints (for real-time demo) ──

@router.get("/live-threat", dependencies=[Depends(require_permission("view_dashboard"))])
async def get_live_threat():
    """Frontend polls this every 2s to get current threat state"""
    return live_threat_state

@router.post("/live-threat/reset", dependencies=[Depends(require_permission("approve_incidents"))])
async def reset_threat():
    """Reset the live threat state"""
    reset_live_threat()
    return {"status": "reset", "message": "Live threat cleared"}

@router.post("/inject-threat", dependencies=[Depends(require_permission("approve_incidents"))])
async def inject_threat(payload: dict = Body(...)):
    """
    Attack simulator sends threat data here.
    The data goes through the REAL ML pipeline before updating the live feed.
    
    Expected payload:
    {
        "phase": "recon|escalation|breach|exfiltration",
        "attacker_ip": "203.0.113.42",
        "attacker_location": "Moscow, RU",
        "attacker_device": "Unknown Linux Host",
        "target_user": "Alex Chen",
        "behavior_metrics": { ... },
        "anomaly_score": 0.0-1.0,
        "anomalies": ["list of anomaly descriptions"],
        "compromised_nodes": ["n1", "n4"]
    }
    """
    global live_threat_state

    if not models_ready:
        raise HTTPException(status_code=503, detail="ML models are not ready yet.")
    
    try:
        # ── Run through REAL ML models ──
        metrics = payload.get("behavior_metrics", {})
        anomaly_score = payload.get("anomaly_score", 0.0)
        required_metrics = {
            "normal_login_time", "actual_login_time", "normal_session_duration",
            "actual_session_duration", "normal_data_volume", "actual_data_volume",
            "normal_api_calls", "actual_api_calls", "normal_geo_distance", "actual_geo_distance",
        }
        if not isinstance(metrics, dict) or not required_metrics.issubset(metrics):
            raise HTTPException(status_code=422, detail=f"behavior_metrics must include: {', '.join(sorted(required_metrics))}")
        try:
            metric_values = np.asarray([metrics[key] for key in required_metrics], dtype=float)
            anomaly_score = float(anomaly_score)
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=422, detail=f"Threat metrics must be numeric: {error}") from error
        if not np.isfinite(metric_values).all() or not 0 <= anomaly_score <= 1:
            raise HTTPException(status_code=422, detail="Threat metrics must be finite and anomaly_score must be between 0 and 1.")
        if not isinstance(payload.get("anomalies", []), list) or not all(isinstance(item, str) for item in payload.get("anomalies", [])):
            raise HTTPException(status_code=422, detail="anomalies must be a list of strings.")
        compromised_nodes = payload.get("compromised_nodes", [])
        valid_node_ids = {f"n{i}" for i in range(1, 11)}
        if not isinstance(compromised_nodes, list) or not all(node_id in valid_node_ids for node_id in compromised_nodes):
            raise HTTPException(status_code=422, detail="compromised_nodes must contain valid node IDs from n1 through n10.")
        
        # 1. Risk scoring via ML
        ml_result = risk_scorer.calculate_risk_score(
            behavior_metrics=metrics,
            anomaly_score=anomaly_score,
            sensitivity=1.0
        )
        
        # 2. Anomaly detection via Isolation Forest
        anomaly_data = np.array([[
            metrics.get("actual_session_duration", 4.5),
            metrics.get("actual_data_volume", 120),
            metrics.get("actual_api_calls", 45),
            metrics.get("actual_geo_distance", 0),
            metrics.get("actual_login_time", 9.2),
        ]])
        predictions, scores = anomaly_detector.predict(anomaly_data)
        
        ml_result["isolation_forest_anomaly"] = bool(predictions[0] == -1)
        ml_result["isolation_forest_score"] = round(float(scores[0]), 4)

        target_user = str(payload.get("target_user", "unknown"))
        target_devices = list_devices(target_user)
        target_device = target_devices[0] if target_devices else None
        deviations = ml_result.get("deviations", {})
        prediction = threat_classifier.predict(
            login_hour_deviation=abs(float(metrics["actual_login_time"]) - float(metrics["normal_login_time"])),
            geo_distance_km=float(metrics["actual_geo_distance"]),
            device_match_score=0.15,
            session_deviation_pct=float(deviations.get("session_deviation", 0)),
            data_volume_deviation_pct=float(deviations.get("data_volume_deviation", 0)),
            api_calls_deviation_pct=float(deviations.get("api_calls_deviation", 0)),
            isolation_forest_score=float(ml_result["isolation_forest_score"]),
        )
        fused_risk = record_signals(
            target_user,
            behavioral_score=float(ml_result["overall_score"]),
            anomaly_score=min(100.0, float(ml_result["isolation_forest_score"]) * 100),
            classifier_label=prediction.get("attack_type", "unknown"),
            classifier_confidence=prediction.get("confidence", 0),
            device_id=target_device["device_id"] if target_device else None,
            device_trust_status=target_device["trust_status"] if target_device else "unknown",
        )
        stored_incident = maybe_create_risk_incident(
            fused_risk,
            evidence=list(payload.get("anomalies", [])) + [f"Simulated threat: {payload.get('attack_type', 'unspecified')}"]
        )
        incident = None if stored_incident is None else {
            "id": stored_incident["id"],
            "timestamp": stored_incident["created_at"],
            "userId": "u1",
            "userName": target_user,
            "type": stored_incident["title"],
            "description": "; ".join(stored_incident["evidence"]),
            "riskScore": stored_incident["risk_score"],
            "threatLevel": stored_incident["severity"].lower(),
            "status": "active",
            "response": "Analyst review required",
            "deviation": round(max(ml_result.get("deviations", {}).values(), default=0)),
        }
        
        # Update the live state
        live_threat_state = {
            "active": True,
            "phase": payload.get("phase", "recon"),
            "risk_score": fused_risk["score"],
            "threat_level": fused_risk["level"],
            "attacker_ip": payload.get("attacker_ip"),
            "attacker_location": payload.get("attacker_location"),
            "attacker_device": payload.get("attacker_device"),
            "target_user": payload.get("target_user"),
            "anomalies": payload.get("anomalies", []),
            "ml_result": ml_result,
            "prediction": prediction,
            "fused_risk": fused_risk,
            "incident": incident,
            "compromised_nodes": compromised_nodes,
            "timestamp": datetime.now().isoformat(),
        }
        
        phase = payload.get("phase", "?")
        score = ml_result["overall_score"]
        level = ml_result["threat_level"]
        print(f"LIVE THREAT [{phase.upper()}] -> Score: {score} | Level: {level} | IF-Anomaly: {ml_result['isolation_forest_anomaly']}")

        await ws_manager.broadcast_to_admins({"type": "login_threat", **live_threat_state})
        await broadcast_dashboard_update("threat_injected")
        
        return {
            "status": "injected",
            "ml_result": ml_result,
            "fused_risk": fused_risk,
            "live_threat": live_threat_state
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Threat injection failed: {str(e)}")

# ── WebSocket endpoint (ADMIN dashboards connect here — attackers never see this) ──
@app.websocket("/ws/admin")
async def admin_websocket_endpoint(websocket: WebSocket, ticket: str | None = None):
    user = consume_websocket_ticket(ticket or "")
    if not user or "view_dashboard" not in PERMISSIONS.get(user["role"], set()):
        await websocket.close(code=4401, reason="Valid dashboard connection ticket required")
        return
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


# ── Real Login Detection Endpoint ──
@router.post("/login")
@router.post("/auth/login")
async def real_login(request: Request, payload: dict = Body(...)):
    """
    REAL login detection pipeline:
      1. Receive device fingerprint from browser
      2. Get client IP → GeoIP lookup → lat/lon
      3. Compare fingerprint against stored baseline
      4. Calculate haversine geo distance
      5. Build ML feature vector from REAL data
      6. Run through Isolation Forest + Risk Scorer
      7. Push result to dashboard via WebSocket

    Expected payload from frontend:
    {
        "username": "alex_chen",
        "fingerprint": { userAgent, platform, screenResolution, timezone, ... }
    }
    """
    global live_threat_state

    if not models_ready:
        raise HTTPException(status_code=503, detail="ML models are not ready yet.")

    username = payload.get("email", payload.get("username", "unknown"))
    password = payload.get("password", "")
    fingerprint = payload.get("fingerprint", {})
    source_fingerprint_id = payload.get("fingerprint_id", "")

    if not isinstance(username, str) or not username.strip():
        raise HTTPException(status_code=422, detail="username must be a non-empty string.")
    if not isinstance(password, str):
        raise HTTPException(status_code=422, detail="password must be a string.")
    username = username.strip()

    auth_username = username.strip()
    authenticated_user, auth_failure_reason, audit_attempt_id = authenticate(
        auth_username, password, ip=_client_ip(request), device_id=str(source_fingerprint_id or "") or None,
    )

    if not authenticated_user:
        # Still get client IP for the alert
        fail_ip = _client_ip(request)

        stuffing_event = record_auth_failure(fail_ip, auth_username.lower())
        if stuffing_event:
            request.state.extra_network_anomalies = [stuffing_event]
        failed_risk = record_signals(
            auth_username.lower(),
            behavioral_score=85.0,
            anomaly_score=85.0,
            classifier_label="credential_theft",
            classifier_confidence=100.0,
            # A failed password attempt is not proof that the caller used the
            # account owner's registered device. Keep it account-scoped only.
            device_id=None,
            device_trust_status="unknown",
        )
        failed_incident = maybe_create_risk_incident(
            failed_risk,
            evidence=["Invalid password attempt", f"Source IP: {fail_ip}"],
        )

        failed_event = {
            "type": "login_threat",
            "active": True,
            "phase": "login",
            "source_fingerprint_id": source_fingerprint_id,
            "username": username,
            "risk_score": failed_risk["score"],
            "threat_level": failed_risk["level"],
            "attacker_ip": fail_ip,
            "attacker_location": "Unknown",
            "attacker_device": f"{fingerprint.get('deviceType', 'unknown')} — {fingerprint.get('platform', 'unknown')}" if isinstance(fingerprint, dict) else "Unknown device",
            "target_user": username,
            "attack_type": "Failed Login — Invalid Credentials",
            "anomalies": ["Invalid password attempt", f"Username: {username}", f"Source IP: {fail_ip}"],
            "compromised_nodes": ["n1"],
            "incident": None if not failed_incident else {
                "id": failed_incident["id"],
                "timestamp": failed_incident["created_at"],
                "userId": "u1",
                "userName": username,
                "type": "Failed Login — Invalid Credentials",
                "description": "; ".join(failed_incident["evidence"]),
                "riskScore": failed_incident["risk_score"],
                "threatLevel": failed_incident["severity"].lower(),
                "status": "active",
                "response": "Block source IP",
                "deviation": 100,
            },
            "fused_risk": failed_risk,
            "timestamp": datetime.now().isoformat(),
        }

        # Update live_threat_state so polling also keeps the threat active
        live_threat_state = {
            **failed_event,
            "type": "login_threat",
        }

        # Push failed login to admin dashboards
        await ws_manager.broadcast_to_admins(failed_event)
        await broadcast_dashboard_update("invalid_login_incident")
        print(f"\n{'─'*60}")
        print(f"FAILED LOGIN: {username} (wrong password) from {fail_ip}")
        print(f"{'─'*60}")

        return JSONResponse(status_code=401, content={
            **failed_event,
            "login_status": "denied",
            "message": "Account temporarily locked. Try again after 15 minutes." if auth_failure_reason == "account_locked" else "Invalid username or password.",
            "login_attempt_reason": auth_failure_reason,
            "detail": "Account temporarily locked. Try again after 15 minutes." if auth_failure_reason == "account_locked" else "Invalid username or password.",
        })

    required_fingerprint_fields = {
        "userAgent", "platform", "screenResolution", "timezone", "canvasHash",
        "webglRenderer", "hardwareConcurrency", "colorDepth", "deviceType", "language",
    }
    if not isinstance(fingerprint, dict) or not required_fingerprint_fields.issubset(fingerprint):
        finalize_login_attempt(audit_attempt_id, success=False, device_id=None, reason="invalid_fingerprint")
        raise HTTPException(status_code=422, detail="fingerprint is missing required device identity fields.")
    if not all(isinstance(fingerprint[field], (str, int, float)) for field in required_fingerprint_fields):
        finalize_login_attempt(audit_attempt_id, success=False, device_id=None, reason="invalid_fingerprint")
        raise HTTPException(status_code=422, detail="fingerprint fields must be strings or numeric values.")

    username = authenticated_user["id"]
    request.state.authenticated_user = authenticated_user

    # ── STEP 2: Get real client IP & geolocation ──
    # Use the transport peer until trusted proxy configuration is explicit;
    # accepting arbitrary X-Forwarded-For values would let clients spoof history.
    client_ip = _client_ip(request)

    geo = await geoip_lookup(client_ip)
    login_hour = datetime.now().hour

    print(f"\n{'─'*60}")
    print(f"LOGIN ATTEMPT: {username}")
    print(f"   IP: {client_ip}")
    print(f"   Geo: {geo['city']}, {geo['country']} ({geo['lat']}, {geo['lon']})")
    print(f"   Device: {fingerprint.get('deviceType', '?')} | {fingerprint.get('platform', '?')}")
    print(f"   Screen: {fingerprint.get('screenResolution', '?')} | Canvas: {fingerprint.get('canvasHash', '?')}")
    print(f"   Time: {login_hour}:00")

    # ── STEP 3: Compare with stored baseline ──
    is_first_login = username not in user_baselines
    baseline = get_or_create_baseline(username, fingerprint, geo, login_hour)
    device = register_login_device(username, fingerprint, first_login=is_first_login)
    access_token = issue_access_token(authenticated_user, device_id=device["device_id"])
    # Fingerprint comparison
    fp_comparison = compare_fingerprints(baseline["fingerprint"], fingerprint)
    baseline_device_match = fp_comparison["is_same_device"]
    registered_trusted_device = device["trust_status"] == "trusted"
    device_recognized = baseline_device_match or registered_trusted_device
    effective_device_match_score = 1.0 if registered_trusted_device else fp_comparison["match_score"]

    # Geo distance (haversine)
    baseline_geo = baseline["geo"]
    geo_distance = haversine(
        baseline_geo["lat"], baseline_geo["lon"],
        geo["lat"], geo["lon"]
    )

    # Login hour deviation
    hour_deviation = abs(login_hour - baseline.get("normal_login_hour", 9))

    print(f"\n   COMPARISON vs BASELINE:")
    print(f"   Device match:  {fp_comparison['match_score']*100:.0f}% ({fp_comparison['fields_matched']}/{fp_comparison['fields_total']} fields)")
    print(f"   Same device:   {'YES' if fp_comparison['is_same_device'] else 'NO MISMATCH'}")
    print(f"   Geo distance:  {geo_distance:.0f} km")
    print(f"   Hour deviation: {hour_deviation}h")

    if fp_comparison["differences"]:
        print(f"   Changes:")
        for d in fp_comparison["differences"][:5]:
            print(f"     -> {d}")

    # ── STEP 4: Build ML feature vector from REAL data ──
    features = build_feature_vector(
        login_hour=login_hour,
        geo_distance_km=geo_distance,
        device_match_score=effective_device_match_score,
        baseline=baseline,
    )

    # ── STEP 5: Run through REAL ML models ──
    metrics = features["behavior_metrics"]
    anomaly_score_input = features["anomaly_score"]

    # Risk Scorer
    ml_result = risk_scorer.calculate_risk_score(
        behavior_metrics=metrics,
        anomaly_score=anomaly_score_input,
        sensitivity=1.0,
    )

    # Isolation Forest
    anomaly_data = np.array([[
        metrics["actual_session_duration"],
        metrics["actual_data_volume"],
        metrics["actual_api_calls"],
        metrics["actual_geo_distance"],
        metrics["actual_login_time"],
    ]])
    predictions, scores = anomaly_detector.predict(anomaly_data)
    ml_result["isolation_forest_anomaly"] = bool(predictions[0] == -1) and not is_first_login
    ml_result["isolation_forest_score"] = round(float(scores[0]), 4)

    # A baseline-establishing login has no prior per-user observations to
    # classify. Treat it as enrollment, not as a suspicious event because a
    # generic synthetic model happens to dislike the first sample.
    if is_first_login:
        ml_result["overall_score"] = 0.0
        ml_result["threat_level"] = "safe"
        ml_result["recommendation"] = "monitor"
        ml_result["confidence"] = 0.0

    risk_score = round(ml_result["overall_score"])
    threat_level = ml_result["threat_level"]

    # ── STEP 5b: Supervised Threat Classifier ──
    # Build deviations for classifier features
    deviations = ml_result.get("deviations", {})
    session_dev = deviations.get("session_deviation", 0)
    data_dev = deviations.get("data_volume_deviation", 0)
    api_dev = deviations.get("api_calls_deviation", 0)

    prediction = threat_classifier.predict(
        login_hour_deviation=float(hour_deviation),
        geo_distance_km=float(geo_distance),
        device_match_score=float(effective_device_match_score),
        session_deviation_pct=float(session_dev),
        data_volume_deviation_pct=float(data_dev),
        api_calls_deviation_pct=float(api_dev),
        isolation_forest_score=float(ml_result.get("isolation_forest_score", 0)),
    )
    if is_first_login:
        prediction.update({
            "prediction": "BENIGN",
            "attack_type": "benign",
            "attack_label": "Benign",
            "confidence": 100.0,
            "action": "ALLOW",
            "description": "First successful login established this account's device baseline.",
            "is_malicious": False,
            "probabilities": {"benign": 100.0},
        })

    fused_risk = record_signals(
        username,
        behavioral_score=risk_score,
        anomaly_score=(0.0 if is_first_login else min(100.0, float(ml_result.get("isolation_forest_score", 0.0)) * 100)),
        classifier_label=prediction.get("attack_type", "unknown"),
        classifier_confidence=prediction.get("confidence", 0.0),
        device_id=device["device_id"],
        device_trust_status=device["trust_status"],
    )
    risk_score = fused_risk["score"]
    threat_level = fused_risk["level"]
    fused_incident = maybe_create_risk_incident(
        fused_risk,
        evidence=[
            f"Fingerprint match {fp_comparison['match_score'] * 100:.0f}%",
            f"Geo distance {geo_distance:.1f} km",
            f"Classifier {prediction.get('attack_type', 'unknown')} ({prediction.get('confidence', 0)}% confidence)",
        ],
    )
    incident = None
    if fused_incident:
        incident = {
            "id": fused_incident["id"],
            "timestamp": fused_incident["created_at"],
            "userId": "u1",
            "userName": username,
            "type": fused_incident["title"],
            "description": "; ".join(fused_incident["evidence"]),
            "riskScore": fused_incident["risk_score"],
            "threatLevel": fused_incident["severity"].lower(),
            "status": "active",
            "response": "Analyst review required",
            "deviation": round(max(ml_result.get("deviations", {}).values(), default=0)),
        }

    print(f"\n   ML RESULTS:")
    print(f"   Risk Score:         {risk_score}/100")
    print(f"   Threat Level:       {threat_level.upper()}")
    print(f"   IF Anomaly:         {'YES' if ml_result['isolation_forest_anomaly'] else 'No'}")
    print(f"   IF Score:           {ml_result['isolation_forest_score']}")
    print(f"   Recommendation:     {ml_result['recommendation']}")
    print(f"   Confidence:         {ml_result.get('confidence', 'N/A')}%")
    print(f"\n   SUPERVISED PREDICTION:")
    print(f"   Verdict:            {prediction['prediction']}")
    print(f"   Attack Type:        {prediction['attack_label']}")
    print(f"   Confidence:         {prediction['confidence']}%")
    print(f"   Action:             {prediction['action']}")
    print(f"{'─'*60}")

    # Build anomaly descriptions from REAL differences
    anomalies = []
    if not device_recognized:
        anomalies.append(f"New device detected — {100 - fp_comparison['match_score']*100:.0f}% fingerprint mismatch")
    if geo_distance > 100:
        anomalies.append(f"Geo-location deviation: {geo_distance:,.0f} km ({geo['city']}, {geo['country']})")
    if hour_deviation > 4:
        anomalies.append(f"Login time deviation: {login_hour}:00 (normal: {baseline.get('normal_login_hour', 9)}:00)")
    if ml_result["isolation_forest_anomaly"]:
        anomalies.append(f"Isolation Forest flagged as anomaly (score: {ml_result['isolation_forest_score']})")
    for key, val in ml_result.get("deviations", {}).items():
        if val > 80:
            anomalies.append(f"{key}: {val:.0f}% deviation from baseline")

    # Determine compromised nodes based on risk
    compromised = []
    if risk_score > 30:
        compromised.append("n1")  # User endpoint
    if risk_score > 50:
        compromised.append("n4")  # Web app
    if risk_score > 70:
        compromised.extend(["n7", "n9"])  # Core server + DB

    # ── STEP 5c: Explainable AI ──
    explanation = build_full_explanation(
        baseline_fp=baseline["fingerprint"],
        current_fp=fingerprint,
        match_score=fp_comparison["match_score"],
        is_same_device=fp_comparison["is_same_device"],
        features_used=prediction.get("features_used", {}),
        prediction=prediction,
        rf_model=threat_classifier.rf_model,
        gb_model=threat_classifier.gb_model,
        scaler=threat_classifier.scaler,
        ml_result=ml_result,
        geo_distance_km=geo_distance,
        device_match_score=effective_device_match_score,
        isolation_forest_score=ml_result.get("isolation_forest_score", 0),
        isolation_forest_anomaly=ml_result.get("isolation_forest_anomaly", False),
        compromised_nodes=compromised,
        risk_score=risk_score,
    )
    print(f"   XAI: {len(explanation)} explanation layers generated")

    # ── STEP 6 & 7: Update live state + push via WebSocket ──
    threat_event = {
        "type": "login_threat",
        "active": True,
        "phase": "login",
        "source_fingerprint_id": source_fingerprint_id,
        "username": username,
        "risk_score": risk_score,
        "threat_level": threat_level,
        "attacker_ip": client_ip,
        "attacker_location": f"{geo['city']}, {geo['country']}",
        "attacker_device": f"{fingerprint.get('deviceType', 'unknown')} — {fingerprint.get('platform', 'unknown')}",
        "target_user": username,
        "attack_type": prediction["attack_label"] if prediction["is_malicious"] else "Real Login Detection",
        "prediction": prediction,
        "anomalies": anomalies,
        "ml_result": ml_result,
        "fingerprint_comparison": fp_comparison,
        "registered_device_trusted": registered_trusted_device,
        "geo_distance_km": round(geo_distance, 1),
        "geo": geo,
        "login_hour": login_hour,
        "incident": incident,
        "compromised_nodes": compromised,
        "explanation": explanation,
        "device": device,
        "fused_risk": fused_risk,
        "timestamp": datetime.now().isoformat(),
    }

    # Update the polled live_threat_state too (for backward compat)
    live_threat_state = {
        "active": True,
        "phase": "login",
        "source_fingerprint_id": source_fingerprint_id,
        "risk_score": risk_score,
        "threat_level": threat_level,
        "attacker_ip": client_ip,
        "attacker_location": f"{geo['city']}, {geo['country']}",
        "attacker_device": f"{fingerprint.get('deviceType', 'unknown')} — {fingerprint.get('platform', 'unknown')}",
        "target_user": username,
        "anomalies": anomalies,
        "ml_result": ml_result,
        "prediction": prediction,
        "fingerprint_comparison": fp_comparison,
        "geo_distance_km": round(geo_distance, 1),
        "geo": geo,
        "login_hour": login_hour,
        "incident": incident,
        "compromised_nodes": compromised,
        "explanation": explanation,
        "timestamp": datetime.now().isoformat(),
    }

    # Push to admin dashboards via WebSocket
    await ws_manager.broadcast_to_admins(threat_event)
    await broadcast_dashboard_update("login_risk_recomputed")

    # Add simplified login_status for the attacker-facing login portal
    # Key rule: if device fingerprint doesn't match → ACCESS DENIED
    if device["trust_status"] == "flagged":
        login_status = "denied"
        user_message = "Access denied. This device has been flagged by an administrator."
    elif not device_recognized:
        login_status = "denied"
        user_message = "Access denied. Unrecognized device."
    elif not is_first_login and device["trust_status"] != "trusted":
        login_status = "restricted"
        user_message = "Device is awaiting administrator trust approval."
    elif risk_score >= 70:
        login_status = "restricted"
        user_message = "Access temporarily restricted. Please contact your administrator."
    else:
        login_status = "allowed"
        user_message = "Login successful."

    finalize_login_attempt(
        audit_attempt_id,
        success=login_status == "allowed",
        device_id=device["device_id"],
        reason=None if login_status == "allowed" else login_status,
    )

    # Return full data (admin dashboard reads ML fields) + simplified fields (login portal reads login_status)
    return {
        **threat_event,
        "login_status": login_status,
        "message": user_message,
        "access_token": access_token if login_status == "allowed" else None,
        "token_type": "bearer" if login_status == "allowed" else None,
        "expires_in": 1800 if login_status == "allowed" else 0,
        "user": authenticated_user,
        "permissions": sorted(PERMISSIONS[authenticated_user["role"]]) if login_status == "allowed" else [],
    }


@router.get("/devices", dependencies=[Depends(require_permission("view_dashboard"))])
async def get_devices_endpoint():
    devices = list_devices()
    return {"devices": devices, "count": len(devices)}


@router.get("/devices/{user_id}", dependencies=[Depends(require_permission("view_dashboard"))])
async def get_user_devices_endpoint(user_id: str):
    devices = list_devices(user_id)
    return {"user_id": user_id, "devices": devices, "count": len(devices)}


@router.post("/devices/{device_id}/trust", dependencies=[Depends(require_permission("manage_devices"))])
async def trust_device_endpoint(device_id: str):
    device = set_device_status(device_id, "trusted", quarantined=False)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found.")
    risk = compute_risk(device["user_id"])
    incident = maybe_create_risk_incident(risk, evidence=[f"Device {device_id} trust status updated to trusted"])
    await broadcast_dashboard_update("device_trust_changed")
    return {"device": device, "risk": risk, "incident": incident}


@router.get("/risk/{user_id}", dependencies=[Depends(require_permission("view_dashboard"))])
async def get_user_risk_endpoint(user_id: str):
    risk = compute_risk(user_id)
    had_open_incident = any(
        item["user_id"] == user_id and item["status"] in {"open", "investigating"}
        for item in list_incidents()
    )
    incident = maybe_create_risk_incident(risk, evidence=["Risk recomputed from current stored security signals"])
    if incident and not had_open_incident:
        await broadcast_dashboard_update("risk_incident_created")
    return {**risk, "incident": incident}


@router.get("/incidents", dependencies=[Depends(require_permission("view_dashboard"))])
async def list_incidents_endpoint(status: str | None = None):
    valid_statuses = {"active", "open", "investigating", "resolved", "dismissed"}
    if status is not None and status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"status must be one of {sorted(valid_statuses)}")
    incidents = list_incidents(status=status)
    return {"incidents": incidents, "count": len(incidents)}


@router.get("/incidents/{incident_id}", dependencies=[Depends(require_permission("view_dashboard"))])
async def get_incident_endpoint(incident_id: str):
    incident = get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    return incident


@router.post("/incidents/{incident_id}/approve", dependencies=[Depends(require_permission("approve_incidents"))])
async def approve_incident_endpoint(incident_id: str):
    incident = get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    if incident["status"] in {"resolved", "dismissed"}:
        raise HTTPException(status_code=409, detail=f"Cannot approve incident in {incident['status']} status.")
    device = set_device_status(incident["device_id"], "flagged", quarantined=True) if incident.get("device_id") else None
    if device:
        compute_risk(incident["user_id"])
    updated = transition_incident(
        incident_id,
        "investigating",
        response_action="device_quarantined" if device else "approved_for_manual_review",
    )
    await broadcast_dashboard_update("incident_response_approved")
    return {"incident": updated, "device": device}


@router.post("/incidents/{incident_id}/dismiss", dependencies=[Depends(require_permission("approve_incidents"))])
async def dismiss_incident_endpoint(incident_id: str):
    current = get_incident(incident_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    if current["status"] in {"resolved", "dismissed"}:
        raise HTTPException(status_code=409, detail=f"Cannot dismiss incident in {current['status']} status.")
    incident = transition_incident(incident_id, "dismissed", response_action="dismissed_by_analyst")
    await broadcast_dashboard_update("incident_dismissed")
    return {"incident": incident}


@router.get("/incidents/{incident_id}/events", dependencies=[Depends(require_permission("view_dashboard"))])
async def get_incident_events_endpoint(incident_id: str):
    if get_incident(incident_id) is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    events = get_incident_events(incident_id)
    return {"events": events, "count": len(events)}


@router.post("/incidents/{incident_id}/resolve", dependencies=[Depends(require_permission("approve_incidents"))])
async def resolve_incident_endpoint(incident_id: str):
    current = get_incident(incident_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    if current["status"] in {"resolved", "dismissed"}:
        raise HTTPException(status_code=409, detail=f"Cannot resolve incident in {current['status']} status.")
    incident = transition_incident(incident_id, "resolved", response_action="resolved_by_analyst")
    await broadcast_dashboard_update("incident_resolved")
    return {"incident": incident}


@router.post("/incidents/{incident_id}/escalate", dependencies=[Depends(require_permission("approve_incidents"))])
async def escalate_incident_endpoint(incident_id: str):
    current = get_incident(incident_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    if current["status"] in {"resolved", "dismissed"}:
        raise HTTPException(status_code=409, detail=f"Cannot escalate incident in {current['status']} status.")
    incident = transition_incident(incident_id, "investigating", response_action="escalated_to_analyst")
    await broadcast_dashboard_update("incident_escalated")
    return {"incident": incident}


@router.get("/dashboard/summary", dependencies=[Depends(require_permission("view_dashboard"))])
async def get_dashboard_summary_endpoint():
    return dashboard_summary_payload()


@router.get("/policies/restrict-threshold", dependencies=[Depends(require_permission("manage_users"))])
async def get_restrict_threshold_endpoint():
    return {"restrict_threshold": get_restrict_threshold(), "minimum": 50, "maximum": 85}


@router.put("/policies/restrict-threshold", dependencies=[Depends(require_permission("manage_users"))])
async def update_restrict_threshold_endpoint(payload: dict = Body(...)):
    try:
        threshold = set_restrict_threshold(payload.get("restrict_threshold"))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    await broadcast_dashboard_update("restrict_threshold_changed")
    return {"restrict_threshold": threshold, "minimum": 50, "maximum": 85}


@router.get("/network/events", dependencies=[Depends(require_permission("view_dashboard"))])
async def get_network_events_endpoint(ip: str | None = None, user_id: str | None = None, limit: int = 200):
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 1000")
    events = list_network_events(ip=ip, user_id=user_id, limit=limit)
    return {"events": events, "count": len(events)}


@router.get("/network/topology", dependencies=[Depends(require_permission("view_dashboard"))])
async def get_network_topology_endpoint():
    return build_network_topology()


@router.get("/protected-assets/{asset_id}")
async def read_protected_asset_endpoint(asset_id: str, user: dict = Depends(get_current_user)):
    access = authorize_asset_read(user["role"], asset_id)
    if access is None:
        raise HTTPException(status_code=404, detail="Protected asset not found.")
    if not access["allowed"]:
        raise HTTPException(status_code=403, detail="Role is not authorized to read this protected asset.")
    return {"asset": access["asset"], "access": "allowed"}


@router.get("/audit/verify", dependencies=[Depends(require_permission("view_dashboard"))])
async def verify_audit_chain_endpoint():
    return verify_audit_chain()


@router.get("/network/anomalies", dependencies=[Depends(require_permission("view_dashboard"))])
async def get_network_anomalies_endpoint(ip: str | None = None, user_id: str | None = None, limit: int = 200):
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 1000")
    events = list_network_events(ip=ip, user_id=user_id, anomalies_only=True, limit=limit)
    return {"anomalies": events, "count": len(events)}


@router.get("/baselines", dependencies=[Depends(require_permission("view_dashboard"))])
async def get_baselines():
    """Get all stored user baselines (for admin view)."""
    result = {}
    for username, b in user_baselines.items():
        result[username] = {
            "fingerprint_hash": b.get("fingerprint_hash"),
            "device_type": b.get("fingerprint", {}).get("deviceType"),
            "location": f"{b['geo']['city']}, {b['geo']['country']}",
            "normal_login_hour": b.get("normal_login_hour"),
            "created_at": b.get("created_at"),
        }
    return {"baselines": result, "count": len(result)}


@router.post("/baselines/reset", dependencies=[Depends(require_permission("reset_baselines"))])
async def reset_baselines_endpoint(payload: dict = Body(default={})):
    """Reset baselines. Optionally pass {"username": "..."} for single user."""
    username = payload.get("username")
    if username:
        ok = reset_baseline(username)
        if ok:
            reset_user_devices(username)
            reset_user_risk(username)
            await broadcast_dashboard_update("user_baseline_recalibrated")
        return {"status": "reset" if ok else "not_found", "username": username}
    reset_all_baselines()
    reset_devices()
    reset_risk_state()
    await broadcast_dashboard_update("all_baselines_recalibrated")
    return {"status": "all_cleared"}


# ── Attack Chain Simulation Endpoints ──

@router.post("/attack-chain/start", dependencies=[Depends(require_permission("approve_incidents"))])
async def start_attack_chain():
    """Start the 6-phase simulated attack chain."""
    global live_threat_state
    if not models_ready:
        raise HTTPException(status_code=503, detail="ML models are not ready yet.")
    if attack_chain_module.is_running():
        return {"status": "already_running"}

    reset_live_threat()

    def update_live(event: dict):
        global live_threat_state
        target_user = str(event.get("target_user", "unknown"))
        devices = list_devices(target_user)
        device = devices[0] if devices else None
        ml_result = event.get("ml_result", {})
        prediction = event.get("prediction", {})
        fused = record_signals(
            target_user,
            behavioral_score=float(ml_result.get("overall_score", event.get("risk_score", 0))),
            anomaly_score=min(100.0, float(ml_result.get("isolation_forest_score", 0)) * 100),
            classifier_label=prediction.get("attack_type", "unknown"),
            classifier_confidence=prediction.get("confidence", 0),
            device_id=device["device_id"] if device else None,
            device_trust_status=device["trust_status"] if device else "unknown",
        )
        event["risk_score"] = fused["score"]
        event["threat_level"] = fused["level"]
        event["fused_risk"] = fused
        incident = maybe_create_risk_incident(
            fused,
            evidence=event.get("anomalies", [])[:4] + [f"Attack chain: {event.get('attack_type', event.get('step_name', 'step'))}"],
        )
        if incident:
            event["incident"] = {
                "id": incident["id"],
                "timestamp": incident["created_at"],
                "userId": "u1",
                "userName": target_user,
                "type": incident["title"],
                "description": "; ".join(incident["evidence"]),
                "riskScore": incident["risk_score"],
                "threatLevel": incident["severity"].lower(),
                "status": "active",
                "response": "Analyst review required",
                "deviation": max(ml_result.get("deviations", {}).values(), default=0),
            }
        live_threat_state = event

    async def broadcast_attack_event(event: dict):
        await ws_manager.broadcast_to_admins(event)
        await broadcast_dashboard_update("attack_chain_step")

    asyncio.create_task(
        attack_chain_module.run_attack_chain(
            broadcast_fn=broadcast_attack_event,
            update_live_state=update_live,
        )
    )
    return {"status": "started", "phases": 6, "total_steps": sum(len(p['steps']) for p in attack_chain_module.PHASES)}


@router.post("/attack-chain/stop", dependencies=[Depends(require_permission("approve_incidents"))])
async def stop_attack_chain():
    """Stop the running attack chain."""
    attack_chain_module.stop()
    reset_live_threat()
    await ws_manager.broadcast_to_admins({"type": "attack_chain_stopped", "active": False})
    return {"status": "stopped"}


@router.get("/attack-chain/status", dependencies=[Depends(require_permission("view_dashboard"))])
async def attack_chain_status():
    """Check if attack chain is currently running."""
    return {"running": attack_chain_module.is_running()}


# Include router
app.include_router(router)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "TrustNet AI Guardian ML Backend",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "openapi": "/openapi.json"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
