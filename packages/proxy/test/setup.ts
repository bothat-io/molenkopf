import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.MOLENKOPF_DATA_DIR) {
  process.env.MOLENKOPF_DATA_DIR = join(tmpdir(), `molenkopf-test-${process.pid}`);
}

process.env.MOLENKOPF_SESSION_SECRET ??= "test-only-session-secret-please-change-123456";
