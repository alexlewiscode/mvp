# Backend

MVP's Node 22, strict TypeScript, Fastify, and PostgreSQL service owns daily-puzzle validation, ranked matchmaking, hidden ELO, public match points, company verification, and leaderboards. Migrations reset the now-unused run records and enforce the single current daily-puzzle scoring contract.

## Local workflow

1. Create the official GitHub OAuth App used by MVP and enable Device Flow. No client secret is needed.
2. Copy `backend/.env.example` to `backend/.env`, set the OAuth client ID, public website URL, and a random session secret of at least 32 characters.
3. Email sign-in and company-email verification require a configured Cloudflare Email Service sender. Set `EMAIL_AUTH_ENABLED=true`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, and `EMAIL_FROM`.
4. Start PostgreSQL with `docker compose up -d postgres`.
5. Run `cd backend && npm ci && npm run migrate && npm run dev`.

The migration runner applies ordered `migrations/*.sql` files transactionally. Compose enables email features by default and therefore requires the Cloudflare email settings. The API listens on port 3000 and the website on 3001. Production website URLs must use the same HTTPS origin for `WEBSITE_URL` and `NEXT_PUBLIC_SITE_URL`.

Quality commands: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Database E2E tests use a disposable `TEST_DATABASE_URL` naming `mvp_test`; they skip if it is not configured.

## Authentication and profile

The CLI supports GitHub Device Flow, personal email magic-link authentication, and the website browser handoff. Session tokens are opaque and only their hashes are stored. Email addresses are not public usernames. GitHub and email identities are not merged automatically.

`GET /v1/competition/profile` returns ranked match points, match/win counts, and optional verified company name/domain. ELO and verified email addresses are never returned. Company verification requires a signed-in user and a one-time six-digit code sent to a non-consumer email domain; codes expire after 15 minutes and are limited to five guesses. The company record is keyed to the verified email domain.

When email delivery credentials are absent, set `EMAIL_AUTH_ENABLED=false`; the website keeps the email sign-in option visible but disabled, and company verification returns an unavailable response. The website's company verification form appears on `/profile` when email auth is enabled.

## Daily Code Puzzle

`GET /v1/puzzles/daily` returns the current UTC puzzle's title, language, snippet, highlighted line, difficulty, and versioned identity. It does not return the solution. `POST /v1/runs` accepts one daily result per user/date and requires a matching `daily_code:v1:YYYY-MM-DD` challenge. The submitted fix is checked against the server puzzle bank; the stored result excludes the submitted answer. Wrong attempts cost five seconds, and faster correct solutions receive more daily-puzzle points.

Daily-code is the only game-run type accepted or stored by the API.

## Ranked 1v1

- `POST /v1/matches/queue` joins the signed-in player to the ranked queue or pairs them with a waiting player within 400 ELO points.
- `GET /v1/matches/current` returns queue, active match, or recent outcome state. Active opponents receive the same UTC daily puzzle.
- `DELETE /v1/matches/queue` leaves a waiting queue entry.
- `POST /v1/matches/:id/submit` checks the submitted fix server-side. The first correct submission wins; repeated or post-completion submissions cannot award points again.

ELO starts at 1000 and uses K=32. It is used only for matchmaking and is never sent to clients. A win awards 100 visible match points. ELO changes, match completion, and win-point updates are committed together. The no-AI expectation is an honor-system rule, not technical anti-cheat enforcement.

## Leaderboards

Public player leaderboards rank match points: `GET /v1/leaderboards/daily`, `/weekly`, and `/all-time`. A game-specific `/v1/leaderboards/games/daily_code` ranks daily puzzle solve scores.

`GET /v1/leaderboards/companies` computes each company's average match points per active verified member over a rolling 30-day window. An active member is someone who participated in a ranked match in that window. Companies with fewer than three active verified members are omitted, so large rosters do not win by headcount alone.

Leaderboard routes accept `limit=1..100`, use competition ranks for ties, and order ties deterministically by username/company name. Public score data includes display identity and points only; email addresses and ELO are private.

## Privacy and operational boundaries

The CLI submits typed puzzle results and match answers, not repository contents or source files. Submitted corrected lines are checked in memory and are not persisted. Keep API logs free of verification codes and user-submitted answers. Configure `TRUST_PROXY=true` only behind a trusted reverse proxy. The service applies global and route-specific rate limits.
