# Project findings and working notes

Real issues and non-obvious discoveries hit while building this project, recorded as they happen — not a design document (see `intent/`, `spec/`, `plan/` for that).

## Phase 3 — `anchor deploy`'s auto-extend step fails against this validator (`ExtendProgram` superseded by `ExtendProgramChecked`)

Redeploying the `depository` program after it grew past its original allocated size (adding `open_pledge` in Phase 3) failed under `anchor deploy`:

```
Auto-extending program data by 86120 bytes (57856 → 143976) before upgrade…
Attempt 3 failed: Auto-extend failed: RPC response error -32002: Transaction simulation failed: Error processing Instruction 0: invalid instruction data; 3 log messages:
  Program BPFLoaderUpgradeab1e11111111111111111111111 invoke [1]
  ExtendProgram was superseded by ExtendProgramChecked
  Program BPFLoaderUpgradeab1e11111111111111111111111 failed: invalid instruction data
```

This is a real incompatibility between `anchor-cli 1.1.2`'s deploy path (which still issues the BPF Loader Upgradeable program's older `ExtendProgram` instruction when it needs to grow a program's allocated data account) and this environment's `solana-cli 3.1.10` / validator, whose loader has moved to `ExtendProgramChecked` instead. It only surfaces once a program's compiled size exceeds what was allocated at its *first* deploy — Phase 1's initial skeleton deploy worked fine under `anchor deploy`, since there was no existing allocation to extend yet.

**Workaround:** use `solana program deploy` directly instead of `anchor deploy` for every redeploy from Phase 3 onward:

```
solana program deploy target/deploy/depository.so --program-id target/deploy/depository-keypair.json --url <RPC_URL> --upgrade-authority ~/.config/solana/id.json
```

This succeeds because `solana-cli`'s own deploy path is current with the validator's loader version. `anchor build` itself is unaffected — only `anchor deploy`'s auto-extend step is broken here. No workaround was needed for the initial deploy; this only applies to *re*-deploys of an already-existing program.
