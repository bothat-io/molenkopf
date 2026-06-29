export type AuditContentFingerprint = {
  hash: string;
  contentKind: string;
  originalBytes: number;
  estimatedOriginalTokens: number;
  compressed: boolean;
  compressorName?: string;
  skipReason?: string;
};

export function optionalContentFingerprints(value: unknown): value is AuditContentFingerprint[] {
  return value === undefined || (Array.isArray(value) && value.every(isFingerprint));
}

export function safeContentFingerprints(value: AuditContentFingerprint[]): AuditContentFingerprint[] {
  return value.filter(isFingerprint).slice(0, 50).map((item) => ({
    hash: item.hash.toLowerCase(),
    contentKind: safeId(item.contentKind),
    originalBytes: safeNumber(item.originalBytes),
    estimatedOriginalTokens: safeNumber(item.estimatedOriginalTokens),
    compressed: item.compressed,
    compressorName: item.compressorName ? safeId(item.compressorName) : undefined,
    skipReason: item.skipReason ? safeId(item.skipReason) : undefined
  }));
}

function isFingerprint(value: unknown): value is AuditContentFingerprint {
  const item = value as AuditContentFingerprint;
  return Boolean(item && typeof item === "object" && safeHash(item.hash) && safeText(item.contentKind)
    && typeof item.originalBytes === "number" && Number.isFinite(item.originalBytes)
    && typeof item.estimatedOriginalTokens === "number" && Number.isFinite(item.estimatedOriginalTokens)
    && typeof item.compressed === "boolean" && optionalText(item.compressorName) && optionalText(item.skipReason));
}

function safeHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function optionalText(value: unknown): boolean { return value === undefined || safeText(value); }

function safeText(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_.:-]{1,80}$/i.test(value);
}

function safeId(value: string): string { return value.replace(/[^a-z0-9_.:-]/gi, "_").slice(0, 80) || "unknown"; }

function safeNumber(value: number): number { return Math.max(0, Math.trunc(value)); }
