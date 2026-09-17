import { loadSession, replayAt, settledEntries, usageTokens } from "./replay.ts";

const sessionFile = process.argv[2];
if (!sessionFile) {
  console.error("usage: node --import tsx eval/verify-tokens.ts <session.jsonl>");
  process.exit(1);
}
const s = loadSession(sessionFile);
const settled = settledEntries(s);
let same = 0,
  diff = 0;
for (let i = 0; i < settled.length; i += 7) {
  const e = settled[i];
  const c = replayAt(s, e, i);
  if (!c) continue;
  const fast = usageTokens(e);
  if (fast === c.contextTokens) same++;
  else {
    diff++;
    if (diff < 4) console.log("MISMATCH", e.id, fast, c.contextTokens);
  }
}
console.log(`fast-path usage total matches replayed contextTokens: same=${same} diff=${diff}`);
