export type RequestTimingSnapshot = {
  authMs?: number;
  redactionMs?: number;
  classificationMs?: number;
  compressionMs?: number;
  retrievalWriteMs?: number;
  pluginMs?: number;
  upstreamConnectMs?: number;
  firstByteMs?: number;
  firstSseMs?: number;
  streamDurationMs?: number;
  totalMs?: number;
};

export class RequestTimer {
  private readonly startedAt: number;
  private readonly marks = new Map<string, number>();
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
    this.startedAt = this.now();
  }

  mark(name: string): void {
    this.marks.set(name, this.now());
  }

  snapshot(): RequestTimingSnapshot {
    return compact({
      authMs: this.duration("auth:start", "auth:end"),
      redactionMs: this.duration("redaction:start", "redaction:end"),
      classificationMs: this.duration("classification:start", "classification:end"),
      compressionMs: this.duration("compression:start", "compression:end"),
      retrievalWriteMs: this.duration("retrieval:start", "retrieval:end"),
      pluginMs: this.duration("plugin:start", "plugin:end"),
      upstreamConnectMs: this.duration("upstream:start", "upstream:connected"),
      firstByteMs: this.sinceStart("upstream:first-byte"),
      firstSseMs: this.sinceStart("upstream:first-sse"),
      streamDurationMs: this.duration("upstream:first-byte", "upstream:end"),
      totalMs: this.total()
    });
  }

  private duration(from: string, to: string): number | undefined {
    const start = this.marks.get(from);
    const end = this.marks.get(to);
    return start === undefined || end === undefined ? undefined : nonNegative(end - start);
  }

  private sinceStart(to: string): number | undefined {
    const end = this.marks.get(to);
    return end === undefined ? undefined : nonNegative(end - this.startedAt);
  }

  private total(): number {
    return nonNegative(this.now() - this.startedAt);
  }
}

function nonNegative(value: number): number {
  return Math.max(0, Math.round(value));
}

function compact(value: RequestTimingSnapshot): RequestTimingSnapshot {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
