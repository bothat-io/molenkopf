export function resolveCliTarget(flags: Map<string, string | boolean>, env: Record<string, string | undefined> = process.env): string {
  const explicit = flags.get("target");
  if (typeof explicit === "string" && explicit) return explicit;
  if (env.ANTHROPIC_BASE_URL) return env.ANTHROPIC_BASE_URL;
  if (env.OPENAI_BASE_URL) return env.OPENAI_BASE_URL;
  return "https://api.openai.com/v1";
}
