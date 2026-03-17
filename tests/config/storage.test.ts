import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStorage } from "../../src/config/storage.js";
import type { IMConfig } from "../../src/config/types.js";

let dir: string;
let storage: ConfigStorage<IMConfig>;

beforeEach(() => {
  dir = join(tmpdir(), `clawclaw-config-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  storage = new ConfigStorage<IMConfig>(join(dir, "im-config.json"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("IMConfigStorage", () => {
  it("returns empty object when file does not exist", () => {
    expect(storage.read()).toEqual({});
  });

  it("writes and reads back config", () => {
    storage.write({
      feishu: {
        appId: "cli_123",
        appSecret: "secret",
        verificationToken: "token",
      },
    });
    const result = storage.read();
    expect(result.feishu?.appId).toBe("cli_123");
    expect(result.feishu?.appSecret).toBe("secret");
    expect(result.feishu?.verificationToken).toBe("token");
  });

  it("persists across instances", () => {
    storage.write({ feishu: { appId: "a", appSecret: "b", verificationToken: "c" } });
    const storage2 = new ConfigStorage<IMConfig>(join(dir, "im-config.json"));
    expect(storage2.read().feishu?.appId).toBe("a");
  });

  it("overwrites previous config on write", () => {
    storage.write({ feishu: { appId: "old", appSecret: "s", verificationToken: "t" } });
    storage.write({ feishu: { appId: "new", appSecret: "s", verificationToken: "t" } });
    expect(storage.read().feishu?.appId).toBe("new");
  });

  it("handles optional fields", () => {
    storage.write({
      feishu: {
        appId: "id",
        appSecret: "s",
        verificationToken: "t",
        encryptKey: "ek",
        chatId: "oc_123",
      },
    });
    const result = storage.read();
    expect(result.feishu?.encryptKey).toBe("ek");
    expect(result.feishu?.chatId).toBe("oc_123");
  });

  it("returns empty object on corrupt file", () => {
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    writeFileSync(join(dir, "im-config.json"), "not json", "utf8");
    const s = new ConfigStorage<IMConfig>(join(dir, "im-config.json"));
    expect(s.read()).toEqual({});
  });
});
