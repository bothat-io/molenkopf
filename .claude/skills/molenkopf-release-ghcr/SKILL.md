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
- Create official `v*.*.*` tags only after the PR has merged to `main` and
  the `main` test workflow is green.

## Known Test State

- `v0.1.0` was used to test GHCR publishing from branch
  `codex/defer-npm-publish`.
- `v0.1.1` was also published from the branch while finalizing the Docker README
  path.
- The GHCR image exists at:
  - `ghcr.io/bothat-io/molenkopf:v0.1.0`
  - `ghcr.io/bothat-io/molenkopf:0.1.0`
  - `ghcr.io/bothat-io/molenkopf:latest`
- Do not reuse `v0.1.0` for a new official release.
- Do not move or reuse `v0.1.1` either. The next official main-based release
  should bump the package version again and tag the merged `main` commit.

## Preferred Next Steps

1. Put workflow, ignore-file, and README updates into a PR to `main`.
2. Merge before creating the next official release tag.
3. Confirm the `main` push test workflow is green after the merge.
4. Use the next real version tag only when the release should be official.
5. If more workflow testing is needed, add an explicit preview tag path first.

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
- Docker starts require `MOLENKOPF_SESSION_SECRET`; pass it with
  `--env-file .env` or `-e`.
- Do not seed admin usernames or passwords through environment variables.
  Create the first admin through the normal browser first-run flow.
- `/v1/...` proxy traffic always requires a Molenkopf API key. Use
  `Authorization: Bearer mk_...`, or `x-molenkopf-token: mk_...` when
  `Authorization` must stay reserved for the upstream provider.
- The Docker quickstart should bind the published host port to loopback:
  `-p 127.0.0.1:8787:8787`.

## Documentation Timing

- README can show `docker pull ghcr.io/bothat-io/molenkopf:latest` after the
  GHCR path has been verified.
- Avoid "npm coming soon" wording while npm publishing is intentionally deferred.

## npm Publishing

- The npm package scope is `@bothat-io`; publish `@bothat-io/molenkopf`.
- The npm org is `bothat-io`. Use a maintainer account with publish rights for
  that org.
- Keep npm publish manual/protected until the release policy is stable.
- Do not store npm usernames, passwords, 2FA codes, access tokens, or recovery
  codes in repo files, skills, docs, Docker images, or workflow logs.
- First validate from clean `main`: `npm run release:verify`.
- For a local manual publish, use npm login/session auth and publish with
  `npm publish --access public` from the release commit/package.
- For later automation, prefer npm Trusted Publishing from a protected GitHub
  Actions environment. If that is not available, use a granular automation token
  only as a protected GitHub Actions secret/environment secret. Do not commit it.
