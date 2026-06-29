import type { AuditContentFingerprint } from "../manifest/audit-fingerprints.ts";
import { localFingerprint } from "../security/local-fingerprint.ts";

type FingerprintTarget = { contentFingerprints: AuditContentFingerprint[] };
type FingerprintResult = {
  kind: string;
  compressed: boolean;
  reason: string;
  compressorName?: string;
  metrics: { originalBytes: number; originalTokens: number };
};
type FingerprintOptions = { fingerprintSecret?: string; observe?: boolean };

export function addCompressionFingerprint(target: FingerprintTarget, original: string, result: FingerprintResult, options: FingerprintOptions): void {
  if (!options.fingerprintSecret || target.contentFingerprints.length >= 50) return;
  target.contentFingerprints.push({
    hash: localFingerprint(`${result.kind}\0${original}`, options.fingerprintSecret),
    contentKind: result.kind,
    originalBytes: result.metrics.originalBytes,
    estimatedOriginalTokens: result.metrics.originalTokens,
    compressed: result.compressed && !options.observe,
    compressorName: result.compressorName,
    skipReason: result.compressed && options.observe ? "observe_only" : result.compressed ? undefined : result.reason
  });
}
