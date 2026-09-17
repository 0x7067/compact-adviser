import assert from "node:assert/strict";
import { readFileSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { lockSync } from "proper-lockfile";
import { ConfigStore, DEFAULT_CONFIG, parseMinimum } from "../src/config.ts";
import { snapshot } from "../src/context.ts";
import { parseDotenvKey, resolveTypesafeApiKey } from "../src/env.ts";
import {
  ENDPOINT,
  judge,
  MAX_REQUEST_BYTES,
  parseJudgment,
  qualifies,
  requestBody,
} from "../src/judge.ts";
import { apiResponse, assistant, harness, temp } from "./helpers.ts";

test("config defaults, atomic persistence, field merging, contention and invalid files", (t) => {
  const dir = temp(t),
    a = new ConfigStore(dir),
    b = new ConfigStore(dir);
  assert.deepEqual(a.read(), DEFAULT_CONFIG);
  a.update({ mode: "auto", autoAcknowledged: true });
  b.update({ minContextTokens: 60000 });
  assert.equal(a.read().mode, "auto");
  assert.equal(a.read().minContextTokens, 60000);
  assert.equal(statSync(a.path).mode & 0o777, 0o600);
  const release = lockSync(a.path, { realpath: false });
  assert.throws(() => b.update({ mode: "off" }));
  release();
  assert.equal(a.read().mode, "auto");
  const previous = readFileSync(a.path, "utf8");
  assert.throws(() => a.update({ minContextTokens: 0 }));
  assert.equal(readFileSync(a.path, "utf8"), previous);
  writeFileSync(a.path, JSON.stringify({ ...DEFAULT_CONFIG, version: 2 }));
  assert.throws(() => a.read());
  assert.throws(() => a.update({ mode: "hint" }));
  const target = join(dir, "elsewhere");
  writeFileSync(target, JSON.stringify(DEFAULT_CONFIG));
  unlinkSync(a.path);
  symlinkSync(target, a.path);
  assert.throws(() => a.read());
  assert.throws(() => a.update({ mode: "off" }));
  assert.equal(JSON.parse(readFileSync(target, "utf8")).mode, "hint");
});

test("minimum parsing rejects ambiguous, nonpositive or unsafe values", () => {
  assert.equal(parseMinimum(" 40000 "), 40000);
  for (const value of ["", "0", "-1", "1.5", "40k", "4e4", "NaN", "Infinity", "9007199254740992"])
    assert.throws(() => parseMinimum(value), value);
});

test("bounded snapshot excludes system prompt, thinking, images and known secrets", (t) => {
  const h = harness(t);
  h.sm.appendMessage({
    role: "user",
    content: [
      { type: "text", text: "API_KEY=secretvalue123 preserve the requirement" },
      { type: "image", data: "IMAGESECRET", mimeType: "image/png" },
    ],
    timestamp: Date.now(),
  });
  h.sm.appendMessage({
    ...assistant("Saved"),
    content: [
      { type: "thinking", thinking: "INTERNALSECRET" },
      { type: "text", text: "Saved. Bearer fixtureSecretToken" },
    ],
  });
  const result = snapshot(h.ctx),
    body = requestBody(result.state);
  assert.ok(Buffer.byteLength(body) <= MAX_REQUEST_BYTES);
  assert.ok(!body.includes("SYSTEM_SECRET_NOT_EXPORTED"));
  assert.ok(!body.includes("secretvalue123"));
  assert.ok(!body.includes("fixtureSecretToken"));
  assert.ok(!body.includes("IMAGESECRET"));
  assert.ok(!body.includes("INTERNALSECRET"));
  assert.equal(result.state.coverage.hasImages, true);
  assert.equal(result.autoCoverage, false);
});

test("request contains typed factors; output validation rejects malformed/contradictory confidence evidence", () => {
  const valid = parseJudgment(apiResponse());
  assert.ok(qualifies(valid, false));
  assert.ok(qualifies(valid, true));
  const low = { ...valid, volatileDependency: 0.08 };
  assert.ok(qualifies(low, false));
  assert.ok(!qualifies(low, true));
  const contradiction = {
    ...valid,
    continuation: { ...valid.continuation, choice: "needs_older_details" },
  };
  assert.ok(!qualifies(contradiction, false));
  const bad = apiResponse();
  bad.answers.phase.probabilities.completed_checkpoint = 0.6;
  assert.throws(() => parseJudgment(bad));
  assert.throws(() => parseJudgment({}));
  assert.throws(() => requestBody({ text: "x".repeat(MAX_REQUEST_BYTES) }));
});

test("HTTP contract, output bound, status classification, and cancellation", async () => {
  let seen: RequestInit | undefined;
  let url: unknown;
  const transport = (async (input, init) => {
    url = input;
    seen = init;
    return new Response(JSON.stringify(apiResponse()), { status: 200 });
  }) as typeof fetch;
  const result = await judge(
    { phase: "done" },
    "fake-test-key",
    new AbortController().signal,
    transport,
  );
  assert.equal(url, ENDPOINT);
  assert.equal(result.inputTokens, 2000);
  assert.equal(seen?.redirect, "error");
  const headers = seen?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer fake-test-key");
  assert.ok(!String(seen?.body).includes("fake-test-key"));
  const body = JSON.parse(String(seen?.body));
  assert.equal(body.model, "jev-latest");
  assert.deepEqual(Object.keys(body.questions), ["phase", "continuation", "volatile_dependency"]);
  for (const [status, kind] of [
    [401, "authentication"],
    [429, "rate-limit"],
    [529, "server"],
  ] as const) {
    await assert.rejects(
      judge(
        {},
        "x",
        new AbortController().signal,
        (async () => new Response("error", { status })) as typeof fetch,
      ),
      new RegExp(kind),
    );
  }
  await assert.rejects(
    judge(
      {},
      "x",
      new AbortController().signal,
      (async () => new Response("x".repeat(40000))) as typeof fetch,
    ),
    /response/,
  );
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    judge({}, "x", aborted.signal, (async (_url, init) => {
      init?.signal?.throwIfAborted();
      throw new Error("unexpected");
    }) as typeof fetch),
    /network/,
  );
});

