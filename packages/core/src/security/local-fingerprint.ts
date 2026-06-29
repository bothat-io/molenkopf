import { createHmac } from "node:crypto";

export function localFingerprint(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}
