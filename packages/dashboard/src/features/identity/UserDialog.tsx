import { FormEvent, useState } from "react";
import { postJson } from "../../app/api";
import { BudgetFields, budgetFromForm } from "../../components/forms/BudgetControls";
import { DialogError, DialogFrame, messageOf } from "../../components/modal/DialogFrame";
import { CheckboxGrid, FormActionBar, FormField, FormGrid, SelectControl } from "../../components/forms/FormControls";
import { keyPermissionIds } from "../keys/keyPermissions";
import type { UserView } from "../../app/types";

export function UserDialog({ close, reload, user }: { close: () => void; reload: () => void; user?: UserView }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const { body, password } = userDialogPayload(user, f);
    if (password) body.password = password;
    try { await postJson("/__molenkopf/identity/users", body); reload(); close(); } catch (err) { setError(messageOf(err, "save_failed")); }
  }
  return <DialogFrame title={user ? "Edit user" : "New user"}><form onSubmit={submit} className="form-panel" autoComplete="off">
    <FormGrid><FormField label="Login"><input name="id" defaultValue={user?.id || ""} disabled={Boolean(user)} autoComplete="username" /></FormField><FormField label="Display name"><input name="name" defaultValue={user?.displayName || ""} autoComplete="off" /></FormField><FormField label="Role"><SelectControl name="role" defaultValue={user?.role || "member"} options={[{ id: "member", label: "Member" }, { id: "manager", label: "Manager" }, { id: "admin", label: "Admin" }]} /></FormField><FormField label="Password"><input name="password" type="password" minLength={10} placeholder={user ? "leave blank to keep current password" : "minimum 10 characters"} autoComplete="new-password" /></FormField></FormGrid>
    <CheckboxGrid label="Access" namePrefix="access" options={[{ id: "login", label: "Login allowed", meta: "Requires a password" }]} selectedIds={!user?.disabled && !user?.loginDisabled ? ["login"] : []} />
    <CheckboxGrid label="API key permissions" namePrefix="keyperm" options={[{ id: "create", label: "Create project keys", meta: "User can issue project-bound API keys" }, { id: "revoke", label: "Revoke project keys", meta: "User can disable project-bound API keys" }]} selectedIds={keyPermissionIds(user)} />
    <BudgetFields budget={user?.budget} />
    <DialogError value={error} /><FormActionBar primary="Save" onAbort={close} />
  </form></DialogFrame>;
}

export function userDialogPayload(user: UserView | undefined, f: FormData): { body: Record<string, unknown>; password: string } {
  const password = String(f.get("password") || "");
  const body: Record<string, unknown> = {
    id: user?.id || f.get("id"), displayName: f.get("name"), role: f.get("role"),
    disabled: user?.disabled,
    loginDisabled: f.get("access:login") !== "on",
    keyPermissions: { create: f.get("keyperm:create") === "on", revoke: f.get("keyperm:revoke") === "on" },
    budget: budgetFromForm(f),
    teamIds: user?.teamIds || []
  };
  return { body, password };
}
