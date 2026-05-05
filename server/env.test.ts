import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDotEnv } from "./env.js";

const touchedKeys = ["CS2_MONITOR_TEST_ENV", "CS2_MONITOR_EXISTING_ENV", "CS2_MONITOR_QUOTED_ENV"];

describe("env loader", () => {
  afterEach(() => {
    for (const key of touchedKeys) {
      delete process.env[key];
    }
  });

  it("loads .env-style values without overriding real environment variables", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "csgo-env-"));
    const envPath = path.join(dataDir, ".env");
    await writeFile(
      envPath,
      [
        "CS2_MONITOR_TEST_ENV=from-file",
        'CS2_MONITOR_QUOTED_ENV="quoted value"',
        "CS2_MONITOR_EXISTING_ENV=from-file",
      ].join("\n"),
      "utf8",
    );
    process.env.CS2_MONITOR_EXISTING_ENV = "from-process";

    loadDotEnv(envPath);

    expect(process.env.CS2_MONITOR_TEST_ENV).toBe("from-file");
    expect(process.env.CS2_MONITOR_QUOTED_ENV).toBe("quoted value");
    expect(process.env.CS2_MONITOR_EXISTING_ENV).toBe("from-process");

    await rm(dataDir, { recursive: true, force: true });
  });
});
