#!/usr/bin/env python3
"""TrustNet Safe Device Trust & Baseline Recalibration Tool.

Allows administrators and developers in local development / demo environments
to list observed browser devices, trust their active browser device, or recalibrate
baselines without resetting the database, hardcoding secrets, or bypassing zero-trust
controls in production.

Usage:
  python scripts/trust_device.py --list
  python scripts/trust_device.py --trust <device_id>
  python scripts/trust_device.py --trust-user <user_id>
  python scripts/trust_device.py --recalibrate <user_id>
  python scripts/trust_device.py --recalibrate-all
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from models.device_registry import get_device, list_devices, set_device_status
from models.login_detector import _ensure_baselines_loaded, reset_all_baselines, reset_baseline, user_baselines


def list_all_devices() -> None:
    _ensure_baselines_loaded()
    devices = list_devices()
    print(f"\nRegistered Devices ({len(devices)}):")
    print("-" * 75)
    print(f"{'DEVICE ID':<22} {'USER':<12} {'STATUS':<10} {'LABEL':<25}")
    print("-" * 75)
    for dev in devices:
        print(f"{dev['device_id']:<22} {dev['user_id']:<12} {dev['trust_status']:<10} {dev.get('label', '')[:25]}")
    if not devices:
        print("No devices have connected yet.")

    print(f"\nStored Baselines ({len(user_baselines)}):")
    print("-" * 75)
    for user, b in user_baselines.items():
        fp = b.get("fingerprint", {})
        print(f"User '{user}': {fp.get('platform', '?')} · {fp.get('userAgent', '?')[:40]} · Canvas {fp.get('canvasHash', '?')}")
    print("-" * 75)


def trust_device_id(device_id: str) -> None:
    device = get_device(device_id)
    if not device:
        print(f"Error: Device '{device_id}' not found.")
        sys.exit(1)
    set_device_status(device_id, "trusted", quarantined=False)
    print(f"[OK] Device '{device_id}' ({device['label']}) for user '{device['user_id']}' is now TRUSTED.")


def trust_user_devices(user_id: str) -> None:
    devices = list_devices(user_id)
    if not devices:
        print(f"No devices found for user '{user_id}'.")
        return
    for dev in devices:
        set_device_status(dev["device_id"], "trusted", quarantined=False)
        print(f"[OK] Device '{dev['device_id']}' ({dev['label']}) for user '{user_id}' is now TRUSTED.")


def recalibrate_user(user_id: str) -> None:
    _ensure_baselines_loaded()
    existed = reset_baseline(user_id)
    if existed:
        print(f"[OK] Baseline for '{user_id}' cleared. The next successful login will establish their new browser baseline.")
    else:
        print(f"No existing baseline found for '{user_id}'.")


def recalibrate_all() -> None:
    reset_all_baselines()
    print("[OK] All user baselines cleared. Each account will establish a new baseline on its next login.")


def main() -> None:
    parser = argparse.ArgumentParser(description="TrustNet Device Trust & Baseline Recalibration Tool")
    parser.add_argument("--list", action="store_true", help="List all registered devices and stored baselines")
    parser.add_argument("--trust", metavar="DEVICE_ID", help="Trust a specific device by its device_id")
    parser.add_argument("--trust-user", metavar="USER_ID", help="Trust all devices registered for a specific user")
    parser.add_argument("--recalibrate", metavar="USER_ID", help="Recalibrate/clear baseline for a user")
    parser.add_argument("--recalibrate-all", action="store_true", help="Clear all stored device baselines")

    args = parser.parse_args()

    if args.list:
        list_all_devices()
    elif args.trust:
        trust_device_id(args.trust)
    elif args.trust_user:
        trust_user_devices(args.trust_user)
    elif args.recalibrate:
        recalibrate_user(args.recalibrate)
    elif args.recalibrate_all:
        recalibrate_all()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
