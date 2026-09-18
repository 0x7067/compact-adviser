import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const worktree = "/Users/kunchen/.no-mistakes/worktrees/8383627c78c8/01M2V2Q738MEJ9RC9JTG204JWR";
const evidence = "/Users/kunchen/.no-mistakes/evidence/01M2V2Q738MEJ9RC9JTG204JWR";
const lab = join(evidence, "claude-noninteractive-lab");
rmSync(lab, { recursive: true, force: true });
mkdirSync(join(lab, "config"), { recursive: true });
mkdirSync(join(lab, "project"), { recursive: true });
const apiKey = "sk-ant-fixture-not-a-real-key-0000000000";
writeFileSync(join(lab, "config", ".claude.json"), JSON.stringify({
  hasCompletedOnboarding: true,
  theme: "dark",
  customApiKeyResponses: { approved: [apiKey.slice(-20)], rejected: [] },
  projects: { [join(lab, "project")]: { hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true } }
}));
const requests = { anthropic: 0, jev: 0 };
const server = createServer((req, res) => {
  let raw = "";
  req.on("data", c => raw += c);
  req.on("end", () => {
    if (req.url.startsWith("/v1/systemone")) {
      requests.jev++;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ model: "jev-fixture", usage: { input_tokens: 1, output_tokens: 1 }, answers: {
        done: { type: "choice", choice: "finished", confidence: 1, probabilities: { finished: 1, not_finished: 0, unclear: 0 } },
        shape: { type: "choice", choice: "hands_on", confidence: 1, probabilities: { hands_on: 1, coordinating: 0, unclear: 0 } }
      }}));
      return;
    }
    if (req.url.startsWith("/v1/messages/count_tokens")) {
      res.writeHead(200, { "content-type": "application/json" }); res.end('{"input_tokens":70000}'); return;
    }
    if (req.url.startsWith("/v1/messages")) {
      requests.anthropic++;
      const message = { id: "msg_fixture", type: "message", role: "assistant", model: "claude-fixture", content: [{ type: "text", text: "LIVE_FIXTURE_COMPLETE" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 70000, output_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(message)); return;
    }
    res.writeHead(404); res.end();
  });
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const env = { ...process.env };
for (const key of Object.keys(env)) if (key === "CLAUDECODE" || key === "CLAUDE_CONFIG_DIR" || key.startsWith("CLAUDE_CODE_")) delete env[key];
Object.assign(env, {
  CLAUDE_CONFIG_DIR: join(lab, "config"), HOME: lab,
  ANTHROPIC_API_KEY: apiKey, ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
  CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1", CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "false",
  DISABLE_AUTOUPDATER: "1", TYPESAFE_API_KEY: "test-key-not-a-secret",
  COMPACT_ADVISER_TEST_ENDPOINT: `http://127.0.0.1:${port}/v1/systemone`
});
const result = await new Promise((resolve, reject) => {
  const child = spawn("/Users/kunchen/.local/bin/claude", ["--plugin-dir", join(worktree, "packages/claude-mod"), "--model", "claude-sonnet-4-5", "-p", "Finish the live fixture and report completion."], { cwd: join(lab, "project"), env });
  let stdout = "", stderr = "";
  child.stdin.end();
  child.stdout.on("data", chunk => stdout += chunk);
  child.stderr.on("data", chunk => stderr += chunk);
  child.on("error", reject);
  child.on("close", status => resolve({ status, stdout, stderr }));
  setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Claude Code timed out")); }, 60000).unref();
});
server.close();
const report = [
  `exit: ${result.status}`,
  `stdout: ${(result.stdout || "").trim()}`,
  `stderr: ${(result.stderr || "").trim()}`,
  `Anthropic fixture requests: ${requests.anthropic}`,
  `TypeSafe/Jev requests: ${requests.jev}`,
  `result: ${result.status === 0 && requests.anthropic >= 1 && requests.jev === 0 ? "PASS - real Claude Code print session stayed adviser-inert" : "FAIL"}`
].join("\n") + "\n";
writeFileSync(join(evidence, "claude-noninteractive-result.txt"), report);
process.stdout.write(report);
if (!(result.status === 0 && requests.anthropic >= 1 && requests.jev === 0)) process.exitCode = 1;
