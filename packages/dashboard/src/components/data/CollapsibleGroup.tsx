import { useState, type DragEvent, type ReactNode } from "react";
import "./CollapsibleGroup.css";

export type GroupMetric = { key: string; content: ReactNode };

export function CollapsibleGroup({
  title, subtitle, metrics, actions, open, children, empty, onToggle, onDropValue
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
}) {
  const [dropActive, setDropActive] = useState(false);
  const canDrop = Boolean(onDropValue);
  return <details className={`collapsible-group${canDrop ? " can-drop" : ""}${dropActive ? " is-drop-active" : ""}`} open={open} onToggle={(event) => onToggle(event.currentTarget.open)}
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
    <summary>
      <div className="collapsible-main"><strong>{title}</strong>{subtitle ? <span>{subtitle}</span> : null}</div>
      <div className="collapsible-side">
        {metrics?.map((metric) => <span key={metric.key}>{metric.content}</span>)}
        {actions ? <span className="collapsible-actions" onClick={(event) => event.stopPropagation()}>{actions}</span> : null}
      </div>
    </summary>
    {open ? children : empty || null}
  </details>;
}

function isUserDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("text/molenkopf-user");
}
