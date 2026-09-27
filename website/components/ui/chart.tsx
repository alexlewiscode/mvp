"use client";

import * as React from "react";
import { ResponsiveContainer, Tooltip as ChartTooltip } from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  { label?: React.ReactNode; color?: string }
>;

export { ChartTooltip };

export function ChartContainer({
  config,
  children,
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  config: ChartConfig;
  children: React.ReactElement;
}) {
  const chartColors = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      `--color-${key}`,
      value.color ?? "var(--chart-1)",
    ]),
  ) as React.CSSProperties;

  return (
    <div
      data-slot="chart-container"
      className={cn("flex w-full justify-center text-xs", className)}
      style={{ ...chartColors, ...style }}
      {...props}
    >
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </div>
  );
}
