import { randomUUID } from "node:crypto";
import { redactSecrets } from "../security/secret-redactor.ts";

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

function sanitize(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return safeString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean" || value === null) return value;
  if (!value || typeof value !== "object") return undefined;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, seen));
  return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, item]) => [safeString(key), sanitize(item, seen)]));
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
