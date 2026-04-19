# Proxmox And VM Access

This is the practical runbook for reaching the FamilyTree VMs and the currently deployed app without rediscovering the access path.

Do not commit passwords, tokens, or new private keys into this repo. This file documents hostnames, users, key paths, and the deployment shape that was verified during setup.

## Topology

- Proxmox host: `192.168.68.50`
- App VM: `familytree-app` at `192.168.68.110`
- Data VM: `familytree-data` at `192.168.68.111`

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
ssh -i ~/.ssh/proxmox_key ubuntu@192.168.68.110
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
- The app VM had two different FamilyTree checkouts:
  - `/home/ubuntu/heirloom`
  - `/home/ubuntu/FamilyTree`
- The actually running app was **not** using `/home/ubuntu/FamilyTree`.
- The live processes were originally started from `/home/ubuntu/heirloom`.
- Later deployment used a safer separate checkout:
  - `/home/ubuntu/heirloom-feature-family-map`

## Current Running App

At the time this was written, the running app processes were launched from:

- API: `/home/ubuntu/heirloom-feature-family-map/apps/api`
- Web: `/home/ubuntu/heirloom-feature-family-map/apps/web`

Local health checks:

- Web: `http://192.168.68.110:3000`
- API: `http://192.168.68.110:4000/health`

Quick verification:

```bash
ssh -i ~/.ssh/proxmox_key ubuntu@192.168.68.110 \
  'ps -ef | grep -E "node dist/server.js|next start" | grep -v grep'
```

To confirm the working directories:

```bash
ssh -i ~/.ssh/proxmox_key ubuntu@192.168.68.110 'pwdx <pid>'
```

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
- Web from `~/heirloom` via `pnpm --filter @familytree/web start`

Important:

- `heirloom.service` was found **inactive** during inspection.
- The live app processes were running as background processes, not as an active systemd-managed deployment.

If you want a cleaner deployment next time, convert the current feature checkout to a real persistent systemd service instead of relying on manual background processes.

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

1. Push a feature branch to GitHub.
2. SSH to the app VM as `ubuntu`.
3. Clone the branch into a separate checkout instead of overwriting the dirty live repo.
4. Reuse env files from the existing deployment:
   - `~/heirloom/apps/api/.env`
   - `~/heirloom/apps/web/.env.local`
5. Run:

```bash
source ~/.nvm/nvm.sh
cd ~/heirloom-feature-family-map
pnpm install --frozen-lockfile
set -a
. apps/api/.env
set +a
pnpm db:migrate
pnpm build
```

6. Start API and web manually from that new checkout.
7. Verify:
   - `curl http://127.0.0.1:4000/health`
   - `curl -I http://127.0.0.1:3000`

## Current Known Paths

- Old live checkout: `/home/ubuntu/heirloom`
- Alternate checkout: `/home/ubuntu/FamilyTree`
- Current feature deployment checkout: `/home/ubuntu/heirloom-feature-family-map`
- Historical launcher script: `/home/ubuntu/start-heirloom.sh`
- Backup directory on data VM: `~/familytree-backups`

## Recommended Next Time

- SSH directly to the VMs, not through the Proxmox shell, unless you need `qm` inspection.
- Use the data VM for direct Postgres work.
- Treat `/home/ubuntu/heirloom` as potentially dirty until it is cleaned up.
- Prefer deploying new branches into a separate checkout, then cut over deliberately.
- Replace the manual background-process launch with real systemd units once the deployment path stabilizes.
