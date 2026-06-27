const MIN_LENGTH = 32;
const PLACEHOLDERS = new Set([
  "your-super-secret-key",
  "replace-with-at-least-32-random-characters",
  "changeme",
  "change-me",
  "secret",
  "password"
]);

const HELP = "MOLENKOPF_SESSION_SECRET is required. Copy .env.example to .env, set a unique value with at least 32 characters, and pass it to Docker with --env-file .env. For source runs, place it in ./.env or export it in your shell.";

export function requireSessionSecret(env: Record<string, string | undefined> = process.env): string {
  const value = env.MOLENKOPF_SESSION_SECRET?.trim() ?? "";
  if (!value || value.length < MIN_LENGTH || PLACEHOLDERS.has(value.toLowerCase())) {
    throw new Error(HELP);
  }
  return value;
}
