import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadGsbConfig } from "../src/core/plugin-config.ts";

describe("plugin config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(tmpdir(), `gsb-test-config-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty config when no config files exist", () => {
    const config = loadGsbConfig(tmpDir);
    expect(config).toEqual({});
  });

  it("loads repo config", () => {
    writeFileSync(
      path.join(tmpDir, ".gsbrc.json"),
      JSON.stringify({
        plugins: ["gsb-plugin-test"],
        pluginConfig: {
          "gsb-plugin-test": { key: "value" },
        },
      }),
    );

    const config = loadGsbConfig(tmpDir);
    expect(config.plugins).toEqual(["gsb-plugin-test"]);
    expect(config.pluginConfig?.["gsb-plugin-test"]?.key).toBe("value");
  });

  it("interpolates environment variables in plugin config", () => {
    process.env.GSB_TEST_SECRET = "my-secret-key";

    writeFileSync(
      path.join(tmpDir, ".gsbrc.json"),
      JSON.stringify({
        pluginConfig: {
          "gsb-plugin-auth": {
            apiKey: "$GSB_TEST_SECRET",
            endpoint: "${GSB_TEST_SECRET}/api",
          },
        },
      }),
    );

    const config = loadGsbConfig(tmpDir);
    expect(config.pluginConfig?.["gsb-plugin-auth"]?.apiKey).toBe("my-secret-key");
    expect(config.pluginConfig?.["gsb-plugin-auth"]?.endpoint).toBe("my-secret-key/api");

    process.env.GSB_TEST_SECRET = undefined;
  });

  it("preserves literal dollar signs with $$ escape", () => {
    writeFileSync(
      path.join(tmpDir, ".gsbrc.json"),
      JSON.stringify({
        pluginConfig: {
          "gsb-plugin-test": { value: "price is $$100" },
        },
      }),
    );

    const config = loadGsbConfig(tmpDir);
    expect(config.pluginConfig?.["gsb-plugin-test"]?.value).toBe("price is $100");
  });

  it("replaces missing env vars with empty string", () => {
    process.env.GSB_NONEXISTENT_VAR = undefined;

    writeFileSync(
      path.join(tmpDir, ".gsbrc.json"),
      JSON.stringify({
        pluginConfig: {
          "gsb-plugin-test": { value: "$GSB_NONEXISTENT_VAR" },
        },
      }),
    );

    const config = loadGsbConfig(tmpDir);
    expect(config.pluginConfig?.["gsb-plugin-test"]?.value).toBe("");
  });
});
