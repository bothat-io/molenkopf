import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminTab } from "../features/identity/Admin";
import { loadDashboardData, loadSession, postJson, putJson } from "./api";
import { AuthLoadingView, LoginView, SetupView } from "../features/auth/AuthViews";
import { DashboardNotice } from "../components/feedback/DashboardNotice";
import { Dialogs, type ModalState } from "../features/identity/Dialogs";
import { tabFromPath, tabPath, useDashboardEventRefresh, useDevRevisionReload, type DashboardTab } from "./hooks";
import { OverviewTab } from "../features/overview/Overview";
import { Shell } from "./Shell";
import { noticeTone, providerTestFailure } from "./messages";
import { beginRefresh, connectionStatus, shouldPollDashboard, type RefreshState } from "./refresh";
import { confirmDestructive } from "./destructiveActions";
import { buildGlobalPluginPolicyRequest, buildResetTeamPluginPolicyRequest, buildTeamPluginPolicyRequest, type TeamPluginDraft } from "./pluginPolicyMutations";
import { buildAssignUserToTeamBody, buildRemoveUserFromTeamBody } from "./teamMembershipMutations";
import type { DashboardData, TeamView, UserView } from "./types";
const emptyData: DashboardData = { usage: {}, keys: { items: [] }, config: {}, providers: {}, summary: {}, plugins: {} };
export function DashboardApp() {
  const [user, setUser] = useState<UserView | undefined>();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [tab, setTabState] = useState<DashboardTab>(tabFromPath());
  const [selectedSecret, setSelectedSecret] = useState("");
  const [modal, setModal] = useState<ModalState>({ kind: null });
  const [message, setMessage] = useState("");
  const [providerMessages, setProviderMessages] = useState<Record<string, string>>({});
  const [refresh, setRefresh] = useState<RefreshState>({ loading: false });
  const loadSeq = useRef(0);
  const loadAbort = useRef<AbortController | undefined>(undefined);
  useDevRevisionReload(Boolean(user));
  const clearSessionState = useCallback(() => {
    setSelectedSecret(""); setModal({ kind: null }); setMessage(""); setProviderMessages({});
    setData(emptyData);
  }, []);
  const canManage = Boolean(user?.canManage || needsSetup);
  const reload = useCallback(async (options?: { quiet?: boolean }) => {
    const seq = loadSeq.current + 1;
    loadSeq.current = seq;
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    setRefresh((prev) => beginRefresh(prev, options?.quiet));
    try {
      const options = { signal: controller.signal, timeoutMs: 10000 };
      const session = await loadSession(options);
      if (seq !== loadSeq.current) return;
      const activeUser = session.user;
      if (activeUser?.id !== user?.id) clearSessionState();
      const nextNeedsSetup = Boolean(session.open && session.needsSetup);
      const nextData = activeUser ? await loadDashboardData(Boolean(activeUser.canManage), options) : emptyData;
      if (seq !== loadSeq.current) return;
      setNeedsSetup(nextNeedsSetup);
      setUser(activeUser);
      setData(nextData);
      setSessionChecked(true);
      setRefresh({ loading: false, lastSuccessAt: new Date().toISOString() });
    } catch (err) {
      if (controller.signal.aborted || seq !== loadSeq.current) return;
      const text = err instanceof Error ? err.message : String(err);
      setSessionChecked(true);
      setRefresh((prev) => ({ loading: false, lastSuccessAt: prev.lastSuccessAt, lastErrorAt: new Date().toISOString(), error: text }));
      setMessage(text);
    }
  }, [clearSessionState, user?.id]);
  const eventRefresh = useCallback(() => reload({ quiet: true }), [reload]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => () => loadAbort.current?.abort(), []);
  useDashboardEventRefresh(eventRefresh, Boolean(user || needsSetup));
  useEffect(() => {
    const tick = () => { if ((user || needsSetup) && shouldPollDashboard(document.visibilityState)) reload({ quiet: true }); };
    const timer = window.setInterval(tick, 5000);
    const visible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [reload, user, needsSetup]);
  useEffect(() => { const pop = () => setTabState(tabFromPath()); window.addEventListener("popstate", pop); return () => window.removeEventListener("popstate", pop); }, []);
  useEffect(() => {
    if (user && tab === "admin" && !canManage) openOverview();
  }, [canManage, tab, user]);
  const setTab = (next: DashboardTab) => {
    const safe = next === "admin" && !canManage ? "overview" : next;
    setTabState(safe);
    if (window.location.pathname !== tabPath(safe)) window.history.pushState(null, "", tabPath(safe));
  };
  const openOverview = () => { setTabState("overview"); if (window.location.pathname !== tabPath("overview")) window.history.replaceState(null, "", tabPath("overview")); };
  const providers = useMemo(() => data.providers.configuredItems || data.providers.items || [], [data.providers]);
  const adminProps = {
    data,
    onNewUser: () => setModal({ kind: "user" }),
    onNewTeam: () => setModal({ kind: "team" }),
    onNewProvider: () => setModal({ kind: "provider-add" }),
    onEditUser: (user: UserView) => setModal({ kind: "user", payload: user }),
    onEditTeam: (team: TeamView) => setModal({ kind: "team", payload: team }),
    onUserKey: (owner: UserView) => setModal({ kind: "keys", payload: { owner } }),
    onTeamKey: (team: TeamView) => setModal({ kind: "keys", payload: { team } }),
    onRemoveUser: (id: string) => { if (confirmDestructive("remove-user", id)) mutate("/__molenkopf/identity/users/remove", { id }); },
    onRemoveTeam: (id: string) => { if (confirmDestructive("remove-team", id)) mutate("/__molenkopf/identity/teams/remove", { id }); },
    onAssignUserToTeam: assignUserToTeam,
    onRemoveUserFromTeam: removeUserFromTeam,
    onProviderRemove: (id: string) => { if (confirmDestructive("remove-provider", id)) mutate("/__molenkopf/providers/remove", { id }); },
    onProviderOptions: (id: string) => setModal({ kind: "provider-options", payload: id }),
    providerMessages,
    onProviderTest: testProvider,
    onProviderWeight: setProviderShare,
    onPluginToggle: (id: string, enabled: boolean) => mutate("/__molenkopf/plugins/toggle", { id, enabled }),
    onSaveGlobalPluginPolicy: saveGlobalPluginPolicy,
    onSaveTeamPluginPolicy: saveTeamPluginPolicy,
    onResetTeamPluginPolicy: resetTeamPluginPolicy
  };
  async function mutate(path: string, body: unknown, okMessage = "", options?: { rethrow?: boolean }) {
    try {
      await postJson(path, body);
      if (okMessage) setMessage(okMessage);
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      if (options?.rethrow) throw err;
    }
  }
  async function saveGlobalPluginPolicy(pluginId: string, value: { enabled: boolean; maxRisk: "green" | "yellow" | "orange" | "red" }) { await persistPluginPolicy(buildGlobalPluginPolicyRequest(data, pluginId, value)); }
  async function saveTeamPluginPolicy(teamId: string, pluginId: string, value: TeamPluginDraft) { await persistPluginPolicy(buildTeamPluginPolicyRequest(data, teamId, pluginId, value)); }
  async function resetTeamPluginPolicy(teamId: string, pluginId: string) { await persistPluginPolicy(buildResetTeamPluginPolicyRequest(data, teamId, pluginId)); }
  async function persistPluginPolicy(request: { path: string; body: unknown }) {
    try {
      await putJson(request.path, request.body);
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }
  async function saveProviderWeights(weights: Record<string, number>) {
    try {
      const current = new Map(providers.map((item) => [item.id, Math.round(Number(item.weight ?? 1))]));
      const changed = Object.entries(weights).filter(([id, weight]) => current.get(id) !== Math.round(weight));
      if (!changed.length && data.providers.routingMode === "distribute") return;
      const result = await postJson<{ routingMode: string; providers: DashboardData["providers"] }>("/__molenkopf/providers/weights", { weights: Object.fromEntries(changed), mode: "distribute" });
      setData((prev) => ({ ...prev, providers: result.providers }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }
  async function setProviderShare(id: string, share: number) {
    const items = providers.filter((item) => item.id !== "default" && item.enabled !== false);
    const other = items.filter((item) => item.id !== id);
    const next = Math.max(0, Math.min(100, Math.round(share)));
    const remaining = 100 - next;
    const currentOtherTotal = other.reduce((sum, item) => sum + Math.max(0, item.sharePercent ?? item.weight ?? 0), 0);
    const weights: Record<string, number> = { [id]: next };
    for (const item of other) {
      const base = currentOtherTotal > 0 ? Math.max(0, item.sharePercent ?? item.weight ?? 0) / currentOtherTotal : 1 / Math.max(1, other.length);
      weights[item.id] = Math.round(remaining * base);
    }
    const drift = 100 - Object.values(weights).reduce((sum, value) => sum + value, 0);
    if (other[0] && drift) weights[other[0].id] += drift;
    await saveProviderWeights(weights);
  }
  async function testProvider(id: string) {
    setProviderMessages((prev) => ({ ...prev, [id]: "Testing provider..." }));
    try {
      const result = await postJson<Record<string, unknown>>("/__molenkopf/providers/test", { id });
      const status = String(result.providerId || result.id || id);
      const failure = providerTestFailure(result);
      const text = failure ? `Test failed for ${status}: ${failure}` : `Test ok for ${status}`;
      setProviderMessages((prev) => ({ ...prev, [id]: text }));
      setMessage(text);
      await reload();
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setProviderMessages((prev) => ({ ...prev, [id]: text }));
      setMessage(text);
    }
  }
  async function testRuntimeProvider(body?: string | Record<string, unknown>) { return postJson<Record<string, unknown>>("/__molenkopf/providers/test-runtime", typeof body === "string" ? { id: body } : body || {}); }
  async function assignUserToTeam(userId: string, teamId: string) {
    const body = buildAssignUserToTeamBody(data, userId, teamId);
    if (body) await mutate("/__molenkopf/identity/users", body);
  }
  async function removeUserFromTeam(userId: string, teamId: string) {
    const body = buildRemoveUserFromTeamBody(data, userId, teamId);
    if (body) await mutate("/__molenkopf/identity/users", body);
  }
  async function logout() {
    loadSeq.current += 1; loadAbort.current?.abort();
    try { await postJson("/__molenkopf/logout", {}); }
    finally { clearSessionState(); setNeedsSetup(false); setUser(undefined); setRefresh({ loading: false }); openOverview(); }
  }
  if (!sessionChecked && refresh.loading) return <AuthLoadingView />;
  if (needsSetup && !user) return <SetupView onDone={(next) => { setUser(next); setNeedsSetup(false); openOverview(); reload(); }} />;
  if (!user) return <LoginView onDone={(next) => { setUser(next); openOverview(); reload(); }} />;
  return <Shell user={user} canManage={canManage} activeTab={tab} connection={connectionStatus(refresh)} onTab={setTab} onLogout={logout}>
    {message ? <DashboardNotice tone={noticeTone(message)} onDismiss={() => setMessage("")}>{message}</DashboardNotice> : null}
    {tab === "overview" ? <OverviewTab usage={data.usage} currentUser={user} keys={data.keys.items || []} config={data.config} selectedSecret={selectedSecret} onNewKey={() => setModal({ kind: "key" })} onRevoke={(id) => { if (confirmDestructive("revoke-key", id)) mutate("/__molenkopf/keys/revoke", { id }); }} /> : null}
    {tab === "admin" && canManage ? <AdminTab {...adminProps} /> : null}
    <Dialogs modal={modal} close={() => setModal({ kind: null })} reload={reload} providers={providers} users={data.identity?.users || data.usage.users || []} teams={data.identity?.teams || data.usage.teams || []} apiKeys={data.keys.items || data.usage.keys || []} currentUser={user} onKeyCreated={setSelectedSecret} onAddProvider={(body) => mutate("/__molenkopf/providers/add", body, "", { rethrow: true })} onImportAuth={(body) => mutate("/__molenkopf/providers/import-auth", body, "Runtime account imported", { rethrow: true })} onRuntimeTest={testRuntimeProvider} />
  </Shell>;
}
