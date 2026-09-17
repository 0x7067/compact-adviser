// compact-adviser's hooks module under `claude plugin test`: activation, the turn-end
// gates, hint and automatic outcomes, cooldowns across compactions, the commands, and
// the settings pane. The world beneath the plugin is mocked in ./support.ts.
import { describe, type Engine, expect, test } from "claude-code/testing";
import {
  answered,
  commandRun,
  elements,
  interactiveStart,
  jevAnswer,
  KEY,
  longConversation,
  PLUGIN,
  pane,
  SESSION,
  START,
  text,
  type World,
  world,
} from "./support.ts";

const MESSAGES = [{ role: "user" as const, text: "hello", toolUses: [] }];
const HINT = "Potential session boundary detected. Run /compact to save tokens.";

async function turnEnd($: Engine, w: World, answer = answered()) {
  await $.turn.complete(answer);
  await w.clock.settle();
}

async function turn($: Engine, w: World, id = "t") {
  await $.turn.start({ turnId: id, origin: { kind: "composer" } } as never);
  await turnEnd($, w);
}

function stored(w: World) {
  return w.store.get(`session:${SESSION}`) as Record<string, unknown>;
}

describe("activation", () => {
  for (const flag of [undefined, "true", "0"]) {
    test(`is inert when CLAUDE_CODE_ENABLE_FUNCTION_HOOKS is ${flag ?? "unset"}`, async ($, on) => {
      const w = world(on, { functionHooks: flag });
      await $.session.start(interactiveStart);
      await turnEnd($, w);
      await $.session.compact({ trigger: "manual", messages: MESSAGES });
      expect(w.journal.commands).toHaveLength(0);
      expect(w.journal.statuses).toHaveLength(0);
      expect(w.journal.toasts).toHaveLength(0);
      expect(w.journal.requests).toHaveLength(0);
      expect(w.journal.usageReads).toBe(0);
      expect(w.journal.messageReads).toBe(0);
    });
  }

  test("registers /compact-adviser and pins the Pi-style indicator at session start", async ($, on) => {
    const w = world(on, { consent: "absent" });
    await $.session.start(interactiveStart);
    expect(w.journal.commands).toEqual([PLUGIN]);
    expect(w.journal.statuses.at(-1)).toBe("HINT · min 40,000 · sharing off");
  });

  test("indicator readiness: key missing, auto not confirmed, off", async ($, on) => {
    const w = world(on, { key: undefined });
    await $.session.start(interactiveStart);
    expect(w.journal.statuses.at(-1)).toBe("HINT · min 40,000 · key missing");
    w.rows.set(`${PLUGIN}.mode`, "auto");
    w.rows.set(`${PLUGIN}.minContextTokens`, 1200000);
    await $.session.start(interactiveStart);
    expect(w.journal.statuses.at(-1)).toBe("AUTO · min 1,200,000 · key missing");
  });
});

