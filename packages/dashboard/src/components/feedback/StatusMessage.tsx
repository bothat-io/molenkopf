import type { ReactNode } from "react";
import "./StatusMessage.css";

export type StatusTone = "success" | "error" | "warning" | "info" | "pending";

export function StatusMessage({ tone, title, children }: { tone: StatusTone; title?: string; children?: ReactNode }) {
  return <div className={`status-message ${tone}`} role={tone === "error" ? "alert" : "status"}>
    <span className="status-icon" aria-hidden="true" />
    <div className="status-copy">
      <strong>{title || defaultTitle(tone)}</strong>
      {children ? <span>{children}</span> : null}
    </div>
  </div>;
}

function defaultTitle(tone: StatusTone): string {
  if (tone === "success") return "OK";
  if (tone === "error") return "Error";
  if (tone === "warning") return "Warning";
  if (tone === "pending") return "Testing";
  return "Info";
}
