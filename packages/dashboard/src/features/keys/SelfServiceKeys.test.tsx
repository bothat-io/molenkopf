import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SelfServiceKeys } from "./SelfServiceKeys";

describe("SelfServiceKeys", () => {
  const key = { id: "key_a", prefix: "mk_a", ownerUserId: "member-a", project: "project-alpha" };

  it("gates project key actions by user permissions", () => {
    const locked = renderToString(<SelfServiceKeys keys={[key]} currentUser={{ id: "member-a", role: "member", keyPermissions: { create: false, revoke: false } }} config={{}} selectedSecret="" onNewKey={() => {}} onRevoke={() => {}} />);
    expect(locked).not.toContain("+ New key");
    expect(locked).not.toContain("Revoke key");
    expect(locked).toContain("locked");

    const allowed = renderToString(<SelfServiceKeys keys={[key]} currentUser={{ id: "member-a", role: "member", keyPermissions: { create: true, revoke: true } }} config={{}} selectedSecret="" onNewKey={() => {}} onRevoke={() => {}} />);
    expect(allowed).toContain("+ New key");
    expect(allowed).toContain("Revoke key");
  });
});
