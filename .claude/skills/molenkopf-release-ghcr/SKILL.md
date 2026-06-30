---
name: molenkopf-release-ghcr
description: Molenkopf release workflow memory for preview-to-main PR promotion, GHCR Docker publishing, protected npm publishing, preview testing, SemVer tag handling, and README update timing. Use when changing release.yml, targeting preview, merging to main, tagging releases, publishing containers, testing GHCR images, bumping versions, publishing npm packages, or documenting install instructions.
---

# Molenkopf GHCR Release Workflow

Use this workflow when working on Molenkopf releases or Docker publishing.

## Agent Rule

- Read this skill before integration, preview, main, Docker, or version work.
- State the active step by number and name while working.
- Do not merge locally into `preview` or `main`.
- Do not push directly to `preview` or `main` unless the user explicitly asks
  for a repository-maintainer exception.
- Use GitHub PRs for all branch promotion.

## Preview To Main Flow

1. Work on a fix or release branch.
2. Commit only intentional files; keep ignored artifacts such as `fixme.md`,
   `.env`, and local ZIPs out of commits.
3. Push the branch and open a GitHub PR into `preview`.
4. Wait for preview PR checks, including Docker/release gates when configured.
5. Merge into `preview` only through GitHub after the PR is green.
6. Keep `preview` as the persistent integration branch; do not delete or locally
   fast-forward it as a substitute for PR promotion.
7. When preview is accepted, open a second GitHub PR from `preview` into `main`.
8. Merge into `main` only through GitHub after the main PR is green.
9. Make version bumps such as `0.2.0` in a release PR or a clearly scoped
   release commit, not hidden inside unrelated fixes.

## Current Policy

- Treat `main` as the source for official releases.
- Treat `preview` as the persistent integration branch before `main`.
- Keep npm publishing manual and protected.
- Ship Docker automatically from official SemVer tags; ship npm manually after
  the same release commit has passed validation.
- Publish official Docker releases from SemVer tags matching `v*.*.*`.
- Do not create extra official SemVer tags just to test workflow changes.
- Do not move or recreate a published official tag after GHCR images exist.
- Do not add Major/Minor floating tags like `:0` or `:0.1` yet.
- Keep `latest` only for official `v*.*.*` tag releases.
- Do not merge a release PR until the required PR checks are green on the
  current PR head. Do not rely on local checks alone for this decision.
- Create official `v*.*.*` tags only after the PR has merged to `main` and
  the `main` push test workflow is green.

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
2. Wait for required PR checks to pass on the exact PR head commit.
3. Merge the PR through GitHub using the repository's required merge method.
4. Wait for the `main` push test workflow to pass on the merged `main` commit.
5. Sync local `main` to `origin/main` after the GitHub merge. If GitHub used a
   squash merge, expect old local commits to diverge; do not continue while
   `main` shows ahead/behind.
6. Run `npm run release:verify` from clean synced `main`.
7. Use the next real version tag only when the release should be official.
8. Push the tag and wait for GHCR Docker publishing to finish.
9. For npm, tell the user to run
   `npm run release:npm:publish -- --tag vX.Y.Z` as the final manual step.
10. If more workflow testing is needed, add an explicit preview tag path first.

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
- The first `npm publish --access public` creates the org-scoped package when it
  does not already exist.
- Keep npm publish manual/protected until the release policy is stable.
- On tag-triggered release runs, `publish-npm` is expected to be skipped unless
  the workflow is manually dispatched with the protected publish inputs.
- Do not store npm usernames, passwords, 2FA codes, access tokens, or recovery
  codes in repo files, skills, docs, Docker images, or workflow logs.
- First validate from clean tagged `main`: `npm run release:verify`.
- For a local manual publish, tell the user to run
  `npm run release:npm:publish -- --tag vX.Y.Z`. The script validates the tag,
  checks that local `main` matches `origin/main`, checks the successful release
  workflow, creates a clean tag worktree, and then runs `npm publish --access
  public` interactively so the user can enter npm login or OTP prompts.
- For later automation, prefer npm Trusted Publishing from a protected GitHub
  Actions environment. If that is not available, use a granular automation token
  only as a protected GitHub Actions secret/environment secret. Do not commit it.
