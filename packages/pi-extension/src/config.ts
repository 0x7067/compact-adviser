import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { lockSync } from "proper-lockfile";

export type Mode = "hint" | "auto" | "off";
export interface Config {
  version: 1;
  mode: Mode;
  minContextTokens: number;
  sharingConsent: boolean;
  autoAcknowledged: boolean;
}
export const DEFAULT_CONFIG: Readonly<Config> = Object.freeze({
  version: 1,
  mode: "hint",
  minContextTokens: 40000,
  sharingConsent: false,
  autoAcknowledged: false,
});
export function parseMinimum(text: string): number {
  const value = text.trim();
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error("Enter a positive whole number of tokens, for example 40000.");
  }
  return number;
}
function validate(value: unknown): Config {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid settings.");
  const c = value as Record<string, unknown>;
  if (
    c.version !== 1 ||
    !["hint", "auto", "off"].includes(String(c.mode)) ||
    typeof c.minContextTokens !== "number" ||
    !Number.isSafeInteger(c.minContextTokens) ||
    c.minContextTokens <= 0 ||
    typeof c.sharingConsent !== "boolean" ||
    typeof c.autoAcknowledged !== "boolean"
  ) {
    throw new Error("Invalid or unsupported settings. Restore a valid version-1 configuration.");
  }
  return {
    version: 1,
    mode: c.mode as Mode,
    minContextTokens: c.minContextTokens,
    sharingConsent: c.sharingConsent,
    autoAcknowledged: c.autoAcknowledged,
  };
}
export class ConfigStore {
  readonly path: string;
  constructor(agentDir: string) {
    this.path = join(agentDir, "compact-adviser.json");
  }
  read(): Config {
    try {
      const stat = lstatSync(this.path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192)
        throw new Error("Unsafe settings file.");
      return validate(JSON.parse(readFileSync(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
      throw new Error("Cannot read compact-adviser settings; automatic action is disabled.", {
        cause: error,
      });
    }
  }
  update(patch: Partial<Omit<Config, "version">>): Config {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    // A short cross-process lock serializes read/merge/write. Contention is reported,
    // never hidden by overwriting another session's field update.
    const release = lockSync(this.path, { realpath: false, stale: 10000 });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    try {
      const config = validate({ ...this.read(), ...patch });
      const fd = openSync(temp, "wx", 0o600);
      try {
        writeFileSync(fd, `${JSON.stringify(config, null, 2)}\n`);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temp, this.path);
      return config;
    } finally {
      try {
        unlinkSync(temp);
      } catch {
        // Best-effort cleanup of a preferences-only temporary file; always release the lock.
      }
      release();
    }
  }
}
