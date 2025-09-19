"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/supabase";
import { BadgeDollarSign } from "lucide-react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function PaymentRecords() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from("expenses")
          .select("*")
          .eq("payment_status", "paid")
          .order("updated_at", { ascending: false });

        if (error) throw error;

        const rows = data || [];

        // Bulk fetch event titles
        const eventIds = [
          ...new Set(
            rows
              .map((r: any) => r.event_id)
              .filter((id: any) => typeof id === "string" && id.length > 0)
          ),
        ];

        let eventTitleMap: Record<string, string> = {};
        if (eventIds.length > 0) {
          const { data: eventsData, error: evErr } = await supabase
            .from("expense_events")
            .select("id,title")
            .in("id", eventIds);
          if (!evErr && eventsData) {
            eventsData.forEach((ev: { id: string; title: string }) => {
              eventTitleMap[ev.id] = ev.title;
            });
          }
        }

        const withTitles = rows.map((r: any) => ({
          ...r,
          event_title: r.event_id ? eventTitleMap[r.event_id] || "N/A" : "N/A",
        }));

        setRecords(withTitles);
      } catch (err: any) {
        toast.error("Failed to load records", { description: err.message });
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BadgeDollarSign className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Payment Records</h2>
      </div>

      <div className="rounded-md border shadow-sm bg-white overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="text-center py-3">Email</TableHead>
              <TableHead className="text-center py-3">Expense Type</TableHead>
              <TableHead className="text-center py-3">Event Name</TableHead>
              <TableHead className="text-center py-3">Location</TableHead>
              <TableHead className="text-center py-3">Amount</TableHead>
              <TableHead className="text-center py-3">Date</TableHead>
              <TableHead className="text-center py-3">Status</TableHead>
              <TableHead className="text-center py-3">UTR</TableHead>
              <TableHead className="text-center py-3">Payment Status</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6">Loading...</TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-gray-500">
                  No payment records found.
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="text-center py-2">{record.creator_email}</TableCell>
                  <TableCell className="text-center py-2">{record.expense_type}</TableCell>
                  <TableCell className="text-center py-2">{record.event_title || "N/A"}</TableCell>
                  <TableCell className="text-center py-2">{record.location || "N/A"}</TableCell>
                  <TableCell className="text-center py-2">₹{record.approved_amount}</TableCell>
                  <TableCell className="text-center py-2">
                    {new Date(record.date).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell className="text-center py-2">{record.status}</TableCell>
                  <TableCell className="text-center py-2">{record.utr}</TableCell>
                  <TableCell className="text-center py-2">
                    <Badge variant="success" className="text-xs">
                      {record.payment_status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
