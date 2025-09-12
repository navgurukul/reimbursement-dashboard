import { policies, Policy } from "@/lib/db";

type PolicyInput = Omit<Policy, "id" | "created_at" | "updated_at">;

const defaultPolicies: PolicyInput[] = [
  {
    expense_type: "Flights",
    upper_limit: 5000,
    eligibility: "All Team Members",
    conditions:
      "- for distances above 1000 km\n- under 1000km for team members >50yrs or in case of a severe medical condition with doctor's recommendation note\n- for distances for which the fastest train route is still over 24hrs",
    per_unit_cost: null,
    org_id: "", // Will be set during creation
  },
  {
    expense_type: "Flights",
    upper_limit: 6500,
    eligibility: "All Team Members",
    conditions:
      "- only for team members residing in the North Eastern Region as well as Islands of India",
    per_unit_cost: null,
    org_id: "",
  },
  {
    expense_type: "Flights",
    upper_limit: 6500,
    eligibility: "Leads + Heads + Directors + CEO/CIO",
    conditions: "- only for corporate and flexi bookings if and when needed",
    per_unit_cost: null,
    org_id: "",
  },
  {
    expense_type: "Trains",
    upper_limit: 2000,
    eligibility: "All Team Members",
    conditions: "- for 3AC",
    per_unit_cost: null,
    org_id: "",
  },
  {
    expense_type: "Buses",
    upper_limit: 1500,
    eligibility: "All Team Members",
    conditions: null,
    per_unit_cost: null,
    org_id: "",
  },
  {
    expense_type: "Personal Two-Wheeler",
    per_unit_cost: "3/km",
    upper_limit: 1000,
    eligibility: "All Team Members",
    conditions: null,
    org_id: "",
  },
  {
    expense_type: "Personal Four-Wheeler",
    per_unit_cost: "7/km",
    upper_limit: 1000,
    eligibility: "All Team Members",
    conditions: null,
    org_id: "",
  },
  {
    expense_type: "Auto/Cab",
    per_unit_cost: "10/km",
    upper_limit: 500,
    eligibility: "All Team Members",
    conditions: null,
    org_id: "",
  },
  {
    expense_type: "Meal(s)",
    per_unit_cost: "200/meal",
    upper_limit: 600,
    eligibility: "All Team Members",
    conditions: "- for non-campus stays",
    org_id: "",
  },
  {
    expense_type: "Meal(s)",
    upper_limit: 750,
    eligibility: "Leads + Heads + Directors + CEO/CIO",
    conditions: "- for networking meals only",
    per_unit_cost: null,
    org_id: "",
  },
  {
    expense_type: "Day Stay",
    upper_limit: 1000,
    eligibility: "All Team Members",
    conditions:
      "- only if there is no vacancy in any existing NG Flat or Campus",
    per_unit_cost: null,
    org_id: "",
  },
  {
    expense_type: "Overnight Stay",
    upper_limit: 1500,
    eligibility: "All Team Members",
    conditions:
      "- only if there is no vacancy in any existing NG Flat or Campus",
    per_unit_cost: null,
    org_id: "",
  },
  {
    expense_type: "Month long stay",
    upper_limit: 8000,
    eligibility: "All Team Members",
    conditions:
      "- only if there is no vacancy in any existing NG Flat or Campus",
    per_unit_cost: null,
    org_id: "",
  },
];

export async function seedPolicies(orgId: string) {
  try {
    // First, check if policies already exist
    const { data: existingPolicies } = await policies.getPoliciesByOrgId(orgId);

    if (existingPolicies && existingPolicies.length > 0) {
      return;
    }

    // Create all policies
    for (const policy of defaultPolicies) {
      const { error } = await policies.createPolicy({
        ...policy,
        org_id: orgId,
      });

      if (error) {
        throw error;
      }
    }

  } catch (error: any) {
    console.error("❌ Error seeding policies:", error.message);
    throw error;
  }
}

// If running this script directly
if (require.main === module) {
  // Get organization ID from command line argument
  const orgId = process.argv[2];

  if (!orgId) {
    console.error(
      "❌ Please provide an organization ID as a command line argument"
    );
    process.exit(1);
  }

  seedPolicies(orgId)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Failed to seed policies:", error);
      process.exit(1);
    });
}
