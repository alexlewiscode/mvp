"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export const INSTALL_COMMAND = "npm install -g @mvp-play/cli";

export function InstallPill({ id = "install" }: { id?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copyCommand() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1_500);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div id={id} className="flex max-w-full flex-col items-center gap-3">
      <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-1.5 pl-4 shadow-sm sm:pl-5">
        <code className="whitespace-nowrap text-[0.625rem] text-foreground sm:text-sm md:text-base">
          <span aria-hidden="true" className="text-primary">
            ${" "}
          </span>
          {INSTALL_COMMAND}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copyCommand}
          aria-live="polite"
          className="shrink-0 rounded-full"
        >
          {status === "copied" ? <Check /> : <Copy />}
          <span className="sr-only sm:not-sr-only">
            {status === "copied"
              ? "Copied"
              : status === "failed"
                ? "Copy failed"
                : "Copy"}
          </span>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Install once, then run <code className="text-foreground">mvp</code>{" "}
        whenever you like.
      </p>
    </div>
  );
}
