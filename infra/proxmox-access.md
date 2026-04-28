# Proxmox And VM Access

This is the practical runbook for reaching the Tessera VMs and the currently deployed app without rediscovering the access path.

Do not commit passwords, tokens, or new private keys into this repo. This file documents hostnames, users, key paths, and the deployment shape that was verified during setup.

## Tailscale Access (Remote / Off-Local-Network)

Both VMs and the Proxmox host are joined to the same Tailscale network (`wardethan2000@`). Use these IPs when off your home network:

| Device | Tailscale IP | LAN IP |
|--------|-------------|--------|
| app VM (`familytree-app`) | `100.96.74.16` | `192.168.68.110` |
| Proxmox host (`proxmox-homelab`) | `100.120.201.97` | `192.168.68.50` |
| Data VM | (not yet joined) | `192.168.68.111` |

SSH to the app VM over Tailscale:

```bash
ssh -i ~/.ssh/proxmox_key ubuntu@100.96.74.16
```

Note: the `proxmox-homelab` Tailscale IP (`100.120.201.97`) routes to the Proxmox **host**, not the app VM. Use `100.96.74.16` for the app VM.

## Cloudflare Tunnel (Public Access)

The app is publicly accessible at **https://tessera.family** via a Cloudflare Tunnel (`cloudflared`) running as a systemd service on the app VM.

- Tunnel name: `tessera.family`
- Tunnel ID: `67b9835c-fa9f-4fa1-a2b3-f1df843ed336`
- Service URL: `http://localhost:3000` (HTTP, not HTTPS — the origin is plain HTTP)
- cloudflared runs as `cloudflared.service` (systemd, enabled)

Architecture: **single-domain** — all traffic goes through `tessera.family`. The Next.js app proxies `/api/*` to the API server at `localhost:4000` via `afterFiles` rewrites in `next.config.ts`. No separate `api.tessera.family` hostname.

Env vars for public access:

- `API_BASE_URL=https://tessera.family` (better-auth baseURL)
- `TRUSTED_ORIGINS=https://tessera.family,...`
- `WEB_URL=https://tessera.family`
- `NEXT_PUBLIC_API_URL=` (empty — forces relative `/api/...` calls)
- `API_PROXY_URL=http://localhost:4000` (used by Next.js rewrite destination)

Manage the tunnel at: **dash.cloudflare.com → Zero Trust → Networks → Tunnels → tessera.family**

Check tunnel status:

```bash
ssh -i ~/.ssh/proxmox_key ubuntu@100.96.74.16 'sudo systemctl status cloudflared'
```

## Topology

- Proxmox host: `192.168.68.50` / Tailscale `100.120.201.97`
- App VM: `familytree-app` at `192.168.68.110` / Tailscale `100.96.74.16`
- Data VM: `familytree-data` at `192.168.68.111`

Tailscale addresses verified on 2026-04-24:

- Proxmox host: `proxmox-homelab` at `100.120.201.97`
- App VM: `familytree-app` at `100.96.74.16`
- If direct `192.168.68.x` access fails, check whether local Tailscale has
  `--accept-routes=false`; use the Tailscale IPs or ProxyJump through the app VM.

Verified Proxmox VM IDs:

- `110` → `familytree-app`
- `111` → `familytree-data`

## SSH Access

### Proxmox host

Use the Proxmox key directly:

```bash
ssh -i ~/.ssh/proxmox_key root@192.168.68.50
```

Useful first command:

```bash
ssh -i ~/.ssh/proxmox_key root@192.168.68.50 qm list
```

### App VM

Important discovery:

- `root@192.168.68.110` did **not** accept the key.
- The VM cloud-init user is `ubuntu`.
- The same local key works directly against the VM:

```bash
# Local network
ssh -i ~/.ssh/proxmox_key ubuntu@192.168.68.110

# Remote (Tailscale)
ssh -i ~/.ssh/proxmox_key ubuntu@100.96.74.16
```

### Data VM

Use the same pattern:

```bash
ssh -i ~/.ssh/proxmox_key ubuntu@192.168.68.111
```

## What Had To Be Figured Out

These were the non-obvious parts:

- The Proxmox host was reachable as `root`, but the app VM was not.
- `qm config 110` showed `ciuser: ubuntu`, which explained why `root` failed.
- The cloud-init public key on the VM matched `~/.ssh/proxmox_key.pub`, so direct VM SSH with that key was valid.
- The app VM had two different Tessera checkouts, though one still used the older repo directory name:
  - `/home/ubuntu/heirloom`
  - `/home/ubuntu/FamilyTree`
- The actually running app was **not** using `/home/ubuntu/FamilyTree`.
- The live processes were originally started from `/home/ubuntu/heirloom`.
- Later deployment used a safer separate checkout:
  - `/home/ubuntu/heirloom-feature-family-map`
- A later cutover temporarily ran from a non-git live directory:
  - `/home/ubuntu/heirloom-memory-pages-live`
- The current live deployment was moved back to a clean git checkout:
  - `/home/ubuntu/heirloom-dashboard-redesign-live`

## Current Running App

At the time this was last updated, the running app processes were launched from:

- API: `/home/ubuntu/heirloom-homepage-revise-live/apps/api`
- Web: `/home/ubuntu/heirloom-homepage-revise-live/apps/web`

Local health checks:

- Web: `http://192.168.68.110:3000`
- API: `http://192.168.68.110:4000/api/auth/get-session`
- Public: `https://tessera.family`

