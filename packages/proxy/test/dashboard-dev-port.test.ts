import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import { dashboardDevOrigin, requestedDashboardDevPort, resolveDashboardDevPort } from "../src/cli/dashboard-dev.ts";

test("dashboard dev port helper skips an occupied requested port", async (t) => {
  const occupied = await listenOnLocalhost();
  t.after(() => occupied.server.close());

  const port = await resolveDashboardDevPort({ MOLENKOPF_DASHBOARD_DEV_PORT: String(occupied.port) });

  assert.notEqual(port, occupied.port);
  assert.equal(dashboardDevOrigin(port), `http://127.0.0.1:${port}`);
});

test("dashboard dev port helper validates explicit env values", () => {
  assert.equal(requestedDashboardDevPort({ MOLENKOPF_DASHBOARD_DEV_PORT: "5174" }), 5174);
  assert.throws(() => requestedDashboardDevPort({ MOLENKOPF_DASHBOARD_DEV_PORT: "0" }), /invalid dashboard dev port/);
});

function listenOnLocalhost(): Promise<{ server: Server; port: number }> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("missing port"));
      else resolve({ server, port: address.port });
    });
  });
}
