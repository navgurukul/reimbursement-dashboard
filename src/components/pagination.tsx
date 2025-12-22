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
    <div className="flex items-center justify-between pt-2">
      <div className="text-sm text-black font-medium">
        Showing {startItem} to {endItem} of {totalItems} {itemLabel}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1 || isLoading}
          className="cursor-pointer caret-transparent"
        >
          Previous
        </Button>

        <div className="text-sm text-black font-medium">
          Page {currentPage} of {totalPages}
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages || isLoading}
          className="cursor-pointer caret-transparent"
        >
          Next
        </Button>
      </div>
    </div>
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