Quick verification:

```bash
ssh -i ~/.ssh/proxmox_key ubuntu@192.168.68.110 \
  'ps -ef | grep -E "node dist/server.js|next start" | grep -v grep'
```

To confirm the working directories:

```bash
ssh -i ~/.ssh/proxmox_key ubuntu@192.168.68.110 'pwdx <pid>'
```

Current verified live pids after mosaic integration deploy on 2026-04-28:

- API listener pid: `199462`
- Web listener pid: `199463`

## Historical Startup Shape On The App VM

There is a user systemd unit:

```bash
systemctl --user cat heirloom.service
```

It points to:

```bash
/home/ubuntu/start-heirloom.sh
```

That script historically started:

- API from `~/heirloom/apps/api` via `node dist/server.js`
- Web from `~/heirloom` via `pnpm --filter @tessera/web start`

Important:

- `heirloom.service` was found **inactive** during inspection.
- The live app processes were running as background processes, not as an active systemd-managed deployment.

If you want a cleaner deployment next time, convert the current live checkout to a real persistent systemd service instead of relying on manual background processes.

## Data VM Notes

The data VM is Docker-based.

Verified containers:

- `ubuntu-postgres-1`
- `ubuntu-mailpit-1`
- `ubuntu-minio-1`

Inspect them with:

```bash
ssh -i ~/.ssh/proxmox_key ubuntu@192.168.68.111 \
  'docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"'
```

### Postgres access

`psql` was not available on the app VM, so DB inspection/changes were easier from the data VM by entering the Postgres container:

```bash
ssh -i ~/.ssh/proxmox_key ubuntu@192.168.68.111
docker exec -it ubuntu-postgres-1 psql -U familytree -d familytree
```

This was the most reliable path for direct DB inspection and cleanup.

## Deployment Pattern That Worked

The safest workflow used here was:

1. Push the target branch to GitHub.
2. SSH to the app VM as `ubuntu`.
3. Clone the branch into a separate checkout instead of overwriting the dirty or non-git live directory.
4. Reuse env files from the existing deployment:
   - `~/heirloom-memory-pages-live/.env`
   - `~/heirloom-memory-pages-live/apps/api/.env`
   - `~/heirloom-memory-pages-live/apps/web/.env.local`
5. Run:

```bash
source ~/.nvm/nvm.sh
cd ~/heirloom-dashboard-redesign-live
pnpm install --frozen-lockfile
set -a
. apps/api/.env
set +a
pnpm db:migrate
pnpm build
```

6. Restart the live checkout with the checked-in helper:

```bash
cd ~/heirloom-dashboard-redesign-live
bash infra/restart-live-checkout.sh
```

This helper intentionally avoids `pkill -f "next start"` style matches, kills listeners by pid file and port, and starts the web process with `exec node node_modules/next/dist/bin/next start` so the stored pid is the actual long-lived process rather than a shell wrapper.

7. Verify:
   - `curl http://127.0.0.1:4000/health`
   - `curl -I http://127.0.0.1:3000`

## Current Known Paths

- Old live checkout: `/home/ubuntu/heirloom`
- Alternate checkout: `/home/ubuntu/FamilyTree`
- Current feature deployment checkout: `/home/ubuntu/heirloom-feature-family-map`
- Previous non-git live directory: `/home/ubuntu/heirloom-memory-pages-live`
- Current live checkout: `/home/ubuntu/heirloom-decade-rail-live`
- Previous live checkout: `/home/ubuntu/tessera-onboarding-live`
- Previous live checkout: `/home/ubuntu/heirloom-media-fix-live`
- Previous live checkout: `/home/ubuntu/heirloom-immersive-scroll-live`
- Current live checkout: `/home/ubuntu/heirloom-mosaic-integration-live`
- Previous live checkout: `/home/ubuntu/heirloom-corkboard-rev1-live`
- Previous live checkout: `/home/ubuntu/heirloom-decade-rail-live`
- Historical launcher script: `/home/ubuntu/start-heirloom.sh`
- Backup directory on data VM: `~/familytree-backups`

## Media Bucket Notes

Media records currently point to objects stored in the MinIO bucket
`familytree-media`. The API defaults to `tessera-media` when `MINIO_BUCKET` is
unset, which causes `/api/media` to return `404` even when the database rows are
valid.

The live API env was corrected on 2026-04-24 with:

```bash
MINIO_BUCKET=familytree-media
```

If images/videos fail again, verify both:

```bash
ssh -i ~/.ssh/proxmox_key ubuntu@100.96.74.16 \
  'grep "^MINIO_BUCKET=" ~/heirloom-decade-rail-live/apps/api/.env'
```

```bash
ssh -i ~/.ssh/proxmox_key -J ubuntu@100.96.74.16 ubuntu@192.168.68.111 \
  'docker exec ubuntu-minio-1 sh -c "ls /data/familytree-media/trees | head"'
```

## Recommended Next Time

- SSH directly to the VMs, not through the Proxmox shell, unless you need `qm` inspection.
- Use the data VM for direct Postgres work.
- Treat `/home/ubuntu/heirloom` as potentially dirty until it is cleaned up.
- Prefer deploying new branches into a separate checkout, then cut over deliberately.
- Do not assume the pid files are current; verify the live listeners with `ss -ltnp` and `pwdx`.
- Replace the manual background-process launch with real systemd units once the deployment path stabilizes.
