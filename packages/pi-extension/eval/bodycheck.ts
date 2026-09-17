import { readFileSync } from "node:fs";
import { MAX_REQUEST_BYTES, requestBody } from "../src/judge.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: node --import tsx eval/bodycheck.ts <checkpoints.jsonl>");
  process.exit(1);
}
const rows = readFileSync(path, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
let max = 0,
  maxId = "",
  fail = 0;
for (const r of rows) {
  try {
    const b = Buffer.byteLength(requestBody(r.state));
    if (b > max) {
      max = b;
      maxId = r.id;
    }
  } catch {
    fail++;
    console.error(`OVER CAP: ${r.id}`);
  }
}
console.error(
  `max body = ${max} on ${maxId} / cap ${MAX_REQUEST_BYTES} (${((100 * max) / MAX_REQUEST_BYTES).toFixed(1)}%), over-cap rows: ${fail}`,
);
