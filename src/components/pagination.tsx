import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";

export const PER_PAGE = 10;

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage?: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  itemLabel?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage = PER_PAGE,
  onPageChange,
  isLoading = false,
  itemLabel = "items",
}: PaginationProps) {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing{" "}
        <span className="font-medium tabular-nums text-foreground">
          {startItem}–{endItem}
        </span>{" "}
        of{" "}
        <span className="font-medium tabular-nums text-foreground">
          {totalItems}
        </span>
      </p>

      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1 || isLoading}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </Button>

        <span className="px-2 text-sm font-medium whitespace-nowrap text-muted-foreground tabular-nums">
          Page {currentPage} of {totalPages}
        </span>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages || isLoading}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

// Custom hook for pagination logic
export function usePagination<T>(data: T[], itemsPerPage: number = PER_PAGE) {
  const [currentPage, setCurrentPage] = useState(1);

  // Calculate total pages
  const totalPages = Math.max(1, Math.ceil(data.length / itemsPerPage));

  // Get paginated data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  }, [data, currentPage, itemsPerPage]);

  // Calculate start index for correct S.No. across pages
  const getItemNumber = (index: number) => {
    return (currentPage - 1) * itemsPerPage + index + 1;
  };

  // Reset to page 1 when data changes
  const resetPage = () => setCurrentPage(1);

  return {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedData,
    totalItems: data.length,
    getItemNumber,
    resetPage,
  };
}
