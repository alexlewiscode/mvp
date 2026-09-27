import type { Metadata } from "next";
import Link from "next/link";
import { ProfileTabs } from "@/components/profile-tabs";
import {
  DEVELOPMENT_COMPETITION_PROFILE,
  developmentAccountEnabled,
} from "@/lib/development-account";
import type { CompetitionProfile } from "@/lib/competition-types";
import { backendFetch, readSessionToken } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Your Profile",
  description:
    "View your MVP ranked match record and verified company profile.",
  alternates: { canonical: "/profile" },
};

export default async function ProfilePage() {
  const token = await readSessionToken();
  if (!token) {
    if (developmentAccountEnabled()) {
      return (
        <main id="main-content">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-16 sm:px-6">
            <header>
              <p className="text-xs tracking-widest text-primary uppercase">
                Development preview · @mvpdev
              </p>
              <h1 className="mt-2 font-pixelify text-5xl text-foreground">
                Your profile
              </h1>
            </header>
            <ProfileTabs profile={DEVELOPMENT_COMPETITION_PROFILE} />
          </div>
        </main>
      );
    }
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-16 sm:px-6">
        <header>
          <p className="text-xs tracking-widest text-primary uppercase">
            Player account
          </p>
          <h1 className="mt-2 font-pixelify text-5xl text-foreground">
            Your profile
          </h1>
        </header>
        <ProfileTabs profile={profile} />
      </div>
    </main>
  );
}
