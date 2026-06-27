export function cookieOf(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

export async function issueKey(base: string, cookie: string, project = "test"): Promise<string> {
  const res = await fetch(`${base}/__molenkopf/keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ owner: "admin", project, teamId: "everyone" })
  });
  const body = await res.json() as { secret?: string };
  if (!body.secret) throw new Error("test_key_missing");
  return body.secret;
}

export async function setupAdmin(base: string, username = "admin"): Promise<string> {
  const res = await fetch(`${base}/__molenkopf/setup-admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "admin-secret" })
  });
  return cookieOf(res);
}

export async function setupKey(base: string, project = "test"): Promise<string> {
  return issueKey(base, await setupAdmin(base), project);
}

export function auth(secret: string, headers: Record<string, string> = {}): Record<string, string> {
  return { ...headers, authorization: `Bearer ${secret}` };
}

export function localAuth(secret: string, headers: Record<string, string> = {}): Record<string, string> {
  return { ...headers, "x-molenkopf-token": secret };
}
