#!/usr/bin/env python3
"""Read-only diagnostics for a GoogleTV-Web Redroid Linux host.

This tool never loads kernel modules, mounts filesystems, changes Docker state,
or modifies Android. It reports host prerequisites and optional ADB boot state.
"""
from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Sequence


@dataclass
class Check:
    name: str
    status: str
    detail: str


Runner = Callable[..., subprocess.CompletedProcess[str]]


def command(
    runner: Runner, args: Sequence[str], timeout: int = 12
) -> subprocess.CompletedProcess[str]:
    return runner(
        list(args), capture_output=True, text=True, timeout=timeout, check=False
    )


def parse_adb_devices(output: str, target: str) -> str:
    for line in output.splitlines():
        fields = line.split()
        if len(fields) >= 2 and fields[0] == target:
            return fields[1]
    return "missing"


def parse_properties(release: str, model: str, boot: str) -> dict[str, str | bool]:
    return {
        "android_release": release.strip() or "unknown",
        "device_model": model.strip() or "unknown",
        "boot_completed": boot.strip() == "1",
    }


def inspect_host(
    runner: Runner = subprocess.run,
    *,
    system: str | None = None,
    architecture: str | None = None,
    exists: Callable[[str], bool] | None = None,
    which: Callable[[str], str | None] | None = None,
) -> list[Check]:
    system = system or platform.system()
    architecture = architecture or platform.machine()
    exists = exists or (lambda item: Path(item).exists())
    which = which or shutil.which
    checks: list[Check] = []

    if system == "Linux":
        checks.append(Check("linux_host", "PASS", "Linux kernel detected"))
    else:
        checks.append(Check("linux_host", "FAIL", f"Redroid requires Linux; found {system}"))

    if architecture in {"x86_64", "aarch64", "arm64"}:
        checks.append(Check("architecture", "PASS", architecture))
    else:
        checks.append(Check("architecture", "FAIL", f"Unsupported architecture: {architecture}"))

    # Check Redroid's documented host prerequisites independently.
    try:
        page_size = __import__("os").sysconf("SC_PAGE_SIZE")
        if page_size == 4096:
            checks.append(Check("page_size", "PASS", "Host memory page size is 4096 bytes"))
        else:
            checks.append(Check("page_size", "FAIL", f"Redroid requires 4096-byte pages; host reports {page_size}"))
    except (OSError, ValueError):
        checks.append(Check("page_size", "WARN", "Could not determine host memory page size"))

    ipv6_file = Path("/proc/net/if_inet6")
    ipv6_disabled = Path("/proc/sys/net/ipv6/conf/all/disable_ipv6")
    if ipv6_file.exists():
        try:
            disabled = ipv6_disabled.read_text().strip() == "1" if ipv6_disabled.exists() else False
        except OSError:
            disabled = False
        checks.append(Check(
            "ipv6",
            "FAIL" if disabled else "PASS",
            "IPv6 is disabled by the host kernel" if disabled else "IPv6 kernel interface is available",
        ))
    else:
        checks.append(Check("ipv6", "FAIL", "IPv6 interface support is not exposed at /proc/net/if_inet6"))

    binder_fs = False
    try:
        binder_fs = any(line.split()[-1:] == ["binder"] for line in Path("/proc/filesystems").read_text().splitlines())
    except OSError:
        pass

    if not which("docker"):
        checks.append(Check("docker_cli", "FAIL", "Docker CLI not found"))
    else:
        result = command(runner, ["docker", "info"])
        checks.append(Check(
            "docker_daemon",
            "PASS" if result.returncode == 0 else "FAIL",
            "Docker daemon reachable" if result.returncode == 0
            else (result.stderr.strip() or "Docker daemon unavailable or permission denied"),
        ))
        compose = command(runner, ["docker", "compose", "version"])
        checks.append(Check(
            "docker_compose",
            "PASS" if compose.returncode == 0 else "FAIL",
            (compose.stdout or compose.stderr).strip()
            or ("Compose plugin available" if compose.returncode == 0 else "Docker Compose v2 plugin missing"),
        ))

    binder = ["/dev/binder", "/dev/hwbinder", "/dev/vndbinder"]
    found = [device for device in binder if exists(device)]
    if found:
        checks.append(Check("binder", "PASS", "Binder devices found: " + ", ".join(found)))
    elif exists("/dev/binderfs") and binder_fs:
        checks.append(Check(
            "binder", "WARN",
            "BinderFS path and kernel filesystem support exist, but binder devices are not present; mount BinderFS and create binder/hwbinder/vndbinder devices",
        ))
    elif binder_fs:
        checks.append(Check(
            "binder", "WARN",
            "Kernel exposes BinderFS but no Binder device nodes are mounted; configure BinderFS before starting Redroid",
        ))
    else:
        checks.append(Check(
            "binder", "FAIL",
            "Binder devices and BinderFS kernel support are missing; enable binder_linux/BinderFS in the host kernel",
        ))

    if exists("/dev/ashmem") or exists("/sys/module/ashmem_linux"):
        checks.append(Check("ashmem", "INFO", "ashmem compatibility detected; requirements depend on Android image/kernel"))
    else:
        checks.append(Check("ashmem", "INFO", "No ashmem detected; newer Android/kernel combinations may use memfd"))

    if exists("/dev/dma_heap") or exists("/dev/ion"):
        checks.append(Check("dma_heap", "PASS", "ION or DMA-BUF heap device interface is present"))
    else:
        checks.append(Check("dma_heap", "WARN", "No /dev/dma_heap or /dev/ion node found; verify host kernel support for the selected Redroid image"))

    if list(Path("/dev/dri").glob("renderD*")) if exists("/dev/dri") else []:
        checks.append(Check("gpu", "INFO", "GPU render node found; driver and container access still need validation"))
    else:
        checks.append(Check("gpu", "WARN", "No GPU render node found; hardware acceleration is not exposed"))

    return checks


