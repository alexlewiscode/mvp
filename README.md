# MVP — Most Valued Programmer

**Coder competition, right in your terminal.** MVP is a collection of quick coding-inspired games where you can challenge your own best, take on the daily challenges, and compete for the title of Most Valued Programmer.

Play locally without an account. Sign in to submit scores to the global leaderboards and compete for the Daily MVP. MVP runs as a standalone terminal game; it does not install hooks, plugins, or modify coding-tool configuration.

## Games

- **Stack Overflow** — Drop moving call-stack frames, trim overhang, and build as high as possible before a full miss.
- **The Daily PR** — Find the shared five-letter word in six guesses. Fewer guesses wins; speed breaks ties.
- **The Daily Fix** — Correct the broken line in a shared daily snippet. Fast fixes win, while wrong submissions add penalties.

## Play

Requires a recent stable Rust toolchain.

```bash
git clone https://github.com/alexlewiscode/mvp
cd mvp
cargo install --path package
mvp
```

Choose a game, set your player name, and compete. Local play and personal bests work offline.

## Online Competition

```bash
mvp login
mvp login --github
mvp login --email you@example.com
mvp whoami
mvp profile
mvp leaderboard
mvp leaderboard weekly
mvp leaderboard stack-overflow
mvp logout
```

`mvp login` opens the MVP website, where you can continue with GitHub or, when enabled by the deployment, an email magic link. Explicit `--github` and `--email` options are available as direct provider flows; `--email` is unavailable when email authentication is disabled. MVP stores only the resulting session in the operating-system credential store. Press `I` on the main menu for browser sign-in. Failed authenticated score submissions are queued locally and retried without interrupting play. Press `L` to open the Daily MVP leaderboard.

## Controls

| Key | Action |
| --- | --- |
| `ENTER` | Select, start, resume, confirm, or submit |
| `Up` / `Down` | Select a game |
| `SPACE` / `Up` | Drop a Stack Overflow frame |
| Printable characters | Type a Daily PR guess or Daily Fix answer |
| `Backspace` | Delete the last character |
| `N` | Change player name from the main menu |
| `L` | View the online Daily MVP leaderboard |
| `I` | Sign in or view the online account action from the main menu |
| `P` | Pause or resume manually |
| `R` | Restart after game over |
| `ESC` | Go back or cancel a rename; the first-run name prompt is required |
| `Q` / `Ctrl+C` | Quit |

## Development

From the repository root:

```bash
cargo run
cargo test
cargo fmt --check
cargo clippy -- -D warnings
```

The root is a Cargo workspace and `package/src/` is the authoritative Rust implementation. See [Development](docs/development.md) and [Architecture](docs/architecture.md) for technical details.

Production deployment instructions for `mostvaluedprogrammer.com` are in [Coolify Deployment](docs/coolify.md). CLI publishing and mandatory-update operations are in [CLI Releases](docs/releases.md).

## License

MIT — see [LICENSE](LICENSE).
