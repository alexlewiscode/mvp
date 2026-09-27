import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/components/sign-in-form";

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("sign in", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("starts GitHub only after a click and displays its device code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          flow_token: "flow-token-with-enough-length",
          user_code: "ABCD-EFGH",
          verification_uri: "https://github.com/login/device",
          expires_in: 900,
          interval: 60,
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm />);

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with GitHub" }),
    );
    expect(await screen.findByText("ABCD-EFGH")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open github/i })).toHaveAttribute(
      "href",
      "https://github.com/login/device",
    );
  });

  it("sends the email and confirms where the sign-in link was sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ status: "sent" }, { status: 201 })),
    );
    render(<SignInForm emailAuthEnabled />);

    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "person@example.com" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: /^Continue$/ })
        .closest("form")!,
    );

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText("person@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Resend in \d+s/ }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      /we sent a sign-in link/i,
    );
  });

  it("shows the email pill disabled until the provider is configured", () => {
    render(<SignInForm />);

    expect(screen.getByPlaceholderText("Email Address")).toBeInTheDocument();
    expect(screen.getByText("Or")).toBeInTheDocument();
    expect(
      screen.getByText("Email sign-in is temporarily unavailable."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("enables email resend after the fifteen-second cooldown", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ status: "sent" }, { status: 201 })),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm emailAuthEnabled />);
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "person@example.com" },
    });
    await act(async () => {
      fireEvent.submit(
        screen
          .getByRole("button", { name: /^Continue$/ })
          .closest("form")!,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByRole("button", { name: /Resend in \d+s/ }),
    ).toBeDisabled();
    for (let second = 0; second < 15; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }
    expect(screen.getByRole("button", { name: "Resend email" })).toBeEnabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resend email" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires confirmation before binding an existing website session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ user: { username: "octocat" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm browserToken="browser-token-with-enough-length" />);

    const continueButton = await screen.findByRole("button", {
      name: "Continue as @octocat",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(continueButton);
    expect(
      await screen.findByText("Terminal sign-in complete"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/auth/handoff/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          browser_token: "browser-token-with-enough-length",
        }),
      }),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("includes the browser token while polling a GitHub handoff", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url === "/api/auth/session")
        return Promise.resolve(
          Response.json({ error: "none" }, { status: 401 }),
        );
      if (url === "/api/auth/github/start")
        return Promise.resolve(
          Response.json(
            {
              flow_token: "flow-token-with-enough-length",
              user_code: "ABCD-EFGH",
              verification_uri: "https://github.com/login/device",
              expires_in: 900,
              interval: 1,
            },
            { status: 201 },
          ),
        );
      return Promise.resolve(Response.json({ status: "complete" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm browserToken="browser-token-with-enough-length" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with GitHub" }),
    );
    expect(await screen.findByText("ABCD-EFGH")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Terminal sign-in complete",
        {},
        { timeout: 2_000 },
      ),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/github/poll",
      expect.objectContaining({
        body: JSON.stringify({
          poll_token: "flow-token-with-enough-length",
          browser_token: "browser-token-with-enough-length",
        }),
      }),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows a terminal return state for a completed callback", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm cliComplete />);

    expect(screen.getByText("Terminal sign-in complete")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /return to your terminal/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Continue with GitHub")).not.toBeInTheDocument();
  });

  it("announces server errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: "Too many attempts. Please wait and try again." },
            { status: 429 },
          ),
        ),
    );
    render(<SignInForm />);

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with GitHub" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Too many attempts"),
    );
  });
});
