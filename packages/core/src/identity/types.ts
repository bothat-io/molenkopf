import type { PasswordHash } from "../auth/password.ts";
import type { PriceTable } from "./pricing.ts";

// Identity model for the multi-user / team gateway (see
// docs/superpowers/plans/2026-06-21-molenkopf-multiuser-team-redesign.md).
// Persisted locally; provider credentials are NEVER stored here (RAM-only),
// and API-key secrets are stored as a hash only — never in plaintext.

export type Role = "admin" | "manager" | "member";
export type BudgetPeriod = "day" | "week" | "month" | "total";
export type BudgetAction = "block" | "warn";
export type KeyPermissions = { create?: boolean; revoke?: boolean };

export type Budget = {
  tokenLimit?: number;
  costLimitEur?: number;
  period: BudgetPeriod;
  onExceed: BudgetAction;
};

export type User = {
  id: string;
  displayName: string;
  role: Role;
  password?: PasswordHash;
  loginDisabled?: boolean;
  teamIds: string[];
  keyPermissions?: KeyPermissions;
  budget?: Budget;
  disabled?: boolean;
  sessionVersion?: number;
  createdAt: string;
  createdBy?: string;
};

export type Team = {
  id: string;
  name: string;
  allowedProviders: "*" | string[];
  managerIds: string[];
  budget?: Budget;
  createdAt: string;
};

export type ApiKey = {
  id: string;            // public, displayable id, e.g. "key_ab12cd"
  hash: string;          // sha256(secret) hex — the only stored form of the secret
  prefix: string;        // first chars of the secret for recognition, e.g. "mk_ab12"
  ownerUserId: string;
  teamId?: string;       // optional billing team; fallback is owner team membership
  agentLabel?: string;   // optional logical agent name ("ci-bot")
  project?: string;      // optional project/workspace grouping for reporting
  scopes?: string[];     // allowed provider ids; undefined = inherit owner/team allowance
  budget?: Budget;
  disabled?: boolean;
  createdAt: string;
  lastUsedAt?: string;
};

export type IdentityData = {
  schemaVersion: number;
  users: Record<string, User>;
  teams: Record<string, Team>;
  keys: Record<string, ApiKey>;
  orgBudget?: Budget;
  pricing?: PriceTable;
};

export const IDENTITY_SCHEMA_VERSION = 1;

export function emptyIdentity(): IdentityData {
  return { schemaVersion: IDENTITY_SCHEMA_VERSION, users: {}, teams: {}, keys: {} };
}

// View types omit secrets/hashes for safe display.
export type UserView = Omit<User, "password"> & { hasPassword: boolean };
export type ApiKeyView = Omit<ApiKey, "hash"> & {};

export function viewUser(user: User): UserView {
  const { password, ...rest } = user;
  return { ...rest, hasPassword: Boolean(password?.hash) };
}

export function viewKey(key: ApiKey): ApiKeyView {
  const { hash, ...rest } = key;
  return { ...rest };
}
