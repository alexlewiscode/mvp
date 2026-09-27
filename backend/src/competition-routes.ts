import { createHash, randomInt, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config.js";
import type { Database } from "./db.js";
import type { EmailProvider } from "./email.js";
import {
  dailyPuzzleOffset,
  eloDeltas,
  INITIAL_ELO,
  isDailyCodeAnswerCorrect,
  MIN_COMPANY_ACTIVE_MEMBERS,
  WIN_POINTS,
} from "./competition.js";
import { utcDate } from "./scoring.js";

interface CompetitionUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    competitionUser?: CompetitionUser;
  }
}

interface Options {
  config: Config;
  db: Database;
  email?: EmailProvider;
  now: () => Date;
}

interface PuzzleRow {
  puzzle_id: string;
  title: string;
  language: string;
  snippet: string[];
  buggy_line: number;
  answer: string;
  explanation: string;
  difficulty: number;
}

interface MatchRow {
  id: string;
  status: "waiting" | "active" | "completed" | "expired";
  puzzle_date: string | Date;
  puzzle_id: string;
  player_one_id: string;
  player_two_id: string | null;
  player_one_rating: number;
  player_two_rating: number | null;
  player_one_attempts: number | null;
  player_two_attempts: number | null;
  winner_id: string | null;
  expires_at: Date;
  started_at: Date | null;
}

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const dateOnly = (value: string | Date): string =>
  value instanceof Date ? utcDate(value) : value.slice(0, 10);
const freeEmailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "mail.com",
  "gmx.com",
  "fastmail.com",
]);

function isValidWorkEmail(email: string): boolean {
  if (email.length > 254) return false;
  const separator = email.indexOf("@");
  if (separator < 1 || separator > 64 || separator !== email.lastIndexOf("@"))
    return false;
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  if (
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !domain.includes(".")
  )
    return false;
  const localChars = "abcdefghijklmnopqrstuvwxyz0123456789.!#$%&'*+/=?^_`{|}~-";
  const normalizedLocal = local.toLowerCase();
  for (let index = 0; index < normalizedLocal.length; index += 1) {
    if (!localChars.includes(normalizedLocal[index] ?? "")) return false;
  }
  const labels = domain.toLowerCase().split(".");
  if (labels.at(-1)?.length === 0 || (labels.at(-1)?.length ?? 0) < 2)
    return false;
  return labels.every((label) => {
    if (label.length < 1 || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    for (let index = 0; index < label.length; index += 1) {
      const code = label.charCodeAt(index);
      const isDigit = code >= 48 && code <= 57;
      const isLowercase = code >= 97 && code <= 122;
      if (!isDigit && !isLowercase && code !== 45) return false;
    }
    return true;
  });
}

function publicPuzzle(puzzle: PuzzleRow, date: string) {
  return {
    id: puzzle.puzzle_id,
    date,
    version: 1,
    title: puzzle.title,
    language: puzzle.language,
    snippet: puzzle.snippet,
    buggy_line: puzzle.buggy_line,
    difficulty: puzzle.difficulty,
  };
}

function requestError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
) {
  return reply.status(status).send({ error: { code, message } });
}

function requireCompetitionUser(
  request: FastifyRequest,
  reply: FastifyReply,
): CompetitionUser | undefined {
  if (request.competitionUser) return request.competitionUser;
  requestError(
    reply,
    401,
    "unauthorized",
    "A valid bearer session is required",
  );
  return undefined;
}

