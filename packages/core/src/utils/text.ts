export function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

export function truncateValue(value: unknown, max = 240): unknown {
  if (typeof value === "string" && value.length > max) {
    return `${value.slice(0, max)}...[truncated ${value.length - max} chars]`;
  }
  if (Array.isArray(value)) return value.map((item) => truncateValue(item, max));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, truncateValue(v, max)]));
  }
  return value;
}
