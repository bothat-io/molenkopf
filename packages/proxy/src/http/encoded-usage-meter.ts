import { createBrotliDecompress, createGunzip, createInflate, type BrotliDecompress, type Gunzip, type Inflate } from "node:zlib";
import { createUsageMeter, type UsageTotals as MeterTotals } from "../../../core/src/manifest/usage-meter.ts";

type DecodeStream = BrotliDecompress | Gunzip | Inflate;

export type ResponseUsageScanner = {
  feed(chunk: Buffer): void;
  finish(): Promise<MeterTotals>;
};

export function createResponseUsageScanner(encoding: string | undefined): ResponseUsageScanner {
  const meter = createUsageMeter();
  const decoder = decoderFor(encoding);
  if (!decoder) return { feed: (chunk) => meter.feed(chunk), finish: async () => meter.result() };
  const done = new Promise<void>((resolve) => {
    decoder.on("data", (chunk: Buffer) => meter.feed(chunk));
    decoder.on("end", resolve);
    decoder.on("error", resolve);
  });
  return {
    feed(chunk) { decoder.write(chunk); },
    async finish() { decoder.end(); await done; return meter.result(); }
  };
}

function decoderFor(encoding: string | undefined): DecodeStream | undefined {
  const name = encoding?.split(",")[0]?.trim().toLowerCase();
  if (name === "gzip") return createGunzip();
  if (name === "br") return createBrotliDecompress();
  if (name === "deflate") return createInflate();
  return undefined;
}
