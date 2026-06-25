import { useRef, useState } from "react";
import { ApiError } from "../../app/api";
import { FilePicker, FormActionBar, FormField, FormGrid, FormNote, RadioButtonChoice, SelectControl } from "../../components/forms/FormControls";
import { StatusMessage } from "../../components/feedback/StatusMessage";
import { runtimeImportFingerprint, runtimeImportReady, type RuntimeImportBody } from "./runtimeImportState";

type Mode = "manual" | "import";
type RuntimeKind = "codex" | "claude";
type RuntimeDraft = { runtime: RuntimeKind; name: string; authJson: string; profileText: string; authFileName: string; profileFileName: string; importProof: string };
type TestState = "idle" | "testing" | "passed";

const DEFAULT_DRAFT: RuntimeDraft = { runtime: "codex", name: "", authJson: "", profileText: "", authFileName: "", profileFileName: "", importProof: "" };

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

function RuntimeImportForm({ onImport, onTest, onAbort }: { onImport: (body: RuntimeImportBody) => void | Promise<void>; onTest: (body?: RuntimeImportBody) => RuntimeImportBody | void | Promise<RuntimeImportBody | void>; onAbort?: () => void }) {
  const [draft, setDraft] = useState<RuntimeDraft>(DEFAULT_DRAFT);
  const draftRef = useRef(draft);
  const [testState, setTestState] = useState<TestState>("idle");
  const [error, setError] = useState("");
  const testing = testState === "testing";
  const tested = testState === "passed";
  const canImport = runtimeImportReady(tested, testing);
  function setDraftState(next: RuntimeDraft | ((current: RuntimeDraft) => RuntimeDraft)) {
    setDraft((current) => {
      const value = typeof next === "function" ? next(current) : next;
      draftRef.current = value;
      return value;
    });
  }
  function update(field: keyof RuntimeDraft, value: string) {
    setDraftState((current) => ({ ...current, [field]: value, importProof: "" }));
    setTestState("idle");
    setError("");
  }
  function updateFile(textField: "authJson" | "profileText", nameField: "authFileName" | "profileFileName", text: string, fileName: string) {
    setDraftState((current) => ({ ...current, [textField]: text, [nameField]: fileName, importProof: "" }));
    setTestState("idle");
    setError("");
  }
  function updateText(textField: "authJson" | "profileText", nameField: "authFileName" | "profileFileName", text: string) {
    setDraftState((current) => ({ ...current, [textField]: text, [nameField]: "", importProof: "" }));
    setTestState("idle");
    setError("");
  }
  async function testActive() {
    setTestState("testing");
    setError("");
    const testedBody = runtimeImportBody(draftRef.current);
    const testedFingerprint = runtimeImportFingerprint(testedBody);
    try {
      const result = await onTest(testedBody);
      const importProof = typeof result?.importProof === "string" ? result.importProof : "";
      if (!importProof) throw new Error("runtime_test_proof_missing");
      if (runtimeImportFingerprint(runtimeImportBody(draftRef.current)) !== testedFingerprint) return setTestState("idle");
      setDraftState((current) => ({ ...current, importProof }));
      setTestState("passed");
    } catch (err) {
      setTestState("idle");
      setError(messageFromError(err));
    }
  }
  return <form autoComplete="off" onSubmit={async (event) => {
    event.preventDefault();
    if (!tested) return setError("Run Test active before importing.");
    try {
      await onImport({ ...runtimeImportBody(draft), importProof: draft.importProof });
    } catch (err) {
      setError(messageFromError(err));
    }
  }} className="form-panel">
    <FormGrid>
      <FormField label="Runtime"><SelectControl name="runtime" value={draft.runtime} onChange={(value) => update("runtime", value as RuntimeKind)} options={[{ id: "codex", label: "Codex auth.json + config.toml" }, { id: "claude", label: "Claude auth JSON + settings.json" }]} /></FormField>
      <FormField label="Label"><input name="name" value={draft.name} onChange={(event) => update("name", event.currentTarget.value)} placeholder="Local Codex" autoComplete="off" /></FormField>
      <FilePicker name="authFile" label="Auth file" fileName={draft.authFileName} onTextChange={(text, fileName) => updateFile("authJson", "authFileName", text, fileName)} />
      <FilePicker name="profileFile" label={configFileLabel(draft.runtime)} fileName={draft.profileFileName} onTextChange={(text, fileName) => updateFile("profileText", "profileFileName", text, fileName)} />
      <FormField label="Auth JSON" full><textarea name="authJson" value={draft.authFileName ? "" : draft.authJson} onChange={(event) => updateText("authJson", "authFileName", event.currentTarget.value)} placeholder={draft.authFileName ? `Using ${draft.authFileName}` : "Paste auth.json here"} /></FormField>
      <FormField label={configTextLabel(draft.runtime)} full><textarea name="profileText" value={draft.profileFileName ? "" : draft.profileText} onChange={(event) => updateText("profileText", "profileFileName", event.currentTarget.value)} placeholder={draft.profileFileName ? `Using ${draft.profileFileName}` : configPlaceholder(draft.runtime)} /></FormField>
    </FormGrid>
    <FormNote>{tested ? "The current form values passed the active runtime test." : "Run Test active before importing. Import auth files only on a trusted local machine."}</FormNote>
    {testing ? <StatusMessage tone="pending" title="Testing runtime">Checking the current form values.</StatusMessage> : null}
    {tested ? <StatusMessage tone="success" title="Runtime test passed">Import is enabled for the current form values.</StatusMessage> : null}
    {error ? <StatusMessage tone="error" title="Runtime test failed">{error}</StatusMessage> : null}
    <FormActionBar primary="Import & use" secondary={testing ? "Testing..." : "Test active"} primaryDisabled={!canImport} secondaryDisabled={testing} onSecondary={testActive} onAbort={onAbort} />
  </form>;
}

