import { DialogFrame } from "../../components/modal/DialogFrame";
import { KeyDialog } from "../keys/KeyDialog";
import { KeyManagerDialog } from "../keys/KeyManagerDialog";
import { ProviderAddContent } from "../providers/ProviderAddPanel";
import { ProviderOptionsDialog } from "../providers/ProviderOptionsDialog";
import { TeamDialog } from "./TeamDialog";
import { UserDialog } from "./UserDialog";
import type { ApiKeyView, ProviderView, TeamView, UserView } from "../../app/types";

export type ModalState =
  | { kind: null }
  | { kind: "key"; payload?: { owner?: UserView; team?: TeamView } }
  | { kind: "keys"; payload?: { owner?: UserView; team?: TeamView } }
  | { kind: "user"; payload?: UserView }
  | { kind: "team"; payload?: TeamView }
  | { kind: "provider-add" }
  | { kind: "provider-options"; payload: string };

type DialogProps = {
  modal: ModalState;
  close: () => void;
  reload: () => void;
  providers: ProviderView[];
  users: UserView[];
  teams: TeamView[];
  apiKeys: ApiKeyView[];
  currentUser?: UserView;
  onKeyCreated: (secret: string) => void;
  onAddProvider: (body: Record<string, unknown>) => void | Promise<void>;
  onImportAuth: (body: Record<string, unknown>) => void | Promise<void>;
  onRuntimeTest: (body?: Record<string, unknown>) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>;
};

export function Dialogs({ modal, close, reload, providers, users, teams, apiKeys, currentUser, onKeyCreated, onAddProvider, onImportAuth, onRuntimeTest }: DialogProps) {
  if (!modal.kind) return null;
  if (modal.kind === "key") return <KeyDialog close={close} reload={reload} owner={modal.payload?.owner ?? (modal.payload?.team ? undefined : currentUser)} team={modal.payload?.team} users={users} teams={teams} onKeyCreated={onKeyCreated} />;
  if (modal.kind === "keys") return <KeyManagerDialog close={close} reload={reload} owner={modal.payload?.owner} team={modal.payload?.team} users={users} teams={teams} keys={apiKeys} onKeyCreated={onKeyCreated} />;
  if (modal.kind === "user") return <UserDialog close={close} reload={reload} user={modal.payload} />;
  if (modal.kind === "team") return <TeamDialog close={close} reload={reload} team={modal.payload} providers={providers} />;
  if (modal.kind === "provider-add") return <DialogFrame title="New provider" wide><ProviderAddContent onAdd={async (body) => { await onAddProvider(body); close(); }} onImport={async (body) => { await onImportAuth(body); close(); }} onTest={onRuntimeTest} onAbort={close} /></DialogFrame>;
  if (modal.kind === "provider-options") return <ProviderOptionsDialog close={close} reload={reload} provider={providers.find((p) => p.id === modal.payload)} />;
  return null;
}
