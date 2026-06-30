# Molenkopf Open Follow-Up

Resolved findings and completed work packages were removed after verification on
2026-06-30. This file now tracks only work that is still intentionally open.

## Open Work Packages

[ ] Centralize team-scope and default-team helpers
Priority: medium
Agent: Refactor
Reason: Default-team handling is still implemented in more than one module. The
access-control bugs around `everyone` have been fixed, but a shared helper would
reduce future regression risk.
Files: `packages/proxy/src/http/runtime-plugin-policy.ts`;
`packages/proxy/src/http/local-api-scope.ts`;
`packages/proxy/src/http/proxy-identity.ts`; new
`packages/proxy/src/http/team-scope.ts`; related tests under
`packages/proxy/test/`
Depends on: none
Steps:
1. Extract shared helpers for default-team detection, effective non-default team
   IDs, readable data teams, and policy teams.
2. Replace local ad-hoc team filtering in runtime plugin policy, local API scope,
   and proxy identity with the shared helper.
3. Add focused unit tests for the helper, including `["everyone"]`,
   `["everyone", "alpha"]`, multiple non-default teams, empty team lists, admin,
   manager, and member cases.
Tests: Add `packages/proxy/test/team-scope.test.ts` and keep the existing
policy/scope route regressions passing.
Verify: `node --experimental-strip-types --experimental-sqlite --disable-warning=ExperimentalWarning --import ./packages/proxy/test/setup.ts --test --test-concurrency=1 packages/proxy/test/team-scope.test.ts packages/proxy/test/plugin-effective-runtime.test.ts packages/proxy/test/identity-usage-scope.test.ts`
Done when: Team-scope behavior has one implementation, one test suite, and no
remaining first-team/default-team ad-hoc access-control decisions in the
affected modules.
