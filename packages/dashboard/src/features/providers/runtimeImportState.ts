export type RuntimeImportBody = Record<string, unknown>;

export function runtimeImportReady(tested: boolean, testing: boolean): boolean {
  return tested && !testing;
}

export function runtimeImportFingerprint(body: RuntimeImportBody): string {
  return JSON.stringify(["runtime", "name", "authJson", "profileText", "activate"].map((key) => [key, body[key]]));
}
