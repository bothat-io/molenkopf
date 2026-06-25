import { FormEvent, useState } from "react";
import type { ReactNode } from "react";
import { postJson } from "../../app/api";
import "./DialogFrame.css";

export function DialogFrame({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return <div className="modal"><section className={`modal-card${wide ? " wide" : ""}`}><h2>{title}</h2>{children}</section></div>;
}

export function DialogFormActions({ close, save = "Save", disabled = false }: { close: () => void; save?: string; disabled?: boolean }) {
  return <div className="modal-actions"><button className="primary" type="submit" disabled={disabled}>{save}</button><button type="button" onClick={close}>Abort</button></div>;
}

export function DialogCloseAction({ close }: { close: () => void }) {
  return <div className="modal-actions"><button className="primary" type="button" onClick={close}>Close</button></div>;
}

export function DialogError({ value }: { value: string }) {
  return value ? <div className="msg">Error: {value}</div> : null;
}

export function MutationDialog({ title, close, reload, path, body, children }: { title: string; close: () => void; reload: () => void; path: string; body: (f: FormData) => Record<string, unknown>; children: ReactNode }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try { await postJson(path, body(f)); reload(); close(); } catch (err) { setError(messageOf(err, "save_failed")); }
  }
  return <DialogFrame title={title}><form onSubmit={submit} className="stack">{children}<DialogError value={error} /><DialogFormActions close={close} /></form></DialogFrame>;
}

export function messageOf(error: unknown, fallback: string): string {
  return typeof error === "object" && error && "message" in error ? String(error.message) : fallback;
}
