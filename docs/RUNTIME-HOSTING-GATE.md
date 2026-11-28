# Runtime hosting gate (Redroid)

Last reviewed: 2026-11-28

## Current deployment split

- Vercel hosts the static browser client only. It does not run Docker, a privileged Android container, Binder devices, ADB, or the screen-streaming sidecar.
- Android runs on a separate Linux host. The browser talks to the authenticated gateway and the streaming service over HTTPS/WSS.
- A successful Vercel deployment or frontend CI run is not evidence that Android has booted.

## Non-negotiable host requirements

A candidate host is not accepted until all of these are demonstrated:

1. A real Linux kernel environment (not a restricted app container or static hosting service).
2. Docker Engine and Docker Compose v2.
3. Binder support in the host kernel and the required binder devices for the selected Redroid image. A privileged Docker container cannot manufacture a missing host Binder driver.
4. Permission to run the Redroid container with the required privileged configuration.
5. Persistent storage for the Android `/data` volume.
6. Sufficient RAM, CPU and disk for the selected Android image and screen streaming; measure actual use rather than assuming a tiny free tier is adequate.
7. For the current complete streaming stack, Linux amd64 is required because the selected ws-scrcpy-web image is amd64-only.
8. HTTPS/WSS reverse proxy support. Keep ADB and internal service ports private; never publish port 5555.

## Free-host screening (not yet approved)

A provider's marketing statement that it supports Docker is not enough. Before deploying, obtain a VM and run:

```bash
uname -a
uname -m
free -h
df -h
docker version
docker compose version
ls -l /dev/binder /dev/hwbinder /dev/vndbinder 2>/dev/null || true
grep -E 'binder|ashmem' /proc/filesystems || true
python3 scripts/redroid_doctor.py --skip-adb
```

Then validate the rendered Compose configuration and security audit:

```bash
docker compose --profile streaming --env-file deploy/redroid/.env \
  -f deploy/redroid/docker-compose.yml config --format json \
  | python3 scripts/redroid_compose_audit.py
```

Only after those checks pass should the Redroid stack be started. Run the real boot and stream acceptance scripts afterward.

### Candidate notes

- Very small NAT/container VPS plans (for example, 192 MB RAM) are not viable for an Android runtime.
- A claimed 2 GB KVM no-card offer is only a lead, not an approved host. Verify the actual VM allocation, kernel Binder availability, privileged Docker support, persistent disk, network ports and account renewal terms before relying on it.
- Hyperscaler always-free offers commonly require a payment card for identity verification; they do not satisfy a no-card constraint.
- Do not enter payment details, enable paid upgrades, or accept a paid fallback for this project.

## Deployment decision

Status: **BLOCKED — no compatible host has been provisioned and tested yet.**

Keep `redroid-migration` as the active integration branch. Do not merge it into `main`, remove the v86 fallback, or claim a working Google TV runtime until the real-host acceptance criteria in `docs/REDROID-MIGRATION.md` pass.
