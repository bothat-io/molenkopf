import type { IncomingMessage, ServerResponse } from "node:http";
import type { EventBus, MolenkopfEvent } from "../../../core/src/events/event-bus.ts";
import { canManage, currentUser } from "./auth-state.ts";
import type { RuntimeState } from "./runtime-types.ts";

export function streamEvents(req: IncomingMessage, res: ServerResponse, events: EventBus, state: RuntimeState) {
  const cookie = req.headers.cookie ?? null;
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe?.();
    if (!res.writableEnded) res.end();
  };
  const authorized = () => {
    const user = currentUser(state, cookie);
    return canManage(state, user) && user?.loginDisabled !== true;
  };
  const writeIfAuthorized = (payload: string) => {
    if (!authorized()) return close();
    res.write(payload);
  };
  const writeEvent = (event: MolenkopfEvent) => writeIfAuthorized(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.write(": connected\n\n");
  heartbeat = setInterval(() => writeIfAuthorized(": heartbeat\n\n"), 25000);
  unsubscribe = events.subscribe(writeEvent);
  res.on("close", close);
}
