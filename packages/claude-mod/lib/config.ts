// Persistent preferences, with the same semantics as the Pi extension's configuration.
//
// `mode` and `minContextTokens` are the plugin's manifest `userConfig` rows: the host
// validates them, stores them in the user's settings.json, and shows them in /config.
// `sharingConsent` and `autoAcknowledged` live in the plugin's own store so that only
// this mod's confirmation dialogs can grant them.

export type Mode = "hint" | "auto" | "off";
export const MODES: readonly Mode[] = ["hint", "auto", "off"];
export const PLUGIN = "compact-adviser";
export const MODE_KEY = `${PLUGIN}.mode`;
export const MINIMUM_KEY = `${PLUGIN}.minContextTokens`;
export const CONSENT_STORE_KEY = "preferences";
export const DEFAULT_MINIMUM = 40000;

export interface Config {
  mode: Mode;
  minContextTokens: number;
  sharingConsent: boolean;
  autoAcknowledged: boolean;
}

export interface Consent {
  version: 1;
  sharingConsent: boolean;
  autoAcknowledged: boolean;
}

export const DEFAULT_CONSENT: Readonly<Consent> = Object.freeze({
  version: 1,
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

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

/** Reads the stored consent record; absent means the defaults, anything malformed throws. */
export function parseConsent(value: unknown): Consent {
  if (value === undefined) return { ...DEFAULT_CONSENT };
  const c = value as Record<string, unknown> | null;
  if (
    !c ||
    typeof c !== "object" ||
    Array.isArray(c) ||
    c.version !== 1 ||
    typeof c.sharingConsent !== "boolean" ||
    typeof c.autoAcknowledged !== "boolean"
  ) {
    throw new SettingsError(
      "Invalid compact-adviser consent record; run /compact-adviser sharing on to restore it.",
    );
  }
  return { version: 1, sharingConsent: c.sharingConsent, autoAcknowledged: c.autoAcknowledged };
}

export interface ConfigRowLike {
  key: string;
  value: unknown;
}

/**
 * Combines the host's `userConfig` values with the stored consent.
 * The live `/config` rows win, so a change another session saved is seen at once; the
 * options the module loaded with (host-validated, defaults filled in) stand in for a row
 * the menu has not listed yet, as happens at startup. The host already maps a stored mode
 * outside the options to its `hint` default; a value of the wrong kind is reported rather
 * than silently replaced.
 */
export function readConfig(
  rows: readonly ConfigRowLike[],
  consentValue: unknown,
  loaded: Readonly<Record<string, unknown>> = {},
): Config {
  const row = (key: string, field: string) =>
    rows.find((candidate) => candidate.key === key)?.value ?? loaded[field];
  const mode = row(MODE_KEY, "mode");
  const minimum = row(MINIMUM_KEY, "minContextTokens");
  if (typeof mode !== "string" || !MODES.includes(mode as Mode)) {
    throw new SettingsError("Cannot read the compact-adviser mode setting; no action is taken.");
  }
  if (typeof minimum !== "number" || !Number.isSafeInteger(minimum) || minimum <= 0) {
    throw new SettingsError(
      "Cannot read the compact-adviser minimum context setting; no action is taken.",
    );
  }
  const consent = parseConsent(consentValue);
  return {
    mode: mode as Mode,
    minContextTokens: minimum,
    sharingConsent: consent.sharingConsent,
    autoAcknowledged: consent.autoAcknowledged,
  };
}

export function formatTokens(count: number): string {
  return count.toLocaleString("en-US");
}
