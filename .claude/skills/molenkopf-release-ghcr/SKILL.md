---
name: molenkopf-release-ghcr
description: Molenkopf release workflow memory for GHCR Docker publishing, npm deferral, preview testing, SemVer tag handling, and README update timing. Use when changing release.yml, tagging releases, publishing containers, testing GHCR images, or documenting Docker install instructions.
---

# Molenkopf GHCR Release Workflow

Use this workflow when working on Molenkopf releases or Docker publishing.

## Current Policy

- Treat `main` as the source for official releases.
- Keep npm publishing manual and protected.
- Publish official Docker releases from SemVer tags matching `v*.*.*`.
- Do not create extra official SemVer tags just to test workflow changes.
- Do not move or recreate a published official tag after GHCR images exist.
- Do not add Major/Minor floating tags like `:0` or `:0.1` yet.
- Keep `latest` only for official `v*.*.*` tag releases.

## Known Test State

- `v0.1.0` was used to test GHCR publishing from branch
  `codex/defer-npm-publish`.
- The GHCR image exists at:
  - `ghcr.io/bothat-io/molenkopf:v0.1.0`
  - `ghcr.io/bothat-io/molenkopf:0.1.0`
  - `ghcr.io/bothat-io/molenkopf:latest`
- Do not reuse `v0.1.0` for a new official release.

## Preferred Next Steps

1. Put workflow, ignore-file, and README updates into a PR to `main`.
2. Merge before creating the next official release tag.
3. Use the next real version tag only when the release should be official.
4. If more workflow testing is needed, add an explicit preview tag path first.

## Preview Release Rule

If test tags are needed, add support for tags such as `preview-v*.*.*` before
using them. Preview tags should publish only preview container tags, for example:

- `ghcr.io/bothat-io/molenkopf:preview-v0.1.1`
- `ghcr.io/bothat-io/molenkopf:preview`

Preview tags must not publish `latest`, must not publish npm, and must not be
documented as the stable install path.

## Official Docker Tags

For an official Git tag `v0.1.2`, publish:

- `ghcr.io/bothat-io/molenkopf:v0.1.2`
- `ghcr.io/bothat-io/molenkopf:0.1.2`
- `ghcr.io/bothat-io/molenkopf:latest`

Use `docker/metadata-action` with explicit tags. Keep `publish-docker`
dependent on the validated Docker image artifact, not a rebuilt image.

## Local Container Test Notes

- The active Docker context may be remote, such as `proxmox-docker`.
- If the Docker context is remote, host port mappings are exposed on that remote
  Docker host, not necessarily on local Windows `127.0.0.1`.
- For public bind tests, start with `--host 0.0.0.0 --allow-public-bind` and set:
  - `MOLENKOPF_REQUIRE_KEY=1`
  - `MOLENKOPF_ADMIN_PASSWORD`
  - `MOLENKOPF_SESSION_SECRET`
- With `MOLENKOPF_ADMIN_PASSWORD`, use `/__molenkopf/login`; do not expect
  `/__molenkopf/setup-admin` to be available on public bind.

## Documentation Timing

- README can show `docker pull ghcr.io/bothat-io/molenkopf:latest` after the
  GHCR path has been verified.
- Avoid "npm coming soon" wording while npm publishing is intentionally deferred.
