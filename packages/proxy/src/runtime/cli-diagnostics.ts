import { redactSecrets } from "../../../core/src/security/secret-redactor.ts";

export type CliLifecycleState = "unknown" | "spawned" | "stdin_sent" | "first_output" | "timeout" | "killed" | "closed" | "malformed";
export type CliErrorClass = "auth_failure" | "permission_prompt" | "timeout" | "empty_output" | "exit_error" | "spawn_error" | "unknown";

export type CliErrorDiagnostics = {
  class: CliErrorClass;
  lifecycle: { state: CliLifecycleState; events: string[] };
  permissionBlocked: boolean;
};

export function cliErrorDiagnostics(error: unknown): CliErrorDiagnostics {
  const message = safeMessage(error);
  const events = lifecycleEvents(message);
  const classification = classifyCliMessage(message);
  return {
    class: classification,
    lifecycle: { state: lifecycleState(events, classification), events },
    permissionBlocked: classification === "permission_prompt"
  };
}

export function safeCliMessage(error: unknown): string {
  const message = safeMessage(error);
  const classification = classifyCliMessage(message);
  if (classification === "auth_failure") return "Local CLI authentication failed. Re-import a current auth.json or run the runtime login command, then test again.";
  if (classification === "permission_prompt") return "Local CLI reported a permission prompt.";
  return message;
}

export function successfulCliLifecycle(): CliErrorDiagnostics["lifecycle"] {
  return { state: "closed", events: ["spawned", "stdin_sent", "first_output", "closed"] };
}

function classifyCliMessage(message: string): CliErrorClass {
  if (/output_class:auth_failure|not logged in|please run \/login|authentication|credentials/i.test(message)) return "auth_failure";
  if (/output_class:permission_prompt|requested permissions|haven't granted|permission[^.]{0,80}(denied|blocked|required)|requires permission|not allowed/i.test(message)) return "permission_prompt";
  if (/timed out after/i.test(message)) return "timeout";
  if (/returned empty output|malformed/i.test(message)) return "empty_output";
  if (/failed:/i.test(message)) return "spawn_error";
  if (/exited with/i.test(message)) return "exit_error";
  return "unknown";
}

function lifecycleEvents(message: string): string[] {
  const match = message.match(/lifecycle:\s*([^;]+)/i);
  if (!match) return [];
  return match[1].split("->").map((item) => item.trim().replace(/^\d+ms\s+/, "").slice(0, 120)).filter(Boolean);
}

function lifecycleState(events: string[], classification: CliErrorClass): CliLifecycleState {
  if (classification === "empty_output") return "malformed";
  if (events.some((event) => event.startsWith("timeout"))) return "timeout";
  if (events.some((event) => event.startsWith("kill"))) return "killed";
  if (events.some((event) => event.startsWith("close"))) return "closed";
  if (events.some((event) => event.includes("first byte"))) return "first_output";
  if (events.some((event) => event === "stdin sent")) return "stdin_sent";
  if (events.some((event) => event.startsWith("spawn"))) return "spawned";
  return "unknown";
}

function safeMessage(error: unknown): string {
  return redactSecrets(String(error instanceof Error ? error.message : error)).text.slice(0, 720);
}
