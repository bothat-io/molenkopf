import type { ServerResponse } from "node:http";

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
    res.write(frame.endsWith("\n\n") ? frame : `${frame}\n\n`);
  }
}

export function endSse(res: ServerResponse, chunk = ""): void {
  if (chunk) writeSse(res, chunk);
  res.end();
}

function sseFrames(chunk: string): string[] {
  return chunk.split(/\n\n/).map((item) => item.trimEnd()).filter(Boolean);
}
