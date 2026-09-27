import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileTabs } from "@/components/profile-tabs";

describe("profile tabs", () => {
  it("shows match stats by default and keeps team settings in their own tab", () => {
    render(
      <ProfileTabs
        profile={{
          match_points: 1250,
          rated_matches: 8,
          wins: 5,
          company_name: "MVP Dev Team",
          company_domain: "development.mvp",
          progression: [
            { date: "2026-09-01", match_points: 0 },
            { date: "2026-09-10", match_points: 100 },
          ],
          team_members: [
            {
              id: "member-1",
              username: "octocat",
              display_name: "Octocat",
              match_points: 300,
              rated_matches: 4,
              wins: 3,
              last_active: "2026-09-20T12:00:00.000Z",
              progression: [
                { date: "2026-09-01", match_points: 0 },
                { date: "2026-09-20", match_points: 300 },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("tabpanel", { name: "Profile" })).toHaveTextContent(
      "1,250",
    );
    expect(
      screen.getByLabelText(
        "Area chart showing cumulative match points over time",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Company affiliation")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Team settings" }));
    expect(
      screen.getByRole("tabpanel", { name: "Team settings" }),
    ).toHaveTextContent("Company affiliation");
    expect(
      screen.getByRole("heading", { name: "Team members" }),
    ).toBeInTheDocument();
    const memberRow = screen.getByRole("row", { name: /Octocat, @octocat/ });
    fireEvent.click(memberRow);
    expect(
      screen.getByRole("heading", { name: "Octocat's performance" }),
    ).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View company leaderboard" }),
    ).toHaveAttribute("href", "/leaderboard/companies");
  });
});
