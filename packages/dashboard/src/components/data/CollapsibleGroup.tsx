import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import "./CollapsibleGroup.css";

export type GroupMetric = { key: string; content?: ReactNode; label?: ReactNode; value?: ReactNode };
export function CollapsiblePanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`collapsible-panel ${className}`.trim()}>{children}</div>;
}

export function CollapsibleGroup({
  title, subtitle, metrics, actions, open, children, empty, onToggle, onDropValue, summaryClassName = "", bodyClassName = "", mainClassName = "", sideClassName = ""
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  metrics?: GroupMetric[];
  actions?: ReactNode;
  open: boolean;
  children: ReactNode;
  empty?: ReactNode;
  onToggle: (open: boolean) => void;
  onDropValue?: (value: string) => void;
  summaryClassName?: string;
  bodyClassName?: string;
  mainClassName?: string;
  sideClassName?: string;
}) {
  const [dropActive, setDropActive] = useState(false);
  const [isOpen, setIsOpen] = useState(open);
  const canDrop = Boolean(onDropValue);
  useEffect(() => setIsOpen(open), [open]);
  return <details className={`collapsible-group${canDrop ? " can-drop" : ""}${dropActive ? " is-drop-active" : ""}`} open={isOpen} onToggle={(event) => { setIsOpen(event.currentTarget.open); onToggle(event.currentTarget.open); }}
    onDragEnter={(event) => { if (isUserDrag(event)) setDropActive(true); }}
    onDragOver={(event) => { if (isUserDrag(event)) event.preventDefault(); }}
    onDragLeave={() => setDropActive(false)}
    onDrop={(event) => {
      if (!onDropValue) return;
      event.preventDefault();
      setDropActive(false);
      const value = event.dataTransfer.getData("text/molenkopf-user");
      if (value) onDropValue(value);
    }}>
    <summary className={summaryClassName}>
      <div className={`collapsible-main ${mainClassName}`.trim()}><strong>{title}</strong>{subtitle ? <span>{subtitle}</span> : null}</div>
      <div className={`collapsible-side ${sideClassName}`.trim()}>
        {metrics?.map((metric) => metric.content !== undefined
          ? <span key={metric.key}>{metric.content}</span>
          : <span key={metric.key} className="collapsible-metric"><b>{metric.label}</b><span>{metric.value}</span></span>)}
        {actions ? <span className="collapsible-actions" onClick={(event) => event.stopPropagation()}>{actions}</span> : null}
      </div>
    </summary>
    {isOpen ? <div className={`collapsible-body ${bodyClassName}`.trim()}>{children}</div> : empty || null}
  </details>;
}

function isUserDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("text/molenkopf-user");
}
