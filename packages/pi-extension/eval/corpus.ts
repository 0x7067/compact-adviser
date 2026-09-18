/**
 * Corpus contract for the judgment-eval harness.
 *
 * Real session paths stay out of git. Copy `corpus.example.json` to
 * `eval/local/corpus.json` (gitignored) and point each `file` at your own
 * Pi session transcripts. Override the path with COMPACT_ADVISER_CORPUS.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Stratum = string;

export interface CorpusEntry {
  /** Opaque label used in worksheets and metrics grouping. */
  label: string;
  /** Caller-defined grouping (for example interactive vs long-running). */
  stratum: Stratum;
  /** Absolute path to a Pi session `.jsonl` file. */
  file: string;
}

export const EVAL_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CORPUS_PATH = join(EVAL_DIR, "local", "corpus.json");
export const EXAMPLE_CORPUS_PATH = join(EVAL_DIR, "corpus.example.json");

export function corpusPath(): string {
  return process.env.COMPACT_ADVISER_CORPUS?.trim() || DEFAULT_CORPUS_PATH;
}

function parseCorpus(value: unknown, path: string): CorpusEntry[] {
  if (!Array.isArray(value)) {
    throw new Error(`Corpus at ${path} must be a JSON array of {label, stratum, file} objects.`);
  }
  const out: CorpusEntry[] = [];
  for (const [i, row] of value.entries()) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof (row as CorpusEntry).label !== "string" ||
      typeof (row as CorpusEntry).stratum !== "string" ||
      typeof (row as CorpusEntry).file !== "string" ||
      !(row as CorpusEntry).label.trim() ||
      !(row as CorpusEntry).stratum.trim() ||
      !(row as CorpusEntry).file.trim()
    ) {
      throw new Error(`Corpus row ${i} in ${path} must have non-empty string label, stratum, and file.`);
    }
    const entry = row as CorpusEntry;
    out.push({ label: entry.label, stratum: entry.stratum, file: entry.file });
  }
  return out;
}

export function loadCorpus(path = corpusPath()): CorpusEntry[] {
  if (!existsSync(path)) {
    throw new Error(
      `No corpus at ${path}. Copy ${EXAMPLE_CORPUS_PATH} to ${DEFAULT_CORPUS_PATH} and point each file at your own Pi session transcripts.`,
    );
  }
  return parseCorpus(JSON.parse(readFileSync(path, "utf8")), path);
}
