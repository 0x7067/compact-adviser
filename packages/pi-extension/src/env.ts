import { readFileSync } from "node:fs";
import { join } from "node:path";

const NAME = "TYPESAFE_API_KEY";
const PREFIX = /^(?:export|declare\s+-x)\s+/;

function unquote(value: string): string {
  if (value.length >= 2) {
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) return value.slice(1, -1);
  }
  return value;
}

/** Last `KEY=VALUE` assignment wins. Comments and blank lines are ignored. */
export function parseDotenvKey(text: string, name: string): string | undefined {
  let found: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    line = line.replace(PREFIX, "");
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    if (line.slice(0, eq).trim() !== name) continue;
    found = unquote(line.slice(eq + 1).trim());
  }
  return found;
}

/**
 * Prefer a non-empty process env value. Otherwise read `TYPESAFE_API_KEY` from
 * `.env` in `cwd`. A missing file is ignored; the value is never logged.
 */
export function resolveTypesafeApiKey(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string | undefined {
  const fromEnv = env.TYPESAFE_API_KEY;
  if (fromEnv !== undefined && fromEnv.trim() !== "") return fromEnv;
  try {
    return parseDotenvKey(readFileSync(join(cwd, ".env"), "utf8"), NAME);
  } catch {
    return undefined;
  }
}
