import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const dashboardPort = Number(process.env.MOLENKOPF_DASHBOARD_DEV_PORT || 5173);
const apiOrigin = process.env.MOLENKOPF_DASHBOARD_API_ORIGIN || "http://127.0.0.1:8787";

export default defineConfig({
  base: "/__molenkopf/dashboard/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: dashboardPort,
    strictPort: true,
    hmr: {
      host: "127.0.0.1",
      port: dashboardPort
    },
    proxy: {
      "^/__molenkopf/(?!dashboard(?:/|$))": { target: apiOrigin, changeOrigin: true },
      "/v1": { target: apiOrigin, changeOrigin: true }
    }
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"]
  }
});
