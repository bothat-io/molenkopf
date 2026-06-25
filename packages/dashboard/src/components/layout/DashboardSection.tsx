import type { ReactNode } from "react";
import "./DashboardSection.css";

export function DashboardSection({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="dashboard-section"><SectionTitle label={title}>{actions}</SectionTitle>{children}</section>;
}

export function SectionTitle({ label, children }: { label: string; children?: ReactNode }) {
  return <div className="label"><span>{label}</span>{children}</div>;
}
