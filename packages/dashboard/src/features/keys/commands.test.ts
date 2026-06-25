import { describe, expect, it } from "vitest";
import { connectLines } from "./commands";

describe("connectLines", () => {
  it("generates Bash exports for Codex", () => {
    const lines = connectLines("codex", "bash", "http://127.0.0.1:8787", "mk_key");
    expect(lines[0]).toBe('export OPENAI_API_KEY="mk_key"');
    expect(lines[1]).toContain("codex -c");
    expect(lines[1]).toContain("-c model_provider=molenkopf");
    expect(lines[1]).toContain("-c model_providers.molenkopf.base_url=http://127.0.0.1:8787/v1");
    expect(lines[1]).not.toContain("Reply only OK");
    expect(lines[1]).not.toContain("OPENAI_BASE_URL");
  });
});
