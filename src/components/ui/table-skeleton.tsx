import { Skeleton } from "./skeleton";
import { TableRow, TableCell } from "./table";

interface TableSkeletonProps {
  colSpan: number;
  rows?: number;
  columnWidths?: string[]; // Legacy prop - ignored, kept for backward compatibility
}

export function TableSkeleton({ colSpan, rows = 5 }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          <TableCell colSpan={colSpan} className="py-3">
            <Skeleton className="h-5 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
