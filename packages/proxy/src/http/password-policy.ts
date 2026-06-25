export const MIN_PASSWORD_LENGTH = 10;

export function isWeakPassword(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && value.length < MIN_PASSWORD_LENGTH;
}
