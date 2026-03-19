import { readFileSync, writeFileSync, existsSync } from "node:fs";

/**
 * Generic JSON file storage. Reads and writes a typed object to disk.
 *
 * @example
 * const store = new ConfigStorage<IMConfig>("./data/im-config.json");
 * const config = store.read(); // returns IMConfig (or {} if file missing)
 * store.write({ feishu: { ... } });
 */
export class ConfigStorage<T extends object> {
  readonly #filePath: string;
  readonly #default: T;

  constructor(filePath: string, defaultValue: T = {} as T) {
    this.#filePath = filePath;
    this.#default = defaultValue;
  }

  /** Default value returned when the file does not exist or is invalid. */
  get defaultValue(): T {
    return this.#default;
  }

  /** Read current config from disk. Returns defaultValue if file doesn't exist or is invalid. */
  read(): T {
    if (!existsSync(this.#filePath)) return this.#default;
    try {
      return JSON.parse(readFileSync(this.#filePath, "utf8")) as T;
    } catch {
      return this.#default;
    }
  }

  /** Write config to disk (full replace). */
  write(config: T): void {
    writeFileSync(this.#filePath, JSON.stringify(config, null, 2), "utf8");
  }
}

/** @deprecated Use ConfigStorage<IMConfig> directly. */
export type IMConfigStorage = ConfigStorage<import("./types.js").IMConfig>;
