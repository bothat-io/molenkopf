import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.MOLENKOPF_DATA_DIR) {
  process.env.MOLENKOPF_DATA_DIR = join(tmpdir(), `molenkopf-test-${process.pid}`);
}

process.env.MOLENKOPF_SESSION_SECRET ??= "test-8f6e1a9d0c2b4f739ab15c6d8e029471";
