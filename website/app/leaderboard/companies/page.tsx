import type { Metadata } from "next";
import { CompanyLeaderboardView } from "@/components/company-leaderboard";
import { fetchCompanyLeaderboard } from "@/lib/api";

export const metadata: Metadata = {
  title: "Company Leaderboard",
  description: "See which verified developer teams have the highest average match points.",
  alternates: { canonical: "/leaderboard/companies" },
};

export default async function CompaniesLeaderboardPage() {
  const board = await fetchCompanyLeaderboard().catch(() => null);
  return <CompanyLeaderboardView board={board} />;
}
