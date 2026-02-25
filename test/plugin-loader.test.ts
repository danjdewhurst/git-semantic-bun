import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverAndLoadPlugins } from "../src/core/plugin-loader.ts";

describe("plugin loader", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(tmpdir(), `gsb-test-loader-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no plugins found", async () => {
    const loaded = await discoverAndLoadPlugins(tmpDir, {});
    expect(loaded).toHaveLength(0);
  });

  it("loads valid plugin from repo .gsb/plugins/", async () => {
    const pluginDir = path.join(tmpDir, ".gsb", "plugins");
    mkdirSync(pluginDir, { recursive: true });

    writeFileSync(
      path.join(pluginDir, "test-plugin.ts"),
      `export default {
        meta: { name: "test-local", version: "0.1.0" },
      };`,
    );

    const loaded = await discoverAndLoadPlugins(tmpDir, {});
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.plugin.meta.name).toBe("test-local");
  });

  it("skips invalid plugin files gracefully", async () => {
    const pluginDir = path.join(tmpDir, ".gsb", "plugins");
    mkdirSync(pluginDir, { recursive: true });

    // Plugin with no meta — should be skipped
    writeFileSync(path.join(pluginDir, "bad-plugin.ts"), "export default { notAPlugin: true };");

    const loaded = await discoverAndLoadPlugins(tmpDir, {});
    expect(loaded).toHaveLength(0);
  });

  it("loads explicitly listed plugins from config", async () => {
    const pluginDir = path.join(tmpDir, ".gsb", "plugins");
    mkdirSync(pluginDir, { recursive: true });

    writeFileSync(
      path.join(pluginDir, "explicit.ts"),
      `export default {
        meta: { name: "explicit-plugin", version: "1.0.0" },
      };`,
    );

    const loaded = await discoverAndLoadPlugins(tmpDir, {
      plugins: ["./.gsb/plugins/explicit.ts"],
    });
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.plugin.meta.name).toBe("explicit-plugin");
  });

  it("skips nonexistent plugin files in explicit list", async () => {
    const loaded = await discoverAndLoadPlugins(tmpDir, {
      plugins: ["./nonexistent.ts"],
    });
    expect(loaded).toHaveLength(0);
  });
});
