import { FormEvent, useState } from "react";
import { postJson } from "../../app/api";
import { BudgetFields, budgetFromForm } from "../../components/forms/BudgetControls";
import { DialogError, DialogFrame, messageOf } from "../../components/modal/DialogFrame";
import { CheckboxGrid, FormActionBar, FormField, FormGrid, RadioButtonChoice, type ChoiceOption } from "../../components/forms/FormControls";
import type { ProviderView, TeamView } from "../../app/types";

export function TeamDialog({ close, reload, team, providers }: { close: () => void; reload: () => void; team?: TeamView; providers: ProviderView[] }) {
  const [error, setError] = useState("");
  const [providerMode, setProviderMode] = useState(team?.allowedProviders && team.allowedProviders !== "*" ? "custom" : "all");
  const providerOptions = providerChoiceOptions(providers, team);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const allowedProviders = providerMode === "all" ? "*" : providerOptions.filter((provider) => f.get(`provider:${provider.id}`) === "on").map((provider) => provider.id);
    try { await postJson("/__molenkopf/identity/teams", { id: team?.id, name: f.get("name"), allowedProviders, budget: budgetFromForm(f) }); reload(); close(); } catch (err) { setError(messageOf(err, "save_failed")); }
  }
  return <DialogFrame title={team ? "Edit team" : "New team"}><form onSubmit={submit} className="form-panel" autoComplete="off">
    <FormGrid><FormField label="Name"><input name="name" required defaultValue={team?.name || ""} autoComplete="off" /></FormField></FormGrid>
    <RadioButtonChoice label="Allowed providers" name="provider-mode" value={providerMode} onChange={setProviderMode} options={[{ id: "all", label: "All" }, { id: "custom", label: "Custom" }]} />
    {providerMode === "custom" ? <CheckboxGrid label="Provider access" namePrefix="provider" options={providerOptions} selectedIds={team?.allowedProviders === "*" ? [] : team?.allowedProviders} /> : null}
    <BudgetFields budget={team?.budget} />
    <DialogError value={error} /><FormActionBar primary="Save" onAbort={close} />
  </form></DialogFrame>;
}

function providerChoiceOptions(providers: ProviderView[], team?: TeamView): ChoiceOption[] {
  const items = providers.filter((provider) => provider.id !== "default").map((provider) => ({ id: provider.id, label: provider.name || provider.id, meta: provider.enabled === false ? "disabled" : provider.kind || undefined }));
  const known = new Set(items.map((item) => item.id));
  const existing = team?.allowedProviders === "*" ? [] : team?.allowedProviders || [];
  for (const id of existing) if (!known.has(id)) items.push({ id, label: id, meta: "not configured" });
  return items;
}
