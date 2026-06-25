import { MutationDialog } from "../../components/modal/DialogFrame";
import type { ProviderView } from "../../app/types";

export function ProviderOptionsDialog({ close, reload, provider }: { close: () => void; reload: () => void; provider?: ProviderView }) {
  if (!provider) return null;
  return <MutationDialog title="Provider options" close={close} reload={reload} path="/__molenkopf/providers/update" body={(f) => providerOptionsBody(provider, f)}>
    <label>Name<input name="name" defaultValue={provider.name || provider.id} /></label><label>Status<select name="enabled" defaultValue={provider.enabled === false ? "false" : "true"}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>{provider.kind !== "cli" ? <label>Target URL<input name="target" defaultValue={provider.target || ""} /></label> : <p className="hint">Runtime target is managed by the imported local client profile.</p>}<label className="checkline"><input name="distribution" type="checkbox" defaultChecked={provider.allowDistribution ?? provider.kind !== "cli"} /> Allow weighted routing</label>
  </MutationDialog>;
}

export function providerOptionsBody(provider: ProviderView, f: FormData): Record<string, unknown> {
  return { id: provider.id, name: f.get("name"), enabled: f.get("enabled") === "true", allowDistribution: f.get("distribution") === "on", target: provider.kind === "cli" ? undefined : f.get("target") };
}
