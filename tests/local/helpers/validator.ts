/**
 * Spins up a dedicated, ephemeral local validator for the test suite —
 * deliberately on a different port (8910) and a fresh temp ledger dir,
 * never the long-running manually-tested validator at the default 8899
 * this project's build sessions have used (which carries real
 * accumulated history from Phases 1-9 that automated tests shouldn't
 * depend on or disturb). Fully self-contained: deploy the program fresh
 * into it, run assertions, tear down.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, PublicKey } from "@solana/web3.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

export const TEST_RPC_PORT = 8910;
// solana-test-validator always derives its WebSocket/pubsub port as
// RPC_PORT + 1 (8911 here) — it's not independently configurable via any
// flag. Found by hitting it directly: setting --faucet-port to 8911
// collided with that implicit pubsub port, and `solana program deploy`
// failed with an opaque "Should return a valid tpu client:
// HttparseError(Version)" (the deploy CLI's websocket client connecting
// to the faucet service instead of pubsub). Faucet/gossip below are
// chosen to avoid 8910/8911 and this project's other long-running
// manually-tested validator's own default ports (gossip 8000, faucet
// 9900 — neither overridden when that one was started).
export const TEST_FAUCET_PORT = 8913;
export const TEST_GOSSIP_PORT = 8912;
export const TEST_DYNAMIC_PORT_RANGE = "8920-8950"; // must be >= ~26 ports; solana-test-validator rejects a narrower range outright
export const TEST_RPC_URL = `http://127.0.0.1:${TEST_RPC_PORT}`;
export const DEPOSITORY_PROGRAM_ID = new PublicKey("8txdQqhWf2M4jvWa3kDugQThgu82Vw53QoZ8doNog9ah");

let validatorProcess: ChildProcess | null = null;
let ledgerDir: string | null = null;
let intentionalStop = false;
let activeConnection: Connection | null = null;

export async function startEphemeralValidator(): Promise<Connection> {
  ledgerDir = mkdtempSync(path.join(tmpdir(), "depository-test-validator-"));
  // Explicit gossip port and a narrow dynamic-port-range: this project's
  // own long-running manually-tested validator (default ports, including
  // gossip 8000) is very likely already running during a dev session —
  // discovered by hitting exactly that collision ("Address already in
  // use", gossip port 8000) on the first attempt at building this helper.
  // stderr is captured (not ignored) specifically so a crash (e.g. an
  // invalid flag, or a port collision with another running validator)
  // surfaces immediately with its real message, rather than the caller
  // silently waiting out the full readiness timeout — found the hard way
  // while building this helper (a too-narrow --dynamic-port-range was
  // rejected outright, but with stdio fully ignored the only symptom was
  // a 60s timeout with no indication why).
  let earlyExit: { code: number | null; stderr: string } | null = null;
  let stderrBuf = "";
  let readyAchieved = false;
  validatorProcess = spawn(
    "solana-test-validator",
    [
      "--ledger", ledgerDir,
      "--rpc-port", String(TEST_RPC_PORT),
      "--faucet-port", String(TEST_FAUCET_PORT),
      "--gossip-port", String(TEST_GOSSIP_PORT),
      "--dynamic-port-range", TEST_DYNAMIC_PORT_RANGE,
      "--reset",
      "--quiet",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  validatorProcess.stderr?.on("data", (d: Buffer) => {
    stderrBuf += d.toString();
    // Keep only the tail — a crash dump can be large and we only need
    // enough to see the reason, not the whole run's log.
    if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000);
  });
  validatorProcess.on("exit", (code) => {
    if (earlyExit === null) earlyExit = { code, stderr: stderrBuf };
    // Safety net for a genuine, unexpected mid-run death of the validator
    // (distinct from the normal teardown path below, which sets
    // intentionalStop first) — without this, every subsequent RPC call
    // would just fail with ECONNREFUSED forever, and node:test has no
    // built-in timeout for that, so the run would hang indefinitely
    // instead of failing loud with the real reason.
    if (readyAchieved && !intentionalStop) {
      // eslint-disable-next-line no-console
      console.error(
        `\nFATAL: solana-test-validator died mid-run (exit code ${code}) — the test process would otherwise hang forever waiting on RPC calls that can never succeed again. Last validator stderr:\n${stderrBuf}\n`,
      );
      process.exit(1);
    }
  });

  const connection = new Connection(TEST_RPC_URL, "confirmed");
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (earlyExit !== null) {
      const exit: { code: number | null; stderr: string } = earlyExit;
      throw new Error(`solana-test-validator exited early (code ${exit.code}):\n${exit.stderr}`);
    }
    try {
      await connection.getVersion();
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  if (!ready) {
    throw new Error(`Ephemeral validator on port ${TEST_RPC_PORT} did not become ready within 60s`);
  }

  // Deploy the depository program fresh into this validator, using the
  // same tracked program-keypair.json so the program ID matches
  // DEPOSITORY_PROGRAM_ID exactly (mirrors plan-001.md's Phase 1 note on
  // why this keypair is tracked outside target/ in the first place).
  try {
    execFileSync(
      "solana",
      [
        "program",
        "deploy",
        "target/deploy/depository.so",
        "--program-id",
        "programs/depository/program-keypair.json",
        "--url",
        TEST_RPC_URL,
        "--keypair",
        path.join(process.env.HOME ?? "", ".config/solana/id.json"),
      ],
      { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? "";
    throw new Error(`solana program deploy failed:\n${stderr || (err as Error).message}`);
  }

  readyAchieved = true;
  activeConnection = connection;
  return connection;
}

export function stopEphemeralValidator(): void {
  intentionalStop = true;
  // @solana/web3.js's Connection opens a WebSocket subscription client
  // (used for "confirmed"-commitment confirmations) that has no public
  // teardown method and, once the validator disappears, retries
  // reconnecting forever. That kept timer is what was actually causing
  // this suite to hang indefinitely after every run — even a fully
  // passing one — long after node:test itself had already finished and
  // printed the real pass/fail summary (confirmed by comparing a hung
  // run's own log against a live process check: the summary was already
  // printed, only the process itself never exited). Reaching into the
  // private field to close it is the documented workaround for this
  // known gap in @solana/web3.js's classic Connection API.
  if (activeConnection) {
    try {
      (activeConnection as unknown as { _rpcWebSocket: { close: () => void } })._rpcWebSocket.close();
    } catch {
      // best-effort — if this shape ever changes, worst case is the old hang
    }
    activeConnection = null;
  }
  validatorProcess?.kill();
  validatorProcess = null;
  if (ledgerDir) {
    try {
      rmSync(ledgerDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
    ledgerDir = null;
  }
}
