import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AboutPage from "@/app/about/page";
import { Navbar } from "@/components/navbar";

describe("about page", () => {
  it("introduces MVP without depending on a list of current games", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { name: /AI can write the code/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/AI makes it easier than ever to build software/i),
    ).toBeInTheDocument();
  });

  it("frames MVP as player-powered ranked competition", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { name: /No AI doing the thinking/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Play. Post your score. Rise up." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/live 1v1 against a similarly skilled developer/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/honor system/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
    expect(document.getElementById("install-hero")).toBeInTheDocument();
    expect(document.getElementById("install-footer")).toBeInTheDocument();
  });

  it("explains company scoring and active-member eligibility", () => {
    render(<AboutPage />);

    expect(
      screen.getByText(/average match points per active verified member/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/at least three active players/i),
    ).toBeInTheDocument();
  });

  it("links to about from the header", () => {
    render(<Navbar />);

    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
  });
});
