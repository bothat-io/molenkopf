export function visibleCliStepLabel(label: string): string | undefined {
  const normalized = label.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  if (/^turn\./i.test(normalized)) return undefined;
  const command = /^command_execution\s+in_progress(?:\s+-\s+(.+))?$/i.exec(normalized);
  if (command) {
    const name = command[1]?.split(/\s+/)[0]?.split(/[\\/]/).pop();
    return name ? `running command - ${name}` : "running command";
  }
  if (/^command_execution\s+completed/i.test(normalized)) return undefined;
  if (/^todo_list\b/i.test(normalized)) return "updating task list";
  if (/^exec_command_begin\b/i.test(normalized)) return "running command";
  if (/^apply_patch\b/i.test(normalized)) return "editing files";
  if (/^tool_use:\s*(.+)$/i.test(normalized)) return `using ${RegExp.$1}`;
  if (/^mcp\b/i.test(normalized)) return "using connector";
  if (/^task\b/i.test(normalized)) return "working on task";
  return normalized.slice(0, 120);
}
