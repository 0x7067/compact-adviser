import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Checkpoint } from "./replay.ts";
import { futureWindow, renderEntry } from "./render.ts";

type SnapshotState = {
  coverage?: unknown;
  savedArtifacts?: unknown;
  userConstraints?: Array<{ text: string }>;
  recent?: Array<{ role: string; tool?: string; error?: boolean; text: string }>;
};

export function writeWorksheet(opts: {
  outDir: string;
  id: string;
  session: string;
  stratum: string;
  extraTitle?: string;
  checkpoint: Checkpoint;
  ordinal: number;
  settledCount: number;
  branch: Array<{ id: string; type?: string; [k: string]: unknown }>;
  liveLogged?: boolean;
}): void {
  const st = opts.checkpoint.state as SnapshotState;
  const fut = futureWindow(opts.branch, opts.checkpoint.entryId);
  const live = opts.liveLogged ? "  [LIVE-LOGGED PRODUCTION REQUEST]" : "";
  const extra = opts.extraTitle ? `  ${opts.extraTitle}` : "";
  writeFileSync(
    join(opts.outDir, "worksheet", `${opts.id}.md`),
    [
      `# ${opts.id}  (${opts.session} / ${opts.stratum})${live}${extra}`,
      "",
      `entry=${opts.checkpoint.entryId} ts=${opts.checkpoint.timestamp} settledOrdinal=${opts.ordinal + 1}/${opts.settledCount}`,
      `contextTokens=${opts.checkpoint.contextTokens} conversationTokens=${opts.checkpoint.conversationTokens} stateBytes=${opts.checkpoint.stateBytes} autoCoverage=${opts.checkpoint.autoCoverage}`,
      `coverage=${JSON.stringify(st.coverage)}`,
      `savedArtifacts=${JSON.stringify(st.savedArtifacts)}`,
      "",
      "## A. What the judge sees - last user constraints",
      ...(st.userConstraints ?? []).slice(-3).map((m) => `- ${m.text.slice(0, 500).replace(/\n/g, " ")}`),
      "",
      "## B. What the judge sees - tail of `recent`",
      ...(st.recent ?? [])
        .slice(-8)
        .map(
          (m) =>
            `- [${m.role}${m.tool ? `:${m.tool}` : ""}${m.error ? " ERROR" : ""}] ${m.text.slice(0, 600).replace(/\n/g, " ")}`,
        ),
      "",
      "## C. FUTURE - labelling evidence only, never sent to the judge",
      ...fut.map((f) => `- ${renderEntry(f, 500).replace(/\n/g, " ")}`),
      "",
      "## D. Labels",
      "phase_gold: ",
      "continuation_gold: ",
      "safe_to_compact: ",
      "pivot: ",
      "note: ",
      "",
    ].join("\n"),
  );
}
