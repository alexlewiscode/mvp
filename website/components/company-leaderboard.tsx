import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompanyLeaderboard } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CompanyLeaderboardView({
  board,
}: {
  board: CompanyLeaderboard | null;
}) {
  return (
    <main id="main-content">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-16 sm:px-6">
        <header>
          <p className="text-xs tracking-widest text-primary uppercase">
            Team rankings
          </p>
          <h1 className="mt-2 font-pixelify text-5xl text-foreground sm:text-6xl">
            Company MVP
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
            Ranked by average match points per active, verified member over the
            last 30 days. A company needs at least three active members to
            appear.
          </p>
        </header>
        <nav aria-label="Leaderboard type" className="flex gap-2">
          <Link
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "rounded-full",
            )}
            href="/leaderboard"
          >
            Players
          </Link>
          <Link
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "rounded-full",
            )}
            href="/leaderboard/companies"
            aria-current="page"
          >
            Companies
          </Link>
        </nav>
        {!board ? (
          <p
            role="status"
            className="rounded-lg border border-border p-8 text-center text-muted-foreground"
          >
            Company leaderboard unavailable.
          </p>
        ) : board.entries.length === 0 ? (
          <p
            role="status"
            className="rounded-lg border border-border p-8 text-center text-muted-foreground"
          >
            No companies have enough active verified players yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Active players</TableHead>
                <TableHead className="text-right">Avg. points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {board.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.rank}</TableCell>
                  <TableCell>
                    <span className="font-medium">{entry.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {entry.email_domain}
                    </span>
                  </TableCell>
                  <TableCell>{entry.active_members}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {entry.average_points.toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </main>
  );
}
