export type DestructiveAction = "remove-user" | "remove-team" | "remove-provider" | "revoke-key";

export function confirmDestructive(action: DestructiveAction, id: string, confirmFn = window.confirm): boolean {
  return confirmFn(`${labelFor(action)} "${id}"?`);
}

function labelFor(action: DestructiveAction): string {
  if (action === "remove-user") return "Remove user";
  if (action === "remove-team") return "Remove team";
  if (action === "remove-provider") return "Remove provider";
  return "Revoke API key";
}
