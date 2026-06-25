export type CliArgs = { command?: string; values: string[]; flags: Map<string, string | boolean> };

export function parseArgs(input: string[]): CliArgs {
  const [command, ...rest] = input;
  const flags = new Map<string, string | boolean>();
  const values: string[] = [];
  let positionalOnly = false;
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i];
    if (positionalOnly || !item.startsWith("--") || item === "-") {
      values.push(item);
      continue;
    }
    if (item === "--") {
      positionalOnly = true;
      continue;
    }
    const inline = item.indexOf("=");
    if (inline > 2) {
      flags.set(item.slice(2, inline), item.slice(inline + 1));
      continue;
    }
    const key = item.slice(2);
    if (!key) throw new Error("invalid CLI flag");
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      i++;
    } else {
      flags.set(key, true);
    }
  }
  return { command, values, flags };
}
