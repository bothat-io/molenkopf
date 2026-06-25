type IconName = "edit" | "key" | "trash" | "play" | "settings" | "up" | "down" | "power" | "open";

export function IconButton({ icon, label, danger, disabled, onClick }: { icon: IconName; label: string; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" className={`icon-btn${danger ? " danger" : ""}`} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{iconPath(icon)}</svg>
  </button>;
}

function iconPath(icon: IconName) {
  if (icon === "edit") return <><path d="M4 20h4l11-11-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>;
  if (icon === "key") return <><circle cx="7" cy="12" r="3" /><path d="M10 12h10" /><path d="M16 12v3" /><path d="M19 12v2" /></>;
  if (icon === "trash") return <><path d="M5 7h14" /><path d="M9 7V5h6v2" /><path d="M8 7l1 13h6l1-13" /></>;
  if (icon === "play") return <path d="M8 5v14l11-7-11-7z" />;
  if (icon === "up") return <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>;
  if (icon === "down") return <><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>;
  if (icon === "open") return <><path d="M7 7h10v10" /><path d="M7 17 17 7" /><path d="M6 12v6h6" /></>;
  if (icon === "power") return <><path d="M12 3v8" /><path d="M7 6.5a8 8 0 1 0 10 0" /></>;
  return <><circle cx="12" cy="12" r="3" /><path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="M5.6 5.6l2.1 2.1" /><path d="M16.3 16.3l2.1 2.1" /><path d="M18.4 5.6l-2.1 2.1" /><path d="M7.7 16.3l-2.1 2.1" /></>;
}
