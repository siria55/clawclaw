import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigStorage } from "../../src/config/storage.js";
import { MountedDocLibrary } from "../../src/docs/library.js";
import type { MountedDocConfig } from "../../src/config/types.js";

let dir: string;
let configStorage: ConfigStorage<MountedDocConfig>;

beforeEach(() => {
  dir = join(tmpdir(), `claw-doc-lib-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  configStorage = new ConfigStorage<MountedDocConfig>(join(dir, "config.json"), { docs: [] });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("MountedDocLibrary", () => {
  it("normalizes and saves mounted doc sources", () => {
    const library = new MountedDocLibrary({ configStorage, dataDir: dir });
    const saved = library.saveSources([
      { id: "leave", title: " 请假制度 ", url: " https://example.com/doc ", enabled: true },
      { id: "leave", title: "重复", url: "https://example.com/dup", enabled: true },
      { id: "empty", title: "", url: "", enabled: true },
    ]);

    expect(saved).toEqual([
      { id: "leave", title: "请假制度", url: "https://example.com/doc", enabled: true },
    ]);
    expect(configStorage.read().docs).toEqual(saved);
  });

  it("syncs a doc and searches by content snippet", async () => {
    const library = new MountedDocLibrary({
      configStorage,
      dataDir: dir,
      extractor: async () => ({
        title: "请假制度",
        content: "员工请假需要提前两天提交审批，病假需要补充医院证明，年假最少以半天为单位申请。",
      }),
    });
    library.saveSources([
      { id: "leave", title: "请假制度", url: "https://example.com/leave", enabled: true },
    ]);

    const result = await library.syncById("leave");
    const hits = library.search("病假怎么申请", 3);

    expect(result.ok).toBe(true);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("请假制度");
    expect(hits[0].snippet).toContain("病假");
  });

  it("syncAll skips disabled docs by filtering enabled sources", async () => {
    const library = new MountedDocLibrary({
      configStorage,
      dataDir: dir,
      extractor: async (source) => ({
        title: source.title,
        content: `正文: ${source.title}`,
      }),
    });
    library.saveSources([
      { id: "enabled", title: "启用文档", url: "https://example.com/enabled", enabled: true },
      { id: "disabled", title: "停用文档", url: "https://example.com/disabled", enabled: false },
    ]);

    const results = await library.syncAll();

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("enabled");
    expect(library.listSnapshots()).toHaveLength(1);
  });
});
