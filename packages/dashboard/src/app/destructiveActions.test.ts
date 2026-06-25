import { describe, expect, it, vi } from "vitest";
import { confirmDestructive } from "./destructiveActions";

describe("confirmDestructive", () => {
  it("requires an explicit confirmation before destructive actions", () => {
    const confirm = vi.fn(() => false);

    expect(confirmDestructive("remove-user", "alice", confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Remove user "alice"?');
  });
});
