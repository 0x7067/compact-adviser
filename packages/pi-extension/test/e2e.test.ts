import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { ConfigStore } from "../src/config.ts";
import { assistant, temp } from "./helpers.ts";

const root = process.cwd();
const binary = process.env.COMPACT_TEST_PI_BIN ?? "";
assert.ok(
  binary,
  "Set COMPACT_TEST_PI_BIN to the actual Pi 0.82.0 executable (not npm's injected PATH).",
);
function run(
  t: TestContext,
  mode: "hint" | "auto",
  actions: { send: string; wait?: string }[],
  installed = false,
) {
  const dir = temp(t),
    store = new ConfigStore(dir);
  store.update({ mode, sharingConsent: true, autoAcknowledged: mode === "auto" });
  const sm = SessionManager.create(dir, join(dir, "sessions"));
  sm.appendMessage({
    role: "user",
    content: "Finish and save the report, then read it next.",
    timestamp: Date.now(),
  });
  sm.appendMessage(assistant("Earlier exploration. ".repeat(6000)));
  for (let i = 0; i < 8; i++) sm.appendMessage(assistant(`Earlier step ${i}`));
  const log = join(dir, "events.jsonl");
  if (installed) {
    const product = join(dir, "package");
    mkdirSync(product);
    for (const file of ["package.json", "package-lock.json", "src"])
      cpSync(join(root, file), join(product, file), { recursive: true });
    execFileSync(
      "npm",
      ["ci", "--omit=dev", "--omit=peer", "--ignore-scripts", "--no-audit", "--no-fund"],
      { cwd: product, timeout: 60000 },
    );
    assert.ok(existsSync(join(product, "node_modules/proper-lockfile")));
    assert.ok(!existsSync(join(product, "node_modules/@earendil-works/pi-coding-agent")));
    execFileSync(binary, ["install", product], {
      cwd: dir,
      env: { ...process.env, PI_CODING_AGENT_DIR: dir, PI_OFFLINE: "1", PI_TELEMETRY: "0" },
      timeout: 30000,
    });
    const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
    assert.equal(settings.packages.length, 1);
  }
  const spec = {
    cwd: dir,
    command: [
      binary,
      ...(installed ? [] : ["--no-extensions", "-e", root]),
      "-e",
      join(root, "test/fixtures/runtime.ts"),
      "--no-skills",
      "--no-context-files",
      "--no-prompt-templates",
      "--no-themes",
      "--no-approve",
      "--no-tools",
      "--provider",
      "compact-fixture",
      "--model",
      "local",
      "--thinking",
      "off",
      "--session",
      sm.getSessionFile(),
      "--session-dir",
      join(dir, "sessions"),
    ],
    env: {
      PI_CODING_AGENT_DIR: dir,
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0",
      TYPESAFE_API_KEY: "test-key-not-a-secret",
      COMPACT_TEST_LOG: log,
    },
    actions,
    output: join(dir, "terminal.log"),
  };
  const result = execFileSync("python3", [join(root, "test/fixtures/tui.py")], {
    input: JSON.stringify(spec),
    encoding: "utf8",
    timeout: 90000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const events = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return { dir, store, result: JSON.parse(result), events };
}

test("signed Pi 0.82.0: native configuration input is actually prefilled", (t) => {
  assert.equal(
    execFileSync(binary, ["--version"], { encoding: "utf8" }).trim(),
    "0.82.0",
    "Set COMPACT_TEST_PI_BIN to the target Pi 0.82.0 executable.",
  );
  const r = run(t, "hint", [
    { send: "/compact-adviser\r", wait: "Compact adviser (saved for all sessions)" },
    { send: "\x1b[B\r", wait: "Minimum context tokens" },
    { send: "\r", wait: "Minimum context saved: 40,000 tokens" },
    { send: "\x1b[B\r", wait: "Minimum context tokens" },
    { send: "\x01\x0b60000\r", wait: "Minimum context saved: 60,000 tokens" },
    { send: "\x1b[B\x1b[B\r", wait: "Minimum context saved: 40,000 tokens" },
  ]);
  assert.equal(r.store.read().minContextTokens, 40000);
  assert.ok(r.result.ok);
});

test("signed Pi 0.82.0: real settled event produces the hint through native UI", (t) => {
  const r = run(t, "hint", [
    { send: "Finish the fixture report.\r", wait: "Run /compact to save tokens." },
  ]);
  assert.equal(r.events.filter((e) => e.event === "jev").length, 1);
  assert.ok(r.events.some((e) => e.event === "start" && e.mode === "tui"));
  assert.ok(r.events.some((e) => e.event === "settled" && e.idle));
  assert.ok(!r.events.some((e) => e.event === "compacted"));
});

test("signed Pi 0.82.0: opt-in auto uses native compaction and resets usage", (t) => {
  const r = run(t, "auto", [
    { send: "Finish the fixture report.\r", wait: "Compact adviser: compaction completed." },
  ]);
  assert.equal(r.events.filter((e) => e.event === "jev").length, 1);
  assert.ok(r.events.some((e) => e.event === "compacted" && e.tokens === null));
});

test("signed Pi 0.82.0: production-only independent package installs and loads through its manifest", (t) => {
  const r = run(
    t,
    "hint",
    [{ send: "Finish the installed package fixture.\r", wait: "Run /compact to save tokens." }],
    true,
  );
  assert.equal(r.events.filter((e) => e.event === "jev").length, 1);
});
