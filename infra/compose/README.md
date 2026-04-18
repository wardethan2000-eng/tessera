# Data services — Docker Compose

This directory contains the Docker Compose configuration for FamilyTree's self-hosted data services, intended for the **data VM** (`familytree-data`, default IP `192.168.68.111`).

---

## Services

| Service    | Image                          | Port(s)               | Purpose                          |
|------------|--------------------------------|-----------------------|----------------------------------|
| `postgres`  | `postgres:17`                 | `5432`                | Primary Postgres database        |
| `minio`     | `minio/minio` (pinned)        | `9000` (API)          | S3-compatible media object store |
|             |                                | `9001` (console)      | MinIO web admin UI               |
| `mailpit`   | `axllent/mailpit:latest`      | `1025` (SMTP)         | Catches outbound SMTP in dev     |
|             |                                | `8025` (HTTP)         | Email inbox browser UI           |

---

## Setup

### 1. Copy and configure the environment file

```bash
cp data.env.example .env
```

Edit `.env` and set secure passwords before deploying to any network:

| Variable              | Description                         |
|-----------------------|-------------------------------------|
| `POSTGRES_DB`         | Database name (default: `familytree`) |
| `POSTGRES_USER`       | Postgres username                   |
| `POSTGRES_PASSWORD`   | Postgres password — **change this** |
| `POSTGRES_PORT`       | Host port for Postgres (default: `5432`) |
| `MINIO_ROOT_USER`     | MinIO root access key               |
| `MINIO_ROOT_PASSWORD` | MinIO root secret — **change this** |
| `MINIO_API_PORT`      | Host port for MinIO API (default: `9000`) |
| `MINIO_CONSOLE_PORT`  | Host port for MinIO console (default: `9001`) |
| `MAILPIT_SMTP_PORT`   | Host port for Mailpit SMTP (default: `1025`) |
| `MAILPIT_UI_PORT`     | Host port for Mailpit web UI (default: `8025`) |

### 2. Start the stack

```bash
docker compose -f data.compose.yaml --env-file .env up -d
```

### 3. Verify

```bash
docker compose -f data.compose.yaml ps
```

All three services should show `healthy` or `running`.

---

## Accessing services

| Service       | URL / Connection                                         |
|---------------|----------------------------------------------------------|
| Postgres      | `postgresql://<user>:<password>@<data-vm-ip>:5432/<db>` |
| MinIO API     | `http://<data-vm-ip>:9000`                              |
| MinIO Console | `http://<data-vm-ip>:9001`                              |
| Mailpit UI    | `http://<data-vm-ip>:8025`                              |

---

## Data persistence

Postgres data is stored in the `postgres-data` Docker volume.  
MinIO data is stored in the `minio-data` Docker volume.

Both persist across container restarts. To reset:

```bash
docker compose -f data.compose.yaml down -v   # removes volumes — all data lost
```

---

## Stopping

```bash
docker compose -f data.compose.yaml down      # stop (keeps volumes)
docker compose -f data.compose.yaml down -v   # stop and delete data
```
