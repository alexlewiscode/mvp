import type { AuthUser } from "@/lib/auth-types";
import type { CompetitionProfile } from "@/lib/competition-types";

export function developmentAccountEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export const DEVELOPMENT_ACCOUNT: AuthUser = {
  id: "development-account",
  username: "mvpdev",
  display_name: "MVP Developer",
  avatar_url: null,
};

const developmentProgression = [
  { date: "2026-09-01", match_points: 0 },
  { date: "2026-09-04", match_points: 100 },
  { date: "2026-09-08", match_points: 200 },
  { date: "2026-09-12", match_points: 400 },
  { date: "2026-09-16", match_points: 600 },
  { date: "2026-09-20", match_points: 900 },
  { date: "2026-09-24", match_points: 1_200 },
];

export const DEVELOPMENT_COMPETITION_PROFILE: CompetitionProfile = {
  match_points: 1_200,
  rated_matches: 18,
  wins: 12,
  company_name: "MVP Development Team",
  company_domain: "development.mvp",
  progression: developmentProgression,
  team_members: [
    {
      id: "development-account",
      username: "mvpdev",
      display_name: "MVP Developer",
      match_points: 1_200,
      rated_matches: 18,
      wins: 12,
      last_active: "2026-09-27T10:30:00.000Z",
      progression: developmentProgression,
    },
    {
      id: "development-member-2",
      username: "pixelpioneer",
      display_name: "Pixel Pioneer",
      match_points: 900,
      rated_matches: 14,
      wins: 9,
      last_active: "2026-09-26T15:20:00.000Z",
      progression: [
        { date: "2026-09-03", match_points: 0 },
        { date: "2026-09-08", match_points: 200 },
        { date: "2026-09-14", match_points: 500 },
        { date: "2026-09-20", match_points: 700 },
        { date: "2026-09-26", match_points: 900 },
      ],
    },
    {
      id: "development-member-3",
      username: "arrayace",
      display_name: "Array Ace",
      match_points: 600,
      rated_matches: 9,
      wins: 6,
      last_active: "2026-09-25T09:10:00.000Z",
      progression: [
        { date: "2026-09-05", match_points: 0 },
        { date: "2026-09-11", match_points: 200 },
        { date: "2026-09-18", match_points: 400 },
        { date: "2026-09-25", match_points: 600 },
      ],
    },
  ],
};
