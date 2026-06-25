export type ConnectTool = "claude" | "codex" | "other";
export type ConnectShell = "powershell" | "cmd" | "bash";

export function shellLabel(shell: ConnectShell): string {
  return shell === "cmd" ? "CMD" : shell === "bash" ? "Bash" : "PowerShell";
}

export function connectLines(tool: ConnectTool, shell: ConnectShell, base: string, key: string): string[] {
  if (tool === "other") return openAiCompatibleLines(shell, base, key);
  const isCodex = tool === "codex";
  const urlVar = isCodex ? "OPENAI_BASE_URL" : "ANTHROPIC_BASE_URL";
  const keyVar = isCodex ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  const urlValue = base + (isCodex ? "/v1" : "");
  const command = isCodex ? codexCommand("codex", urlValue) : "claude";
  const psCommand = isCodex ? codexCommand("codex.cmd", urlValue) : "claude.cmd";
  if (isCodex && shell === "cmd") return [cmdSet(keyVar, key), command];
  if (isCodex && shell === "bash") return [bashExport(keyVar, key), command];
  if (isCodex) return [psSet(keyVar, key), psCommand];
  if (shell === "cmd") return [cmdSet(urlVar, urlValue), cmdSet(keyVar, key), command];
  if (shell === "bash") return [bashExport(urlVar, urlValue), bashExport(keyVar, key), command];
  return [psSet(urlVar, urlValue), psSet(keyVar, key), psCommand];
}

function codexCommand(binary: string, baseUrl: string): string {
  return [
    binary,
    "-c model_provider=molenkopf",
    "-c model_providers.molenkopf.name=Molenkopf",
    quoteArg(`-c model_providers.molenkopf.base_url=${baseUrl}`),
    "-c model_providers.molenkopf.env_key=OPENAI_API_KEY",
    "-c model_providers.molenkopf.wire_api=responses"
  ].join(" ");
}

function openAiCompatibleLines(shell: ConnectShell, base: string, key: string): string[] {
  const urlValue = `${base}/v1`;
  if (shell === "cmd") return [cmdSet("OPENAI_BASE_URL", urlValue), cmdSet("OPENAI_API_KEY", key), "rem Start your OpenAI-compatible tool in this shell."];
  if (shell === "bash") return [bashExport("OPENAI_BASE_URL", urlValue), bashExport("OPENAI_API_KEY", key), "# Start your OpenAI-compatible tool in this shell."];
  return [psSet("OPENAI_BASE_URL", urlValue), psSet("OPENAI_API_KEY", key), "# Start your OpenAI-compatible tool in this shell."];
}

function psSet(name: string, value: string): string {
  return `$env:${name} = '${value.replaceAll("'", "''")}'`;
}

function bashExport(name: string, value: string): string {
  return `export ${name}='${value.replaceAll("'", "'\"'\"'")}'`;
}

function cmdSet(name: string, value: string): string {
  return `set "${name}=${value.replaceAll("%", "%%").replaceAll("\r", "").replaceAll("\n", "")}"`;
}

function quoteArg(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}
