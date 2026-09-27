# Architecture

MVP keeps game simulation independent of terminal rendering:

```text
Input -> Application -> Game State -> Simulation -> Rendering
```

## Repository Layout

```text
Cargo.toml              workspace manifest
package/Cargo.toml      mvp package manifest
package/src/            authoritative Rust implementation
backend/                versioned API and PostgreSQL migrations
website/                independently deployable Next.js public site
```

There is one workspace package and one user-facing binary, both named `mvp`.

## Application Layers

- `main.rs` dispatches CLI commands and runs the event loop.
- `cli.rs` defines game and online competition commands.
- `tui.rs` initializes and restores the terminal.
- `event.rs` translates terminal events into application input.
- `app.rs` owns screen transitions, game selection, local scores, and online results.
- `ui.rs` renders menus, games, HUDs, and pause panels with Ratatui.
- `config.rs` stores local names, personal records, and the daily puzzle's local result.
- `game/` contains terminal-independent game logic.
- `api/` owns authentication, HTTP DTOs, the durable score queue, ranked-match
  matchmaking/polling, and the background network worker.

## Online Architecture

```text
headless game result -> application -> durable outbox -> API worker
                                                       |
GitHub / email -> MVP API -> daily scores, ranked matches, team boards -> PostgreSQL
```

The game layer produces typed completion records and never imports HTTP,
authentication, or database types. The synchronous TUI sends owned records to
a worker thread; that worker owns its Tokio runtime, API client, and retry
queue. Leaderboard requests use the same channel and therefore never block
input or rendering.

GitHub authentication is backend-mediated Device Flow. The CLI receives an
MVP session, not a GitHub token; the backend discards GitHub's token after
fetching the public account identity. MVP sessions are stored in the operating
system credential store. Local player names remain independent from the
GitHub-ID-backed online account.

PostgreSQL stores daily puzzle results, ranked match state, private ELO, and
visible match-point events. Match submissions are checked by the API against
the server's puzzle answer; ELO updates and win points are committed
transactionally. Submitted fixes are checked in memory and discarded. MVP
does not read repository contents or prompts.

Daily code puzzles use UTC and versioned identities `daily_code:v1:YYYY-MM-DD`.
Ranked matchmaking uses private ELO (K=32, starting rating 1000); match wins
award visible 100-point events. The company board averages those points over
active verified members from the last 30 days and requires three active
members. ELO is excluded from public API profile and leaderboard responses.

## Design Constraints

- Game simulation is delta-time based and clamps long frames.
- `ActiveGame` owns the local daily puzzle; live ranked matches are driven by
  the online worker and rendered as a distinct application state.
- Only the playing state advances game time; pauses and undersized terminals freeze runs.
- Daily challenges use the UTC epoch day and a versioned identity so all users
  receive the same puzzle.
- Daily score metrics normalize to a higher-is-better value for one comparison path.

MVP keeps its blocking terminal loop. Tokio is restricted to online commands
and the background API worker; stable game simulation remains synchronous.
