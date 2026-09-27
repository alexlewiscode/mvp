"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Area, AreaChart, XAxis } from "recharts";
import { DataTable } from "@/components/ui/data-table";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { TeamMember } from "@/lib/competition-types";

const memberChartConfig = {
  match_points: { label: "Match points", color: "var(--chart-1)" },
} satisfies ChartConfig;

const columns: ColumnDef<TeamMember, unknown>[] = [
  {
    accessorKey: "display_name",
    header: "Team member",
    cell: ({ row }) => (
      <div>
        <p className="font-medium text-foreground">
          {row.original.display_name}
        </p>
        <p className="text-xs text-muted-foreground">
          @{row.original.username}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "match_points",
    header: "Match points",
    cell: ({ row }) => row.original.match_points.toLocaleString("en-US"),
  },
  {
    id: "record",
    header: "Ranked record",
    cell: ({ row }) =>
      `${row.original.wins} W · ${row.original.rated_matches - row.original.wins} L`,
  },
  {
    accessorKey: "rated_matches",
    header: "Matches",
  },
  {
    accessorKey: "last_active",
    header: "Last active",
    cell: ({ row }) => formatLastActive(row.original.last_active),
  },
];

export function TeamMembersTable({ members }: { members: TeamMember[] }) {
  return (
    <DataTable
      columns={columns}
      data={members}
      getRowId={(member) => member.id}
      getRowLabel={(member) =>
        `${member.display_name}, @${member.username}. Activate to view team member performance.`
      }
      emptyMessage="No team members are available."
      renderExpandedRow={(member) => <MemberPerformance member={member} />}
    />
  );
}

function MemberPerformance({ member }: { member: TeamMember }) {
  const losses = Math.max(0, member.rated_matches - member.wins);
  const winRate =
    member.rated_matches > 0
      ? Math.round((member.wins / member.rated_matches) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">
          {member.display_name}&apos;s performance
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ranked match results and point progression.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-4">
        <Detail
          label="Match points"
          value={member.match_points.toLocaleString("en-US")}
        />
        <Detail
          label="Ranked wins"
          value={member.wins.toLocaleString("en-US")}
        />
        <Detail label="Ranked losses" value={losses.toLocaleString("en-US")} />
        <Detail label="Win rate" value={`${winRate}%`} />
      </dl>
      <p className="text-xs text-muted-foreground">
        {member.last_active
          ? `Last active ${formatLastActive(member.last_active)}`
          : "No ranked matches yet"}
      </p>
      {member.progression.length > 0 ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Points over time</p>
          <ChartContainer config={memberChartConfig} className="h-[100px]">
            <AreaChart
              accessibilityLayer
              data={member.progression}
              margin={{ left: 0, right: 0, top: 4, bottom: 0 }}
            >
              <XAxis dataKey="date" hide />
              <Area
                type="monotone"
                dataKey="match_points"
                stroke="var(--color-match_points)"
                strokeWidth={2}
                fill="var(--color-match_points)"
                fillOpacity={0.12}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function formatLastActive(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
