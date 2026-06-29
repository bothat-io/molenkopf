import type { ServerResponse } from "node:http";
import { debugLog } from "../../../core/src/debug/debug-log.ts";

export function writeSseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  res.flushHeaders();
}

export function writeSse(res: ServerResponse, chunk: string): void {
  for (const frame of sseFrames(chunk)) {
    const text = frame.endsWith("\n\n") ? frame : `${frame}\n\n`;
    const ok = res.write(text);
    debugLog("sse", "frame", { type: frameType(frame), bytes: Buffer.byteLength(text), backpressure: !ok });
  }
}

export function endSse(res: ServerResponse, chunk = ""): void {
  if (chunk) writeSse(res, chunk);
  res.end();
}

function sseFrames(chunk: string): string[] {
  return chunk.split(/\n\n/).map((item) => item.trimEnd()).filter(Boolean);
}

function frameType(frame: string): string {
  if (frame.startsWith(":")) return "comment";
  const event = field(frame, "event");
  const data = field(frame, "data");
  if (data === "[DONE]") return "done";
  try {
    const parsed = JSON.parse(data) as { type?: unknown };
    return typeof parsed.type === "string" ? parsed.type : event || "message";
  } catch {
    return event || "message";
  }
}

function field(frame: string, name: string): string {
  return frame.split(/\n/).filter((line) => line.startsWith(`${name}:`)).map((line) => line.slice(name.length + 1).trimStart()).join("\n");
}
