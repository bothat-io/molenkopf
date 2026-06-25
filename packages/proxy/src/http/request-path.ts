export function auditPath(value: string | undefined): string {
  try {
    const url = new URL(value || "/", "http://molenkopf.local");
    return url.pathname || "/";
  } catch {
    return "/";
  }
}
