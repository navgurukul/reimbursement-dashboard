"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import { expenseEvents, expenses } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Pencil,
  PlusCircle,
  Receipt,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  ExpenseStatusBadge,
  EventStatusBadge,
} from "@/components/ExpenseStatusBadge";
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
}

interface Expense {
  id: string;
  expense_type: string;
  amount: number;
  approved_amount?: number;
  date: string;
  status:
    | "draft"
    | "submitted"
    | "approved"
    | "rejected"
    | "reimbursed"
    | "approved_as_per_policy";
  receipt: any;
  custom_fields: Record<string, any>;
  approver_id?: string;
  event_id?: string;
  creator?: { full_name: string };
  approver?: { full_name: string };
}

// Custom Modal component to replace AlertDialog
const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-description"
        className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border bg-background p-5 shadow-lg sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 id="confirm-modal-title" className="card-title">
            {title}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 size-8 text-muted-foreground"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p
          id="confirm-modal-description"
          className="mb-6 text-sm text-muted-foreground"
        >
          {description}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            variant="destructive"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};

export default function ExpenseEventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { organization, userRole } = useOrgStore();
  const { user } = useAuthStore();
  const orgId = organization?.id!;
  const slug = params.slug as string;
  const eventId = params.id as string;

  const [event, setEvent] = useState<ExpenseEvent | null>(null);
  const [eventExpenses, setEventExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editedEvent, setEditedEvent] = useState<Partial<ExpenseEvent>>({});

  useEffect(() => {
    if (!eventId || !orgId) return;

    const fetchEventDetails = async () => {
      setLoading(true);
      try {
        // Fetch event details
        const { data: eventData, error: eventError } =
          await expenseEvents.getById(eventId);
        if (eventError) throw eventError;
        if (!eventData) throw new Error("Event not found");

        setEvent(eventData);
        setEditedEvent({
          title: eventData.title,
          description: eventData.description,
          start_date: eventData.start_date,
          end_date: eventData.end_date,
        });
        // Fetch expenses for this event
        const { data: expensesData, error: expensesError } =
          await expenses.getByEventId(eventId);
        if (expensesError) throw expensesError;

        setEventExpenses(
          (expensesData || []).map((exp: any) => ({
            ...exp,
            approved_amount:
              exp.approved_amount === null ? undefined : exp.approved_amount,
          })) as Expense[]
        );
      } catch (error: any) {
        toast.error("Failed to load event details", {
          description: error.message,
        });
        router.push(`/org/${slug}/expense-events`);
      } finally {
        setLoading(false);
      }
    };

    fetchEventDetails();
  }, [eventId, orgId, slug, router]);

  const approvedStatuses = [
    "finance_approved",
    "approved",
    "approved_as_per_policy",
    "approve_full_amount",
    "custom_amount",
  ];

  const approvedTotal = eventExpenses
    .filter((exp) => approvedStatuses.includes(exp.status?.toLowerCase()))
    .reduce((sum, exp) => sum + (exp.approved_amount || 0), 0);

  // Total of all created expenses linked to this event
  const createdTotal = useMemo(() => {
    return eventExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  }, [eventExpenses]);

  const handleInputChange = (field: string, value: string) => {
    setEditedEvent((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveEvent = async () => {
    if (!event) return;
    setSaving(true);

    try {
      const { error } = await expenseEvents.update(event.id, editedEvent);
      if (error) throw error;

      toast.success("Event updated successfully");

      // Refresh event data
      const { data } = await expenseEvents.getById(event.id);
      if (data) setEvent(data);

      setEditing(false);
    } catch (error: any) {
      toast.error("Failed to update event", {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!event) return;

    try {
      // First unlink all expenses from this event
      for (const expense of eventExpenses) {
        await expenses.update(expense.id, { event_id: null });
      }

      // Then delete the event
      const { error } = await expenseEvents.delete(event.id);
      if (error) throw error;

      toast.success("Event deleted successfully");
      router.push(`/org/${slug}/expense-events`);
    } catch (error: any) {
      toast.error("Failed to delete event", {
        description: error.message,
      });
    }
  };

  const handleSubmitEvent = async () => {
    if (!event) return;
    setSaving(true);

    try {
      // First submit the event
      const { error } = await expenseEvents.update(event.id, {
        status: "submitted",
      });

      if (error) throw error;

      // Then submit all draft expenses under this event
      const draftExpenses = eventExpenses.filter(
        (exp) => exp.status === "draft"
      );
      for (const expense of draftExpenses) {
        await expenses.update(expense.id, { status: "submitted" });
      }

      toast.success("Event and expenses submitted successfully");

      // Refresh event data
      const { data } = await expenseEvents.getById(event.id);
      if (data) setEvent(data);

      // Refresh expenses
      const { data: expensesData } = await expenses.getByEventId(event.id);
      setEventExpenses(
        (expensesData || []).map((exp: any) => ({
          ...exp,
          approved_amount:
            exp.approved_amount === null ? undefined : exp.approved_amount,
        }))
      );
    } catch (error: any) {
      toast.error("Failed to submit event", {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  function getEventTimelineStatus(startDate: string, endDate: string): string {
    const today = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (today < start) return "Upcoming";
    if (today > end) return "Closed";
    return "Ongoing";
  }

  const handleRemoveExpense = async (expenseId: string) => {
    try {
      const { error } = await expenses.update(expenseId, {
        event_id: null,
      });
      if (error) throw error;

      toast.success("Expense removed from event");

      // Refresh expenses
      const { data } = await expenses.getByEventId(eventId);
      setEventExpenses(
        (data || []).map((exp: any) => ({
          ...exp,
          approved_amount:
            exp.approved_amount === null ? undefined : exp.approved_amount,
        }))
      );

      // Refresh event data (to update total)
      const { data: eventData } = await expenseEvents.getById(eventId);
      if (eventData) setEvent(eventData);
    } catch (error: any) {
      toast.error("Failed to remove expense", {
        description: error.message,
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <h2 className="subsection-heading mb-2">Event not found</h2>
        <p className="text-muted-foreground mb-4">
          The expense event you're looking for doesn't exist.
        </p>
        <Button
          variant="outline"
          onClick={() => router.push(`/org/${slug}/expense-events`)}
        >
          Return to Events
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-[1000px] mx-auto space-y-6">
      {/* Custom Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteEvent}
        title="Delete this expense event?"
        description="This will remove the event and unlink all associated expenses. The expenses themselves will not be deleted."
      />

      <PageHeader
        leading={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/org/${slug}/expense-events`)}
            className="-ml-2 w-fit text-muted-foreground"
          >
            <ArrowLeft />
            Back to Events
          </Button>
        }
        title={event.title}
        actions={
          event.status === "draft" && (
            <>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteModal(true)}
              >
                <Trash2 />
                Delete
              </Button>

              {editing ? (
                <Button disabled={saving} onClick={handleSaveEvent}>
                  {saving ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save />
                      Save Changes
                    </>
                  )}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil />
                  Edit
                </Button>
              )}

              <Button
                onClick={handleSubmitEvent}
                disabled={saving || eventExpenses.length === 0}
                variant="neutral"
              >
                Submit Event
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm text-muted-foreground">
          <EventStatusBadge
            startDate={event.start_date}
            endDate={event.end_date}
          />
          <span>
            {formatDate(event.start_date)} - {formatDate(event.end_date)}
          </span>
        </div>
      </PageHeader>

      <Card>
        <CardContent className="space-y-6">
          {editing && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="event-title">Event Title</Label>
                <Input
                  id="event-title"
                  value={editedEvent.title || ""}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  placeholder="Event Title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-start-date">Start Date</Label>
                <Input
                  id="event-start-date"
                  type="date"
                  value={editedEvent.start_date || ""}
                  onChange={(e) =>
                    handleInputChange("start_date", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end-date">End Date</Label>
                <Input
                  id="event-end-date"
                  type="date"
                  value={editedEvent.end_date || ""}
                  onChange={(e) =>
                    handleInputChange("end_date", e.target.value)
                  }
                />
              </div>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:max-w-md">
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">
                Total Amount
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground break-words">
                {formatCurrency(createdTotal)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">
                Approved Amount
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-green-700 break-words">
                {formatCurrency(approvedTotal)}
              </dd>
            </div>
          </dl>

          <div className="space-y-1.5 border-t pt-4">
            {editing ? (
              <>
                <Label htmlFor="event-description">Description</Label>
                <Textarea
                  id="event-description"
                  value={editedEvent.description || ""}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  placeholder="Event description"
                  className="min-h-[100px]"
                />
              </>
            ) : (
              <>
                <h2 className="text-xs font-medium text-muted-foreground">
                  Description
                </h2>
                <p className="text-sm text-foreground whitespace-pre-line break-words max-w-full overflow-auto">
                  {event.description || "No description provided."}
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="subsection-heading">Expenses</h2>
          {event.status === "draft" && (
            <Button
              onClick={() =>
                router.push(`/org/${slug}/expenses/new?eventId=${event.id}`)
              }
              size="sm"
            >
              <PlusCircle />
              Add Expense
            </Button>
          )}
        </div>

        {eventExpenses.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card">
            <EmptyState
              icon={Receipt}
              title="No expenses added to this event yet."
              action={
                event.status === "draft" ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push(
                        `/org/${slug}/expenses/new?eventId=${event.id}`
                      )
                    }
                  >
                    Add your first expense
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="data-table-wrap max-h-[70vh]">
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Approved Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventExpenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>{formatDate(expense.date)}</TableCell>
                    <TableCell>{expense.expense_type}</TableCell>
                    <TableCell
                      className="max-w-[16rem] truncate"
                      title={expense.custom_fields?.description || undefined}
                    >
                      {expense.custom_fields?.description || "—"}
                    </TableCell>
                    <TableCell>{formatCurrency(expense.amount)}</TableCell>
                    <TableCell>
                      {formatCurrency(expense.approved_amount || 0)}
                    </TableCell>
                    <TableCell>
                      <ExpenseStatusBadge status={expense.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            router.push(`/org/${slug}/expenses/${expense.id}`)
                          }
                        >
                          View
                        </Button>
                        {event.status === "draft" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemoveExpense(expense.id)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
