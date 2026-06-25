import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../src/events/event-bus.ts";

test("EventBus replays history and supports unsubscribe", () => {
  const bus = new EventBus();
  bus.emit("request_started", { requestId: "before" });
  const seen: string[] = [];
  const unsubscribe = bus.subscribe((event) => seen.push(event.requestId ?? ""));
  bus.emit("request_finished", { requestId: "after" });
  unsubscribe();
  bus.emit("request_failed", { requestId: "ignored" });
  assert.deepEqual(seen, ["before", "after"]);
});

test("EventBus isolates throwing subscribers", () => {
  const bus = new EventBus();
  const seen: string[] = [];
  bus.subscribe(() => { throw new Error("listener failed"); });
  bus.subscribe((event) => seen.push(event.type));
  assert.doesNotThrow(() => bus.emit("warning"));
  bus.emit("request_finished");
  assert.deepEqual(seen, ["warning", "request_finished"]);
});

test("EventBus bounds replay history", () => {
  const bus = new EventBus();
  for (let i = 0; i < 105; i++) bus.emit("plugin_event", { requestId: String(i) });
  const replayed: string[] = [];
  bus.subscribe((event) => replayed.push(event.requestId ?? ""));
  assert.equal(replayed.length, 100);
  assert.equal(replayed[0], "5");
  assert.equal(replayed.at(-1), "104");
});

test("EventBus stores immutable redacted event snapshots", () => {
  const bus = new EventBus();
  const data = { message: "Authorization: Bearer raw-token", nested: { value: "password=hunter2" } };
  const event = bus.emit("plugin_event", { requestId: "req", data });
  data.message = "changed";
  data.nested.value = "changed";
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.data), true);
  assert.equal(Object.isFrozen(event.data?.nested), true);
  assert.doesNotMatch(JSON.stringify(event), /raw-token|hunter2|changed/);
  const replayed: unknown[] = [];
  bus.subscribe((item) => replayed.push(item));
  assert.deepEqual(replayed, [event]);
});
