import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const REQUEST_LOG_NAME = "compact-adviser-requests.jsonl";

export function requestLogPath(agentDir: string): string {
  return join(agentDir, REQUEST_LOG_NAME);
}

export function requestLogLine(body: string, at = new Date().toISOString()): string {
  return `${JSON.stringify({ at, body: JSON.parse(body) })}\n`;
}

export function appendRequestLog(agentDir: string, body: string): void {
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  appendFileSync(requestLogPath(agentDir), requestLogLine(body), { mode: 0o600 });
}
