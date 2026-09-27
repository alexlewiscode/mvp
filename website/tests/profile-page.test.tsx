import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  backendFetch: vi.fn(),
  readSessionToken: vi.fn(),
}));

vi.mock("@/lib/auth", () => auth);

import ProfilePage from "@/app/profile/page";

describe("profile page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("renders the placeholder account and sample profile in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    auth.readSessionToken.mockResolvedValue(undefined);

    render(await ProfilePage());

    expect(
      screen.getByText("Development preview · @mvpdev"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Team settings" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(auth.backendFetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Team settings" }));
    expect(
      screen.getByRole("row", { name: /Pixel Pioneer, @pixelpioneer/ }),
    ).toBeInTheDocument();
  });

  it("keeps authentication required for profiles outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    auth.readSessionToken.mockResolvedValue(undefined);

    render(await ProfilePage());

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});