def inspect_android(
    runner: Runner,
    target: str,
    *,
    wait_seconds: int = 0,
    sleep: Callable[[float], None] = time.sleep,
) -> list[Check]:
    if not shutil.which("adb"):
        status = "FAIL" if wait_seconds else "WARN"
        return [Check("adb", status, "ADB CLI not found; Android runtime state was not checked")]

    deadline = time.monotonic() + wait_seconds
    last_state = "missing"
    while True:
        command(runner, ["adb", "connect", target], timeout=8)
        devices = command(runner, ["adb", "devices"], timeout=8)
        last_state = parse_adb_devices(devices.stdout, target)
        if last_state == "device":
            break
        if time.monotonic() >= deadline:
            return [Check("adb_device", "FAIL" if wait_seconds else "WARN",
                          f"{target} state: {last_state}")]
        sleep(min(2, max(0, deadline - time.monotonic())))

    boot = command(runner, ["adb", "-s", target, "shell", "getprop", "sys.boot_completed"])
    release = command(runner, ["adb", "-s", target, "shell", "getprop", "ro.build.version.release"])
    model = command(runner, ["adb", "-s", target, "shell", "getprop", "ro.product.model"])
    properties = parse_properties(release.stdout, model.stdout, boot.stdout)
    status = "PASS" if properties["boot_completed"] else ("FAIL" if wait_seconds else "WARN")
    detail = (
        f"Android {properties['android_release']} / {properties['device_model']}; "
        f"sys.boot_completed={boot.stdout.strip() or 'empty'}"
    )
    return [Check("android_boot", status, detail)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb-target", default="127.0.0.1:5555")
    parser.add_argument("--wait", action="store_true", help="wait up to --timeout for Android boot")
    parser.add_argument("--timeout", type=int, default=180, help="boot wait timeout in seconds (1-1800)")
    parser.add_argument("--skip-adb", action="store_true", help="check host prerequisites only")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args()

    if not 1 <= args.timeout <= 1800:
        parser.error("--timeout must be between 1 and 1800 seconds")

    checks = inspect_host()
    if not args.skip_adb:
        checks.extend(inspect_android(
            subprocess.run, args.adb_target, wait_seconds=args.timeout if args.wait else 0
        ))

    if args.json:
        print(json.dumps([asdict(item) for item in checks], indent=2))
    else:
        for item in checks:
            print(f"[{item.status}] {item.name}: {item.detail}")

    return 1 if any(item.status == "FAIL" for item in checks) else 0


if __name__ == "__main__":
    sys.exit(main())
