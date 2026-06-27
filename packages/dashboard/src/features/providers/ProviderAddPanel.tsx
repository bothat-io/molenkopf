import { useState } from "react";
import { FormActionBar, FormField, FormGrid, FormNote, RadioButtonChoice, SelectControl } from "../../components/forms/FormControls";
import { StatusMessage } from "../../components/feedback/StatusMessage";
import { RuntimeImportForm, messageFromError } from "./RuntimeImportForm";
import type { RuntimeImportBody } from "./runtimeImportState";

type Mode = "manual" | "import";

export function ProviderAddContent({ onAdd, onImport, onTest, onAbort }: { onAdd: (body: Record<string, unknown>) => void | Promise<void>; onImport: (body: RuntimeImportBody) => void | Promise<void>; onTest: (body?: RuntimeImportBody) => RuntimeImportBody | void | Promise<RuntimeImportBody | void>; onAbort?: () => void }) {
  const [mode, setMode] = useState<Mode>("manual");
  return <div className="provider-add-content">
    <RadioButtonChoice label="Provider source" name="provider-source" value={mode} onChange={(value) => setMode(value as Mode)} options={[{ id: "manual", label: "Manual setup" }, { id: "import", label: "Import files" }]} />
    {mode === "manual" ? <ManualProviderForm onAdd={onAdd} onAbort={onAbort} /> : <RuntimeImportForm onImport={onImport} onTest={onTest} onAbort={onAbort} />}
  </div>;
}

function ManualProviderForm({ onAdd, onAbort }: { onAdd: (body: Record<string, unknown>) => void | Promise<void>; onAbort?: () => void }) {
  const [kind, setKind] = useState("openai");
  const [error, setError] = useState("");
  const isCli = kind === "cli-claude" || kind === "cli-codex";
  const noCred = isCli || kind === "local" || kind === "ollama";
  return <form className="form-panel" autoComplete="off" onSubmit={async (event) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      await onAdd({ kind, id: providerId(kind, String(f.get("name") || "")), name: f.get("name"), target: f.get("target"), credential: f.get("credential") });
      event.currentTarget.reset();
    } catch (err) {
      setError(messageFromError(err));
    }
  }}>
    <FormGrid>
      <FormField label="Provider type"><SelectControl value={kind} onChange={setKind} options={[{ id: "openai", label: "OpenAI API key" }, { id: "anthropic", label: "Anthropic API key" }, { id: "ollama", label: "Ollama local" }, { id: "local", label: "Other local OpenAI-compatible" }, { id: "cli-claude", label: "Claude CLI" }, { id: "cli-codex", label: "Codex CLI" }]} /></FormField>
      <FormField label="Name"><input name="name" placeholder="Production OpenAI" autoComplete="off" /></FormField>
      {!isCli ? <FormField label="Target URL"><input key={kind} name="target" placeholder={targetPlaceholder(kind)} defaultValue={targetPlaceholder(kind)} autoComplete="off" /></FormField> : null}
      {!noCred ? <FormField label="API token"><input name="credential" type="password" placeholder="Stored locally" autoComplete="new-password" /></FormField> : null}
    </FormGrid>
    <FormNote>{hint(kind)}</FormNote>
    {error ? <StatusMessage tone="error" title="Provider not added">{error}</StatusMessage> : null}
    <FormActionBar primary="Add provider" onAbort={onAbort} />
  </form>;
}

function providerId(kind: string, name: string): string {
  const base = slug(name || kind.replace(/^cli-/, ""));
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42) || "provider";
}

function targetPlaceholder(kind: string) {
  if (kind === "anthropic") return "https://api.anthropic.com/v1";
  if (kind === "ollama") return "http://127.0.0.1:11434/v1";
  if (kind === "local") return "http://127.0.0.1:1234/v1";
  return "https://api.openai.com/v1";
}

function hint(kind: string) {
  if (kind === "cli-claude") return "Claude CLI authenticates itself. Run claude login first.";
  if (kind === "cli-codex") return "Codex CLI authenticates itself. Run codex login first.";
  if (kind === "ollama") return "Ollama uses the local loopback default and no API token.";
  if (kind === "local") return "Local OpenAI-compatible backends need no token.";
  return "Paste API tokens only on a trusted local machine. They stay local and are never shown again.";
}
