import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatCardProps extends React.ComponentProps<"div"> {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  /** Colour accent for the icon chip. */
  tone?: "default" | "success" | "warning" | "danger" | "info";
}

const toneClasses: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-muted text-foreground",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
};

/** Compact metric tile used in the stats rows at the top of list pages. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  className,
  ...props
}: StatCardProps) {
  return (
    <div
      data-slot="stat-card"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground shadow-xs",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium leading-snug text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
              toneClasses[tone]
            )}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="truncate text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
