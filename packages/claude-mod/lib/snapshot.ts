// The bounded, text-only judge input built from `$.session.messages()`, following the
// Pi extension's snapshot: user constraints, the recent tail, the prior summary, saved
// artifact names, and explicit coverage markers. Nothing here touches the engine.

export interface ToolUseLike {
  tool_use_id?: string;
  tool: string;
  input: Record<string, unknown>;
  text?: string;
  isError?: true;
}

export interface MessageLike {
  role: "user" | "assistant";
  text: string;
  toolUses: readonly ToolUseLike[];
  toolResults?: readonly { text: string; isError: boolean }[];
}

/** `$.session.messages()` answers at most this many; a full answer means older ones exist. */
export const MESSAGE_LIMIT = 4096;
export const SUMMARY_PREFIX = "This session is being continued from a previous conversation";
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

function clip(text: string, limit: number): { text: string; truncated: boolean } {
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength <= limit) return { text, truncated: false };
  const cut = new TextDecoder().decode(bytes.subarray(0, Math.max(0, limit - 3)));
  // A multi-byte character split at the cut decodes as U+FFFD; drop it.
  return { text: cut.replace(/�$/, ""), truncated: true };
}

function bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

const sensitivePath =
  /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|auth\.json|id_(?:rsa|ed25519)|[^\\/]*\.(?:pem|key))$/i;

export function redact(text: string): { text: string; redacted: boolean } {
  const clean = text
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{15,}|Bearer\s+\S+)/gi, "[REDACTED]")
    .replace(
      /\b([A-Z_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))\s*[=:]\s*["']?[^\s"',}]+/g,
      "$1=[REDACTED]",
    );
  return { text: clean, redacted: clean !== text };
}

function toolPath(use: ToolUseLike): string | undefined {
  const path = use.input.file_path ?? use.input.notebook_path ?? use.input.path;
  return typeof path === "string" ? path : undefined;
}

/** A local estimate of the conversation's own tokens (about four characters per token). */
export function estimateConversationTokens(messages: readonly MessageLike[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.text.length;
    for (const use of m.toolUses)
      chars += JSON.stringify(use.input).length + (use.text?.length ?? 0);
    for (const result of m.toolResults ?? []) chars += result.text.length;
  }
  return Math.ceil(chars / 4);
}

export interface Snapshot {
  state: {
    userConstraints: { role: "user"; text: string }[];
    recent: {
      role: string;
      text: string;
      tools?: { tool: string; error: boolean; excerpt: string }[];
    }[];
    previousSummary: string;
    savedArtifacts: string[];
    coverage: {
      omittedUserMessages: number;
      olderMessagesOmitted: number;
      recentTextTruncated: boolean;
      hasImages: boolean;
      redacted: boolean;
      transcriptLimitReached: boolean;
    };
    compaction: { description: string };
  };
  conversationTokens: number;
  /** The text the checkpoint fingerprint is taken over: the latest ask and reply. */
  checkpointText: string;
  autoCoverage: boolean;
}

export function snapshot(messages: readonly MessageLike[]): Snapshot {
  const artifacts = new Set<string>();
  let redacted = false;
  let omittedUsers = 0;
  let recentTruncated = false;
  let userBudget = 8000;
  let tailBudget = 14000;
  let summary = "";
  const users: { role: "user"; text: string }[] = [];
  const recent: Snapshot["state"]["recent"] = [];

  for (const m of messages) {
    for (const use of m.toolUses) {
      const path = toolPath(use);
      if (path && !use.isError && WRITE_TOOLS.has(use.tool) && !sensitivePath.test(path)) {
        artifacts.delete(path);
        artifacts.add(path);
      }
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "user" && m.text.startsWith(SUMMARY_PREFIX)) {
      if (!summary) {
        const s = redact(m.text);
        summary = clip(s.text, 1500).text;
        redacted ||= s.redacted;
      }
      continue;
    }
    const cleaned = redact(m.text);
    redacted ||= cleaned.redacted;
    if (m.role === "user" && cleaned.text.trim()) {
      const part = clip(cleaned.text, userBudget);
      if (part.truncated) omittedUsers++;
      if (part.text) users.unshift({ role: "user", text: part.text });
      userBudget = Math.max(0, userBudget - bytes(part.text));
    } else if (m.role === "assistant" && i >= messages.length - 6) {
      const part = clip(cleaned.text, Math.min(tailBudget, 8000));
      recentTruncated ||= part.truncated;
      tailBudget = Math.max(0, tailBudget - bytes(part.text));
      const tools = m.toolUses.map((use) => {
        const path = toolPath(use);
        let excerpt: string;
        if (path && sensitivePath.test(path)) {
          excerpt = "[Sensitive file content excluded]";
          redacted = true;
        } else {
          const r = redact(use.text ?? "");
          redacted ||= r.redacted;
          const c = clip(r.text, Math.min(tailBudget, 512));
          recentTruncated ||= c.truncated;
          excerpt = c.text;
        }
        tailBudget = Math.max(0, tailBudget - bytes(excerpt));
        return { tool: use.tool, error: use.isError === true, excerpt };
      });
      recent.unshift({ role: "assistant", text: part.text, ...(tools.length ? { tools } : {}) });
    }
  }

  const lastUser = users.at(-1)?.text ?? "";
  const lastAssistant = recent.at(-1)?.text ?? "";
  const transcriptLimitReached = messages.length >= MESSAGE_LIMIT;
  const state: Snapshot["state"] = {
    userConstraints: users,
    recent,
    previousSummary: summary,
    savedArtifacts: [...artifacts].slice(-8).map((p) => clip(p, 256).text),
    coverage: {
      omittedUserMessages: omittedUsers,
      olderMessagesOmitted: Math.max(0, messages.length - 6),
      recentTextTruncated: recentTruncated,
      // Claude Code's transcript view carries text only; images cannot be detected here.
      hasImages: false,
      redacted,
      transcriptLimitReached,
    },
    compaction: {
      description:
        "Lossy structured summary of older context (request, files, errors, pending tasks, current work, next step) plus a few recent messages. Exact tool output and long file contents are compressed away. Other compaction hooks may differ.",
    },
  };
  return {
    state,
    conversationTokens: estimateConversationTokens(messages),
    checkpointText: JSON.stringify([lastUser, lastAssistant]),
    autoCoverage: omittedUsers === 0 && !recentTruncated && !redacted && !transcriptLimitReached,
  };
}
