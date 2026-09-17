/**
 * Re-replay an existing checkpoint set with the CURRENT snapshot code, keeping
 * every row id stable so gold labels stay aligned across iterations.
 *   node --import tsx eval/rebuild.ts <in.jsonl> <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mainBranch } from "./branch.ts";
import { loadCorpus } from "./corpus.ts";
import { loadSession, passesSizeGates, replayAt } from "./replay.ts";

const inPath = process.argv[2];
const outDir = process.argv[3];
if (!inPath || !outDir) {
  console.error("usage: node --import tsx eval/rebuild.ts <in.jsonl> <outDir>");
  process.exit(1);
}
const rows = readFileSync(inPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
mkdirSync(outDir, { recursive: true });
const sessions = new Map<string, ReturnType<typeof loadSession>>();
const corpus = loadCorpus();
const out: unknown[] = [];
let dropped = 0;
for (const r of rows) {
  const c = corpus.find((x) => x.label === r.session);
  if (!c) {
    console.error(`DROP ${r.id} (${r.session}:${r.entryId}) - not in corpus`);
    dropped++;
    continue;
  }
  if (!sessions.has(c.label)) sessions.set(c.label, loadSession(c.file));
  const s = sessions.get(c.label);
  if (!s) {
    dropped++;
    continue;
  }
  const settled = mainBranch(s).filter(
    (e) => e.type === "message" && e.message?.role === "assistant" && e.message?.stopReason === "stop",
  );
  const e = settled.find((x) => x.id === r.entryId);
  const cp = e ? replayAt(s, e, settled.indexOf(e)) : null;
  if (!cp || !passesSizeGates(cp)) {
    console.error(`DROP ${r.id} (${r.session}:${r.entryId})`);
    dropped++;
    continue;
  }
  out.push({
    id: r.id,
    session: r.session,
    stratum: r.stratum,
    liveLogged: r.liveLogged ?? false,
    sampling: r.sampling ?? "spread",
    ...cp,
  });
}
writeFileSync(join(outDir, "checkpoints.jsonl"), `${out.map((r) => JSON.stringify(r)).join("\n")}\n`);
const bytes = out.map((r) => (r as { stateBytes: number }).stateBytes).sort((a, b) => a - b);
const arts = out.map((r) => ((r as { state: { savedArtifacts: unknown[] } }).state.savedArtifacts ?? []).length);
console.error(`rebuilt ${out.length}/${rows.length} (dropped ${dropped}) -> ${join(outDir, "checkpoints.jsonl")}`);
if (bytes.length) {
  console.error(`stateBytes: min=${bytes[0]} median=${bytes[bytes.length >> 1]} max=${bytes.at(-1)}`);
  const sortedArts = arts.slice().sort((a, b) => a - b);
  console.error(
    `savedArtifacts entries: min=${Math.min(...arts)} median=${sortedArts[sortedArts.length >> 1]} max=${Math.max(...arts)} | empty on ${arts.filter((n) => n === 0).length}/${out.length}`,
  );
}
