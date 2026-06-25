import { useEffect, useRef, useState } from "react";
import "./CopyButton.css";

export function CopyButton({ text, label = "Copy", copiedLabel = "Copied", errorLabel = "Copy failed", resetMs = 1400, className = "" }: { text: string; label?: string; copiedLabel?: string; errorLabel?: string; resetMs?: number; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  async function copy() {
    window.clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("error");
    }
    timerRef.current = window.setTimeout(() => setState("idle"), resetMs);
  }
  const stateClass = state === "copied" ? " is-copied" : state === "error" ? " is-error" : "";
  const textLabel = state === "copied" ? copiedLabel : state === "error" ? errorLabel : label;
  return <button type="button" className={`copy-button${stateClass} ${className}`.trim()} disabled={state !== "idle"} aria-live="polite" onClick={() => void copy()}>{textLabel}</button>;
}
