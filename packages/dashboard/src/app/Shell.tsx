import type { ReactNode } from "react";
import type { UserView } from "./types";
import type { DashboardTab } from "./hooks";
import type { ConnectionStatus } from "./refresh";

const logoSrc = `${import.meta.env.BASE_URL}molenkopf-logo.png`;

export function Shell(props: {
  user?: UserView;
  canManage: boolean;
  activeTab: DashboardTab;
  onTab: (tab: DashboardTab) => void;
  onLogout: () => void;
  connection?: ConnectionStatus;
  children: ReactNode;
}) {
  const tabs: DashboardTab[] = props.canManage ? ["overview", "admin"] : ["overview"];
  const connection = props.connection ?? "connected";
  return (
    <div className={`wrap ${connection === "syncing" ? "syncing" : ""}`.trim()}>
      <header className="topbar">
        <button className="brand-title" type="button" onClick={() => props.onTab("overview")} aria-label="Open Molenkopf overview">
          <img className="brand-mark" src={logoSrc} alt="" aria-hidden="true" />
          <span className="brand-word">Molenkopf</span>
        </button>
        <div className="status">
          {props.user ? <span>{props.user.displayName || props.user.id}</span> : null}
          {props.user ? <button className="ghost" onClick={props.onLogout}>Sign out</button> : null}
          <span className="conn-pill"><span className={connection === "offline" ? "idle" : "live"} />{connection}</span>
        </div>
      </header>
      <nav className="toptabs" role="tablist" aria-label="Dashboard sections">
        {tabs.map((tab) => (
          <button key={tab} role="tab" aria-selected={props.activeTab === tab} className={props.activeTab === tab ? "on" : ""} onClick={() => props.onTab(tab)}>
            {tab === "overview" ? "Overview" : "Admin"}
          </button>
        ))}
      </nav>
      <main>{props.children}</main>
    </div>
  );
}