describe("turn-end gates", () => {
  test("a qualifying settled checkpoint shows the hint once, without blocking the turn", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    const result = await $.turn.complete(answered());
    expect(result.text).toBe(answered().answer);
    expect(w.journal.requests).toHaveLength(0);
    await w.clock.settle();
    expect(w.journal.requests).toHaveLength(1);
    const request = w.journal.requests[0] ?? { url: "", headers: {}, body: "" };
    expect(request.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(request.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(request.body.includes(KEY)).toBe(false);
    expect(JSON.parse(request.body).model).toBe("jev-latest");
    expect(w.journal.statuses.at(-1)).toBe(HINT);
    expect(w.journal.toasts).toContain(HINT);
    expect(w.journal.suggestions).toEqual(["/compact"]);
    expect(w.journal.compactions).toHaveLength(0);
  });

  test("the next turn clears the hint and restores the indicator", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.statuses.at(-1)).toBe(HINT);
    await $.turn.start({ turnId: "t2", origin: { kind: "composer" } } as never);
    expect(w.journal.statuses.at(-1)).toBe("HINT · min 40,000");
  });

  test("below the constant minimum no transcript is read and TypeSafe is not called", async ($, on) => {
    const w = world(on, { minimum: 60001 });
    w.usage.tokens = 60000;
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.requests).toHaveLength(0);
    expect(w.journal.messageReads).toBe(0);
    w.rows.set(`${PLUGIN}.minContextTokens`, 60000);
    await turnEnd($, w);
    expect(w.journal.requests).toHaveLength(1);
  });

  test("the minimum is a token count: a 1M window at 4% still qualifies at 40k", async ($, on) => {
    const w = world(on);
    w.usage = { tokens: 40000, window: 1000000, autoCompactThreshold: 967000 };
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.requests).toHaveLength(1);
  });

  test("no request without sharing consent, a key, known usage, or in off mode", async ($, on) => {
    const w = world(on, { consent: "absent" });
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    w.store.set("preferences", { version: 1, sharingConsent: true, autoAcknowledged: false });
    w.usage.tokens = undefined;
    await turnEnd($, w);
    w.usage.tokens = 60000;
    w.rows.set(`${PLUGIN}.mode`, "off");
    await turnEnd($, w);
    expect(w.journal.requests).toHaveLength(0);
    w.rows.set(`${PLUGIN}.mode`, "hint");
    await turnEnd($, w);
    expect(w.journal.requests).toHaveLength(1);
  });

  test("an empty key never makes a request", async ($, on) => {
    const w = world(on, { key: "   " });
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.requests).toHaveLength(0);
  });

  test("subagent, interrupted, errored, and empty-answer turns are not checkpoints", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await turnEnd($, w, { ...answered(), agentId: "agent-1" } as never);
    await turnEnd($, w, { ...answered(), reason: "aborted", isAborted: true } as never);
    await turnEnd($, w, { ...answered(), reason: "error" } as never);
    await turnEnd($, w, answered("   "));
    expect(w.journal.requests).toHaveLength(0);
    expect(stored(w)).toBeUndefined();
  });

  test("non-interactive sessions never judge", async ($, on) => {
    const w = world(on);
    await $.session.start({ cwd: "/work", surface: null, isInteractive: false });
    await turnEnd($, w);
    expect(w.journal.requests).toHaveLength(0);
    expect(w.journal.statuses).toHaveLength(0);
  });

  test("a large static prompt alone is not useful history", async ($, on) => {
    const w = world(on);
    w.messages = longConversation().slice(2);
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.messageReads).toBe(1);
    expect(w.journal.requests).toHaveLength(0);
  });

  test("a turn that starts before the judgment runs invalidates it", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await $.turn.complete(answered());
    await $.turn.start({ turnId: "t2", origin: { kind: "composer" } } as never);
    await w.clock.settle();
    expect(w.journal.requests).toHaveLength(0);
    expect(w.journal.statuses.includes(HINT)).toBe(false);
  });

  test("a turn that starts while TypeSafe answers discards the verdict", async ($, on) => {
    const w = world(on);
    let release: () => void = () => undefined;
    w.respond = () =>
      new Promise((resolve) => {
        release = () => resolve({ status: 200, text: JSON.stringify(jevAnswer()) });
      });
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.requests).toHaveLength(1);
    await $.turn.start({ turnId: "t2", origin: { kind: "composer" } } as never);
    release();
    await w.clock.settle();
    expect(w.journal.statuses.includes(HINT)).toBe(false);
  });

  test("no repeat at the same checkpoint, and three exchanges between hints", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.requests).toHaveLength(1);
    for (let i = 0; i < 3; i++) await turn($, w, `same-${i}`);
    expect(w.journal.requests).toHaveLength(1);
    w.messages = longConversation("Now add the README section.");
    await turn($, w, "new-1");
    expect(w.journal.requests).toHaveLength(2);
    expect(stored(w).lastHintAt).toBe(5);
    w.messages = longConversation("And a changelog entry.");
    await turn($, w, "new-2");
    expect(w.journal.requests).toHaveLength(2);
  });

  test("uncertain or insufficient verdicts leave context alone", async ($, on) => {
    const w = world(on);
    w.respond = async () => ({
      status: 200,
      text: JSON.stringify(jevAnswer({ recoverable: 0.68 })),
    });
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.requests).toHaveLength(1);
    expect(w.journal.statuses.includes(HINT)).toBe(false);
    expect(w.journal.compactions).toHaveLength(0);
  });

  for (const [name, respond, message] of [
    [
      "rate limit",
      async () => ({ status: 429, text: "" }),
      "TypeSafe rate-limit; context left unchanged.",
    ],
    [
      "malformed",
      async () => ({ status: 200, text: "{}" }),
      "TypeSafe response; context left unchanged.",
    ],
    [
      "authentication",
      async () => ({ status: 401, text: "" }),
      "TypeSafe authentication; context left unchanged.",
    ],
  ] as const) {
    test(`a ${name} failure backs off and reports once`, async ($, on) => {
      const w = world(on);
      w.respond = respond;
      await $.session.start(interactiveStart);
      await turnEnd($, w);
      expect(w.journal.toasts).toContain(message);
      expect(stored(w).retryAfter).toBe(START + 10000);
      w.messages = longConversation("next");
      await turnEnd($, w);
      expect(w.journal.requests).toHaveLength(1);
      await w.clock.advance(10000);
      w.messages = longConversation("later");
      await turnEnd($, w);
      expect(w.journal.requests).toHaveLength(2);
      expect(w.journal.toasts.filter((t) => t === message)).toHaveLength(1);
    });
  }

  test("a host refusal of nonessential traffic is named in the notice", async ($, on) => {
    const w = world(on);
    w.respond = async () => ({
      deny: "refused: nonessential network traffic is disabled for this session",
    });
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.toasts).toContain(
      "TypeSafe requests are refused: Claude Code has nonessential network traffic disabled. Context left unchanged.",
    );
    expect(w.journal.statuses.includes(HINT)).toBe(false);
  });

  test("a two-second TypeSafe timeout leaves context alone", async ($, on) => {
    const w = world(on);
    w.respond = () => new Promise(() => undefined);
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    await w.clock.advance(2000);
    expect(w.journal.toasts).toContain("TypeSafe timeout; context left unchanged.");
    expect(w.journal.statuses.includes(HINT)).toBe(false);
  });

  test("the endpoint override accepts only a loopback fixture", async ($, on) => {
    const w = world(on, { endpoint: "http://127.0.0.1:4567/v1/systemone" });
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.requests[0]?.url).toBe("http://127.0.0.1:4567/v1/systemone");
  });

  test("a non-loopback endpoint override is ignored", async ($, on) => {
    const w = world(on, { endpoint: "https://collector.example/v1" });
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.requests[0]?.url).toBe("https://api.typesafe.ai/v1/systemone");
  });
});

