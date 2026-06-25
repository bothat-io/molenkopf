import { describe, expect, it } from "vitest";
import { userDialogPayload } from "./UserDialog";

describe("userDialogPayload", () => {
  it("stores login disablement without suspending the whole account", () => {
    const form = new FormData();
    form.set("id", "alice");
    form.set("name", "Alice");
    form.set("role", "member");

    const { body } = userDialogPayload({ id: "alice", role: "member", teamIds: [], disabled: false }, form);

    expect(body.disabled).toBe(false);
    expect(body.loginDisabled).toBe(true);
  });
});
