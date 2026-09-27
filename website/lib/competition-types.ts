export interface ProgressionPoint {
  date: string;
  match_points: number;
}

export interface TeamMember {
  id: string;
  username: string;
  display_name: string;
  match_points: number;
  rated_matches: number;
  wins: number;
  last_active: string | null;
  progression: ProgressionPoint[];
}

export interface CompetitionProfile {
  match_points: number;
  rated_matches: number;
  wins: number;
  company_name: string | null;
  company_domain: string | null;
  progression: ProgressionPoint[];
  team_members: TeamMember[];
}
