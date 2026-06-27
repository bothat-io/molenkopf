---
name: molenkopf-fixme-backlog
description: Maintain Molenkopf FIXME.md as a current evidence-based engineering backlog. Use when reviewing, pruning, updating, or validating FIXME.md; when another agent provides review output; or when deciding which backlog items are stale versus still real.
---

# Molenkopf FIXME Backlog

Use this skill when maintaining `FIXME.md` in the Molenkopf repository.

## Policy

- Keep `FIXME.md` as a current engineering backlog, not a historical review log.
- Remove old snapshot claims and anything no longer current before formatting
  the remaining items.
- Keep every remaining open item as a `[ ]` work package.
- Do not keep entries about missing files when the files exist and the contract
  checks pass.
- Do not keep `[x]` completed items in `FIXME.md`; completed work belongs in
  commits, PR notes, or release notes.
- Keep the file below the repository handwritten-file line limit.
- Keep entries in English.
- Do not include private notes, secrets, API keys, or user-specific context.

## Review Workflow

1. Read `FIXME.md`.
2. Verify each claim against the current workspace before trusting it.
3. Remove stale items instead of preserving them for context.
4. Convert the remaining real issues into `[ ]` work packages.
5. Keep only actionable issues with affected files and a verification command.
6. Prefer focused checks first, then broader gates when a block is changed.

## Stale Item Signals

Treat an entry as stale when any of these are true:

- It says files are absent but `rg --files` or `Test-Path` shows them.
- It says Docker/package/source contracts are broken but these pass:
  - `npm run check:source-completeness`
  - `npm run check:container-contract`
  - `npm run check:package`
- It describes npm publishing, GHCR tagging, or release behavior that has moved
  into the release workflow skill.
- It records completed work instead of an open defect.

## Entry Shape

Use this shape for remaining issues:

````markdown
### [ ] Short imperative or bug title

`path/to/file.ts`

Concrete current problem and why it matters.

Verify:

```bash
focused command
```
````

## Current Baseline Checks

Use these to disprove stale path/package claims:

```bash
npm run check:source-completeness
npm run check:container-contract
npm run check:package
npm run check:line-limits
```
