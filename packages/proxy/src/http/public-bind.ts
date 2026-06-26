export function isLoopbackBindHost(host: string): boolean {
  const value = host.toLowerCase();
  return value === "localhost" || value === "::1" || value === "[::1]" || /^127(?:\.|$)/.test(value);
}

export function requirePublicBindFlag(host: string, allowPublicBind?: boolean): void {
  if (!isLoopbackBindHost(host) && !allowPublicBind) throw new Error("public bind requires --allow-public-bind");
}
