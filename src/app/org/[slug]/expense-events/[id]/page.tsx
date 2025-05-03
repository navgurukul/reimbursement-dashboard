"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import { expenseEvents, expenses } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Edit, PlusCircle, Save, Trash, Upload } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  date: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "reimbursed";
  receipt: any;
  custom_fields: Record<string, any>;
  approver_id?: string;
  event_id?: string;
}

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
  const [confirmDelete, setConfirmDelete] = useState(false);
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

        setEventExpenses(expensesData || []);
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
  }, [eventId, orgId, slug]);

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
      setEventExpenses(expensesData || []);
    } catch (error: any) {
      toast.error("Failed to submit event", {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveExpense = async (expenseId: string) => {
    try {
      const { error } = await expenses.update(expenseId, { event_id: null });
      if (error) throw error;

      toast.success("Expense removed from event");

      // Refresh expenses
      const { data } = await expenses.getByEventId(eventId);
      setEventExpenses(data || []);

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
        <h2 className="text-xl font-semibold mb-2">Event not found</h2>
        <p className="text-gray-500 mb-4">
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
    <div className="max-w-[1000px] mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push(`/org/${slug}/expense-events`)}
          className="text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Events
        </Button>

        <div className="flex items-center space-x-2">
          {event.status === "draft" && (
            <>
              <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-red-600">
                    <Trash className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete this expense event?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the event and unlink all associated
                      expenses. The expenses themselves will not be deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 text-white hover:bg-red-700"
                      onClick={handleDeleteEvent}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {editing ? (
                <Button disabled={saving} onClick={handleSaveEvent}>
                  {saving ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}

              <Button
                onClick={handleSubmitEvent}
                disabled={saving || eventExpenses.length === 0}
                className="bg-black text-white hover:bg-black/90"
              >
                Submit Event
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              {editing ? (
                <Input
                  value={editedEvent.title || ""}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  className="text-xl font-bold mb-1"
                  placeholder="Event Title"
                />
              ) : (
                <CardTitle className="text-xl">{event.title}</CardTitle>
              )}
              <div className="flex items-center mt-1">
                <Badge
                  className={`${
                    event.status === "approved"
                      ? "bg-green-100 text-green-800"
                      : event.status === "rejected"
                      ? "bg-red-100 text-red-800"
                      : event.status === "submitted"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                </Badge>
                <p className="text-sm text-gray-500 ml-2">
                  {editing ? (
                    <div className="flex space-x-2">
                      <Input
                        type="date"
                        value={editedEvent.start_date || ""}
                        onChange={(e) =>
                          handleInputChange("start_date", e.target.value)
                        }
                        className="w-32"
                      />
                      <span>to</span>
                      <Input
                        type="date"
                        value={editedEvent.end_date || ""}
                        onChange={(e) =>
                          handleInputChange("end_date", e.target.value)
                        }
                        className="w-32"
                      />
                    </div>
                  ) : (
                    <>
                      {formatDate(event.start_date)} -{" "}
                      {formatDate(event.end_date)}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Total Amount</p>
              <p className="text-2xl font-bold">
                {formatCurrency(event.total_amount)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mt-4">
            <h3 className="text-sm font-medium mb-2">Description</h3>
            {editing ? (
              <Textarea
                value={editedEvent.description || ""}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                placeholder="Event description"
                className="min-h-[100px]"
              />
            ) : (
              <p className="text-gray-700">
                {event.description || "No description provided."}
              </p>
            )}
          </div>

          <div className="mt-6 pt-6 border-t">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Expenses</h3>
              {event.status === "draft" && (
                <Button
                  onClick={() =>
                    router.push(`/org/${slug}/expenses/new?eventId=${event.id}`)
                  }
                  size="sm"
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Expense
                </Button>
              )}
            </div>

            {eventExpenses.length === 0 ? (
              <div className="text-center py-8 text-gray-500 border rounded-md">
                <p>No expenses added to this event yet.</p>
                {event.status === "draft" && (
                  <Button
                    variant="outline"
                    className="mt-2"
                    onClick={() =>
                      router.push(
                        `/org/${slug}/expenses/new?eventId=${event.id}`
                      )
                    }
                  >
                    Add your first expense
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{formatDate(expense.date)}</TableCell>
                      <TableCell>{expense.expense_type}</TableCell>
                      <TableCell>
                        {expense.custom_fields?.description || "—"}
                      </TableCell>
                      <TableCell>{formatCurrency(expense.amount)}</TableCell>
                      <TableCell>
                        <Badge
                          className={`${
                            expense.status === "approved"
                              ? "bg-green-100 text-green-800"
                              : expense.status === "rejected"
                              ? "bg-red-100 text-red-800"
                              : expense.status === "submitted"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {expense.status.charAt(0).toUpperCase() +
                            expense.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
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
                              className="text-red-600"
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
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