describe("compaction cooldown", () => {
  test("any external compaction resets counters; judging waits for 20k fresh tokens and 3 exchanges", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await $.session.compact({ trigger: "manual", messages: MESSAGES });
    expect(stored(w).compacted).toBe(true);
    w.usage.tokens = 45000;
    for (let i = 0; i < 3; i++) {
      w.messages = longConversation(`ask ${i}`);
      await turn($, w, `a${i}`);
    }
    expect(w.journal.requests).toHaveLength(0);
    w.usage.tokens = 65000;
    await turn($, w, "a3");
    expect(w.journal.requests).toHaveLength(1);
  });

  test("a precompute or a subagent's compaction does not reset the session", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    await $.session.compact({ trigger: "precompute", messages: MESSAGES });
    await $.session.compact({ trigger: "auto", agentId: "sub", messages: MESSAGES });
    expect(stored(w).compacted).toBe(false);
  });
});

describe("automatic mode", () => {
  const acknowledged = { sharingConsent: true, autoAcknowledged: true };
  const complete = () => longConversation().slice(2);

  function autoWorld(on: Parameters<typeof world>[0]) {
    const w = world(on, { mode: "auto", consent: acknowledged });
    // Fully covered state: no truncation or redaction, but real useful history.
    w.messages = [
      ...Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 ? ("assistant" as const) : ("user" as const),
        text: i % 2 ? `Step ${i} done. ${"detail ".repeat(1600)}` : `Next step ${i}.`,
        toolUses: [],
      })),
      { role: "user", text: "Run the tests.", toolUses: [] },
      { role: "assistant", text: "All 12 tests pass.", toolUses: [] },
      { role: "user", text: "Commit it.", toolUses: [] },
      { role: "assistant", text: "Committed as abc1234.", toolUses: [] },
      ...complete(),
    ];
    return w;
  }

  test("compacts once at a confident checkpoint and resets the cooldown", async ($, on) => {
    const w = autoWorld(on);
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.compactions).toEqual([
      {
        instructions:
          "The session reached a natural boundary; keep the current work, pending tasks, referenced files, and the next step exact.",
      },
    ]);
    expect(w.journal.statuses).toContain("compacting at a checkpoint (experimental auto)…");
    expect(w.journal.toasts).toContain("compaction completed: 60,000 to 3,300 tokens.");
    expect(w.journal.logs).toEqual([
      "compact-adviser: automatic compaction completed: 60,000 to 3,300 tokens.",
    ]);
    expect(w.journal.statuses.at(-1)).toBe("AUTO · min 40,000");
    expect(stored(w).compacted).toBe(true);
    expect(stored(w).completed).toBe(0);
    w.messages = longConversation("again");
    await turn($, w, "again");
    expect(w.journal.compactions).toHaveLength(1);
  });

  test("hint-level confidence neither compacts nor hints in auto mode", async ($, on) => {
    const w = autoWorld(on);
    w.respond = async () => ({
      status: 200,
      text: JSON.stringify(jevAnswer({ completed: 0.95, recoverable: 0.95 })),
    });
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.compactions).toHaveLength(0);
    expect(w.journal.statuses.includes(HINT)).toBe(false);
  });

  test("auto chosen in /config without the first-use confirmation never compacts", async ($, on) => {
    const w = autoWorld(on);
    w.store.set("preferences", { version: 1, sharingConsent: true, autoAcknowledged: false });
    await $.session.start(interactiveStart);
    expect(w.journal.statuses.at(-1)).toBe("AUTO · min 40,000 · auto not confirmed");
    await turnEnd($, w);
    expect(w.journal.compactions).toHaveLength(0);
  });

  test("incomplete judge coverage never compacts", async ($, on) => {
    const w = world(on, { mode: "auto", consent: acknowledged });
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.requests).toHaveLength(1);
    expect(w.journal.compactions).toHaveLength(0);
  });

  test("a vetoed or failed compaction backs off for a minute without resetting counters", async ($, on) => {
    const w = autoWorld(on);
    w.compact = async () => ({ skip: "another plugin vetoed" });
    await $.session.start(interactiveStart);
    await turnEnd($, w);
    expect(w.journal.compactions).toHaveLength(1);
    const state = stored(w);
    expect(state.retryAfter).toBe(START + 60000);
    expect(state.compacted).toBe(false);
    expect(w.journal.toasts).toContain(
      "Compaction failed or was cancelled. No immediate retry; Claude Code remains in control.",
    );
    w.compact = async () => Promise.reject(new Error("summarization produced empty response"));
    await w.clock.advance(60000);
    w.messages = [...w.messages, { role: "user", text: "more", toolUses: [] }];
    await turnEnd($, w);
    expect(w.journal.compactions).toHaveLength(2);
    expect(stored(w).retryAfter).toBe(START + 120000);
  });
});

