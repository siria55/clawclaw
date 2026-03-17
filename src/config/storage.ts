import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { IMConfig } from "./types.js";

/**
 * Persists IM platform configuration to a JSON file.
 * Used to save credentials configured via the WebUI settings page.
 */
export class IMConfigStorage {
  readonly #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  /** Read current config from disk. Returns empty object if file doesn't exist. */
  read(): IMConfig {
    if (!existsSync(this.#filePath)) return {};
    try {
      return JSON.parse(readFileSync(this.#filePath, "utf8")) as IMConfig;
    } catch {
      return {};
    }
  }

  /** Write config to disk (full replace). */
  write(config: IMConfig): void {
    writeFileSync(this.#filePath, JSON.stringify(config, null, 2), "utf8");
  }
}
