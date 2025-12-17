import { cn } from "@/lib/utils";
import { Loader2Icon, type LucideProps } from "lucide-react";

interface SpinnerProps extends Omit<LucideProps, "ref"> {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className, ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  return (
    <Loader2Icon
      aria-label="Loading"
      className={cn("animate-spin", sizeClasses[size], className)}
      {...props}
    />
  );
}