describe("commands", () => {
  test("threshold saves a whole token count and reports it; invalid input keeps the setting", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await $.command.run(commandRun("threshold 60000"));
    expect(w.rows.get(`${PLUGIN}.minContextTokens`)).toBe(60000);
    expect(w.journal.toasts.at(-1)).toBe("Minimum context saved: 60,000 tokens (all sessions).");
    for (const bad of ["40k", "0", "-5", "1.5", "4e4", "lots"]) {
      await $.command.run(commandRun(`threshold ${bad}`));
      expect(w.journal.toasts.at(-1)).toBe(
        "Enter a positive whole number of tokens, for example 40000.",
      );
    }
    expect(w.rows.get(`${PLUGIN}.minContextTokens`)).toBe(60000);
    await $.command.run(commandRun("threshold default"));
    expect(w.rows.get(`${PLUGIN}.minContextTokens`)).toBe(40000);
  });

  test("a minimum at or above the model window saves with a warning, never clamped", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await $.command.run(commandRun("threshold 250000"));
    expect(w.rows.get(`${PLUGIN}.minContextTokens`)).toBe(250000);
    expect(w.journal.toasts.at(-1)).toContain(
      "at or above the active model's 200,000-token window",
    );
  });

  test("a save confirmation survives the hot reload a saved row causes", async ($, on) => {
    // Claude Code reloads the module after a saved row and drops the old environment's
    // toasts; the reloaded environment shows the confirmation at its session.start.
    const w = world(on, {
      store: { pendingNotice: { message: "Off saved (all sessions).", at: START - 1000 } },
    });
    await $.session.start(interactiveStart);
    expect(w.journal.toasts).toEqual(["Off saved (all sessions)."]);
    expect(w.store.has("pendingNotice")).toBe(false);
    await $.session.start(interactiveStart);
    expect(w.journal.toasts).toHaveLength(1);
  });

  test("a stale save confirmation is discarded", async ($, on) => {
    const w = world(on, {
      store: { pendingNotice: { message: "Off saved (all sessions).", at: START - 60000 } },
    });
    await $.session.start(interactiveStart);
    expect(w.journal.toasts).toHaveLength(0);
    expect(w.store.has("pendingNotice")).toBe(false);
  });

  test("a refused save is reported as not saved", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    w.denyConfig("a managed setting owns this row");
    await $.command.run(commandRun("off"));
    expect(w.rows.get(`${PLUGIN}.mode`)).toBe("hint");
    expect(w.journal.toasts.at(-1)).toBe("Not saved: a managed setting owns this row");
  });

  test("auto asks once; cancelling keeps the mode, confirming persists across sessions", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    w.answers.push(undefined);
    await $.command.run(commandRun("auto"));
    w.answers.push("Cancel");
    await $.command.run(commandRun("auto"));
    expect(w.rows.get(`${PLUGIN}.mode`)).toBe("hint");
    expect(w.journal.configSets).toHaveLength(0);
    w.answers.push("Enable automatic mode");
    await $.command.run(commandRun("auto"));
    expect(w.rows.get(`${PLUGIN}.mode`)).toBe("auto");
    expect(w.journal.asks).toHaveLength(3);
    expect(w.journal.asks[0]).toContain("Compaction is lossy");
    expect(w.journal.toasts.at(-1)).toBe(
      "Automatic mode saved (all sessions). TypeSafe sharing and a key are still required.",
    );
    await $.command.run(commandRun("hint"));
    await $.command.run(commandRun("auto"));
    expect(w.journal.asks).toHaveLength(3);
    expect(w.journal.compactions).toHaveLength(0);
    expect(w.journal.requests).toHaveLength(0);
  });

  test("hint and off save and say Claude Code's own compaction is unchanged", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await $.command.run(commandRun("off"));
    expect(w.rows.get(`${PLUGIN}.mode`)).toBe("off");
    expect(w.journal.toasts.at(-1)).toBe(
      "Off saved (all sessions). Claude Code's built-in compaction is unchanged.",
    );
    expect(w.journal.statuses.at(-1)).toBe("OFF · min 40,000");
    await $.command.run(commandRun("hint"));
    expect(w.journal.toasts.at(-1)).toBe(
      "Hints only saved (all sessions). Claude Code's built-in compaction is unchanged.",
    );
  });

  test("sharing on requires the disclosure; sharing off revokes without asking", async ($, on) => {
    const w = world(on, { consent: "absent" });
    await $.session.start(interactiveStart);
    w.answers.push("Cancel");
    await $.command.run(commandRun("sharing on"));
    expect(w.store.get("preferences")).toBeUndefined();
    w.answers.push("Allow sharing");
    await $.command.run(commandRun("sharing on"));
    expect(w.journal.asks.at(-1)).toContain("api.typesafe.ai");
    expect(w.journal.asks.at(-1)).toContain("best-effort");
    expect(w.journal.toasts.at(-1)).toBe("TypeSafe conversation sharing enabled (all sessions).");
    expect(w.journal.statuses.at(-1)).toBe("HINT · min 40,000");
    await $.command.run(commandRun("sharing off"));
    expect(w.journal.asks).toHaveLength(2);
    expect(w.journal.statuses.at(-1)).toBe("HINT · min 40,000 · sharing off");
  });

  test("status reports readiness and the engine threshold, never the key", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await $.command.run(commandRun("status"));
    const line = w.journal.logs.at(-1) ?? "";
    expect(line).toBe(
      "compact-adviser: Mode: hint. Minimum: 40,000 tokens. Context: 60,000. Sharing: on. Key: present. No cooldown; semantic checks still apply. Claude Code auto-compacts at 167,000 tokens. Settings: /config (compact-adviser rows) and /compact-adviser.",
    );
    expect(line.includes(KEY)).toBe(false);
  });

  test("snooze suppresses advice for three exchanges; dismiss clears the hint", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await $.command.run(commandRun("snooze"));
    expect(w.journal.toasts.at(-1)).toBe("Advice snoozed for three completed exchanges.");
    for (let i = 0; i < 3; i++) {
      w.messages = longConversation(`s${i}`);
      await turn($, w, `s${i}`);
    }
    expect(w.journal.requests).toHaveLength(0);
    w.messages = longConversation("s3");
    await turn($, w, "s3");
    expect(w.journal.requests).toHaveLength(1);
    expect(w.journal.statuses.at(-1)).toBe(HINT);
    await $.command.run(commandRun("dismiss"));
    expect(w.journal.statuses.at(-1)).toBe("HINT · min 40,000");
  });

  test("unknown arguments show the usage", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await $.command.run(commandRun("threshold"));
    expect(w.journal.toasts.at(-1)).toBe(
      "Use /compact-adviser, auto, hint, off, status, threshold <tokens|default>, sharing <on|off>, snooze or dismiss.",
    );
  });
});

