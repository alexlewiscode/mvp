# MVP — Most Valued Programmer

MVP is an open-source terminal coding game with a daily solo puzzle and ranked 1v1 matches. Play the daily puzzle offline, or sign in to compete online and submit results to the leaderboards.

## Quick start

Requires Node.js 18 or newer. The npm install does not require Rust.

```bash
npm install -g @mvp-play/cli
mvp
```

Install once, then run `mvp` whenever you want to play. To build from source, see [Development](docs/development.md).

## Game modes

- **Daily Code Puzzle** — Solve the shared UTC-day puzzle against the clock. Play offline for a local attempt and personal best; sign in to claim an official attempt and submit results.
- **Ranked 1v1** — Race another developer to solve the same puzzle. Ranked matchmaking requires sign-in; a win earns 100 match points.

Please solve puzzles and matches yourself without AI assistance. This is an honor-system request.

## Online play

Sign in through the website:

```bash
mvp login
```

Use `mvp profile` to view your stats and `mvp leaderboard` to see the daily standings. Ranked matchmaking and official online results require sign-in; local daily play does not.

## Controls

| Key | Action |
| --- | --- |
| `↑` / `↓` | Select a mode |
| `Enter` | Choose, play, or submit |
| Letters / `Backspace` | Type or edit a code fix |
| `M` | Start ranked matchmaking from the main menu |
| `I` | Sign in or view your profile |
| `L` | Open the leaderboard |
| `Esc` | Go back |
| `Q` / `Ctrl+C` | Quit |

## Documentation

- [Development](docs/development.md) and [Architecture](docs/architecture.md)
- [Backend](docs/backend.md)
- [CLI releases](docs/releases.md)
- [Coolify deployment](docs/coolify.md)

## License

[MIT](LICENSE)
