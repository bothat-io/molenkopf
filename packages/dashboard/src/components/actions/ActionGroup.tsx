import type { ReactNode } from "react";
import "./ActionGroup.css";

export function ActionGroup({ children, as = "div", className = "" }: { children: ReactNode; as?: "div" | "span"; className?: string }) {
  const Component = as;
  return <Component className={`ctl action-group ${className}`.trim()}>{children}</Component>;
}
