/**
 * Build the local checkpoint dataset and per-row label worksheets.
 *   node --import tsx eval/build.ts <outDir>
 * Writes <outDir>/checkpoints.jsonl and <outDir>/worksheet/*.md. Local only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mainBranch } from "./branch.ts";
import { DEFAULT_CORPUS_PATH, EVAL_DIR, loadCorpus } from "./corpus.ts";
import { loadSession, passesSizeGates, replayAt, usageTokens } from "./replay.ts";
import { spread } from "./sample.ts";
import { writeWorksheet } from "./worksheet.ts";

const outDir = process.argv[2] ?? join(EVAL_DIR, "local");
const perSession = Number(process.env.COMPACT_ADVISER_PER_SESSION ?? 5);

/** Production request bodies actually sent on this host, for provenance marking. */
function liveBodies(): Set<string> {
  const p =
    process.env.COMPACT_ADVISER_REQUEST_LOG?.trim() ||
    join(homedir(), ".pi", "agent", "compact-adviser-requests.jsonl");
  const set = new Set<string>();
  if (!existsSync(p)) return set;
  for (const line of readFileSync(p, "utf8").split("\n").filter(Boolean)) {
    try {
      set.add(JSON.stringify(JSON.parse(line).body.state));
    } catch {
      /* ignore */
    }
  }
  return set;
}

const live = liveBodies();
mkdirSync(join(outDir, "worksheet"), { recursive: true });
const rows: unknown[] = [];
let id = 0;

for (const c of loadCorpus()) {
  const s = loadSession(c.file);
  const branch = mainBranch(s);
  const settled = branch.filter(
    (e) => e.type === "message" && e.message?.role === "assistant" && e.message?.stopReason === "stop",
  );
  const sized = settled.filter((e) => usageTokens(e) >= 40000);
  const picks = spread(sized, Number.isFinite(perSession) && perSession > 0 ? perSession : 5);
  const seenKeys = new Set<string>();
  for (const e of picks) {
    const ord = settled.indexOf(e);
    const cp = replayAt(s, e, ord);
    if (!cp || !passesSizeGates(cp)) continue;
    if (seenKeys.has(cp.checkpointKey)) continue;
    seenKeys.add(cp.checkpointKey);
    const rid = `cp${String(++id).padStart(3, "0")}`;
    const isLive = live.has(JSON.stringify(cp.state));
    rows.push({
      id: rid,
      session: c.label,
      stratum: c.stratum,
      liveLogged: isLive,
      sampling: "spread",
      ...cp,
    });
    writeWorksheet({
      outDir,
      id: rid,
      session: c.label,
      stratum: c.stratum,
      checkpoint: cp,
      ordinal: ord,
      settledCount: settled.length,
      branch,
      liveLogged: isLive,
    });
  }
  console.error(
    `${c.label.padEnd(16)} settled=${String(settled.length).padStart(4)} sized=${String(sized.length).padStart(4)} sampled=${picks.length}`,
  );
}

writeFileSync(join(outDir, "checkpoints.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
console.error(`\nwrote ${rows.length} checkpoints -> ${join(outDir, "checkpoints.jsonl")}`);
console.error(`live-logged rows: ${rows.filter((r) => (r as { liveLogged?: boolean }).liveLogged).length}`);
console.error(`corpus: ${process.env.COMPACT_ADVISER_CORPUS?.trim() || DEFAULT_CORPUS_PATH}`);
