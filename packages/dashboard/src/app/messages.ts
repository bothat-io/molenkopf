import type { NoticeTone } from "../components/feedback/DashboardNotice";

export function providerTestFailure(result: Record<string, unknown>): string {
  if (typeof result.error === "string") return result.error;
  for (const key of ["auth", "permission", "model"]) {
    const check = checkOf(result[key]);
    if (check && ["failed", "missing", "blocked"].includes(check.status)) return `${key} ${check.status}: ${check.message}`;
  }
  return result.ok === false ? "not ok" : "";
}

export function noticeTone(message: string): NoticeTone {
  if (/failed|error|forbidden|unauthorized|invalid|missing|502|not ok/i.test(message)) return "error";
  if (/imported|created|saved|updated|removed|revoked|test ok|finished/i.test(message)) return "success";
  return "info";
}

function checkOf(value: unknown): { status: string; message: string } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.status === "string" ? { status: record.status, message: typeof record.message === "string" ? record.message : "" } : undefined;
}
