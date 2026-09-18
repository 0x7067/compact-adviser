// Regenerates .claude/types (gitignored) from the installed Claude Code with its own
// `/plugin-types` command, in a throwaway directory and configuration so nothing in the
// user's Claude Code setup is read or written.
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PACKAGE, run } from "./common.mjs";

const lab = mkdtempSync(join(tmpdir(), "compact-adviser-types-"));
try {
  const { status, output } = run(["-p", "/plugin-types"], {
    env: { CLAUDE_CONFIG_DIR: join(lab, "config") },
    spawn: { cwd: lab },
    timeoutMs: 60000,
  });
  if (status !== 0 || !output.includes("claude-code.d.ts")) {
    process.stderr.write(output);
    throw new Error("Claude Code did not write its plugin API declarations");
  }
  rmSync(join(PACKAGE, ".claude", "types"), { recursive: true, force: true });
  cpSync(join(lab, ".claude", "types"), join(PACKAGE, ".claude", "types"), { recursive: true });
} finally {
  rmSync(lab, { recursive: true, force: true });
}
