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
const DEFAULT_PATTERNS = [
  /please[-_\s]?change/i,
  /placeholder/i,
  /fixture/i,
  /example/i,
  /default/i,
  /test[-_\s]?only[-_\s]?session[-_\s]?secret/i
];

export function requireSessionSecret(env: Record<string, string | undefined> = process.env): string {
  const value = env.MOLENKOPF_SESSION_SECRET?.trim() ?? "";
  if (!value || value.length < MIN_LENGTH || PLACEHOLDERS.has(value.toLowerCase()) || isWeakSecret(value)) {
    throw new Error(HELP);
  }
  return value;
}

function isWeakSecret(value: string): boolean {
  if (DEFAULT_PATTERNS.some((pattern) => pattern.test(value))) return true;
  const compact = value.replace(/[^a-z0-9]/gi, "");
  if (new Set(compact.toLowerCase()).size < 8) return true;
  const unpadded = value.replace(/=+$/g, "");
  return repeatedChunk(compact.toLowerCase()) || repeatedChunk(unpadded.toLowerCase());
}

function repeatedChunk(value: string): boolean {
  if (value.length < MIN_LENGTH) return false;
  for (let size = 1; size <= 8; size += 1) {
    if (value.length % size === 0 && value.slice(0, size).repeat(value.length / size) === value) return true;
  }
  return false;
}
