import { useEffect } from "react";

const DEV_REVISION_URL = "/__molenkopf/dev/revision";
export const DEV_REVISION_INTERVAL_MS = 5000;

export function useDevRevisionReload(active = true): void {
  useEffect(() => {
    if (!active) return;
    let revision = "";
    let enabled = false;
    const check = async () => {
      try {
        const res = await fetch(DEV_REVISION_URL, { cache: "no-store" });
        if (!res.ok) {
          if (!enabled) window.clearInterval(timer);
          return;
        }
        enabled = true;
        const data = await res.json();
        if (!data.revision) return;
        if (!revision) {
          revision = data.revision;
          return;
        }
        if (revision !== data.revision) window.location.reload();
      } catch {}
    };
    const timer = window.setInterval(check, DEV_REVISION_INTERVAL_MS);
    check();
    return () => window.clearInterval(timer);
  }, [active]);
}

export type DashboardTab = "overview" | "admin";

export function tabFromPath(): DashboardTab {
  const tab = window.location.pathname.split("/").filter(Boolean).pop();
  return tab === "admin" ? tab : "overview";
}

export function tabPath(tab: DashboardTab): string {
  return `/__molenkopf/dashboard/${tab}`;
}
