"""In-memory RBAC identity store for the single-process TrustNet demo."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from typing import Any
from uuid import uuid4

import bcrypt
import jwt
import secrets
from models import database as database_module
from models.database import get_db_connection, initialize_database

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ.get("TRUSTNET_JWT_SECRET") or secrets.token_urlsafe(48)
ACCESS_TOKEN_MINUTES = 30
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15

PERMISSIONS: dict[str, set[str]] = {
    "admin": {"view_dashboard", "manage_devices", "approve_incidents", "manage_users", "reset_baselines"},
    "analyst": {"view_dashboard", "manage_devices", "approve_incidents"},
    "viewer": {"view_dashboard"},
}

_USERS: dict[str, dict[str, Any]] = {}
_EMAIL_INDEX: dict[str, str] = {}
_LOGIN_ATTEMPTS: list[dict[str, Any]] = []
_FAILED_BY_USER: dict[str, list[datetime]] = {}
_REVOKED_JTIS: dict[str, datetime] = {}
_WS_TICKETS: dict[str, tuple[str, datetime]] = {}
_IDENTIFIER_TO_USER_ID: dict[str, str] = {}
_AUTH_DATABASE_PATH: str | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in user.items() if key != "password_hash"}


def _ensure_auth_state_loaded() -> None:
    global _AUTH_DATABASE_PATH
    active_path = database_module._DB_PATH
    if _AUTH_DATABASE_PATH == active_path:
        return
    initialize_database()
    connection = get_db_connection()
    try:
        users = connection.execute("SELECT * FROM users").fetchall()
        attempts = connection.execute(
            "SELECT * FROM login_attempts ORDER BY timestamp DESC LIMIT 10000"
        ).fetchall()
        revoked = connection.execute(
            "SELECT jti, expires_at FROM revoked_tokens WHERE expires_at > ?",
            (_now().isoformat(),),
        ).fetchall()
    finally:
        connection.close()

    _USERS.clear()
    _EMAIL_INDEX.clear()
    _IDENTIFIER_TO_USER_ID.clear()
    for row in users:
        user = dict(row)
        user["is_active"] = bool(user["is_active"])
        _USERS[user["id"]] = user
        _EMAIL_INDEX[user["email"].lower()] = user["id"]
        _IDENTIFIER_TO_USER_ID[user["id"].lower()] = user["id"]

    _LOGIN_ATTEMPTS.clear()
    _FAILED_BY_USER.clear()
    cutoff = _now() - timedelta(minutes=LOCKOUT_MINUTES)
    for row in reversed(attempts):
        attempt = dict(row)
        attempt["success"] = bool(attempt["success"])
        _LOGIN_ATTEMPTS.append(attempt)
        timestamp = datetime.fromisoformat(attempt["timestamp"])
        lockout_key = attempt["user_id"] if attempt["user_id"] in _USERS else f"unknown:{attempt['ip']}:{attempt['user_id']}"
        if not attempt["success"] and timestamp >= cutoff:
            _FAILED_BY_USER.setdefault(lockout_key, []).append(timestamp)

    _REVOKED_JTIS.clear()
    for row in revoked:
        _REVOKED_JTIS[row["jti"]] = datetime.fromisoformat(row["expires_at"])
    _AUTH_DATABASE_PATH = active_path


def _persist_user(user: dict[str, Any]) -> None:
    connection = get_db_connection()
    try:
        connection.execute(
            """INSERT INTO users (id, email, password_hash, role, is_active, created_at, last_login_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET email = excluded.email,
                 password_hash = excluded.password_hash, role = excluded.role,
                 is_active = excluded.is_active, created_at = excluded.created_at,
                 last_login_at = excluded.last_login_at""",
            (user["id"], user["email"], user["password_hash"], user["role"],
             int(user["is_active"]), user["created_at"], user["last_login_at"]),
        )
        connection.commit()
    finally:
        connection.close()


def _persist_login_attempt(attempt: dict[str, Any]) -> None:
    connection = get_db_connection()
    try:
        connection.execute(
            """INSERT INTO login_attempts (attempt_id, user_id, timestamp, success, ip, device_id, reason)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(attempt_id) DO UPDATE SET success = excluded.success,
                 device_id = excluded.device_id, reason = excluded.reason""",
            (attempt["attempt_id"], attempt["user_id"], attempt["timestamp"],
             int(attempt["success"]), attempt["ip"], attempt["device_id"], attempt["reason"]),
        )
        connection.commit()
    finally:
        connection.close()


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


def create_user(email: str, password: str, role: str, *, user_id: str | None = None) -> dict[str, Any]:
    _ensure_auth_state_loaded()
    normalized_email = email.strip().lower()
    if role not in PERMISSIONS:
        raise ValueError("role must be admin, analyst, or viewer")
    if not normalized_email or "@" not in normalized_email:
        raise ValueError("A valid email address is required")
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password cannot exceed 72 UTF-8 bytes with bcrypt")
    if normalized_email in _EMAIL_INDEX:
        raise ValueError("An account with this email already exists")
    new_id = user_id or str(uuid4())
    user = {
        "id": new_id,
        "email": normalized_email,
        "password_hash": _hash_password(password),
        "role": role,
        "is_active": True,
        "created_at": _now().isoformat(),
        "last_login_at": None,
    }
    _USERS[new_id] = user
    _EMAIL_INDEX[normalized_email] = new_id
    _IDENTIFIER_TO_USER_ID[new_id.lower()] = new_id
    _persist_user(user)
    return _public_user(user)


def seed_demo_users() -> None:
    """Create deterministic demo identities; only the admin is seeded by default."""
    _ensure_auth_state_loaded()
    # Preserve existing local demo credentials; registered accounts follow
    # the stronger 12-character password policy above.
    for email, password, role, user_id in (
        ("sumukh@trustnet.local", "sumukh@123", "admin", "sumukh"),
        ("alex.chen@corp.com", "admin123", "analyst", "alex_chen"),
        ("admin@trustnet.local", "admin123", "admin", "admin"),
    ):
        if user_id in _USERS or email in _EMAIL_INDEX:
            continue
        user = {
            "id": user_id, "email": email, "password_hash": _hash_password(password),
            "role": role, "is_active": True, "created_at": _now().isoformat(), "last_login_at": None,
        }
        _USERS[user_id] = user
        _EMAIL_INDEX[email] = user_id
        _IDENTIFIER_TO_USER_ID[user_id.lower()] = user_id
        _persist_user(user)


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    _ensure_auth_state_loaded()
    user = _USERS.get(user_id)
    return _public_user(user) if user else None


def find_user(identifier: str) -> dict[str, Any] | None:
    seed_demo_users()
    normalized = identifier.strip().lower()
    user_id = _EMAIL_INDEX.get(normalized) or _IDENTIFIER_TO_USER_ID.get(normalized)
    user = _USERS.get(user_id) if user_id else None
    return dict(user) if user else None


def authenticate(identifier: str, password: str, *, ip: str, device_id: str | None = None) -> tuple[dict[str, Any] | None, str | None, str]:
    seed_demo_users()
    user = find_user(identifier)
    user_id = user["id"] if user else _IDENTIFIER_TO_USER_ID.get(identifier.strip().lower(), identifier.strip().lower())
    now = _now()
    lockout_key = user_id if user else f"unknown:{ip}:{identifier.strip().lower()}"
    failures = [instant for instant in _FAILED_BY_USER.get(lockout_key, []) if now - instant < timedelta(minutes=LOCKOUT_MINUTES)]
    _FAILED_BY_USER[lockout_key] = failures
    locked = len(failures) >= MAX_FAILED_LOGINS
    success = bool(user and user["is_active"] and not locked and verify_password(password, user["password_hash"]))
    reason = None
    if locked:
        reason = "account_locked"
    elif not user:
        reason = "unknown_account"
    elif not user["is_active"]:
        reason = "account_inactive"
    elif not success:
        reason = "invalid_credentials"

    attempt_id = uuid4().hex
    _LOGIN_ATTEMPTS.append({
        "attempt_id": attempt_id,
        "user_id": user_id,
        "timestamp": now.isoformat(),
        "success": success,
        "ip": ip,
        "device_id": device_id,
        "reason": reason,
    })
    if len(_LOGIN_ATTEMPTS) > 10000:
        del _LOGIN_ATTEMPTS[: len(_LOGIN_ATTEMPTS) - 10000]
    _persist_login_attempt(_LOGIN_ATTEMPTS[-1])

    if not success:
        failures.append(now)
        _FAILED_BY_USER[lockout_key] = failures
        return None, reason, attempt_id

    _FAILED_BY_USER.pop(lockout_key, None)
    return _public_user(user), None, attempt_id


def finalize_login_attempt(attempt_id: str, *, success: bool, device_id: str | None, reason: str | None = None) -> None:
    """Finalize the audit result after fingerprint and risk policy checks."""
    for attempt in reversed(_LOGIN_ATTEMPTS):
        if attempt["attempt_id"] == attempt_id:
            attempt["success"] = success
            attempt["device_id"] = device_id
            attempt["reason"] = reason
            if success and attempt["user_id"] in _USERS:
                _USERS[attempt["user_id"]]["last_login_at"] = _now().isoformat()
                _persist_user(_USERS[attempt["user_id"]])
            _persist_login_attempt(attempt)
            return


def issue_access_token(user: dict[str, Any], *, device_id: str | None = None) -> str:
    now = _now()
    jti = uuid4().hex
    claims = {
        "sub": user["id"],
        "role": user["role"],
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "jti": jti,
    }
    if device_id is not None:
        claims["device_id"] = device_id
    return jwt.encode(claims, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    _ensure_auth_state_loaded()
    claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    jti = claims.get("jti")
    if jti in _REVOKED_JTIS:
        raise jwt.InvalidTokenError("Token has been logged out")
    return claims


def revoke_access_token(claims: dict[str, Any]) -> None:
    jti = claims.get("jti")
    exp = claims.get("exp")
    if jti:
        expiry = datetime.fromtimestamp(float(exp), timezone.utc) if exp else _now() + timedelta(minutes=ACCESS_TOKEN_MINUTES)
        _REVOKED_JTIS[str(jti)] = expiry
        connection = get_db_connection()
        try:
            connection.execute(
                "INSERT OR REPLACE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)",
                (str(jti), expiry.isoformat()),
            )
            connection.commit()
        finally:
            connection.close()
    now = _now()
    for revoked_jti, expiry in list(_REVOKED_JTIS.items()):
        if expiry <= now:
            del _REVOKED_JTIS[revoked_jti]


def create_websocket_ticket(user_id: str) -> str:
    """Mint a single-use, short-lived WebSocket ticket to avoid JWTs in URLs."""
    ticket = secrets.token_urlsafe(32)
    _WS_TICKETS[ticket] = (user_id, _now() + timedelta(seconds=60))
    return ticket


def consume_websocket_ticket(ticket: str) -> dict[str, Any] | None:
    entry = _WS_TICKETS.pop(ticket, None)
    if entry is None or entry[1] <= _now():
        return None
    user = get_user_by_id(entry[0])
    return user if user and user["is_active"] else None


def login_history(user_id: str, limit: int = 100) -> list[dict[str, Any]]:
    return [{key: value for key, value in item.items() if key != "attempt_id"} for item in reversed(_LOGIN_ATTEMPTS) if item["user_id"] == user_id][:limit]


def list_users() -> list[dict[str, Any]]:
    seed_demo_users()
    return [_public_user(user) for user in _USERS.values()]


def reset_auth_state() -> None:
    _ensure_auth_state_loaded()
    _USERS.clear()
    _EMAIL_INDEX.clear()
    _LOGIN_ATTEMPTS.clear()
    _FAILED_BY_USER.clear()
    _REVOKED_JTIS.clear()
    _WS_TICKETS.clear()
    _IDENTIFIER_TO_USER_ID.clear()
    connection = get_db_connection()
    try:
        connection.execute("DELETE FROM users")
        connection.execute("DELETE FROM login_attempts")
        connection.execute("DELETE FROM revoked_tokens")
        connection.commit()
    finally:
        connection.close()
    seed_demo_users()
