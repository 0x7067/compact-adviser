/** Readable rendering of session entries for label worksheets (local review only). */

type ContentPart = {
  type?: string;
  text?: string;
  name?: string;
  arguments?: unknown;
  thinking?: string;
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const out: string[] = [];
  for (const c of content as ContentPart[]) {
    if (c.type === "text") out.push(c.text ?? "");
    else if (c.type === "toolCall")
      out.push(`<toolCall ${c.name} ${JSON.stringify(c.arguments).slice(0, 220)}>`);
    else if (c.type === "image") out.push("<image>");
    else if (c.type === "thinking") out.push(`<thinking ${String(c.thinking ?? "").length}b>`);
  }
  return out.join("\n");
}

export function renderEntry(e: Record<string, unknown>, limit = 900): string {
  if (e.type === "message") {
    const m = e.message as {
      role?: string;
      stopReason?: string;
      content?: unknown;
    };
    const head = `[${m.role}${m.stopReason ? ` stop=${m.stopReason}` : ""}]`;
    const body = textOf(m.content).trim();
    return `${head} ${body.length > limit ? `${body.slice(0, limit)} …(+${body.length - limit}b)` : body}`;
  }
  if (e.type === "custom_message")
    return `[custom_message ${e.customType}] ${String(e.content ?? "").slice(0, 300)}`;
  if (e.type === "custom") return `[custom ${e.customType}]`;
  if (e.type === "compaction") return `[COMPACTION]`;
  return `[${e.type}]`;
}

/** Entries after the checkpoint on the branch - labelling evidence the judge never sees. */
export function futureWindow<T extends { id: string }>(
  branch: T[],
  checkpointId: string,
  maxEntries = 14,
): T[] {
  const i = branch.findIndex((e) => e.id === checkpointId);
  if (i < 0) return [];
  return branch.slice(i + 1, i + 1 + maxEntries);
}
