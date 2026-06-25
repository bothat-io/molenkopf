import type { RuntimeState } from "./runtime-state.ts";
import { authRequired } from "./auth-state.ts";

export function isLoopbackBindHost(host: string): boolean {
  const value = host.toLowerCase();
  return value === "localhost" || value === "::1" || value === "[::1]" || /^127(?:\.|$)/.test(value);
}

export function requirePublicBindFlag(host: string, allowPublicBind?: boolean): void {
  if (!isLoopbackBindHost(host) && !allowPublicBind) throw new Error("public bind requires --allow-public-bind");
}

export function requirePublicBindSecurity(host: string, state: RuntimeState, requireProxyKey: boolean): void {
  if (isLoopbackBindHost(host)) return;
  if (!authRequired(state) || !requireProxyKey) {
    throw new Error("public bind requires configured admin auth and MOLENKOPF_REQUIRE_KEY=1");
  }
  if (!strongSessionSecret(process.env.MOLENKOPF_SESSION_SECRET)) {
    throw new Error("public bind requires a strong MOLENKOPF_SESSION_SECRET");
  }
}

function strongSessionSecret(value: string | undefined): boolean {
  return typeof value === "string" && value.length >= 32;
}
