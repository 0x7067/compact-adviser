export const REQUEST_LOG_NAME = "compact-adviser-requests.jsonl";

export function requestLogPath(home: string): string {
  const root = home.replace(/[\\/]+$/, "");
  return `${root}/.claude/${REQUEST_LOG_NAME}`;
}

export function requestLogLine(body: string, at = new Date().toISOString()): string {
  return `${JSON.stringify({ at, body: JSON.parse(body) })}\n`;
}
