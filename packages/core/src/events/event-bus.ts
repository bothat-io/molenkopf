import { randomUUID } from "node:crypto";
import { redactSecrets } from "../security/secret-redactor.ts";
import { shortHash } from "../utils/hash.ts";

export type MolenkopfEvent = {
  id: string;
  type: "request_started" | "request_compressed" | "request_forwarded" | "request_finished" | "request_failed" | "request_warning" | "plugin_event" | "warning";
  timestamp: string;
  requestId?: string;
  data?: Record<string, unknown>;
};

export class EventBus {
  private clients = new Set<(event: MolenkopfEvent) => void>();
  private history: MolenkopfEvent[] = [];

  emit(type: MolenkopfEvent["type"], data: Omit<MolenkopfEvent, "id" | "type" | "timestamp"> = {}): MolenkopfEvent {
    const event = deepFreeze({ id: randomUUID(), type, timestamp: new Date().toISOString(), requestId: safeString(data.requestId), data: safeData(data.data) });
    this.history.push(event);
    this.history = this.history.slice(-100);
    for (const client of [...this.clients]) this.deliver(client, event);
    return event;
  }

  subscribe(client: (event: MolenkopfEvent) => void): () => void {
    this.clients.add(client);
    for (const event of this.history) if (!this.deliver(client, event)) break;
    return () => this.clients.delete(client);
  }

  private deliver(client: (event: MolenkopfEvent) => void, event: MolenkopfEvent): boolean {
    try {
      client(event);
      return true;
    } catch {
      this.clients.delete(client);
      return false;
    }
  }
}

function safeData(value: unknown, seen = new WeakSet<object>()): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return sanitize(value, seen) as Record<string, unknown>;
}

function sanitize(value: unknown, seen: WeakSet<object>, key?: string): unknown {
  if (key && isSensitiveKey(key)) return sensitiveMarker(key, value);
  if (typeof value === "string") return safeString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean" || value === null) return value;
  if (!value || typeof value !== "object") return undefined;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, seen));
  return Object.fromEntries(Object.entries(value).slice(0, 50).map(([itemKey, item]) => [safeString(itemKey), sanitize(item, seen, itemKey)]));
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return redactSecrets(value).text.slice(0, 512);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return /(?:^|[_-])(?:password|passwd|pwd|token|authorization|auth|cookie|secret|api[_-]?key|credential|private[_-]?key)(?:$|[_-])/i.test(normalized);
}

function sensitiveMarker(key: string, value: unknown): string {
  const kind = key.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "secret";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `[REDACTED_SECRET:event_${kind}:sha256:${shortHash(text ?? "")}]`;
}
