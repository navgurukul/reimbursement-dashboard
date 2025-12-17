import { Spinner } from "./spinner";

interface PageLoaderProps {
  message?: string;
  className?: string;
}

export function PageLoader({
  message = "Loading...",
  className = "",
}: PageLoaderProps) {
  return (
    <div
      className={`flex items-center justify-center min-h-[400px] ${className}`}
    >
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <span className="text-sm text-gray-600">{message}</span>
      </div>
    </div>
  );
}
