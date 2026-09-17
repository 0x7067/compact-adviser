/** Reconstruct the main branch (leaf -> root parent chain) of a session file. */
import type { LoadedSession } from "./replay.ts";

type BranchEntry = LoadedSession["entries"][number];

export function mainBranch(s: LoadedSession): BranchEntry[] {
  const byId = new Map<string, BranchEntry>();
  for (const e of s.entries) byId.set(e.id, e);
  const parents = new Set<string>();
  for (const e of s.entries) if (e.parentId) parents.add(e.parentId);
  let leaf: BranchEntry | undefined;
  for (let i = s.entries.length - 1; i >= 0; i--) {
    if (!parents.has(s.entries[i].id)) {
      leaf = s.entries[i];
      break;
    }
  }
  if (!leaf) leaf = s.entries.at(-1);
  const chain: BranchEntry[] = [];
  let cur: BranchEntry | undefined = leaf;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain.reverse();
}
