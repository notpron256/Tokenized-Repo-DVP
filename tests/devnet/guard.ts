/**
 * Opt-in guard for `npm run test:devnet` (Module 4). This suite has a
 * real, permanent side effect on the bank's actual devnet Postgres — it
 * onboards fresh clients every run and there is no cleanup mechanism
 * anywhere in the reused bank system (see tests/README.md and
 * project-findings-and-working-notes.md's Module 4 entries). Running it
 * unattended, e.g. from a CI job triggered on every push, would quietly
 * accumulate rows in a real system this repo doesn't own forever.
 *
 * This is intentionally a separate guard script, not a check inside
 * atomicity.test.ts itself, so the refusal happens before anything in
 * that file — including its `before()` hook, which is what actually
 * onboards clients — ever runs.
 */
if (!process.env.I_UNDERSTAND_THIS_ADDS_PERMANENT_TEST_CLIENTS) {
  console.error(
    [
      "Refusing to run tests/devnet/atomicity.test.ts.",
      "",
      "This suite onboards fresh clients on the bank's real devnet Postgres on every run, and there is no delete/cleanup endpoint anywhere in the reused bank system — every run leaves permanent rows behind. It must never run unattended (e.g. in CI on every push).",
      "",
      "If you mean to run it deliberately, right now, by hand:",
      "  I_UNDERSTAND_THIS_ADDS_PERMANENT_TEST_CLIENTS=1 npm run test:devnet",
    ].join("\n"),
  );
  process.exit(1);
}
