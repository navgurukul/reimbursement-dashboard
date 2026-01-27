"use client";

import React from "react";
import { useEffect, useState, useRef } from "react";
import supabase from "@/lib/supabase";
import { expenses, organizations } from "@/lib/db";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  IndianRupee,
  Pencil,
  Save,
  Trash2,
  Funnel,
  Undo2,
  Filter,
  Eye,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { toast } from "sonner";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Pagination, usePagination } from "@/components/pagination";

export default function PaymentRecords() {
  const [records, setRecords] = useState<any[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { slug } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [highlightedExpenseId, setHighlightedExpenseId] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);

  // Filter state
  const [filters, setFilters] = useState({
    expenseType: "All Expense Type",
    eventName: "All Events",
    createdBy: "All Creators",
    email: "All Emails",
    uniqueId: "All Unique IDs",
    location: "All Locations",
    bills: "All Bills",
    utr: "All UTRs",
    startDate: "",
    endDate: "",
    dateMode: "All Dates",
    minAmount: 0,
    maxAmount: 0,
  });

  const [amountBounds, setAmountBounds] = useState({ min: 0, max: 0 });
  const [filterOpen, setFilterOpen] = useState(false);
  const [eventTitleLookup, setEventTitleLookup] = useState<
    Record<string, string>
  >({});
  const [eventOptions, setEventOptions] = useState<
    { id: string; title: string }[]
  >([]);

  // State for UTR editing functionality
  const [editingFields, setEditingFields] = useState<
    Record<string, { utr?: boolean }>
  >({});
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [passwordModal, setPasswordModal] = useState({
    open: false,
    expenseId: null as null | string,
  });
  const [enteredPassword, setEnteredPassword] = useState("");

  // Use pagination hook
  const pagination = usePagination(filteredRecords, 100);

  // Reset page when filters change
  useEffect(() => {
    pagination.resetPage();
  }, [filters]);

  // Handle expID from URL parameter
  useEffect(() => {
    const expID = searchParams.get("expID");
    if (expID) {
      setHighlightedExpenseId(expID);
      // Clear the expID after 10 seconds
      const timer = setTimeout(() => {
        setHighlightedExpenseId(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Scroll to highlighted row when it's set
  useEffect(() => {
    if (highlightedExpenseId && filteredRecords.length > 0) {
      // Find which page the highlighted expense is on
      const recordIndex = filteredRecords.findIndex(r => r.id === highlightedExpenseId);
      if (recordIndex !== -1) {
        const itemsPerPage = 100;
        const pageNumber = Math.floor(recordIndex / itemsPerPage) + 1;
        pagination.setCurrentPage(pageNumber);
        
        // Scroll to the highlighted row after pagination updates
        setTimeout(() => {
          highlightedRowRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 200);
      }
    }
  }, [highlightedExpenseId, filteredRecords]);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    id: string | null;
  }>({
    open: false,
    id: null,
  });
  const [sendBackModal, setSendBackModal] = useState<{
    open: boolean;
    id: string | null;
  }>({ open: false, id: null });
  const [sendBackLoading, setSendBackLoading] = useState(false);
  const [editModal, setEditModal] = useState<{
    open: boolean;
    record: any | null;
  }>({ open: false, record: null });
  const [editForm, setEditForm] = useState({
    expense_type: "",
    event_id: "",
    location: "",
    approved_amount: "",
    utr: "",
    unique_id: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const ADMIN_PASSWORD = "admin"; // your password

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        setLoading(true);

        // Get organization ID from slug
        const { data: orgData, error: orgError } = await organizations.getBySlug(
          slug as string
        );

        if (orgError || !orgData) {
          throw new Error("Organization not found");
        }

        const orgId = orgData.id;

        const { data, error } = await supabase
          .from("expense_new")
          .select("*")
          .eq("payment_status", "paid")
          .eq("org_id", orgId)
          // Show records with missing paid_approval_time first, then the rest ascending
          .order("paid_approval_time", { ascending: true, nullsFirst: true })
          // Stable tie-breaker to prevent random ordering when timestamps match
          .order("created_at", { ascending: true });

        if (error) throw error;

        const rows = data || [];

        // Fetch vouchers for these records (if any)
        try {
          const expenseIds = rows.map((r: any) => r.id).filter(Boolean);
          if (expenseIds.length > 0) {
            const { data: allVouchers, error: voucherError } = await supabase
              .from("vouchers")
              .select("*")
              .in("expense_id", expenseIds);

            const voucherMap: Record<string, any> = {};
            if (!voucherError && allVouchers) {
              allVouchers.forEach((v: any) => {
                voucherMap[v.expense_id] = v;
              });
            }

            // attach voucher info to rows
            rows.forEach((r: any) => {
              const voucher = voucherMap[r.id];
              if (voucher) {
                r.hasVoucher = true;
                r.voucherId = voucher.id;
              }
            });
          }
        } catch (vErr) {
          // non-critical: continue without voucher data
          console.error("Error fetching vouchers for records:", vErr);
        }

        // Bulk fetch event titles
        const eventIds = [
          ...new Set(
            rows
              .map((r: any) => r.event_id)
              .filter((id: any) => typeof id === "string" && id.length > 0)
          ),
        ];

        let eventTitleMap: Record<string, string> = {};
        let eventsDataList: { id: string; title: string }[] = [];
        if (eventIds.length > 0) {
          const { data: eventsData, error: evErr } = await supabase
            .from("expense_events")
            .select("id,title")
            .in("id", eventIds);
          if (!evErr && eventsData) {
            eventsDataList = eventsData;
            eventsData.forEach((ev: { id: string; title: string }) => {
              eventTitleMap[ev.id] = ev.title;
            });
          }
        }

        const sortByPaidApprovalTime = (list: any[]) =>
          [...list].sort((a, b) => {
            const aTime = a.paid_approval_time
              ? new Date(a.paid_approval_time).getTime()
              : null;
            const bTime = b.paid_approval_time
              ? new Date(b.paid_approval_time).getTime()
              : null;

            // nulls first (show items missing paid_approval_time at the top)
            if (aTime === null && bTime === null) {
              // stable fallback to avoid random shuffles
              const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
              const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
              if (aCreated !== bCreated) return aCreated - bCreated;
              return String(a.id || "").localeCompare(String(b.id || ""));
            }
            // nulls first => missing paid_approval_time appears at top
            if (aTime === null) return -1;
            if (bTime === null) return 1;
            if (aTime !== bTime) return aTime - bTime; // ascending

            // stable tie-breaker when paid timestamps match
            const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
            if (aCreated !== bCreated) return aCreated - bCreated;
            return String(a.id || "").localeCompare(String(b.id || ""));
          });

        const withTitles = rows.map((r: any) => ({
          ...r,
          event_title: r.event_id ? eventTitleMap[r.event_id] || "N/A" : "N/A",
        }));

        // Fetch bank details to enrich records with user's unique_id (if available)
        try {
          const { data: bankData, error: bankError } = await supabase
            .from("bank_details")
            .select("*");
          if (bankError) throw bankError;

          const enriched = withTitles.map((r: any) => {
            const matched = bankData?.find(
              (b: any) => b.email === r.creator_email
            );
            return {
              ...r,
              unique_id: r.unique_id || matched?.unique_id || "N/A",
            };
          });

          const sorted = sortByPaidApprovalTime(enriched);
          const sortedWithSerial = sorted.map((r: any, index: number) => ({
            ...r,
            serialNumber: index + 1,
          }));

          // compute amount bounds
          const amounts = enriched.map(
            (r: any) => Number(r.approved_amount) || 0
          );
          const min = amounts.length ? Math.min(...amounts) : 0;
          const max = amounts.length ? Math.max(...amounts) : 0;

          setRecords(sortedWithSerial);
          setFilteredRecords(sortedWithSerial);
          setAmountBounds({ min, max });
          setEventTitleLookup(eventTitleMap);
          setEventOptions(eventsDataList);
          setFilters((prev) => ({ ...prev, minAmount: min, maxAmount: max }));
        } catch (bankErr) {
          // If bank details fetch fails, fall back to existing titles and default Unique ID
          const fallback = sortByPaidApprovalTime(
            withTitles.map((r: any) => ({
              ...r,
              unique_id: r.unique_id || "N/A",
            }))
          );
          const fallbackWithSerial = fallback.map((r: any, index: number) => ({
            ...r,
            serialNumber: index + 1,
          }));
          const amounts = fallback.map(
            (r: any) => Number(r.approved_amount) || 0
          );
          const min = amounts.length ? Math.min(...amounts) : 0;
          const max = amounts.length ? Math.max(...amounts) : 0;

          setRecords(fallbackWithSerial);
          setFilteredRecords(fallbackWithSerial);
          setAmountBounds({ min, max });
          setEventTitleLookup(eventTitleMap);
          setEventOptions(eventsDataList);
          setFilters((prev) => ({ ...prev, minAmount: min, maxAmount: max }));
        }
      } catch (err: any) {
        toast.error("Failed to load records", { description: err.message });
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, []);

  // Derive options from fetched records
  const expenseTypes = Array.from(
    new Set(records.map((r: any) => r.expense_type).filter(Boolean))
  );
  const eventNames = Array.from(
    new Set(records.map((r: any) => r.event_title).filter(Boolean))
  );
  const creators = Array.from(
    new Set(records.map((r: any) => r.creator_email).filter(Boolean))
  );
  const locations = Array.from(
    new Set(records.map((r: any) => r.location).filter(Boolean))
  );
  const uniqueIds = Array.from(
    new Set(records.map((r: any) => r.unique_id).filter(Boolean))
  );
  const utrValues = Array.from(
    new Set(
      (filters.uniqueId && filters.uniqueId !== "All Unique IDs"
        ? records.filter((r: any) => (r.unique_id || "") === filters.uniqueId)
        : records
      )
        .map((r: any) => (r.utr || "").toString().trim())
        .filter((v: string) => v !== "")
    )
  );

  const applyFilters = () => {
    const fr = records.filter((r: any) => {
      if (
        filters.expenseType !== "All Expense Type" &&
        r.expense_type !== filters.expenseType
      )
        return false;
      if (
        filters.eventName !== "All Events" &&
        (r.event_title || "N/A") !== filters.eventName
      )
        return false;
      if (
        filters.createdBy !== "All Creators" &&
        r.creator_email !== filters.createdBy
      )
        return false;
      if (filters.email !== "All Emails" && r.creator_email !== filters.email)
        return false;
      if (
        filters.uniqueId !== "All Unique IDs" &&
        (r.unique_id || "") !== filters.uniqueId
      )
        return false;
      if (
        filters.location !== "All Locations" &&
        (r.location || "") !== filters.location
      )
        return false;
      if (filters.bills !== "All Bills") {
        if (filters.bills === "Receipt" && !r.receipt) return false;
        if (filters.bills === "Voucher" && !r.hasVoucher) return false;
      }
      if (filters.utr && filters.utr !== "All UTRs") {
        if (filters.utr === "Has" && !r.utr) return false;
        if (filters.utr === "None" && r.utr) return false;
        if (
          filters.utr !== "Has" &&
          filters.utr !== "None" &&
          (r.utr || "") !== filters.utr
        )
          return false;
      }
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        const recDate = new Date(r.updated_at || r.created_at || r.date);
        if (recDate < start) return false;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        const recDate = new Date(r.updated_at || r.created_at || r.date);
        end.setHours(23, 59, 59, 999);
        if (recDate > end) return false;
      }
      const amt = Number(r.approved_amount) || 0;
      if (filters.minAmount !== null && amt < Number(filters.minAmount))
        return false;
      if (filters.maxAmount !== null && amt > Number(filters.maxAmount))
        return false;

      return true;
    });

    setFilteredRecords(fr);
  };

  // Auto-apply filters when filter values change or when records update
  useEffect(() => {
    // only apply when records are loaded
    if (!loading) applyFilters();
  }, [filters, records]);

  // Reset to page 1 when filters change
  useEffect(() => {
    pagination.resetPage();
  }, [filteredRecords]);

  const clearFilters = () => {
    setFilters((prev) => ({
      ...prev,
      expenseType: "All Expense Type",
      eventName: "All Events",
      createdBy: "All Creators",
      email: "All Emails",
      uniqueId: "All Unique IDs",
      location: "All Locations",
      bills: "All Bills",
      utr: "All UTRs",
      dateMode: "All Dates",
      startDate: "",
      endDate: "",
      minAmount: amountBounds.min,
      maxAmount: amountBounds.max,
    }));
    setFilteredRecords(records);
  };

  const sendBackToPaymentProcessing = async () => {
    const id = sendBackModal.id;
    if (!id) return;
    try {
      setSendBackLoading(true);

      const { error } = await supabase
        .from("expense_new")
        .update({ payment_status: "pending" })
        .eq("id", id);

      if (error) throw error;

      setRecords((prev) => prev.filter((r) => r.id !== id));
      setFilteredRecords((prev) => prev.filter((r: any) => r.id !== id));
      toast.success("Sent back to Payment Processing");
      setSendBackModal({ open: false, id: null });
    } catch (err: any) {
      toast.error("Failed to send back", { description: err.message });
    } finally {
      setSendBackLoading(false);
    }
  };

  const openEditModal = (record: any) => {
    setEditForm({
      expense_type: record.expense_type || "",
      event_id: record.event_id || "",
      location: record.location || "",
      approved_amount:
        record.approved_amount !== undefined
          ? String(record.approved_amount)
          : record.amount !== undefined
            ? String(record.amount)
            : "",
      utr: record.utr || "",
      unique_id: record.unique_id || "",
    });
    setEditModal({ open: true, record });
  };

  const handleSaveEdit = async () => {
    if (!editModal.record) return;

    const parsedAmount = Number(editForm.approved_amount);
    if (
      editForm.approved_amount !== "" &&
      !Number.isFinite(parsedAmount)
    ) {
      toast.error("Please enter a valid amount");
      return;
    }

    const payload = {
      expense_type:
        editForm.expense_type || editModal.record.expense_type || null,
      event_id: editForm.event_id || editModal.record.event_id || null,
      location: editForm.location || editModal.record.location || null,
      approved_amount:
        editForm.approved_amount === ""
          ? editModal.record.approved_amount ?? null
          : parsedAmount,
      utr: editForm.utr.trim() || null,
      unique_id: editForm.unique_id.trim() || null,
    };

    const updatedEventTitle = payload.event_id
      ? eventTitleLookup[payload.event_id] || editModal.record.event_title || "N/A"
      : editModal.record.event_title || "N/A";

    try {
      setSavingEdit(true);

      const { error } = await supabase
        .from("expense_new")
        .update(payload)
        .eq("id", editModal.record.id);

      if (error) throw error;

      const updateList = (list: any[]) =>
        list.map((r: any) =>
          r.id === editModal.record.id
            ? { ...r, ...payload, event_title: updatedEventTitle }
            : r
        );

      setRecords((prev) => updateList(prev));
      setFilteredRecords((prev) => updateList(prev));

      toast.success("Record updated");
      setEditModal({ open: false, record: null });
    } catch (err: any) {
      toast.error("Failed to update record", { description: err.message });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-end">
        <div className="mt-2 sm:mt-0">
          <Button variant="outline" onClick={() => setFilterOpen((s) => !s)}>
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div className="p-4 rounded-md border shadow-sm bg-white">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Expense Type</label>
              <select
                className="mt-1 block w-full border rounded px-3 py-2 bg-gray-50 dark:bg-gray-800"
                value={filters.expenseType}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, expenseType: e.target.value }))
                }
              >
                <option>All Expense Type</option>
                {expenseTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Event</label>
              <select
                className="mt-1 block w-full border rounded px-3 py-2"
                value={filters.eventName}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, eventName: e.target.value }))
                }
              >
                <option>All Events</option>
                {eventNames.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Email</label>
              <select
                className="mt-1 block w-full border rounded px-3 py-2"
                value={filters.email}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, email: e.target.value }))
                }
              >
                <option>All Emails</option>
                {creators.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Unique ID</label>
              <select
                className="mt-1 block w-full border rounded px-3 py-2"
                value={filters.uniqueId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, uniqueId: e.target.value }))
                }
              >
                <option>All Unique IDs</option>
                {uniqueIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Location</label>
              <select
                className="mt-1 block w-full border rounded px-3 py-2"
                value={filters.location}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, location: e.target.value }))
                }
              >
                <option>All Locations</option>
                {locations.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Bills</label>
              <select
                className="mt-1 block w-full border rounded px-3 py-2"
                value={filters.bills}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, bills: e.target.value }))
                }
              >
                <option>All Receipt/Voucher</option>
                <option>Receipt</option>
                <option>Voucher</option>
              </select>
            </div>

            {utrValues.length > 0 && (
              <div className="col-span-3 sm:col-span-1">
                <label className="text-sm font-medium">UTR</label>
                <select
                  className="mt-1 block w-full border rounded px-3 py-2"
                  value={filters.utr}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, utr: e.target.value }))
                  }
                >
                  <option value="All UTRs">All UTRs</option>
                  {utrValues.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Date</label>
              <select
                className="mt-1 block w-full border rounded px-3 py-2"
                value={filters.dateMode}
                onChange={(e) => {
                  const mode = e.target.value;
                  setFilters((f) => {
                    if (mode === "All Dates")
                      return {
                        ...f,
                        dateMode: mode,
                        startDate: "",
                        endDate: "",
                      };
                    if (mode === "Single Date")
                      return {
                        ...f,
                        dateMode: mode,
                        startDate: f.startDate || "",
                        endDate: f.startDate || "",
                      };
                    return { ...f, dateMode: mode };
                  });
                }}
              >
                <option>All Dates</option>
                <option>Single Date</option>
                <option>Custom Date</option>
              </select>

              {/* Conditional inputs shown below the Date selector */}
              <div className="mt-2">
                {filters.dateMode === "Single Date" ? (
                  <>
                    <label className="text-sm font-medium">Select Date</label>
                    <input
                      type="date"
                      className="mt-1 block w-full border rounded px-3 py-2"
                      value={filters.startDate}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          startDate: e.target.value,
                          endDate: e.target.value,
                        }))
                      }
                    />
                  </>
                ) : filters.dateMode === "Custom Date" ? (
                  <>
                    <label className="text-sm font-medium">Start Date</label>
                    <input
                      type="date"
                      className="mt-1 block w-full border rounded px-3 py-2"
                      value={filters.startDate}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, startDate: e.target.value }))
                      }
                    />
                    <label className="text-sm font-medium mt-2 block">
                      End Date
                    </label>
                    <input
                      type="date"
                      className="mt-1 block w-full border rounded px-3 py-2"
                      value={filters.endDate}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, endDate: e.target.value }))
                      }
                    />
                  </>
                ) : null}
              </div>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Amount Min</label>
              <input
                type="number"
                className="mt-1 block w-full border rounded px-3 py-2"
                value={filters.minAmount}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minAmount: Number(e.target.value),
                  }))
                }
              />
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Amount Max</label>
              <input
                type="number"
                className="mt-1 block w-full border rounded px-3 py-2"
                value={filters.maxAmount}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    maxAmount: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-3">
            <Button className="cursor-pointer" onClick={clearFilters}>
              Clear
            </Button>
            <Button
              className="cursor-pointer"
              onClick={() => setFilterOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border shadow-sm bg-white overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-gray-300">
            <TableRow>
              <TableHead className="text-center py-3">S.No.</TableHead>
              <TableHead className="text-center py-3">Timestamp</TableHead>
              <TableHead className="text-center py-3">Email</TableHead>
              <TableHead className="text-center py-3">Unique ID</TableHead>
              <TableHead className="text-center py-3">Expense Type</TableHead>
              <TableHead className="text-center py-3">Event Name</TableHead>
              <TableHead className="text-center py-3">Location</TableHead>
              <TableHead className="text-center py-3">Amount</TableHead>
              <TableHead className="text-center py-3">Bills</TableHead>
              <TableHead className="text-center py-3">Date</TableHead>
              <TableHead className="text-center py-3">Status</TableHead>
              <TableHead className="text-center py-3">
                <div className="flex items-center justify-center gap-2">
                  <span>UTR</span>
                  {!isPasswordVerified ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs cursor-pointer"
                      onClick={() => {
                        setPasswordModal({ open: true, expenseId: "unlock" });
                        setEnteredPassword("");
                      }}
                    >
                      Unlock
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs text-red-600 border-red-300 hover:bg-red-50 cursor-pointer"
                      onClick={() => {
                        setIsPasswordVerified(false);
                        // Close any open UTR editing fields
                        setEditingFields((prev) => {
                          const updated = { ...prev };
                          Object.keys(updated).forEach((key) => {
                            if (updated[key].utr) {
                              updated[key] = { ...updated[key], utr: false };
                            }
                          });
                          return updated;
                        });
                        toast.success("UTR editing locked");
                      }}
                    >
                      Lock
                    </Button>
                  )}
                </div>
              </TableHead>
              <TableHead className="text-center py-3">Payment Status</TableHead>
              <TableHead className="text-center py-3">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableSkeleton colSpan={14} rows={5} />
            ) : filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={14}
                  className="text-center py-6 text-gray-500"
                >
                  No payment records found.
                </TableCell>
              </TableRow>
            ) : (
              pagination.paginatedData.map((record, index) => (
                <TableRow 
                  key={record.id}
                  ref={highlightedExpenseId === record.id ? highlightedRowRef : null}
                  className={`${
                    highlightedExpenseId === record.id 
                      ? "border-2 border-yellow-400 bg-yellow-50" 
                      : ""
                  }`}
                >
                  <TableCell className="text-center py-2">
                    {record.serialNumber ?? pagination.getItemNumber(index)}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {formatDateTime(record.updated_at || record.created_at)}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.creator_email}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.unique_id || "N/A"}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.expense_type}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.event_title || "N/A"}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.location || "N/A"}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    ₹{record.approved_amount}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.receipt ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto font-normal cursor-pointer text-blue-600"
                        onClick={() => {
                          if (record.receipt?.path) {
                            expenses
                              .getReceiptUrl(record.receipt.path)
                              .then(({ url, error }) => {
                                if (error) {
                                  console.error(
                                    "Error getting receipt URL:",
                                    error
                                  );
                                  toast.error("Failed to load receipt");
                                } else if (url) {
                                  window.open(url, "_blank");
                                }
                              });
                          }
                        }}
                      >
                        View Receipt
                      </Button>
                    ) : record.hasVoucher ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto font-normal cursor-pointer text-blue-600"
                        onClick={() =>
                          router.push(
                            `/org/${slug}/expenses/${record.id}/voucher?from=records`
                          )
                        }
                      >
                        View Voucher
                      </Button>
                    ) : (
                      "No receipt or voucher"
                    )}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {new Date(record.date).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.status}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {editingFields[record.id]?.utr ? (
                      <div className="flex items-center justify-center space-x-2 w-40 mx-auto">
                        <input
                          type="text"
                          className="border px-2 py-1 rounded text-sm text-center w-full"
                          value={record.utr || ""}
                          onChange={(e) => {
                            const updated = records.map((r) =>
                              r.id === record.id
                                ? { ...r, utr: e.target.value }
                                : r
                            );
                            setRecords(updated);
                            // keep filtered view in sync
                            setFilteredRecords((prev) =>
                              prev.map((r: any) =>
                                r.id === record.id
                                  ? { ...r, utr: e.target.value }
                                  : r
                              )
                            );
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              // Save UTR when Enter is pressed
                              const { error } = await supabase
                                .from("expense_new")
                                .update({ utr: record.utr })
                                .eq("id", record.id);

                              if (error) {
                                toast.error("Failed to update UTR");
                              } else {
                                toast.success("UTR updated");
                                setEditingFields((prev) => ({
                                  ...prev,
                                  [record.id]: {
                                    ...prev[record.id],
                                    utr: false,
                                  },
                                }));
                              }
                            }
                          }}
                        />
                        <div className="w-16">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-full px-1 text-sm"
                            onClick={async () => {
                              // Update UTR in Supabase when saving
                              const { error } = await supabase
                                .from("expense_new")
                                .update({ utr: record.utr })
                                .eq("id", record.id);

                              if (error) {
                                toast.error("Failed to update UTR");
                              } else {
                                toast.success("UTR updated");
                                setEditingFields((prev) => ({
                                  ...prev,
                                  [record.id]: {
                                    ...prev[record.id],
                                    utr: false,
                                  },
                                }));
                              }
                            }}
                            title="Save"
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center space-x-2 w-40 mx-auto">
                        <span className="truncate max-w-[100px] text-sm">
                          {record.utr || "—"}
                        </span>
                        <div className="w-16">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-full px-1 text-sm cursor-pointer"
                            onClick={() => {
                              if (isPasswordVerified) {
                                setEditingFields((prev) => ({
                                  ...prev,
                                  [record.id]: {
                                    ...(prev[record.id] || {}),
                                    utr: true,
                                  },
                                }));
                              } else {
                                setPasswordModal({
                                  open: true,
                                  expenseId: record.id,
                                });
                                setEnteredPassword("");
                              }
                            }}
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    <ExpenseStatusBadge
                      status={record.payment_status}
                      className="text-xs"
                    />
                  </TableCell>
                  <TableCell className="text-center py-2">
                    <div className="flex items-center justify-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                router.push(
                                  `/org/${slug}/finance/records/${record.id}`
                                )
                              }
                              className="flex items-center gap-2 border border-gray-300 text-black cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>View details</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditModal(record)}
                              className="flex items-center gap-2 border border-gray-300 text-black cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit record</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setSendBackModal({ open: true, id: record.id })
                              }
                              className="flex items-center gap-2 border border-gray-300 text-black cursor-pointer"
                            >
                              <Undo2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Back to Payment Processing</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDeleteModal({ open: true, id: record.id })
                        }
                        className="flex items-center gap-2 border border-gray-300 hover:bg-red-100 text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {filteredRecords.length > 0 && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          itemsPerPage={100}
          onPageChange={pagination.setCurrentPage}
          isLoading={loading}
          itemLabel="Records"
        />
      )}

      {/* Edit record modal */}
      <Dialog
        open={editModal.open}
        onOpenChange={(open) =>
          setEditModal((prev) => ({ open, record: open ? prev.record : null }))
        }
      >
        <DialogContent className="max-w-xl sm:max-w-1xl">
          <DialogHeader>
            <DialogTitle>Edit payment record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            <div className="grid gap-3 text-sm">
              <div>
                <label className="text-sm font-medium">Unique ID</label>
                <input
                  type="text"
                  className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                  value={editForm.unique_id}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, unique_id: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Expense Type</label>
                <select
                  className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                  value={editForm.expense_type}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      expense_type: e.target.value,
                    }))
                  }
                >
                  <option value="">Select expense type</option>
                  {expenseTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Event Name</label>
                <select
                  className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                  value={editForm.event_id}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      event_id: e.target.value,
                    }))
                  }
                >
                  <option value="">Select event</option>
                  {eventOptions.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                  {editModal.record?.event_id &&
                    eventOptions.every((ev) => ev.id !== editModal.record?.event_id) && (
                      <option value={editModal.record.event_id}>
                        {editModal.record.event_title || "Current event"}
                      </option>
                    )}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Location</label>
                <select
                  className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                  value={editForm.location}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      location: e.target.value,
                    }))
                  }
                >
                  <option value="">Select location</option>
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 block w-full border rounded px-3 py-2"
                  value={editForm.approved_amount}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      approved_amount: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">UTR</label>
                <input
                  type="text"
                  className="mt-1 block w-full border rounded px-3 py-2"
                  value={editForm.utr}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, utr: e.target.value }))
                  }
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Finance-only changes here will not alter the creator&apos;s submitted expense fields.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setEditModal({ open: false, record: null })}
              className="cursor-pointer"
              disabled={savingEdit}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              className="cursor-pointer"
              disabled={savingEdit}
            >
              {savingEdit ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Modal for UTR Editing */}
      <Dialog
        open={passwordModal.open}
        onOpenChange={() => setPasswordModal({ open: false, expenseId: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Password to Unlock UTR Editing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input
              type="password"
              className="w-full border px-3 py-2 rounded mb-0"
              placeholder="Password"
              value={enteredPassword}
              onChange={(e) => setEnteredPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (enteredPassword === ADMIN_PASSWORD) {
                    setIsPasswordVerified(true);
                    if (
                      passwordModal.expenseId &&
                      passwordModal.expenseId !== "unlock"
                    ) {
                      const id = passwordModal.expenseId;
                      setEditingFields((prev) => ({
                        ...prev,
                        [id]: { ...(prev[id] || {}), utr: true },
                      }));
                    }
                    setPasswordModal({ open: false, expenseId: null });
                    toast.success("UTR editing unlocked");
                  } else {
                    toast.error("Incorrect password");
                  }
                }
              }}
            />
            <p className="text-sm text-gray-600">
              Reach out to admin for password to unlock UTR editing.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              onClick={() => {
                if (enteredPassword === ADMIN_PASSWORD) {
                  setIsPasswordVerified(true);
                  if (
                    passwordModal.expenseId &&
                    passwordModal.expenseId !== "unlock"
                  ) {
                    const id = passwordModal.expenseId;
                    setEditingFields((prev) => ({
                      ...prev,
                      [id]: { ...(prev[id] || {}), utr: true },
                    }));
                  }
                  setPasswordModal({ open: false, expenseId: null });
                  toast.success("UTR editing unlocked");
                } else {
                  toast.error("Incorrect password");
                }
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send back to Payment Processing modal */}
      <Dialog
        open={sendBackModal.open}
        onOpenChange={() => setSendBackModal({ open: false, id: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back to Payment Processing</DialogTitle>
          </DialogHeader>
          <div>
            <p>
              Move this record back to Payment Processing? It will be removed
              from Payment Records.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setSendBackModal({ open: false, id: null })}
              className="cursor-pointer"
              disabled={sendBackLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={sendBackToPaymentProcessing}
              className="cursor-pointer"
              disabled={sendBackLoading}
            >
              {sendBackLoading ? "Sending..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation modal */}
      <Dialog
        open={deleteModal.open}
        onOpenChange={() => setDeleteModal({ open: false, id: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payment Record</DialogTitle>
          </DialogHeader>
          <div>
            <p>
              Are you sure you want to delete this payment record? This action
              cannot be undone.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteModal({ open: false, id: null })}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const id = deleteModal.id;
                if (!id) return;
                try {
                  // Mark the record as removed so it doesn't reappear in Payment Processing
                  const { error } = await supabase
                    .from("expense_new")
                    .update({ payment_status: "removed" })
                    .eq("id", id);

                  if (error) throw error;

                  // Remove from local UI list
                  setRecords((prev) => prev.filter((r) => r.id !== id));
                  setFilteredRecords((prev) =>
                    prev.filter((r: any) => r.id !== id)
                  );
                  toast.success("Record removed from Payment Records");
                } catch (err: any) {
                  toast.error("Failed to remove record", {
                    description: err.message,
                  });
                } finally {
                  setDeleteModal({ open: false, id: null });
                }
              }}
              className="cursor-pointer"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
