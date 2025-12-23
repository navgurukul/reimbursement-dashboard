// src/app/org/[slug]/expense-events/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import { expenseEvents, expenses } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle, Search } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { PageLoader } from "@/components/ui/page-loader";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { EventStatusBadge } from "@/components/ExpenseStatusBadge";
import { formatDate, formatCurrency } from "@/lib/utils";

interface ExpenseEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  status: "draft" | "submitted" | "approved" | "rejected" | "reimbursed";
  custom_fields: Record<string, any>;
  created_at: string;
  approved_amount?: number; // Add this line
}

export default function ExpenseEventsPage() {
  const router = useRouter();
  const params = useParams();
  const { organization, userRole } = useOrgStore();
  const { user } = useAuthStore();
  const orgId = organization?.id;
  const slug = params.slug as string;

  const [events, setEvents] = useState<ExpenseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [eventTotals, setEventTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!orgId || !user) return;

    const fetchEvents = async () => {
      setLoading(true);
      try {
        // Use the getAvailableEvents function for all roles
        const { data, error } = await expenseEvents.getAvailableEvents(
          orgId,
          user.id,
          userRole || "member"
        );

        if (error) throw error;
        setEvents(data || []);
      } catch (error: any) {
        toast.error("Failed to load expense events", {
          description: error.message,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [orgId, user, userRole]);

  // After events load, fetch totals for each event by summing its created expenses
  useEffect(() => {
    const fetchTotals = async () => {
      try {
        const entries = await Promise.all(
          events.map(async (ev) => {
            const { data } = await expenses.getByEventId(ev.id);
            const total = (data || []).reduce(
              (sum: number, exp: any) => sum + (exp.amount || 0),
              0
            );
            return [ev.id, total] as const;
          })
        );
        setEventTotals(Object.fromEntries(entries));
      } catch (e) {
        // Non-blocking; totals remain 0 if fetch fails
      }
    };

    if (events.length > 0) fetchTotals();
  }, [events]);

  const filteredEvents = events.filter(
    (event) =>
      event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!orgId || !user) {
    return <PageLoader />;
  }

  const getEventTimelineStatus = (start: string, end: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (endDate < today) return "Closed";
    if (startDate > today) return "Upcoming";
    return "Ongoing";
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="page-title">Expense Events</h1>
          <p className="descriptive-text">
            Group your expenses by events for better organization
          </p>
        </div>
        {(userRole === "admin" || userRole === "owner") && (
          <Button
            onClick={() => router.push(`/org/${slug}/expense-events/new`)}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            New Event
          </Button>
        )}
      </div>

      <div className="flex w-full max-w-sm items-center space-x-2 mb-4">
        <Input
          type="search"
          placeholder="Search events..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-lg"
        />
        {/* <Button type="submit" size="icon" variant="ghost">
          <Search className="h-4 w-4" />
        </Button> */}
      </div>

      {loading ? (
        <PageLoader />
      ) : filteredEvents.length === 0 ? (
        <Card className="border-dotted">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-gray-500">No expense events found</p>
            {userRole === "admin" || userRole === "owner" ? (
              <Button
                onClick={() => router.push(`/org/${slug}/expense-events/new`)}
                variant="outline"
              >
                Create your first event
              </Button>
            ) : (
              <p className="text-sm text-gray-500">
                Events will appear here when created by your manager or admin
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvents.map((event) => (
                <TableRow
                  key={event.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() =>
                    router.push(`/org/${slug}/expense-events/${event.id}`)
                  }
                >
                  <TableCell className="font-medium">{event.title}</TableCell>
                  <TableCell>
                    {formatDate(event.start_date)} -{" "}
                    {formatDate(event.end_date)}
                  </TableCell>
                  <TableCell className="space-x-2">
                    <EventStatusBadge
                      startDate={event.start_date}
                      endDate={event.end_date}
                    />
                  </TableCell>
                  <TableCell>
                    {formatCurrency(eventTotals[event.id] || 0)}
                  </TableCell>
                  <TableCell>{formatDate(event.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
