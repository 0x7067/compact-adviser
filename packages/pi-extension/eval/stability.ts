/** Repeat the same checkpoints N times to measure judgment stability. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { judge } from "../src/judge.ts";
import { continuationOf } from "./continuation.ts";
import { typesafeKeyFromEnv } from "./key.ts";

const dir = process.argv[2];
const reps = Number(process.argv[3] ?? 3);
const ids = process.argv.slice(4);
if (!dir || ids.length === 0) {
  console.error("usage: node --import tsx eval/stability.ts <dataDir> [reps] <id...>");
  process.exit(1);
}
const key = typesafeKeyFromEnv();
const rows = readFileSync(join(dir, "checkpoints.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
for (const id of ids) {
  const r = rows.find((x: { id: string }) => x.id === id);
  if (!r) {
    console.error(`${id}: not found`);
    continue;
  }
  const ph: string[] = [];
  const co: string[] = [];
  const pp: number[] = [];
  const cp: number[] = [];
  for (let i = 0; i < reps; i++) {
    const j = await judge(r.state, key, new AbortController().signal, fetch, 60000);
    ph.push(j.phase.choice);
    pp.push(j.phase.probabilities.completed_checkpoint);
    const cont = continuationOf(j);
    if (cont) {
      co.push(cont.choice);
      cp.push(cont.probabilities.recoverable ?? Number.NaN);
    }
  }
  const uniq = (a: string[]) => [...new Set(a)];
  const contPart =
    co.length > 0
      ? `  cont=${uniq(co).join("|")} P=[${cp.map((x) => x.toFixed(2)).join(" ")}]`
      : "";
  console.error(
    `${id}  phase=${uniq(ph).join("|")} P=[${pp.map((x) => x.toFixed(2)).join(" ")}]${contPart}`,
  );
}
