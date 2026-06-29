import { createServer } from "node:net";

export const DASHBOARD_DEV_PORT = 5173;

export function dashboardDevEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.MOLENKOPF_DASHBOARD_DEV !== "0";
}

export function requestedDashboardDevPort(env: Record<string, string | undefined> = process.env): number {
  const port = Number(env.MOLENKOPF_DASHBOARD_DEV_PORT || DASHBOARD_DEV_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid dashboard dev port");
  return port;
}

export function dashboardDevOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export async function resolveDashboardDevPort(env: Record<string, string | undefined> = process.env): Promise<number> {
  const start = requestedDashboardDevPort(env);
  for (let port = start; port <= Math.min(65535, start + 50); port++) {
    if (await canListen(port)) return port;
  }
  throw new Error(`no free dashboard dev port found starting at ${start}`);
}

function canListen(port: number): Promise<boolean> {
  const server = createServer();
  return new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
