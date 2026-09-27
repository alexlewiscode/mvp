"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CompanyVerificationForm({
  companyName,
  emailDomain,
}: {
  companyName: string | null;
  emailDomain: string | null;
}) {
  const [stage, setStage] = useState<"form" | "code" | "done">("form");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifiedCompany, setVerifiedCompany] = useState(companyName);
  const [verifiedDomain, setVerifiedDomain] = useState(emailDomain);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const payload =
      stage === "form"
        ? { company_name: data.get("company_name"), email: data.get("email") }
        : { code: data.get("code") };
    try {
      const response = await fetch("/api/company/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: { message?: string } | string;
        company?: { name: string; email_domain: string };
      };
      if (!response.ok) {
        setError(
          typeof result.error === "string"
            ? result.error
            : (result.error?.message ?? "Could not verify company."),
        );
      } else if (stage === "form") {
        setStage("code");
      } else if (result.company) {
        setVerifiedCompany(result.company.name);
        setVerifiedDomain(result.company.email_domain);
        setStage("done");
      }
    } catch {
      setError("Company verification is unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (verifiedCompany && verifiedDomain && stage !== "code") {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Verified company</p>
        <p className="mt-1 font-medium">{verifiedCompany}</p>
        <p className="mt-1 text-xs text-muted-foreground">{verifiedDomain}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex max-w-lg flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <div>
        <h3 className="font-medium">
          {stage === "code" ? "Check your work email" : "Verify your company"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {stage === "code"
            ? "Enter the six-digit code we sent to your company inbox."
            : "Verify your work email to join your company on the leaderboard."}
        </p>
      </div>
      {stage === "form" ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Company name
            <input
              required
              name="company_name"
              minLength={2}
              maxLength={80}
              className="h-10 rounded-md border border-input bg-background px-3"
              placeholder="Acme Inc."
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Work email
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              className="h-10 rounded-md border border-input bg-background px-3"
              placeholder="you@company.com"
            />
          </label>
        </>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          Verification code
          <input
            required
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            className="h-10 rounded-md border border-input bg-background px-3 font-mono tracking-widest"
            placeholder="000000"
          />
        </label>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {stage === "done" ? (
        <p role="status" className="text-sm text-primary">
          Company verified.
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy
          ? "Please wait…"
          : stage === "code"
            ? "Verify company"
            : "Send verification code"}
      </Button>
    </form>
  );
}