test("cwd .env supplies TYPESAFE_API_KEY when process env is empty and is ignored when env is set", (t) => {
  const dir = temp(t);
  writeFileSync(
    join(dir, ".env"),
    "# TYPESAFE_API_KEY=commented\n\nOTHER=nope\nTYPESAFE_API_KEY=from-dotenv\nTYPESAFE_API_KEY=from-dotenv-last\n",
  );
  assert.equal(resolveTypesafeApiKey({ TYPESAFE_API_KEY: "" }, dir), "from-dotenv-last");
  assert.equal(resolveTypesafeApiKey({}, dir), "from-dotenv-last");
  assert.equal(resolveTypesafeApiKey({ TYPESAFE_API_KEY: "from-env" }, dir), "from-env");
  assert.equal(resolveTypesafeApiKey({ TYPESAFE_API_KEY: "   " }, dir), "from-dotenv-last");
  assert.equal(resolveTypesafeApiKey({}, temp(t)), undefined);
  assert.equal(parseDotenvKey("TYPESAFE_API_KEY=only\n", "TYPESAFE_API_KEY"), "only");
});

test("cwd .env accepts export, declare -x, and one matching quote layer", (t) => {
  const dir = temp(t);
  writeFileSync(join(dir, ".env"), 'declare -x TYPESAFE_API_KEY="from-declare"\n');
  assert.equal(resolveTypesafeApiKey({}, dir), "from-declare");
  writeFileSync(join(dir, ".env"), "export TYPESAFE_API_KEY='from-export'\n");
  assert.equal(resolveTypesafeApiKey({}, dir), "from-export");
  writeFileSync(join(dir, ".env"), "export TYPESAFE_API_KEY=from-export-plain\n");
  assert.equal(resolveTypesafeApiKey({ TYPESAFE_API_KEY: "from-env" }, dir), "from-env");
  assert.equal(
    parseDotenvKey('TYPESAFE_API_KEY="from-double"\n', "TYPESAFE_API_KEY"),
    "from-double",
  );
  assert.equal(
    parseDotenvKey("TYPESAFE_API_KEY='from-single'\n", "TYPESAFE_API_KEY"),
    "from-single",
  );
  assert.equal(
    parseDotenvKey('export TYPESAFE_API_KEY="from-export-quoted"\n', "TYPESAFE_API_KEY"),
    "from-export-quoted",
  );
});

test("the request deadline aborts work instead of delaying the next turn", async () => {
  let aborted = false;
  const transport = (async (_url, init) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(JSON.stringify(apiResponse()))), 5000);
      init?.signal?.addEventListener(
        "abort",
        () => {
          aborted = true;
          clearTimeout(timer);
          reject(new Error("aborted"));
        },
        { once: true },
      );
    })) as typeof fetch;
  await assert.rejects(
    judge({}, "fixture", new AbortController().signal, transport, 20),
    /timeout/,
  );
  assert.equal(aborted, true);
});