function runtimeImportBody(draft: RuntimeDraft): RuntimeImportBody {
  return { runtime: draft.runtime, name: draft.name, authJson: draft.authJson, profileText: draft.profileText, activate: true };
}

function configFileLabel(runtime: RuntimeKind): string {
  return runtime === "codex" ? "Config file" : "Settings file";
}

function configTextLabel(runtime: RuntimeKind): string {
  return runtime === "codex" ? "Config TOML" : "Settings JSON";
}

function configPlaceholder(runtime: RuntimeKind): string {
  return runtime === "codex" ? "Optional: paste Codex config.toml" : "Optional: paste Claude settings.json";
}

function messageFromError(err: unknown): string {
  if (err instanceof ApiError) return runtimeErrorMessage(err) || err.message;
  return err instanceof Error && knownLocalError(err.message) ? err.message : "request_failed";
}

function runtimeErrorMessage(error: ApiError): string {
  const payload = error.payload as { error?: string; auth?: { status?: string; message?: string }; model?: { status?: string; message?: string }; permission?: { status?: string; message?: string }; lifecycle?: { state?: string } } | undefined;
  if (!payload || typeof payload !== "object") return "";
  if (payload.error) return readableRuntimeError(payload.error);
  const blocking = [["auth", payload.auth], ["permission", payload.permission]]
    .filter((item): item is [string, { status?: string; message?: string }] => Boolean(item[1]))
    .find(([, check]) => check.status === "failed" || check.status === "blocked" || check.status === "missing");
  if (blocking) return `${blocking[0]}: ${friendlyCheckMessage(blocking[1].message || blocking[1].status || "failed")}`;
  const checks = [["model", payload.model]]
    .filter((item): item is [string, { status?: string; message?: string }] => Boolean(item[1]))
    .filter(([, check]) => check.status === "failed" || check.status === "blocked" || check.status === "missing")
    .map(([label, check]) => `${label}: ${friendlyCheckMessage(check.message || check.status || "failed")}`);
  const lifecycle = payload.lifecycle?.state && payload.lifecycle.state !== "unknown" ? `lifecycle: ${payload.lifecycle.state}` : "";
  return [...checks, lifecycle].filter(Boolean).join(" - ");
}

export function friendlyCheckMessage(message: string): string {
  if (/output_class:auth_failure|local cli provider exited|authentication failed/i.test(message)) return "Local CLI authentication failed. Re-import a current auth.json or run the runtime login command, then test again.";
  if (/permission prompt/i.test(message)) return "Local CLI reported a permission prompt.";
  return knownLocalError(message) ? message : "runtime_check_failed";
}

export function readableRuntimeError(code: string): string {
  if (code === "invalid_sandbox") return "Unsupported Codex sandbox value in config.toml. Use read-only, workspace-write, or danger-full-access.";
  if (code === "invalid_approval") return "Unsupported Codex approval value in config.toml. Use untrusted, on-failure, on-request, or never.";
  if (code === "invalid_auth_json") return "Auth file is not valid JSON.";
  if (code === "missing_auth_json") return "Add an auth.json file or paste auth JSON before testing.";
  if (code === "invalid_profile_json") return "Settings file is not valid JSON.";
  return code;
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

function knownLocalError(message: string): boolean {
  return /^[a-z][a-z0-9_:-]{0,80}$/i.test(message);
}
