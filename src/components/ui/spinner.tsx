import { cn } from "@/lib/utils";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className, ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div
        className={cn(
          "animate-spin rounded-full border-b-2 border-gray-900",
          sizeClasses[size],
          className
        )}
        {...props}
      />
    </div>
  );
}
