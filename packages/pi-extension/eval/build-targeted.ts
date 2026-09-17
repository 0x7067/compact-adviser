/**
 * Build an extension dataset from explicitly chosen checkpoints (targeted
 * sampling for minority classes). Rows are marked sampling="targeted-hard"
 * so the enriched prior is never mistaken for the natural one.
 *   node --import tsx eval/build-targeted.ts <outDir> <existing.jsonl> <session:entryId>...
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mainBranch } from "./branch.ts";
import { loadCorpus } from "./corpus.ts";
import { loadSession, passesSizeGates, replayAt } from "./replay.ts";
import { writeWorksheet } from "./worksheet.ts";

const outDir = process.argv[2];
const existingPath = process.argv[3];
if (!outDir || !existingPath) {
  console.error(
    "usage: node --import tsx eval/build-targeted.ts <outDir> <existing.jsonl> <session:entryId>...",
  );
  process.exit(1);
}
const picks = process.argv.slice(4).map((s) => {
  const [session, entryId] = s.split(":");
  return { session, entryId };
});

const existing = existsSync(existingPath)
  ? readFileSync(existingPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  : [];
const takenEntries = new Set(existing.map((r: { entryId: string }) => r.entryId));
const takenKeys = new Set(existing.map((r: { checkpointKey: string }) => r.checkpointKey));
let id = existing.length;

mkdirSync(join(outDir, "worksheet"), { recursive: true });
const rows: unknown[] = [];
const sessions = new Map<string, ReturnType<typeof loadSession>>();
const corpus = loadCorpus();

for (const p of picks) {
  if (takenEntries.has(p.entryId)) {
    console.error(`skip ${p.session}:${p.entryId} - already in base set`);
    continue;
  }
  const c = corpus.find((x) => x.label === p.session);
  if (!c) {
    console.error(`skip ${p.session} - not in corpus`);
    continue;
  }
  if (!sessions.has(c.label)) sessions.set(c.label, loadSession(c.file));
  const s = sessions.get(c.label);
  if (!s) continue;
  const branch = mainBranch(s);
  const settled = branch.filter(
    (e) => e.type === "message" && e.message?.role === "assistant" && e.message?.stopReason === "stop",
  );
  const e = settled.find((x) => x.id === p.entryId);
  if (!e) {
    console.error(`skip ${p.session}:${p.entryId} - not a settled entry`);
    continue;
  }
  const cp = replayAt(s, e, settled.indexOf(e));
  if (!cp || !passesSizeGates(cp)) {
    console.error(`skip ${p.session}:${p.entryId} - fails size gates`);
    continue;
  }
  if (takenKeys.has(cp.checkpointKey)) {
    console.error(`skip ${p.session}:${p.entryId} - duplicate checkpointKey`);
    continue;
  }
  takenKeys.add(cp.checkpointKey);
  const rid = `cp${String(++id).padStart(3, "0")}`;
  rows.push({
    id: rid,
    session: c.label,
    stratum: c.stratum,
    liveLogged: false,
    sampling: "targeted-hard",
    ...cp,
  });
  writeWorksheet({
    outDir,
    id: rid,
    session: c.label,
    stratum: c.stratum,
    extraTitle: "[TARGETED-HARD]",
    checkpoint: cp,
    ordinal: settled.indexOf(e),
    settledCount: settled.length,
    branch,
  });
}
writeFileSync(
  join(outDir, "checkpoints-extension.jsonl"),
  `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`,
);
console.error(`\nbuilt ${rows.length} targeted checkpoints -> ${join(outDir, "checkpoints-extension.jsonl")}`);
