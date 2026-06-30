# Token Optimizer Follow-Ups

The current branch now proves that safe coding-agent operational output can
produce real confirmed savings, and protected source/diff context does not
produce fake savings. Remaining work should stay in small, tested batches.

## High Priority

- [ ] Add protected coding-context pressure metrics.
  Track source and diff pressure separately from compressible candidate
  pressure. Never count protected pressure as potential savings.

- [ ] Surface zero-savings diagnostics in operator UI.
  The request/audit layer now records sanitized `zeroSavingsReasons`,
  `effectivePluginIds`, skip reasons, and compressor mode. Expose those fields
  in dashboard views without rendering raw request content or policy objects.

- [ ] Build dashboard controls for context-compressor settings.
  Expose mode, thresholds, body limits, candidate limits, and allowed kinds
  through existing descriptor-defined settings with server-side validation.

- [ ] Convert the token optimizer page into an actionable control surface.
  Keep mutation in `context-compressor-plugin`; make `token-optimizer-plugin`
  clearly act as advisor/control surface for the active transformer.

- [ ] Add operator-facing compression status in the plugin overview.
  Distinguish active transformer, passive observer, blocked, ineffective,
  observe-only, and no-candidate states.

## Medium Priority

- [ ] Improve operational-block detection for more agent outputs.
  Cover pytest, cargo, go test, Maven, Gradle, dotnet, CI logs, repeated
  warnings, and long stack traces while preserving safe-mode source protection.

- [ ] Add safe repeated-block optimization inside a forwarded request.
  Replace later exact duplicates of safe operational blocks with explicit
  same-request markers. Keep source/diff protected by default.

- [ ] Add prompt-cache diagnostics for source-heavy coding-agent traffic.
  Report stable prefix and tool schema readiness without logging raw prompts or
  tools, and avoid claiming confirmed savings without provider cache counters.

- [ ] Improve compression performance budgets.
  Keep body and candidate limits enforced before expensive work, avoid duplicate
  scans where practical, and record sanitized duration warnings.

- [ ] Harden retrieval-store safety for compressed originals.
  Verify redaction before storage, bounded metadata, retention behavior, and no
  raw original rendering in dashboard output.

- [ ] Add request-window clarity to optimizer metrics.
  Label recent snapshot metrics versus all-time overview metrics and show route
  bucket coverage.

- [ ] Update docs to match actual optimizer behavior.
  Document active versus observer plugins, safe compressible kinds, protected
  source/diff behavior, transform mode, and zero-savings troubleshooting.

## Release Gate

- [ ] Add an end-to-end optimizer smoke workflow after dashboard settings land.
  It should prove safe operational-output savings and protected source/diff
  explanations through one deterministic release check.
