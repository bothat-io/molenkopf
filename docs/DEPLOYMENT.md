# Deployment

This document defines the current production deployment target for Molenkopf.
Routes, flags, and environment variables use Molenkopf names.

## Local Modes

- Development: `npm run dev`
  - Binds `127.0.0.1:8787`
  - Uses `.molenkopf/dev`
  - Starts the Vite dashboard unless `MOLENKOPF_DASHBOARD_DEV=0`
  - Restarts the proxy on Core/Proxy source changes
- Stable development: `npm run dev:ignorechanges`
  - Uses the same dev port, data dir, and Vite dashboard
  - Does not restart Molenkopf when Core/Proxy source files change
- Test server: `npm run serve:test`
  - Binds `127.0.0.1:8798`
  - Uses `.molenkopf/test`
- Local prod smoke: `npm run prod`
  - Builds the dashboard
  - Binds `127.0.0.1:8787`
  - Uses `.molenkopf/prod`

`npm run prod` is a local production profile with durable local state. Override
it with `MOLENKOPF_PROD_PORT`, `MOLENKOPF_PROD_HOST`, `MOLENKOPF_PROD_TARGET`,
`MOLENKOPF_PROD_DATA_DIR`, and `MOLENKOPF_PROD_ALLOW_PUBLIC_BIND=1` when
needed.

## Docker Build

Build after the release source tree is clean:

```powershell
docker build --pull -t molenkopf:local .
```

The Docker image builds dashboard assets in a separate stage and copies only the
runtime source, plugin pages, root manifests, and built dashboard assets into the
final image. The final image also carries the MIT license notice. Core and Proxy
keep Node built-ins only.

## Docker Run

The published image listens on `0.0.0.0:8787` inside the container so Docker port
publishing works. For local use, publish it only to host loopback:

```powershell
Copy-Item .env.example .env
# Edit .env and set a unique MOLENKOPF_SESSION_SECRET.

docker run --rm `
  --env-file .env `
  -p 127.0.0.1:8787:8787 `
  -v molenkopf-data:/data `
  molenkopf:local
```

Open `http://127.0.0.1:8787/` and create the first admin in the browser. Do not
seed admin usernames or passwords through environment variables. Docker starts
require a valid `MOLENKOPF_SESSION_SECRET`; copy `.env.example` to `.env`,
change the value, and pass it with `--env-file .env`. Docker does not
automatically read a host `.env` file. Configure provider credentials through
environment variables or a mounted config file that uses credential references.
Do not bake provider keys, imported runtime auth, `.env`, or local data into the
image.

## Data Volume

Mount one durable volume at `/data`. It contains SQLite files, audit manifests,
retrieval store files, runtime settings, and imported runtime profiles. Treat the
volume as sensitive local state.

On POSIX filesystems Molenkopf creates and repairs sensitive state directories as
`0700` and sensitive files as `0600`, including SQLite, audit, retrieval, runtime
settings, and imported runtime auth/profile files. Windows does not expose full
POSIX permission bits through Node, so protect the data directory with Windows
ACLs or a private user profile.

Admins can manually purge audit and retrieval data with
`POST /__molenkopf/retention/purge` and an explicit `scope` of `audit`,
`retrieval`, or `all`. TTLs, quotas, pagination, and project-scoped retention
policies are still future work.

Current constraint: one writer only. Do not run multiple containers against the
same SQLite volume.

## Security Gates

- Non-loopback source binds require `--allow-public-bind`; profile-server starts
  can opt in with `MOLENKOPF_<PROFILE>_ALLOW_PUBLIC_BIND=1`.
- `MOLENKOPF_SESSION_SECRET` is required for every server start.
- `/v1/...` proxy APIs require a valid Molenkopf API key.
- `x-molenkopf-token` carries Molenkopf auth when a client must keep
  `Authorization` for the upstream provider; it is stripped before forwarding.
- `/__molenkopf/health` is public.
- Before first admin setup, only health, session status, and first-run admin
  creation are usable.
- Control-plane APIs require auth after an admin exists; provider, plugin,
  routing, agent, stats, event, config metadata, and retention endpoints are
  admin-only.
- Full prompts, full responses, provider credentials, cookies, auth headers, and
  imported auth JSON must never appear in local API responses, plugin data, logs,
  audit files, or docs.

## Not Supported Yet

- Dockerized host Claude/Codex CLI runtimes by default.
- Multi-replica deployment with one SQLite volume.
- Remote plugin installation.
- Obsidian vault writes without dry-run and path guards.
