# MVP — Most Valued Programmer

**Coder competition, right in your terminal.** Test your own skills on the daily code puzzle, then take them into live ranked 1v1 matches. Hidden ELO matches you with similarly skilled developers; match wins earn public leaderboard points.

Play locally without an account. Sign in to submit scores to the global leaderboards and compete for the Daily MVP. MVP runs as a standalone terminal game; it does not install hooks, plugins, or modify coding-tool configuration.

## Two ways to compete

- **Daily Code Puzzle** — Everyone gets the same code puzzle each UTC day. Find and fix the broken line; faster correct solves rank higher.
- **Ranked 1v1** — Queue from the terminal and race another developer to solve that day’s puzzle. First correct submission wins 100 match points. ELO is private and only used for matchmaking.

Ranked matches and daily puzzles are designed for you to solve yourself. MVP asks players to keep AI out of the challenge, on an honor-system basis.

## Play

Requires a recent stable Rust toolchain.

```bash
git clone https://github.com/alexlewiscode/mvp
cd mvp
cargo install --path package
mvp
```

Choose a mode, set your player name, and compete. The daily puzzle and personal best work offline; ranked matches and online scoreboards require sign-in.

## Online Competition

```bash
mvp login
mvp login --github
mvp login --email you@example.com
mvp whoami
mvp profile
mvp leaderboard
mvp leaderboard weekly
mvp leaderboard daily-code
mvp logout
```

`mvp login` opens the MVP website, where you can continue with GitHub or email. The `--github` and `--email` options are available as direct sign-in flows. MVP stores only the resulting session in the operating-system credential store. Press `I` on the main menu for browser sign-in. Failed authenticated score submissions are queued locally and retried without interrupting play. Press `L` to open the match-points leaderboard.

In the website profile, verify a company email to join its team. The company leaderboard ranks average match points per active, verified member over the rolling last 30 days; a company needs at least three active verified players to appear. ELO is never shown on public profiles or leaderboards.

## Controls

| Key | Action |
| --- | --- |
| `ENTER` | Select, start, resume, confirm, or submit |
| `Up` / `Down` | Select a game |
| Printable characters | Type a code fix in the daily puzzle or ranked match |
| `Backspace` | Delete the last character |
| `N` | Change player name from the main menu |
| `L` | View the online Daily MVP leaderboard |
| `I` | Sign in or view the online account action from the main menu |
| `M` | Open ranked 1v1 matchmaking from the main menu |
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
