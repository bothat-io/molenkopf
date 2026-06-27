import { useRef, useState } from "react";
import { ApiError } from "../../app/api";
import { FilePicker, FormActionBar, FormField, FormGrid, FormNote, SelectControl } from "../../components/forms/FormControls";
import { StatusMessage } from "../../components/feedback/StatusMessage";
import { runtimeImportFingerprint, runtimeImportReady, type RuntimeImportBody } from "./runtimeImportState";

type RuntimeKind = "codex" | "claude";
export type RuntimeDraft = { runtime: RuntimeKind; name: string; authJson: string; profileText: string; authFileName: string; profileFileName: string; importProof: string };
type TestState = "idle" | "testing" | "passed";

const DEFAULT_DRAFT: RuntimeDraft = { runtime: "codex", name: "", authJson: "", profileText: "", authFileName: "", profileFileName: "", importProof: "" };

export function RuntimeImportForm({ onImport, onTest, onAbort }: { onImport: (body: RuntimeImportBody) => void | Promise<void>; onTest: (body?: RuntimeImportBody) => RuntimeImportBody | void | Promise<RuntimeImportBody | void>; onAbort?: () => void }) {
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
  function switchRuntime(runtime: RuntimeKind) {
    setDraftState((current) => clearRuntimeDraft(current, { runtime, name: current.name }));
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
  function clearDraftAndAbort() {
    setDraftState(DEFAULT_DRAFT);
    setTestState("idle");
    setError("");
    onAbort?.();
  }
  return <form autoComplete="off" onSubmit={async (event) => {
    event.preventDefault();
    if (!tested) return setError("Run Test active before importing.");
    try {
      await onImport({ ...runtimeImportBody(draft), importProof: draft.importProof });
      setDraftState(DEFAULT_DRAFT);
      setTestState("idle");
      setError("");
    } catch (err) {
      setError(messageFromError(err));
    }
  }} className="form-panel">
    <FormGrid>
      <FormField label="Runtime"><SelectControl name="runtime" value={draft.runtime} onChange={(value) => switchRuntime(value as RuntimeKind)} options={[{ id: "codex", label: "Codex auth.json + config.toml" }, { id: "claude", label: "Claude auth JSON + settings.json" }]} /></FormField>
      <FormField label="Label"><input name="name" value={draft.name} onChange={(event) => update("name", event.currentTarget.value)} placeholder="Local Codex" autoComplete="off" /></FormField>
      <FilePicker name="authFile" label="Auth file" fileName={draft.authFileName} onError={setError} onTextChange={(text, fileName) => updateFile("authJson", "authFileName", text, fileName)} />
      <FilePicker name="profileFile" label={configFileLabel(draft.runtime)} fileName={draft.profileFileName} onError={setError} onTextChange={(text, fileName) => updateFile("profileText", "profileFileName", text, fileName)} />
      <FormField label="Auth JSON" full><textarea name="authJson" value={draft.authFileName ? "" : draft.authJson} onChange={(event) => updateText("authJson", "authFileName", event.currentTarget.value)} placeholder={draft.authFileName ? `Using ${draft.authFileName}` : "Paste auth.json here"} /></FormField>
      <FormField label={configTextLabel(draft.runtime)} full><textarea name="profileText" value={draft.profileFileName ? "" : draft.profileText} onChange={(event) => updateText("profileText", "profileFileName", event.currentTarget.value)} placeholder={draft.profileFileName ? `Using ${draft.profileFileName}` : configPlaceholder(draft.runtime)} /></FormField>
    </FormGrid>
    <FormNote>{tested ? "The current form values passed the active runtime test." : "Run Test active before importing. Import auth files only on a trusted local machine."}</FormNote>
    {testing ? <StatusMessage tone="pending" title="Testing runtime">Checking the current form values.</StatusMessage> : null}
    {tested ? <StatusMessage tone="success" title="Runtime test passed">Import is enabled for the current form values.</StatusMessage> : null}
    {error ? <StatusMessage tone="error" title="Runtime test failed">{error}</StatusMessage> : null}
    <FormActionBar primary="Import & use" secondary={testing ? "Testing..." : "Test active"} primaryDisabled={!canImport} secondaryDisabled={testing} onSecondary={testActive} onAbort={clearDraftAndAbort} />
  </form>;
}

export function runtimeImportBody(draft: RuntimeDraft): RuntimeImportBody {
  return { runtime: draft.runtime, name: draft.name, authJson: draft.authJson, profileText: draft.profileText, activate: true };
}

export function clearRuntimeDraft(current: RuntimeDraft, keep: Partial<Pick<RuntimeDraft, "runtime" | "name">> = {}): RuntimeDraft {
  return { ...DEFAULT_DRAFT, runtime: keep.runtime ?? current.runtime, name: keep.name ?? "" };
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

export function messageFromError(err: unknown): string {
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

function knownLocalError(message: string): boolean {
  return /^[a-z][a-z0-9_:-]{0,80}$/i.test(message);
}
