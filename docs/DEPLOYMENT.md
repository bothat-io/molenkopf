# Deployment

This document defines the current production deployment target for Molenkopf.
Routes, flags, and environment variables use Molenkopf names.

## Local Modes

- Development: `npm run dev`
  - Binds `127.0.0.1:8787`
  - Uses `.molenkopf/dev`
  - Starts the Vite dashboard unless `MOLENKOPF_DASHBOARD_DEV=0`
- Test server: `npm run serve:test`
  - Binds `127.0.0.1:8798`
  - Uses `.molenkopf/test`
- Local prod smoke: `npm run prod`
  - Builds the dashboard
  - Binds `127.0.0.1:8787`
  - Uses `.molenkopf/prod`

`npm run prod` is a local production profile with durable local state. Override
it with `MOLENKOPF_PROD_PORT`, `MOLENKOPF_PROD_HOST`, `MOLENKOPF_PROD_TARGET`,
and `MOLENKOPF_PROD_DATA_DIR` when needed.

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

The image starts with a safe loopback bind inside the container. For host port
publishing, override the command explicitly and provide the public-bind security
inputs:

```powershell
$adminPassword = Read-Host "Molenkopf admin password" -AsSecureString
$sessionSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$adminPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword))
docker run --rm `
  -p 127.0.0.1:8787:8787 `
  -v molenkopf-data:/data `
  -e MOLENKOPF_REQUIRE_KEY=1 `
  -e MOLENKOPF_ADMIN_PASSWORD=$adminPlain `
  -e MOLENKOPF_SESSION_SECRET=$sessionSecret `
  molenkopf:local `
  node --experimental-strip-types --experimental-sqlite --disable-warning=ExperimentalWarning packages/proxy/src/cli/main.ts proxy --host 0.0.0.0 --allow-public-bind --port 8787 --data-dir /data
```

Use a strong `MOLENKOPF_SESSION_SECRET` in real deployments. Configure provider
credentials through environment variables or a mounted config file that uses
credential references. Do not bake provider keys, imported runtime auth, or
local data into the image.

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

- Non-loopback bind requires `--allow-public-bind`.
- Public bind also requires configured admin auth, `MOLENKOPF_REQUIRE_KEY=1`,
  and a strong session secret.
- `/__molenkopf/health` is public.
- Before first admin setup, only `/__molenkopf/health`, `/__molenkopf/me`, and
  loopback-only `/__molenkopf/setup-admin` are usable.
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
