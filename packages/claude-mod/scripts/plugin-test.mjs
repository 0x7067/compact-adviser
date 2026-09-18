// Runs the colocated suites under the installed Claude Code's `claude plugin test`,
// which loads this package as a plugin in the engine's own host.
import { claudeVersion, PACKAGE, run } from "./common.mjs";

const { status, output } = run(["plugin", "test", PACKAGE]);
process.stdout.write(output);
if (status !== 0 || !/^ *[1-9]\d* pass$/m.test(output) || !/^ *0 fail$/m.test(output)) {
  console.error(`Claude Code ${claudeVersion()}: plugin tests failed.`);
  process.exit(1);
}