export function registerCompetitionRoutes(
  app: FastifyInstance,
  { config, db, email, now }: Options,
) {
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ") || authorization.length <= 7)
      return requestError(
        reply,
        401,
        "unauthorized",
        "A valid bearer session is required",
      );
    const tokenHash = sha256(authorization.slice(7));
    const result = await db.query<CompetitionUser>(
      `SELECT u.id, u.username, u.display_name, u.avatar_url
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [tokenHash, now()],
    );
    const user = result.rows[0];
    if (!user)
      return requestError(
        reply,
        401,
        "unauthorized",
        "A valid bearer session is required",
      );
    request.competitionUser = user;
  };

  async function currentPuzzle(date = utcDate(now())) {
    const count = await db.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM daily_code_puzzles",
    );
    const puzzleCount = count.rows[0]?.count ?? 0;
    if (puzzleCount < 1)
      throw new Error("No daily code puzzles are configured");
    const offset = dailyPuzzleOffset(date, puzzleCount);
    const selected = await db.query<PuzzleRow>(
      "SELECT puzzle_id, title, language, snippet, buggy_line, answer, explanation, difficulty FROM daily_code_puzzles ORDER BY puzzle_id OFFSET $1 LIMIT 1",
      [offset],
    );
    const puzzle = selected.rows[0];
    if (!puzzle) throw new Error("Daily code puzzle selection returned no row");
    return puzzle;
  }

  app.get("/v1/puzzles/daily", async (_request, reply) => {
    try {
      const date = utcDate(now());
      return publicPuzzle(await currentPuzzle(date), date);
    } catch {
      return requestError(
        reply,
        503,
        "puzzle_unavailable",
        "The daily code puzzle is unavailable",
      );
    }
  });

  app.post(
    "/v1/puzzles/daily/attempt",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = requireCompetitionUser(request, reply);
      if (!user) return;
      const date = utcDate(now());
      const attempt = await db.query<{ started_at: Date }>(
        `INSERT INTO daily_code_attempts(user_id, puzzle_date, started_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, puzzle_date) DO NOTHING
         RETURNING started_at`,
        [user.id, date, now()],
      );
      const row = attempt.rows[0];
      if (!row)
        return requestError(
          reply,
          409,
          "daily_attempt_used",
          "You have already started today's daily code puzzle",
        );
      return reply.status(201).send({
        date,
        started_at: row.started_at.toISOString(),
      });
    },
  );

  app.post<{ Body: { queue?: string } }>(
    "/v1/matches/queue",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = requireCompetitionUser(request, reply);
      if (!user) return;
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        // Serialize queue joins so two waiting players cannot be paired twice.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('mvp-ranked-queue'))",
        );
        const existing = await client.query<MatchRow>(
          `SELECT * FROM ranked_matches
           WHERE status IN ('waiting', 'active')
             AND (player_one_id = $1 OR player_two_id = $1)
             AND expires_at > $2
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [user.id, now()],
        );
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return matchSummary(existing.rows[0], user.id);
        }

        const ratingRows = await client.query<{ elo_rating: number }>(
          "SELECT elo_rating FROM users WHERE id = $1 FOR UPDATE",
          [user.id],
        );
        const rating = ratingRows.rows[0]?.elo_rating ?? INITIAL_ELO;
        const candidate = await client.query<MatchRow>(
          `SELECT * FROM ranked_matches
           WHERE status = 'waiting' AND player_one_id <> $1 AND expires_at > $2
             AND abs(player_one_rating - $3) <= 400
           ORDER BY abs(player_one_rating - $3), created_at
           LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [user.id, now(), rating],
        );
        const waiting = candidate.rows[0];
        if (waiting) {
          const puzzleDate = dateOnly(waiting.puzzle_date);
          const puzzle = await currentPuzzle(puzzleDate);
          const updated = await client.query<MatchRow>(
            `UPDATE ranked_matches SET status = 'active', player_two_id = $2,
               player_two_rating = $3, started_at = $4, expires_at = $4 + interval '5 minutes'
             WHERE id = $1 RETURNING *`,
            [waiting.id, user.id, rating, now()],
          );
          const match = updated.rows[0];
          if (!match) throw new Error("Match pairing update returned no row");
          await client.query("COMMIT");
          return {
            ...matchSummary(match, user.id),
            puzzle: publicPuzzle(puzzle, puzzleDate),
          };
        }

        const puzzleDate = utcDate(now());
        const puzzle = await currentPuzzle(puzzleDate);
        const inserted = await client.query<MatchRow>(
          `INSERT INTO ranked_matches(
             id, status, puzzle_date, puzzle_id, player_one_id,
             player_one_rating, expires_at
           ) VALUES ($1, 'waiting', $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            randomUUID(),
            puzzleDate,
            puzzle.puzzle_id,
            user.id,
            rating,
            new Date(now().getTime() + 120_000),
          ],
        );
        const match = inserted.rows[0];
        if (!match) throw new Error("Match queue insert returned no row");
        await client.query("COMMIT");
        return matchSummary(match, user.id);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.delete(
    "/v1/matches/queue",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = requireCompetitionUser(request, reply);
      if (!user) return;
      await db.query(
        "UPDATE ranked_matches SET status = 'expired' WHERE status = 'waiting' AND player_one_id = $1",
        [user.id],
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/v1/matches/current",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = requireCompetitionUser(request, reply);
      if (!user) return;
      const found = await db.query<MatchRow>(
        `SELECT * FROM ranked_matches
       WHERE status IN ('waiting', 'active') AND (player_one_id = $1 OR player_two_id = $1)
       ORDER BY created_at DESC LIMIT 1`,
        [user.id],
      );
      let match = found.rows[0];
      if (!match) {
        const completed = await db.query<MatchRow>(
          `SELECT * FROM ranked_matches
         WHERE status IN ('completed', 'expired') AND (player_one_id = $1 OR player_two_id = $1)
           AND coalesce(completed_at, expires_at) > $2::timestamptz - interval '10 minutes'
         ORDER BY coalesce(completed_at, expires_at) DESC LIMIT 1`,
          [user.id, now()],
        );
        match = completed.rows[0];
      }
      if (!match) return { status: "idle" };
      if (match.expires_at <= now()) {
        await db.query(
          "UPDATE ranked_matches SET status = 'expired' WHERE id = $1 AND status IN ('waiting', 'active')",
          [match.id],
        );
        return { status: "expired", match_id: match.id };
      }
      const opponentId =
        match.player_one_id === user.id
          ? match.player_two_id
          : match.player_one_id;
      const opponent = opponentId
        ? await db.query<{ username: string }>(
            "SELECT username FROM users WHERE id = $1",
            [opponentId],
          )
        : null;
      const response: Record<string, unknown> = {
        ...matchSummary(match, user.id),
        opponent: opponent?.rows[0]?.username ?? null,
        expires_at: match.expires_at.toISOString(),
      };
      if (match.status === "active") {
        const puzzleDate = dateOnly(match.puzzle_date);
        response.puzzle = publicPuzzle(
          await currentPuzzle(puzzleDate),
          puzzleDate,
        );
      }
      if (match.status === "completed") {
        response.result =
          match.winner_id === user.id
            ? "won"
            : match.winner_id
              ? "lost"
              : "draw";
      }
      return response;
    },
  );

  app.post<{
    Params: { id: string };
    Body: { answer: string; attempts: number };
  }>(
    "/v1/matches/:id/submit",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = requireCompetitionUser(request, reply);
      if (!user) return;
      const { answer, attempts } = request.body;
      if (
        typeof answer !== "string" ||
        answer.length > 200 ||
        !Number.isInteger(attempts) ||
        attempts < 0 ||
        attempts > 20
      )
        return requestError(
          reply,
          400,
          "invalid_submission",
          "Answer and attempt count are invalid",
        );
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const selected = await client.query<MatchRow>(
          "SELECT * FROM ranked_matches WHERE id = $1 FOR UPDATE",
          [request.params.id],
        );
        const match = selected.rows[0];
        if (
          !match ||
          (match.player_one_id !== user.id && match.player_two_id !== user.id)
        ) {
          await client.query("ROLLBACK");
          return await requestError(
            reply,
            404,
            "match_not_found",
            "Match not found",
          );
        }
        if (
          match.status !== "active" ||
          !match.started_at ||
          match.expires_at <= now()
        ) {
          await client.query("ROLLBACK");
          return await requestError(
            reply,
            409,
            "match_not_active",
            "This match is no longer active",
          );
        }
        const puzzleResult = await client.query<PuzzleRow>(
          "SELECT puzzle_id, title, language, snippet, buggy_line, answer, explanation, difficulty FROM daily_code_puzzles WHERE puzzle_id = $1",
          [match.puzzle_id],
        );
        const puzzle = puzzleResult.rows[0];
        if (!puzzle) throw new Error("Ranked match puzzle is missing");
        const isOne = match.player_one_id === user.id;
        const priorAttempts = isOne
          ? (match.player_one_attempts ?? 0)
          : (match.player_two_attempts ?? 0);
        if (attempts !== priorAttempts) {
          await client.query("ROLLBACK");
          return await requestError(
            reply,
            409,
            "stale_attempt_count",
            "Refresh the match state before submitting again",
          );
        }
        if (!isDailyCodeAnswerCorrect(puzzle.answer, answer)) {
          if (priorAttempts >= 20) {
            await client.query("ROLLBACK");
            return await requestError(
              reply,
              422,
              "attempt_limit",
              "The match attempt limit has been reached",
            );
          }
          const attemptsColumn = isOne
            ? "player_one_attempts"
            : "player_two_attempts";
          await client.query(
            `UPDATE ranked_matches SET ${attemptsColumn} = $2 WHERE id = $1`,
            [match.id, priorAttempts + 1],
          );
          await client.query("COMMIT");
          return {
            correct: false,
            attempts: priorAttempts + 1,
            penalty_ms: (priorAttempts + 1) * 5_000,
          };
        }

        const opponentId = isOne ? match.player_two_id : match.player_one_id;
        const opponentRating = isOne
          ? match.player_two_rating
          : match.player_one_rating;
        if (!opponentId || opponentRating === null)
          throw new Error("Ranked opponent is missing");
        const winnerRating = isOne ? match.player_one_rating : opponentRating;
        const loserRating = isOne ? opponentRating : match.player_one_rating;
        const [winnerDelta, loserDelta] = eloDeltas(
          winnerRating,
          loserRating,
          1,
        );
        const winnerColumn = isOne ? "player_one" : "player_two";
        const submittedAt = now();
        await client.query(
          `UPDATE ranked_matches SET status = 'completed', winner_id = $2,
             ${winnerColumn}_attempts = $3,
             ${winnerColumn}_submitted_at = $4,
             player_one_elo_delta = $5, player_two_elo_delta = $6, completed_at = $4
           WHERE id = $1`,
          [
            match.id,
            user.id,
            priorAttempts,
            submittedAt,
            isOne ? winnerDelta : loserDelta,
            isOne ? loserDelta : winnerDelta,
          ],
        );
        await client.query(
          "UPDATE users SET elo_rating = least(4000, greatest(100, elo_rating + $2)), match_points = match_points + $3 WHERE id = $1",
          [user.id, winnerDelta, WIN_POINTS],
        );
        await client.query(
          "UPDATE users SET elo_rating = least(4000, greatest(100, elo_rating + $2)) WHERE id = $1",
          [opponentId, loserDelta],
        );
        await client.query(
          `INSERT INTO company_match_activity(company_id, user_id, match_id, points)
           SELECT company_id, user_id, $3,
             CASE WHEN user_id = $4 THEN $5 ELSE 0 END
           FROM company_memberships WHERE user_id IN ($1, $2)
           ON CONFLICT (match_id, user_id) DO NOTHING`,
          [user.id, opponentId, match.id, user.id, WIN_POINTS],
        );
        await client.query(
          `INSERT INTO company_point_events(id, company_id, user_id, match_id, points)
           SELECT $1, company_id, user_id, $2, $3 FROM company_memberships WHERE user_id = $4
           ON CONFLICT (match_id) DO NOTHING`,
          [randomUUID(), match.id, WIN_POINTS, user.id],
        );
        await client.query("COMMIT");
        return { correct: true, result: "won", points_awarded: WIN_POINTS };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.get(
    "/v1/competition/profile",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = requireCompetitionUser(request, reply);
      if (!user) return;
      const result = await db.query<{
        match_points: number;
        rated_matches: number;
        wins: number;
        company_name: string | null;
        company_domain: string | null;
      }>(
        `SELECT u.match_points,
         (SELECT count(*)::integer FROM ranked_matches m WHERE m.status = 'completed' AND $1 IN (m.player_one_id, m.player_two_id)) rated_matches,
         (SELECT count(*)::integer FROM ranked_matches m WHERE m.winner_id = $1) wins,
         c.name company_name, c.email_domain company_domain
       FROM users u LEFT JOIN company_memberships cm ON cm.user_id = u.id
       LEFT JOIN company_profiles c ON c.id = cm.company_id WHERE u.id = $1`,
        [user.id],
      );
      const row = result.rows[0];
      return (
        row ?? {
          match_points: 0,
          rated_matches: 0,
          wins: 0,
          company_name: null,
          company_domain: null,
        }
      );
    },
  );

  app.post<{ Body: { company_name: string; email: string } }>(
    "/v1/company/verification/start",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      if (!config.emailAuthEnabled || !email || !config.emailFrom)
        return requestError(
          reply,
          503,
          "email_auth_unavailable",
          "Email verification is unavailable",
        );
      const user = requireCompetitionUser(request, reply);
      if (!user) return;
      const normalized = request.body.email.trim().toLowerCase();
      const companyName = request.body.company_name.trim().replace(/\s+/g, " ");
      const domain = normalized.split("@")[1] ?? "";
      if (!isValidWorkEmail(normalized) || freeEmailDomains.has(domain))
        return requestError(
          reply,
          400,
          "work_email_required",
          "Enter a valid company email address",
        );
      if (companyName.length < 2 || companyName.length > 80)
        return requestError(
          reply,
          400,
          "invalid_company_name",
          "Company name must be 2 to 80 characters",
        );
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const id = randomUUID();
      const expires = new Date(now().getTime() + 15 * 60_000);
      await db.query(
        "DELETE FROM company_verification_flows WHERE user_id = $1",
        [user.id],
      );
      await db.query(
        `INSERT INTO company_verification_flows(id, user_id, email_normalized, company_name, code_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          user.id,
          normalized,
          companyName,
          sha256(`${config.sessionSecret}:${id}:${code}`),
          expires,
        ],
      );
      try {
        await email.send({
          from: config.emailFrom,
          to: normalized,
          subject: "Verify your MVP company",
          text: `Your MVP company verification code is ${code}. It expires in 15 minutes.`,
          html: `<p>Your MVP company verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 15 minutes.</p>`,
        });
      } catch {
        await db.query("DELETE FROM company_verification_flows WHERE id = $1", [
          id,
        ]);
        return requestError(
          reply,
          503,
          "email_delivery_failed",
          "Verification email could not be delivered",
        );
      }
      return reply
        .status(202)
        .send({ status: "sent", expires_at: expires.toISOString() });
    },
  );

  app.post<{ Body: { code: string } }>(
    "/v1/company/verification/complete",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      if (!/^\d{6}$/.test(request.body.code))
        return requestError(
          reply,
          400,
          "invalid_code",
          "Enter the six-digit code",
        );
      const user = requireCompetitionUser(request, reply);
      if (!user) return;
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const flows = await client.query<{
          id: string;
          email_normalized: string;
          company_name: string;
          code_hash: string;
          attempts: number;
          expires_at: Date;
        }>(
          `SELECT id, email_normalized, company_name, code_hash, attempts, expires_at
           FROM company_verification_flows WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [user.id],
        );
        const flow = flows.rows[0];
        if (!flow || flow.expires_at <= now() || flow.attempts >= 5) {
          await client.query("ROLLBACK");
          return await requestError(
            reply,
            410,
            "verification_expired",
            "Request a new company verification code",
          );
        }
        const valid =
          flow.code_hash ===
          sha256(`${config.sessionSecret}:${flow.id}:${request.body.code}`);
        if (!valid) {
          await client.query(
            "UPDATE company_verification_flows SET attempts = attempts + 1 WHERE id = $1",
            [flow.id],
          );
          await client.query("COMMIT");
          return await requestError(
            reply,
            400,
            "invalid_code",
            "That verification code is incorrect",
          );
        }
        const domain = flow.email_normalized.split("@")[1];
        const company = await client.query<{
          id: string;
          name: string;
          email_domain: string;
        }>(
          `INSERT INTO company_profiles(id, name, email_domain) VALUES ($1, $2, $3)
           ON CONFLICT (email_domain) DO UPDATE SET name = CASE
             WHEN company_profiles.name = EXCLUDED.name THEN company_profiles.name
             ELSE company_profiles.name END
           RETURNING id, name, email_domain`,
          [randomUUID(), flow.company_name, domain],
        );
        const companyRow = company.rows[0];
        if (!companyRow)
          throw new Error("Company verification returned no company");
        await client.query(
          `INSERT INTO company_memberships(user_id, company_id, verified_email, verified_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET company_id = EXCLUDED.company_id,
             verified_email = EXCLUDED.verified_email, verified_at = EXCLUDED.verified_at`,
          [user.id, companyRow.id, flow.email_normalized, now()],
        );
        await client.query(
          "DELETE FROM company_verification_flows WHERE user_id = $1",
          [user.id],
        );
        await client.query("COMMIT");
        return {
          company: {
            name: companyRow.name,
            email_domain: companyRow.email_domain,
          },
        };
      } catch (error) {
        await client.query("ROLLBACK");
        if ((error as { code?: string }).code === "23505")
          return await requestError(
            reply,
            409,
            "company_name_taken",
            "That company name is already in use",
          );
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.get("/v1/leaderboards/companies", async () => {
    const result = await db.query<{
      rank: string;
      company_id: string;
      name: string;
      email_domain: string;
      active_members: string;
      average_points: string;
    }>(
      `WITH member_points AS (
         SELECT c.id company_id, c.name, c.email_domain, a.user_id, sum(a.points)::numeric points
         FROM company_match_activity a JOIN company_profiles c ON c.id = a.company_id
         WHERE a.created_at >= now() - interval '30 days'
         GROUP BY c.id, c.name, c.email_domain, a.user_id
       ), companies AS (
         SELECT company_id, name, email_domain, count(*)::integer active_members,
           round(avg(points), 2) average_points
         FROM member_points GROUP BY company_id, name, email_domain
         HAVING count(*) >= $1
       )
       SELECT rank() OVER (ORDER BY average_points DESC) rank, company_id, name,
         email_domain, active_members, average_points
       FROM companies ORDER BY average_points DESC, lower(name), company_id LIMIT 100`,
      [MIN_COMPANY_ACTIVE_MEMBERS],
    );
    return {
      period: "rolling_30_days",
      minimum_active_members: MIN_COMPANY_ACTIVE_MEMBERS,
      entries: result.rows.map((row) => ({
        rank: Number(row.rank),
        id: row.company_id,
        name: row.name,
        email_domain: row.email_domain,
        active_members: Number(row.active_members),
        average_points: Number(row.average_points),
      })),
    };
  });
}

function matchSummary(match: MatchRow, userId: string) {
  return {
    match_id: match.id,
    status: match.status,
    puzzle_date: dateOnly(match.puzzle_date),
    expires_at: match.expires_at.toISOString(),
    ...(match.status === "completed"
      ? {
          result:
            match.winner_id === userId
              ? "won"
              : match.winner_id
                ? "lost"
                : "draw",
        }
      : {}),
  };
}
