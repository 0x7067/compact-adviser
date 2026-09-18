import type { CorpusEntry } from "./corpus.ts";

/**
 * Example corpus shape. The runner loads JSON, not this file.
 * Copy `corpus.example.json` to `eval/local/corpus.json` and replace `file`
 * with absolute paths to YOUR Pi session transcripts.
 *
 * Pi stores sessions under the agent directory, typically:
 *   ~/.pi/agent/sessions/<encoded-project-dir>/<timestamp>_<uuid>.jsonl
 *
 * Do not commit real session paths, worktree hashes, private repository names,
 * or home directories.
 */
export const CORPUS: CorpusEntry[] = [
  {
    label: "interactive-1",
    stratum: "interactive",
    file: "/absolute/path/to/agent/sessions/<project>/<session>.jsonl",
  },
  {
    label: "coding-1",
    stratum: "coding",
    file: "/absolute/path/to/agent/sessions/<project>/<session>.jsonl",
  },
  {
    label: "longturn-1",
    stratum: "longturn",
    file: "/absolute/path/to/agent/sessions/<project>/<session>.jsonl",
  },
];
