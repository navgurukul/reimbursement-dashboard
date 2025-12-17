import { Skeleton } from "./skeleton";
import { TableRow, TableCell } from "./table";

interface DetailTableSkeletonProps {
  rows?: number;
}

/**
 * Standardized skeleton loader for detail tables (key-value pair tables).
 *
 * Features:
 * - Uniform row height: h-5 (1.25rem)
 * - Consistent cell padding: py-3
 * - Single full-width column per row to simplify layout
 * - Uses animate-pulse from base Skeleton component
 * - Default 7 rows (typical for detail pages)
 *
 * Usage:
 * ```tsx
 * <Table>
 *   <TableBody>
 *     {loading ? (
 *       <DetailTableSkeleton rows={7} />
 *     ) : (
 *       // actual table rows with key-value pairs
 *     )}
 *   </TableBody>
 * </Table>
 * ```
 */
export function DetailTableSkeleton({ rows = 7 }: DetailTableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          <TableCell colSpan={2} className="py-3">
            <Skeleton className="h-5 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
