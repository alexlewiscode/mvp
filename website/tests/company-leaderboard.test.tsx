import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompanyLeaderboardView } from "@/components/company-leaderboard";

describe("company leaderboard", () => {
  it("shows rolling average points and the active-member threshold", () => {
    render(
      <CompanyLeaderboardView
        board={{
          period: "rolling_30_days",
          minimum_active_members: 3,
          entries: [
            {
              rank: 1,
              id: "company-1",
              name: "Example Works",
              email_domain: "example.test",
              active_members: 3,
              average_points: 125.5,
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Company MVP" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Example Works")).toBeInTheDocument();
    expect(screen.getByText("125.5")).toBeInTheDocument();
    expect(
      screen.getByText(/at least three active members/i),
    ).toBeInTheDocument();
  });

  it("explains when there are no eligible companies", () => {
    render(
      <CompanyLeaderboardView
        board={{
          period: "rolling_30_days",
          minimum_active_members: 3,
          entries: [],
        }}
      />,
    );
    expect(
      screen.getByText(/no companies have enough active verified players/i),
    ).toBeInTheDocument();
  });
});
