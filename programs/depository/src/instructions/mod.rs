pub mod exercise_rehypothecation;
pub mod open_pledge;
pub mod release_pledge;
pub mod return_rehypothecated;

// Each instruction module's own `handler` fn is always called fully-
// qualified (e.g. `instructions::open_pledge::handler(...)`) from
// lib.rs, never through this glob re-export — the glob exists only so
// each module's Accounts struct and its `#[derive(Accounts)]`-generated
// companion module are visible to the #[program] macro via `use
// super::*`. Multiple `handler` fns colliding here is therefore
// harmless; suppressed explicitly rather than worked around.
#[allow(ambiguous_glob_reexports)]
mod reexports {
    pub use super::exercise_rehypothecation::*;
    pub use super::open_pledge::*;
    pub use super::release_pledge::*;
    pub use super::return_rehypothecated::*;
}
pub use reexports::*;
