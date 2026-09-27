import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AboutPage from "@/app/about/page";
import { Navbar } from "@/components/navbar";

describe("about page", () => {
  it("introduces MVP without depending on a list of current games", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: /AI can write the code/i })).toBeInTheDocument();
    expect(screen.getByText(/AI makes it easier than ever to build software/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Stack Overflow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "The Daily PR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "The Daily Fix" })).not.toBeInTheDocument();
  });

  it("frames MVP as player-powered competition and explains the future vision", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: /No AI doing the thinking/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Play. Post your score. Rise up." })).toBeInTheDocument();
    expect(screen.getByText(/shared leaderboards/i)).toBeInTheDocument();
    expect(screen.getByText(/bigger vision is to bring developers into direct head-to-head competition/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
    expect(document.getElementById("install-hero")).toBeInTheDocument();
    expect(document.getElementById("install-footer")).toBeInTheDocument();
  });

  it("explains the current scoreboards and daily competition", () => {
    render(<AboutPage />);

    expect(screen.getByText(/shared leaderboards/i)).toBeInTheDocument();
    expect(screen.getByText(/compete for the daily top spot/i)).toBeInTheDocument();
  });

  it("links to about from the header", () => {
    render(<Navbar />);

    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
  });
});
