import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { createPool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { dailyPuzzleOffset } from "../src/competition.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";

type GithubPollResponse =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "complete"; accessToken: string };

describe.skipIf(!databaseUrl)("database API", () => {
  let db: pg.Pool;
  let app: FastifyInstance;
  const initialNow = new Date("2026-08-20T12:00:00.000Z");
  let now = initialNow;
  let verificationToken = "";
  let verificationHandoff = "";
  let companyCode = "";
  let githubPollResponses: GithubPollResponse[] = [];

  beforeAll(async () => {
    if (new URL(databaseUrl).pathname.replace(/^\//, "") !== "mvp_test")
      throw new Error(
        "TEST_DATABASE_URL must name a disposable mvp_test database",
      );
    await migrate(databaseUrl, resolve(import.meta.dirname, "../migrations"));
    db = createPool(databaseUrl);
    app = await buildApp({
      config: readConfig({
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        EMAIL_AUTH_ENABLED: "true",
        CLOUDFLARE_ACCOUNT_ID: "test-account",
        CLOUDFLARE_EMAIL_API_TOKEN: "test-api-token",
        EMAIL_FROM: "login@waitstate.example",
        WEBSITE_URL: "https://waitstate.example",
      }),
      db,
      now: () => now,
      email: {
        send: (message) => {
          const code = message.text.match(/verification code is (\d{6})/)?.[1];
          if (code) {
            companyCode = code;
          } else {
            const link = new URL(
              message.text.match(/https:\/\/\S+/)?.[0] ?? "",
            );
            verificationToken = link.searchParams.get("token") ?? "";
            verificationHandoff = link.searchParams.get("handoff") ?? "";
          }
          return Promise.resolve();
        },
      },
      github: {
        start: () =>
          Promise.resolve({
            deviceCode: "github-device-secret",
            userCode: "ABCD-EFGH",
            verificationUri: "https://github.com/login/device",
            expiresIn: 900,
            interval: 5,
          }),
        poll: () =>
          Promise.resolve(
            githubPollResponses.shift() ?? {
              status: "complete" as const,
              accessToken: "github-access-token",
            },
          ),
        user: () =>
          Promise.resolve({
            id: 42,
            login: "octocat",
            avatarUrl: "https://avatars.example/octocat",
          }),
      },
    });
  });

  beforeEach(async () => {
    now = initialNow;
    verificationToken = "";
    verificationHandoff = "";
    companyCode = "";
    githubPollResponses = [];
    await db.query(
      "TRUNCATE game_runs, login_handoffs, email_auth_flows, github_device_flows, auth_identities, sessions, users CASCADE",
    );
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  async function token(username: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/test",
      payload: { username },
    });
    expect(response.statusCode).toBe(200);
    return response.json<{ token: string }>().token;
  }

  it("completes and replays encrypted GitHub Device Flow", async () => {
    const started = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device",
    });
    expect(started.statusCode).toBe(201);
    const flow = started.json<{ flow_token: string }>();
    const stored = await db.query<{ device_code: string }>(
      "SELECT device_code FROM github_device_flows",
    );
    expect(stored.rows[0]?.device_code).not.toContain("github-device-secret");

    now = new Date(initialNow.getTime() + 5_000);
    const completed = await app.inject({
      method: "POST",
      url: "/v1/auth/github/poll",
      payload: { poll_token: flow.flow_token },
    });
    expect(completed.statusCode).toBe(200);
    const session = completed.json<{
      token: string;
      user: { username: string };
    }>();
    expect(session.user.username).toBe("octocat");

    const replayed = await app.inject({
      method: "POST",
      url: "/v1/auth/github/poll",
      payload: { poll_token: flow.flow_token },
    });
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json<{ token: string }>().token).toBe(session.token);
    expect((await db.query("SELECT 1 FROM sessions")).rowCount).toBe(1);
    expect(
      (
        await db.query(
          "SELECT 1 FROM auth_identities WHERE provider = 'github' AND provider_subject = '42'",
        )
      ).rowCount,
    ).toBe(1);
  });

  it("paces GitHub Device Flow polls while authorization is pending", async () => {
    githubPollResponses.push({ status: "pending" });
    const started = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device",
    });
    expect(started.statusCode).toBe(201);
    const flow = started.json<{ flow_token: string }>();

    now = new Date(initialNow.getTime() + 5_000);
    const pending = await app.inject({
      method: "POST",
      url: "/v1/auth/github/poll",
      payload: { poll_token: flow.flow_token },
    });
    expect(pending.statusCode).toBe(202);
    expect(pending.json()).toEqual({ status: "pending", retry_after: 5 });
    const paced = await db.query<{ next_poll_at: Date }>(
      "SELECT next_poll_at FROM github_device_flows",
    );
    expect(paced.rows[0]?.next_poll_at.getTime()).toBe(
      initialNow.getTime() + 10_000,
    );

    now = new Date(initialNow.getTime() + 10_000);
    githubPollResponses.push({
      status: "complete",
      accessToken: "github-access-token",
    });
    const completed = await app.inject({
      method: "POST",
      url: "/v1/auth/github/poll",
      payload: { poll_token: flow.flow_token },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json<{ user: { username: string } }>().user.username).toBe(
      "octocat",
    );
  });

  it("slows down GitHub Device Flow polling after GitHub reports slow_down", async () => {
    githubPollResponses.push({ status: "slow_down" });
    const started = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device",
    });
    expect(started.statusCode).toBe(201);
    const flow = started.json<{ flow_token: string }>();

    now = new Date(initialNow.getTime() + 5_000);
    const slowed = await app.inject({
      method: "POST",
      url: "/v1/auth/github/poll",
      payload: { poll_token: flow.flow_token },
    });
    expect(slowed.statusCode).toBe(202);
    expect(slowed.json()).toEqual({ status: "pending", retry_after: 10 });
    const rows = await db.query<{
      interval_seconds: number;
      next_poll_at: Date;
    }>("SELECT interval_seconds, next_poll_at FROM github_device_flows");
    expect(rows.rows[0]?.interval_seconds).toBe(10);
    expect(rows.rows[0]?.next_poll_at.getTime()).toBe(
      initialNow.getTime() + 15_000,
    );
  });

  it("completes and replays a hashed email magic-link flow", async () => {
    const started = await app.inject({
      method: "POST",
      url: "/v1/auth/email/start",
      payload: { email: " Player@Example.com " },
    });
    expect(started.statusCode).toBe(201);
    const flow = started.json<{
      flow_token: string;
      expires_in: number;
      interval: number;
    }>();
    expect(flow).toMatchObject({ expires_in: 900, interval: 3 });
    expect(verificationToken).not.toBe("");

    const stored = await db.query<{
      poll_token_hash: string;
      verification_token_hash: string;
      email_normalized: string;
    }>(
      "SELECT poll_token_hash, verification_token_hash, email_normalized FROM email_auth_flows",
    );
    expect(stored.rows[0]).toMatchObject({
      email_normalized: "player@example.com",
    });
    expect(stored.rows[0]?.poll_token_hash).not.toBe(flow.flow_token);
    expect(stored.rows[0]?.verification_token_hash).not.toBe(verificationToken);

    const tooSoon = await app.inject({
      method: "POST",
      url: "/v1/auth/email/poll",
      payload: { poll_token: flow.flow_token },
    });
    expect(tooSoon.statusCode).toBe(202);
    expect(tooSoon.json()).toEqual({ status: "pending", retry_after: 3 });

    const verified = await app.inject({
      method: "POST",
      url: "/v1/auth/email/verify",
      payload: { token: verificationToken },
    });
    expect(verified.statusCode).toBe(200);
    const session = verified.json<{
      token: string;
      user: { id: string; username: string; display_name: string };
    }>();
    const emailDigest = createHash("sha256")
      .update("player@example.com")
      .digest("hex");
    expect(session.user.username).toBe(`player-${emailDigest.slice(0, 8)}`);
    expect(session.user.display_name).toBe(session.user.username);
    expect(JSON.stringify(session.user)).not.toContain("player@example.com");

    const replayed = await app.inject({
      method: "POST",
      url: "/v1/auth/email/verify",
      payload: { token: verificationToken },
    });
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json<{ token: string }>().token).toBe(session.token);

    now = new Date(initialNow.getTime() + 3_000);
    const polled = await app.inject({
      method: "POST",
      url: "/v1/auth/email/poll",
      payload: { poll_token: flow.flow_token },
    });
    expect(polled.statusCode).toBe(200);
    expect(polled.json<{ token: string }>().token).toBe(session.token);
    expect((await db.query("SELECT 1 FROM sessions")).rowCount).toBe(1);

    const identity = await db.query<{
      user_id: string;
      email_normalized: string;
      email_verified_at: Date | null;
    }>(
      "SELECT user_id, email_normalized, email_verified_at FROM auth_identities WHERE provider = 'email'",
    );
    expect(identity.rows[0]).toMatchObject({
      user_id: session.user.id,
      email_normalized: "player@example.com",
    });
    expect(identity.rows[0]?.email_verified_at).not.toBeNull();
  });

  it("securely completes, polls, conflicts, and expires browser handoffs", async () => {
    const started = await app.inject({
      method: "POST",
      url: "/v1/auth/handoff/start",
    });
    expect(started.statusCode).toBe(201);
    const flow = started.json<{
      flow_token: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
    }>();
    const browserToken = new URL(flow.verification_uri).searchParams.get(
      "handoff",
    );
    expect(flow).toMatchObject({ expires_in: 600, interval: 3 });
    expect(browserToken).not.toBeNull();
    expect(browserToken).not.toBe(flow.flow_token);
    const stored = await db.query<{
      poll_token_hash: string;
      browser_token_hash: string;
    }>("SELECT poll_token_hash, browser_token_hash FROM login_handoffs");
    expect(stored.rows[0]?.poll_token_hash).not.toBe(flow.flow_token);
    expect(stored.rows[0]?.browser_token_hash).not.toBe(browserToken);
    expect(stored.rows[0]?.poll_token_hash).not.toBe(
      stored.rows[0]?.browser_token_hash,
    );

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/v1/auth/handoff/complete",
      payload: { browser_token: browserToken },
    });
    expect(unauthenticated.statusCode).toBe(401);
    const pending = await app.inject({
      method: "POST",
      url: "/v1/auth/handoff/poll",
      payload: { poll_token: flow.flow_token },
    });
    expect(pending.statusCode).toBe(202);
    expect(pending.json()).toEqual({ status: "pending", retry_after: 3 });

    const firstUser = await token("handoff-first");
    const completed = await app.inject({
      method: "POST",
      url: "/v1/auth/handoff/complete",
      headers: { authorization: `Bearer ${firstUser}` },
      payload: { browser_token: browserToken },
    });
    expect(completed.statusCode).toBe(204);
    const polled = await app.inject({
      method: "POST",
      url: "/v1/auth/handoff/poll",
      payload: { poll_token: flow.flow_token },
    });
    expect(polled.statusCode).toBe(200);
    const session = polled.json<{
      token: string;
      user: { username: string };
    }>();
    expect(session.user.username).toBe("handoff-first");
    const sessionRow = await db.query<{ token_hash: string }>(
      `SELECT token_hash FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE u.username = 'handoff-first' ORDER BY s.created_at DESC LIMIT 1`,
    );
    expect(sessionRow.rows[0]?.token_hash).toBe(
      createHash("sha256").update(session.token).digest("hex"),
    );
    const replayed = await app.inject({
      method: "POST",
      url: "/v1/auth/handoff/complete",
      headers: { authorization: `Bearer ${firstUser}` },
      payload: { browser_token: browserToken },
    });
    expect(replayed.statusCode).toBe(204);

    const secondUser = await token("handoff-second");
    const conflict = await app.inject({
      method: "POST",
      url: "/v1/auth/handoff/complete",
      headers: { authorization: `Bearer ${secondUser}` },
      payload: { browser_token: browserToken },
    });
    expect(conflict.statusCode).toBe(409);

    const expiring = await app.inject({
      method: "POST",
      url: "/v1/auth/handoff/start",
    });
    const expiringFlow = expiring.json<{
      flow_token: string;
      verification_uri: string;
    }>();
    const expiringBrowserToken = new URL(
      expiringFlow.verification_uri,
    ).searchParams.get("handoff");
    now = new Date(now.getTime() + 601_000);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/handoff/poll",
          payload: { poll_token: expiringFlow.flow_token },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/handoff/complete",
          headers: { authorization: `Bearer ${firstUser}` },
          payload: { browser_token: expiringBrowserToken },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("carries a pending browser handoff in an email link", async () => {
    const started = await app.inject({
      method: "POST",
      url: "/v1/auth/handoff/start",
    });
    const browserToken = new URL(
      started.json<{ verification_uri: string }>().verification_uri,
    ).searchParams.get("handoff");
    const emailStarted = await app.inject({
      method: "POST",
      url: "/v1/auth/email/start",
      payload: {
        email: "handoff@example.com",
        browser_token: browserToken,
      },
    });
    expect(emailStarted.statusCode).toBe(201);
    expect(verificationHandoff).toBe(browserToken);
  });

  it("reuses only the matching email identity", async () => {
    const userIds: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const started = await app.inject({
        method: "POST",
        url: "/v1/auth/email/start",
        payload: { email: "same@example.com" },
      });
      const flow = started.json<{ flow_token: string }>();
      const verified = await app.inject({
        method: "POST",
        url: "/v1/auth/email/verify",
        payload: { token: verificationToken },
      });
      expect(verified.statusCode).toBe(200);
      userIds.push(verified.json<{ user: { id: string } }>().user.id);
      now = new Date(now.getTime() + 1_000);
      expect(flow.flow_token).not.toBe("");
    }
    expect(userIds[0]).toBe(userIds[1]);
    expect((await db.query("SELECT 1 FROM users")).rowCount).toBe(1);
    expect((await db.query("SELECT 1 FROM auth_identities")).rowCount).toBe(1);
  });

  it("authenticates, validates, stores, and idempotently returns a daily code run", async () => {
    const bearer = await token("octocat");
    const claimed = await app.inject({
      method: "POST",
      url: "/v1/puzzles/daily/attempt",
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(claimed.statusCode).toBe(201);
    const repeatedClaim = await app.inject({
      method: "POST",
      url: "/v1/puzzles/daily/attempt",
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(repeatedClaim.statusCode).toBe(409);
    const id = randomUUID();
    const offset = dailyPuzzleOffset("2026-08-20", 5);
    const puzzle = await db.query<{ answer: string }>(
      "SELECT answer FROM daily_code_puzzles ORDER BY puzzle_id OFFSET $1 LIMIT 1",
      [offset],
    );
    const answer = puzzle.rows[0]?.answer;
    if (!answer) throw new Error("Daily puzzle fixture is missing");
    const payload = {
      client_run_id: id,
      game_id: "daily_code",
      raw_score: 65_000,
      duration_ms: 60_000,
      client_version: "0.4.0",
      result: { solved: true, attempts: 1, hint_used: false, answer },
      challenge: {
        date: "2026-08-20",
        version: 1,
        id: "daily_code:v1:2026-08-20",
      },
    };
    const created = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: { authorization: `Bearer ${bearer}` },
      payload,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      client_run_id: id,
      normalized_score: 3_535_000,
      normalization_version: 1,
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: { authorization: `Bearer ${bearer}` },
      payload,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json<{ id: string }>().id).toBe(
      created.json<{ id: string }>().id,
    );
  });

  it("enforces one daily code result per user and date", async () => {
    const bearer = await token("hubot");
    const claimed = await app.inject({
      method: "POST",
      url: "/v1/puzzles/daily/attempt",
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(claimed.statusCode).toBe(201);
    const offset = dailyPuzzleOffset("2026-08-20", 5);
    const puzzle = await db.query<{ answer: string }>(
      "SELECT answer FROM daily_code_puzzles ORDER BY puzzle_id OFFSET $1 LIMIT 1",
      [offset],
    );
    const answer = puzzle.rows[0]?.answer;
    if (!answer) throw new Error("Daily puzzle fixture is missing");
    const base = {
      game_id: "daily_code",
      raw_score: 60_000,
      duration_ms: 60_000,
      client_version: "test",
      result: { solved: true, attempts: 0, hint_used: false, answer },
      challenge: {
        date: "2026-08-20",
        version: 1,
        id: "daily_code:v1:2026-08-20",
      },
    };
    const first = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: { authorization: `Bearer ${bearer}` },
      payload: { ...base, client_run_id: randomUUID() },
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: { authorization: `Bearer ${bearer}` },
      payload: { ...base, client_run_id: randomUUID() },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: { code: "daily_attempt_used" },
    });
  });

  it("pairs two players on the same puzzle, awards win points, and keeps ELO private", async () => {
    const firstToken = await token("ranked-one");
    const secondToken = await token("ranked-two");
    const firstQueue = await app.inject({
      method: "POST",
      url: "/v1/matches/queue",
      headers: { authorization: `Bearer ${firstToken}` },
    });
    expect(firstQueue.statusCode).toBe(200);
    expect(firstQueue.json()).toMatchObject({ status: "waiting" });

    const paired = await app.inject({
      method: "POST",
      url: "/v1/matches/queue",
      headers: { authorization: `Bearer ${secondToken}` },
    });
    expect(paired.statusCode).toBe(200);
    const state = paired.json<{
      match_id: string;
      status: string;
      puzzle: { id: string };
    }>();
    expect(state.status).toBe("active");
    expect(state.puzzle.id).toBeTruthy();
    expect(paired.json()).not.toHaveProperty("elo_rating");

    const userRows = await db.query<{ id: string; username: string }>(
      "SELECT id, username FROM users WHERE username IN ('ranked-one', 'ranked-two')",
    );
    const winner = userRows.rows.find((row) => row.username === "ranked-one");
    const loser = userRows.rows.find((row) => row.username === "ranked-two");
    if (!winner || !loser)
      throw new Error("Ranked match users were not created");
    const puzzle = await db.query<{ answer: string }>(
      "SELECT answer FROM daily_code_puzzles WHERE puzzle_id = $1",
      [state.puzzle.id],
    );
    const answer = puzzle.rows[0]?.answer;
    if (!answer) throw new Error("Ranked puzzle answer is missing");
    const submission = await app.inject({
      method: "POST",
      url: `/v1/matches/${state.match_id}/submit`,
      headers: { authorization: `Bearer ${firstToken}` },
      payload: { answer, attempts: 0 },
    });
    expect(submission.statusCode).toBe(200);
    expect(submission.json()).toMatchObject({
      correct: true,
      result: "won",
      points_awarded: 100,
    });

    const repeated = await app.inject({
      method: "POST",
      url: `/v1/matches/${state.match_id}/submit`,
      headers: { authorization: `Bearer ${firstToken}` },
      payload: { answer, attempts: 0 },
    });
    expect(repeated.statusCode).toBe(409);

    const ratings = await db.query<{
      username: string;
      elo_rating: number;
      match_points: number;
    }>(
      "SELECT username, elo_rating, match_points FROM users WHERE id IN ($1, $2)",
      [winner.id, loser.id],
    );
    expect(
      ratings.rows.find((row) => row.username === "ranked-one"),
    ).toMatchObject({ elo_rating: 1016, match_points: 100 });
    expect(
      ratings.rows.find((row) => row.username === "ranked-two"),
    ).toMatchObject({ elo_rating: 984, match_points: 0 });
    const publicProfile = await app.inject({
      url: "/v1/competition/profile",
      headers: { authorization: `Bearer ${firstToken}` },
    });
    expect(publicProfile.json()).toMatchObject({
      match_points: 100,
      wins: 1,
      rated_matches: 1,
    });
    expect(publicProfile.json()).not.toHaveProperty("elo_rating");
  });

  it("verifies company email and ranks teams by active-member average", async () => {
    const users: { id: string; token: string }[] = [];
    for (let index = 0; index < 3; index += 1) {
      const username = `team-${String(index)}`;
      const bearer = await token(username);
      const user = await db.query<{ id: string }>(
        "SELECT id FROM users WHERE username = $1",
        [username],
      );
      const userId = user.rows[0]?.id;
      if (!userId) throw new Error("Company test user was not created");
      const started = await app.inject({
        method: "POST",
        url: "/v1/company/verification/start",
        headers: { authorization: `Bearer ${bearer}` },
        payload: {
          company_name: "Example Works",
          email: `dev${String(index)}@exampleworks.test`,
        },
      });
      expect(started.statusCode).toBe(202);
      expect(companyCode).toMatch(/^\d{6}$/);
      const verified = await app.inject({
        method: "POST",
        url: "/v1/company/verification/complete",
        headers: { authorization: `Bearer ${bearer}` },
        payload: { code: companyCode },
      });
      expect(verified.statusCode).toBe(200);
      users.push({ id: userId, token: bearer });
    }
    const company = await db.query<{ id: string }>(
      "SELECT id FROM company_profiles WHERE email_domain = 'exampleworks.test'",
    );
    const companyId = company.rows[0]?.id;
    if (!companyId) throw new Error("Verified company was not created");

    for (let index = 0; index < users.length; index += 1) {
      const winner = users[index];
      const loser = users[(index + 1) % users.length];
      if (!winner || !loser)
        throw new Error("Company player fixture is missing");
      const matchId = randomUUID();
      await db.query(
        `INSERT INTO ranked_matches(
           id, status, puzzle_date, puzzle_id, player_one_id, player_two_id,
           player_one_rating, player_two_rating, winner_id, started_at, expires_at, completed_at
         ) VALUES ($1, 'completed', $2, 'daily-code-v1-01', $3, $4, 1000, 1000, $3, $5, $6, $5)`,
        [
          matchId,
          "2026-08-20",
          winner.id,
          loser.id,
          now,
          new Date(now.getTime() + 300_000),
        ],
      );
      await db.query(
        `INSERT INTO company_match_activity(company_id, user_id, match_id, points)
         VALUES ($1, $2, $3, 100), ($1, $4, $3, 0)`,
        [companyId, winner.id, matchId, loser.id],
      );
    }

    const board = await app.inject({ url: "/v1/leaderboards/companies" });
    expect(board.statusCode).toBe(200);
    expect(board.json()).toMatchObject({
      period: "rolling_30_days",
      minimum_active_members: 3,
      entries: [
        {
          name: "Example Works",
          email_domain: "exampleworks.test",
          active_members: 3,
          average_points: 100,
        },
      ],
    });
  });

  it("uses competition rank and deterministic username order for match-win points", async () => {
    const users: Record<string, string> = {};
    for (const username of ["alpha", "zeta", "challenger"]) {
      await token(username);
      const result = await db.query<{ id: string }>(
        "SELECT id FROM users WHERE username = $1",
        [username],
      );
      const row = result.rows[0];
      if (!row) throw new Error(`Missing fixture user ${username}`);
      users[username] = row.id;
    }
    for (const winner of ["alpha", "zeta"]) {
      await db.query(
        `INSERT INTO ranked_matches(
           id, status, puzzle_date, puzzle_id, player_one_id, player_two_id,
           player_one_rating, player_two_rating, winner_id, started_at, expires_at, completed_at
         ) VALUES ($1, 'completed', $2, 'daily-code-v1-01', $3, $4, 1000, 1000, $3, $5, $6, $5)`,
        [
          randomUUID(),
          "2026-08-20",
          users[winner],
          users.challenger,
          now,
          new Date(now.getTime() + 300_000),
        ],
      );
    }
    const leaderboard = await app.inject({
      method: "GET",
      url: "/v1/leaderboards/daily?date=2026-08-20",
    });
    expect(leaderboard.statusCode).toBe(200);
    expect(leaderboard.json()).toMatchObject({
      entries: [
        { rank: 1, points: 100, user: { username: "alpha" } },
        { rank: 1, points: 100, user: { username: "zeta" } },
      ],
    });
  });

  it("submits one server-validated daily code result and hides the answer from storage", async () => {
    const bearer = await token("daily-mvp");
    const claimed = await app.inject({
      method: "POST",
      url: "/v1/puzzles/daily/attempt",
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(claimed.statusCode).toBe(201);
    const offset = dailyPuzzleOffset("2026-08-20", 5);
    const puzzle = await db.query<{ answer: string }>(
      "SELECT answer FROM daily_code_puzzles ORDER BY puzzle_id OFFSET $1 LIMIT 1",
      [offset],
    );
    const puzzleRow = puzzle.rows[0];
    if (!puzzleRow) throw new Error("No daily puzzle fixture was selected");
    const answer = puzzleRow.answer;
    const payload = {
      client_run_id: randomUUID(),
      game_id: "daily_code",
      raw_score: 65_000,
      duration_ms: 60_000,
      client_version: "test",
      result: { solved: true, attempts: 1, hint_used: false, answer },
      challenge: {
        date: "2026-08-20",
        version: 1,
        id: "daily_code:v1:2026-08-20",
      },
    };
    const created = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: { authorization: `Bearer ${bearer}` },
      payload,
    });
    expect(created.statusCode).toBe(201);
    expect(
      created.json<{ result: Record<string, unknown> }>().result,
    ).not.toHaveProperty("answer");
    const stored = await db.query<{ result: Record<string, unknown> }>(
      "SELECT result FROM game_runs WHERE client_run_id = $1",
      [payload.client_run_id],
    );
    expect(stored.rows[0]?.result).not.toHaveProperty("answer");
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: { authorization: `Bearer ${bearer}` },
      payload: { ...payload, client_run_id: randomUUID() },
    });
    expect(duplicate.statusCode).toBe(409);

    const leaderboard = await app.inject({
      method: "GET",
      url: "/v1/leaderboards/games/daily_code?period=daily&date=2026-08-20",
    });
    expect(leaderboard.json()).toMatchObject({
      entries: [
        { rank: 1, points: 3_535_000, user: { username: "daily-mvp" } },
      ],
    });

    const profile = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(profile.json()).toMatchObject({
      username: "daily-mvp",
      stats: {
        daily_rank: null,
        weekly_rank: null,
        global_rank: null,
        match_points: 0,
        ranked_wins: 0,
        ranked_losses: 0,
      },
    });
  });
});