describe("settings pane", () => {
  test("opens focused and draws the Pi menu rows with the saved values prefilled", async ($, on) => {
    const w = world(on);
    await $.session.start(interactiveStart);
    await $.command.run(commandRun(""));
    expect(w.journal.opened).toEqual([{ id: PLUGIN, focus: true }]);
    const tree = await $.ui.render(pane);
    const drawn = elements(tree);
    const select = drawn.find((e) => e.type === "Select");
    expect(select?.props.value).toBe("hint");
    expect(JSON.stringify(select?.props.options)).toBe(
      JSON.stringify([
        { value: "hint", label: "Hints only (default)" },
        { value: "auto", label: "Automatic (experimental)" },
        { value: "off", label: "Off" },
      ]),
    );
    const input = drawn.find((e) => e.type === "Input");
    expect(input?.props.value).toBe("40000");
    expect(input?.props.label).toBe("Minimum context tokens");
    const buttons = drawn.filter((e) => e.type === "Button").map((e) => e.props.label);
    expect(buttons).toEqual(["Reset minimum to 40,000", "TypeSafe sharing: on", "Status", "Close"]);
    expect(text(tree)).toContain("A token count, not a percentage; no judgment below it.");
  });

  // The kit drives presses only; choosing a mode and submitting the minimum field are
  // exercised against the real Claude Code TUI by scripts/live-e2e.mjs.
  test("reset, sharing, status, and close act through the same paths as the commands", async ($, on) => {
    const w = world(on, { minimum: 75000, mode: "off" });
    await $.session.start(interactiveStart);
    await $.ui.render(pane);
    await $.ui.press({ plugin: PLUGIN, key: "reset" });
    await w.clock.settle();
    expect(w.rows.get(`${PLUGIN}.minContextTokens`)).toBe(40000);
    expect(w.rows.get(`${PLUGIN}.mode`)).toBe("off");
    expect(w.journal.toasts.at(-1)).toBe("Minimum context saved: 40,000 tokens (all sessions).");
    await $.ui.render(pane);
    await $.ui.press({ plugin: PLUGIN, key: "sharing" });
    await w.clock.settle();
    expect(w.journal.toasts.at(-1)).toBe("TypeSafe conversation sharing disabled (all sessions).");
    expect(w.journal.asks).toHaveLength(0);
    await $.ui.render(pane);
    await $.ui.press({ plugin: PLUGIN, key: "status" });
    await w.clock.settle();
    expect(text(await $.ui.render(pane))).toContain(
      "Mode: off. Minimum: 40,000 tokens. Context: 60,000. Sharing: off.",
    );
    await $.ui.press({ plugin: PLUGIN, key: "close" });
    expect(w.journal.closed).toEqual([PLUGIN]);
  });

  test("another plugin's pane is left to it", async ($, on) => {
    world(on);
    on("ui.render", async () => ({ type: "Text", props: {}, children: ["OTHER"] }));
    await $.session.start(interactiveStart);
    expect(text(await $.ui.render({ ...(pane as object), requestId: "other" } as never))).toContain(
      "OTHER",
    );
  });
});
