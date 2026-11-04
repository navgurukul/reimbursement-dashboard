import * as React from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons or links. Sit to the right of the title on wide screens and wrap below it on phones. */
  actions?: React.ReactNode;
  /** Shown above the title, e.g. a back link. */
  leading?: React.ReactNode;
}

/**
 * Standard page heading: one h1, an optional description and an actions row.
 * Use it at the top of every page so titles, spacing and action placement
 * match across the app.
 */
export function PageHeader({
  title,
  description,
  actions,
  leading,
  className,
  children,
  ...props
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1.5">
        {leading}
        <h1 className="page-title">{title}</h1>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
