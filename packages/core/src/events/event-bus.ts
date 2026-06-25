import { randomUUID } from "node:crypto";

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
    const event = { id: randomUUID(), type, timestamp: new Date().toISOString(), ...data };
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
