"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { cn } from "@/lib/utils";

export function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

export function SheetTrigger(
  props: React.ComponentProps<typeof SheetPrimitive.Trigger>
) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

export function SheetClose(
  props: React.ComponentProps<typeof SheetPrimitive.Close>
) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal(
  props: React.ComponentProps<typeof SheetPrimitive.Portal>
) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 " +
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        className
      )}
      {...props}
    />
  );
}

export function SheetContent({
  className,
  side = "right",
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-background shadow-lg " +
            "transition ease-in-out " +
            "data-[state=open]:duration-500 data-[state=closed]:duration-300",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm " +
              "data-[state=open]:slide-in-from-right " +
              "data-[state=closed]:slide-out-to-right",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm " +
              "data-[state=open]:slide-in-from-left " +
              "data-[state=closed]:slide-out-to-left",
          side === "top" &&
            "inset-x-0 top-0 h-auto border-b " +
              "data-[state=open]:slide-in-from-top " +
              "data-[state=closed]:slide-out-to-top",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto border-t " +
              "data-[state=open]:slide-in-from-bottom " +
              "data-[state=closed]:slide-out-to-bottom",
          className
        )}
        {...props}
      >
        {/* this hidden title satisfies the a11y requirement */}
        <VisuallyHidden>
          <SheetPrimitive.Title>Dialog</SheetPrimitive.Title>
        </VisuallyHidden>

        {children}

        <SheetPrimitive.Close
          data-slot="sheet-close"
          className="absolute top-4 right-4 rounded focus:ring-2 focus:ring-offset-2 focus:outline-none opacity-70 hover:opacity-100 transition"
        >
          <XIcon className="h-4 w-4" />
          <VisuallyHidden>Close</VisuallyHidden>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

export function SheetHeader(props: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className="p-4 flex flex-col gap-1.5"
      {...props}
    />
  );
}

export function SheetFooter(props: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className="mt-auto p-4 flex flex-col gap-2"
      {...props}
    />
  );
}

export function SheetTitle(
  props: React.ComponentProps<typeof SheetPrimitive.Title>
) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold text-lg", props.className)}
      {...props}
    />
  );
}

export function SheetDescription(
  props: React.ComponentProps<typeof SheetPrimitive.Description>
) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className="text-muted-foreground text-sm"
      {...props}
    />
  );
}
