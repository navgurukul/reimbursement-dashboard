export const defaultExpenseColumns = [
  {
    key: "date",
    label: "Date",
    type: "date",
    required: true,
    visible: true,
  },
  {
    key: "category",
    label: "Category",
    type: "dropdown",
    required: true,
    visible: true,
    options: [
      "Travel",
      "Meals",
      "Office Supplies",
      "Software",
      "Hardware",
      "Training",
      "Other",
    ],
  },
  {
    key: "amount",
    label: "Amount",
    type: "number",
    required: true,
    visible: true,
  },
  {
    key: "description",
    label: "Description",
    type: "textarea",
    required: true,
    visible: true,
  },
  {
    key: "receipt",
    label: "Receipt",
    type: "text",
    required: true,
    visible: true,
  },
  {
    key: "approver",
    label: "Approver",
    type: "dropdown",
    required: true,
    visible: true,
    options: [], // Will be populated with org admins
  },
];
