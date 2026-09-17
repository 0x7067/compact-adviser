import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSessionContext,
  type ExtensionContext,
  estimateTokens,
} from "@earendil-works/pi-coding-agent";

function clip(text: string, limit: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text) <= limit) return { text, truncated: false };
  return {
    text: Buffer.from(text)
      .subarray(0, Math.max(0, limit - 3))
      .toString("utf8"),
    truncated: true,
  };
}
const sensitivePath =
  /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|auth\.json|id_(?:rsa|ed25519)|[^\\/]*\.(?:pem|key))$/i;
function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
function redact(text: string): { text: string; redacted: boolean } {
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
export function snapshot(ctx: ExtensionContext) {
  const messages = buildSessionContext(ctx.sessionManager.buildContextEntries()).messages;
  const conversationTokens = messages.reduce((sum, m) => sum + estimateTokens(m), 0);
  const paths = new Map<string, { path: string; name: string }>();
  const artifacts = new Set<string>();
  let hasImages = false,
    redacted = false,
    unknownContext = false,
    omittedUsers = 0,
    recentTruncated = false;
  let userBudget = 8000,
    tailBudget = 14000;
  const users: { role: string; text: string }[] = [];
  const recent: { role: string; text: string; tool?: string; error?: boolean }[] = [];
  let summary = "";
  for (const m of messages) {
    if (m.role === "assistant")
      for (const c of m.content)
        if (c.type === "toolCall" && typeof c.arguments.path === "string")
          paths.set(c.id, { path: c.arguments.path, name: c.name });
    if (m.role === "toolResult") {
      const p = paths.get(m.toolCallId);
      if (p && !m.isError && ["write", "edit"].includes(p.name) && !sensitivePath.test(p.path)) {
        const full = resolve(ctx.cwd, p.path);
        if (fileExists(full)) artifacts.add(p.path);
      }
    }
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    let raw = "";
    if (m.role === "user" || m.role === "assistant" || m.role === "toolResult") {
      if (typeof m.content === "string") raw = m.content;
      else {
        hasImages ||= m.content.some((c) => c.type === "image");
        raw = m.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
      }
      if (m.role === "toolResult" && sensitivePath.test(paths.get(m.toolCallId)?.path ?? "")) {
        raw = "[Sensitive file content excluded]";
        redacted = true;
      }
    } else if (m.role === "compactionSummary" || m.role === "branchSummary") {
      if (!summary) {
        const s = redact(m.summary);
        summary = clip(s.text, 1500).text;
        redacted ||= s.redacted;
      }
      continue;
    } else {
      unknownContext = true;
      continue;
    }
    const cleaned = redact(raw);
    redacted ||= cleaned.redacted;
    if (m.role === "user") {
      const part = clip(cleaned.text, userBudget);
      if (part.truncated) omittedUsers++;
      if (part.text) users.unshift({ role: "user", text: part.text });
      userBudget = Math.max(0, userBudget - Buffer.byteLength(part.text));
    } else if (i >= messages.length - 6) {
      const part = clip(cleaned.text, Math.min(tailBudget, m.role === "toolResult" ? 512 : 8000));
      recentTruncated ||= part.truncated;
      tailBudget = Math.max(0, tailBudget - Buffer.byteLength(part.text));
      recent.unshift({
        role: m.role,
        text: part.text,
        ...(m.role === "toolResult" ? { tool: m.toolName, error: m.isError } : {}),
      });
    }
  }
  const persistent = ctx.sessionManager.getSessionFile();
  const recoveryAvailable = !!persistent && fileExists(persistent);
  const state = {
    userConstraints: users,
    recent,
    previousSummary: summary,
    savedArtifacts: [...artifacts].slice(-8).map((p) => clip(p, 256).text),
    coverage: {
      omittedUserMessages: omittedUsers,
      olderMessagesOmitted: Math.max(0, messages.length - 6),
      recentTextTruncated: recentTruncated,
      hasImages,
      redacted,
      unknownContext,
      transcriptRecoverable: recoveryAvailable,
    },
    compaction: {
      description:
        "Lossy summary of older context; default recent tail about 20k tokens; tool results truncated to 2000 characters for summarization. Other compaction hooks/settings may differ.",
    },
  };
  const lastAssistant = recent.filter((m) => m.role === "assistant").at(-1)?.text ?? "";
  const checkpointKey = createHash("sha256")
    .update(JSON.stringify([users.at(-1)?.text, lastAssistant]))
    .digest("hex");
  return {
    state,
    conversationTokens,
    checkpointKey,
    autoCoverage:
      omittedUsers === 0 &&
      !recentTruncated &&
      !hasImages &&
      !redacted &&
      !unknownContext &&
      recoveryAvailable,
  };
}
