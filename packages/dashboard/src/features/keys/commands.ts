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
  if (isCodex && shell === "cmd") return [`set "${keyVar}=${key}"`, command];
  if (isCodex && shell === "bash") return [`export ${keyVar}="${key}"`, command];
  if (isCodex) return [`$env:${keyVar} = "${key}"`, psCommand];
  if (shell === "cmd") return [`set "${urlVar}=${urlValue}"`, `set "${keyVar}=${key}"`, command];
  if (shell === "bash") return [`export ${urlVar}="${urlValue}"`, `export ${keyVar}="${key}"`, command];
  return [`$env:${urlVar} = "${urlValue}"`, `$env:${keyVar} = "${key}"`, psCommand];
}

function codexCommand(binary: string, baseUrl: string): string {
  return [
    binary,
    "-c model_provider=molenkopf",
    "-c model_providers.molenkopf.name=Molenkopf",
    `-c model_providers.molenkopf.base_url=${baseUrl}`,
    "-c model_providers.molenkopf.env_key=OPENAI_API_KEY",
    "-c model_providers.molenkopf.wire_api=responses"
  ].join(" ");
}

function openAiCompatibleLines(shell: ConnectShell, base: string, key: string): string[] {
  const urlValue = `${base}/v1`;
  if (shell === "cmd") return [`set "OPENAI_BASE_URL=${urlValue}"`, `set "OPENAI_API_KEY=${key}"`, "rem Start your OpenAI-compatible tool in this shell."];
  if (shell === "bash") return [`export OPENAI_BASE_URL="${urlValue}"`, `export OPENAI_API_KEY="${key}"`, "# Start your OpenAI-compatible tool in this shell."];
  return [`$env:OPENAI_BASE_URL = "${urlValue}"`, `$env:OPENAI_API_KEY = "${key}"`, "# Start your OpenAI-compatible tool in this shell."];
}
