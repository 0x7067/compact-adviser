// TYPESAFE_API_KEY from the host environment, else from a cwd .env file.
// Simple KEY=VALUE lines: last assignment wins; comments and blanks are ignored.

/** Last `KEY=VALUE` assignment wins. Comments and blank lines are ignored. */
export function parseDotenvKey(text: string, name: string): string | undefined {
  let found: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    if (line.slice(0, eq).trim() !== name) continue;
    found = line.slice(eq + 1).trim();
  }
  return found;
}
