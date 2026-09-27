"use client";

import Link from "next/link";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CompanyVerificationForm } from "@/components/company-verification-form";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { TeamMembersTable } from "@/components/team-members-table";
import type { CompetitionProfile } from "@/lib/competition-types";

const progressionConfig = {
  match_points: {
    label: "Match points",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function ProfileTabs({
  profile,
}: {
  profile: CompetitionProfile | null;
}) {
  const [activeTab, setActiveTab] = useState<"profile" | "team">("profile");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Profile sections"
        className="flex w-fit gap-1 rounded-lg border border-border bg-card p-1"
      >
        <Tab
          id="profile-tab"
          panelId="profile-panel"
          selected={activeTab === "profile"}
          onClick={() => setActiveTab("profile")}
        >
          Profile
        </Tab>
        <Tab
          id="team-tab"
          panelId="team-panel"
          selected={activeTab === "team"}
          onClick={() => setActiveTab("team")}
        >
          Team settings
        </Tab>
      </div>

      {activeTab === "profile" ? (
        <section
          id="profile-panel"
          role="tabpanel"
          aria-labelledby="profile-tab"
          className="mt-6"
        >
          {profile ? (
            <>
              <div
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
              </div>
              <section className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6">
                <div>
                  <h2 className="font-medium">Match point progression</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cumulative points earned from ranked match wins.
                  </p>
                </div>
                {profile.progression.length > 0 ? (
                  <ChartContainer
                    config={progressionConfig}
                    className="mt-4 h-[260px]"
                    aria-label="Area chart showing cumulative match points over time"
                  >
                    <AreaChart
                      accessibilityLayer
                      data={profile.progression}
                      margin={{ left: 4, right: 12, top: 8, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="match-points-fill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="var(--color-match_points)"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="100%"
                            stopColor="var(--color-match_points)"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        stroke="var(--border)"
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        minTickGap={24}
                        tick={{ fill: "var(--muted-foreground)" }}
                        tickFormatter={formatChartDate}
                      />
                      <YAxis
                        width={42}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        tick={{ fill: "var(--muted-foreground)" }}
                        tickFormatter={formatCompactNumber}
                      />
                      <ChartTooltip
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          borderColor: "var(--border)",
                          borderRadius: "var(--radius)",
                        }}
                        labelStyle={{ color: "var(--popover-foreground)" }}
                        itemStyle={{ color: "var(--primary)" }}
                        labelFormatter={(label) =>
                          formatFullDate(String(label))
                        }
                        formatter={(value) => [
                          formatCompactNumber(Number(value)),
                          "Match points",
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="match_points"
                        stroke="var(--color-match_points)"
                        strokeWidth={2}
                        fill="url(#match-points-fill)"
                        dot={profile.progression.length <= 12}
                        activeDot={{ r: 5, fill: "var(--color-match_points)" }}
                      />
                    </AreaChart>
                  </ChartContainer>
                ) : (
                  <p className="mt-6 rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Play ranked matches to start building your progression.
                  </p>
                )}
              </section>
            </>
          ) : (
            <p role="status" className="text-muted-foreground">
              Your competition profile is temporarily unavailable.
            </p>
          )}
        </section>
      ) : (
        <section
          id="team-panel"
          role="tabpanel"
          aria-labelledby="team-tab"
          className="mt-6 flex flex-col gap-4"
        >
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
          {profile?.company_name ? (
            <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-6">
              <div>
                <p className="text-xs tracking-widest text-primary uppercase">
                  {profile.company_name}
                </p>
                <h3 className="mt-2 text-xl font-medium">Team members</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select a teammate to explore their ranked match performance.
                </p>
              </div>
              <TeamMembersTable members={profile.team_members} />
            </section>
          ) : null}
          <Link
            href="/leaderboard/companies"
            className="text-sm text-primary underline"
          >
            View company leaderboard
          </Link>
        </section>
      )}
    </div>
  );
}

function formatChartDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

function Tab({
  id,
  panelId,
  selected,
  onClick,
  children,
}: {
  id: string;
  panelId: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={panelId}
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm transition-colors ${
        selected
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
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
