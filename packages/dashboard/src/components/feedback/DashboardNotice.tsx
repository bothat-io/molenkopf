import { useEffect, type ReactNode } from "react";
import "./DashboardNotice.css";

export type NoticeTone = "success" | "error" | "info";

export function DashboardNotice({ tone, children, onDismiss, autoDismissMs = 4500 }: { tone: NoticeTone; children: ReactNode; onDismiss: () => void; autoDismissMs?: number }) {
  useEffect(() => {
    const delay = noticeAutoDismissMs(tone, autoDismissMs);
    if (!delay) return;
    const timer = window.setTimeout(onDismiss, delay);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, onDismiss, tone]);

  return <div className={`dashboard-notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
    <span>{children}</span>
    <button type="button" onClick={onDismiss}>Dismiss</button>
  </div>;
}

export function noticeAutoDismissMs(tone: NoticeTone, autoDismissMs = 4500): number {
  return tone === "error" ? 0 : autoDismissMs;
}
