#!/usr/bin/env python3
"""Audit rendered Docker Compose settings before exposing the Redroid stack.

Reads the JSON emitted by `docker compose config --format json`. This is a
configuration audit only; it does not prove that Android or video streaming runs.
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any


LOOPBACKS = {"127.0.0.1", "::1", "localhost"}


def audit_compose(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    services = config.get("services")
    if not isinstance(services, dict):
        return ["Compose document has no services object"]

    for name in ("redroid", "gateway", "stream"):
        if name not in services:
            errors.append(f"Required service is missing: {name}")

    for name, service in services.items():
        if not isinstance(service, dict):
            errors.append(f"Service {name} is not an object")
            continue
        for port in service.get("ports", []) or []:
            if not isinstance(port, dict):
                errors.append(f"{name} has an unrecognized port mapping")
                continue
            host_ip = str(port.get("host_ip") or "")
            if host_ip not in LOOPBACKS:
                published = port.get("published", "unknown")
                target = port.get("target", "unknown")
                errors.append(
                    f"{name} publishes container port {target} on "
                    f"{host_ip or 'all interfaces'} (host port {published}); bind to loopback"
                )

    required = {name: services.get(name) for name in ("redroid", "gateway", "stream")}
    for name, service in required.items():
        if not isinstance(service, dict):
            continue
        networks = service.get("networks") or {}
        if isinstance(networks, list):
            network_names = set(networks)
        elif isinstance(networks, dict):
            network_names = set(networks)
        else:
            network_names = set()
        if "android-private" not in network_names:
            errors.append(f"{name} must join the android-private network")

    redroid = required.get("redroid")
    if isinstance(redroid, dict) and redroid.get("privileged") is not True:
        errors.append("redroid must run privileged for the Android kernel interfaces")
    for name in ("gateway", "stream"):
        service = required.get(name)
        if isinstance(service, dict) and service.get("privileged") is True:
            errors.append(f"{name} must not run privileged")

    gateway = required.get("gateway")
    if isinstance(gateway, dict):
        environment = gateway.get("environment") or {}
        if isinstance(environment, list):
            environment = dict(item.split("=", 1) for item in environment if "=" in item)
        if not environment.get("GATEWAY_TOKEN"):
            errors.append("gateway must have a non-empty GATEWAY_TOKEN")

    stream = services.get("stream")
    if isinstance(stream, dict):
        profiles = stream.get("profiles") or []
        if "streaming" not in profiles:
            errors.append("stream service must remain behind the 'streaming' profile")
        environment = stream.get("environment") or {}
        if isinstance(environment, list):
            environment = dict(item.split("=", 1) for item in environment if "=" in item)
        remote_admin = str(environment.get("WS_SCRCPY_ALLOW_REMOTE_ADMIN", "0")).lower()
        if remote_admin not in {"0", "false", "no", ""}:
            errors.append("WS_SCRCPY_ALLOW_REMOTE_ADMIN must be disabled outside bootstrap")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", help="read Compose JSON from a file; stdin is used by default")
    args = parser.parse_args()
    try:
        if args.file:
            with open(args.file, encoding="utf-8") as source:
                config = json.load(source)
        else:
            config = json.load(sys.stdin)
    except (OSError, json.JSONDecodeError) as error:
        print(f"[FAIL] Could not read rendered Compose JSON: {error}", file=sys.stderr)
        return 2

    errors = audit_compose(config)
    if errors:
        for error in errors:
            print(f"[FAIL] {error}", file=sys.stderr)
        return 1
    print("[PASS] Private network membership, least-privilege services, gateway token, loopback-only ports, and streaming admin defaults are safe.")
    print("[INFO] This audit validates configuration only; it does not prove runtime or stream readiness.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
