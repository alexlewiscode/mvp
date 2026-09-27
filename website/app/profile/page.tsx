import type { Metadata } from "next";
import Link from "next/link";
import { CompanyVerificationForm } from "@/components/company-verification-form";
import { backendFetch, readSessionToken } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Your Profile",
  description:
    "View your MVP ranked match record and verified company profile.",
  alternates: { canonical: "/profile" },
};

interface CompetitionProfile {
  match_points: number;
  rated_matches: number;
  wins: number;
  company_name: string | null;
  company_domain: string | null;
}

export default async function ProfilePage() {
  const token = await readSessionToken();
  if (!token) {
    return (
      <main
        id="main-content"
        className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6"
      >
        <h1 className="font-pixelify text-5xl text-foreground">Your profile</h1>
        <p className="mt-4 text-muted-foreground">
          Sign in to view match results and verify your company.
        </p>
        <Link
          className="mt-6 inline-block text-primary underline"
          href="/sign-in"
        >
          Sign in
        </Link>
      </main>
    );
  }

  let profile: CompetitionProfile | null = null;
  try {
    const response = await backendFetch("/v1/competition/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) profile = (await response.json()) as CompetitionProfile;
  } catch {
    profile = null;
  }

  return (
    <main id="main-content">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-16 sm:px-6">
        <header>
          <p className="text-xs tracking-widest text-primary uppercase">
            Player account
          </p>
          <h1 className="mt-2 font-pixelify text-5xl text-foreground">
            Your profile
          </h1>
        </header>
        {profile ? (
          <section
            aria-label="Ranked match statistics"
            className="grid gap-4 sm:grid-cols-3"
          >
            <Stat
              label="Match points"
              value={profile.match_points.toLocaleString("en-US")}
            />
            <Stat
              label="Ranked wins"
              value={profile.wins.toLocaleString("en-US")}
            />
            <Stat
              label="Matches played"
              value={profile.rated_matches.toLocaleString("en-US")}
            />
          </section>
        ) : (
          <p role="status" className="text-muted-foreground">
            Your competition profile is temporarily unavailable.
          </p>
        )}
        <section className="flex flex-col gap-4">
          <div>
            <p className="text-xs tracking-widest text-primary uppercase">
              Team standings
            </p>
            <h2 className="mt-2 text-2xl font-medium">Company affiliation</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Verify a company email to represent your team. Company rankings
              average the rolling 30-day points of active members and require at
              least three active verified players.
            </p>
          </div>
          <CompanyVerificationForm
            companyName={profile?.company_name ?? null}
            emailDomain={profile?.company_domain ?? null}
          />
          <Link
            href="/leaderboard/companies"
            className="text-sm text-primary underline"
          >
            View company leaderboard
          </Link>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-pixelify text-3xl text-foreground">{value}</p>
    </div>
  );
}
