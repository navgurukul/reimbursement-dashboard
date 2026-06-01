"use client";

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Plane, Package, Droplet, Heart, Wifi, Tag, ChevronDown, ChevronUp, Route, Zap, Utensils, Pencil, Coffee } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  AreaChart,
  Area,
} from 'recharts';
import {
  Tooltip as RadixTooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from '@radix-ui/react-tooltip';

interface Expense {
  id: string;
  amount: number;
  status: string;
  expense_type: string;
  date: string;
  creator_name?: string;
  user_id?: string;
  created_at?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28DFF', '#FF66B2'];
const STATUS_COLORS: Record<string, string> = {
  submitted: '#f59e0b',
  approved: '#3b82f6',
  finance_approved: '#059669',
  rejected: '#ef4444',
  finance_rejected: '#b91c1c',
  ready_for_payment: '#8b5cf6',
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  approved: 'Manager Approved',
  rejected: 'Manager Rejected',
  finance_approved: 'Finance Approved',
  finance_rejected: 'Finance Rejected',
};

function formatCurrency(value: number) {
  return `₹${Number(value || 0).toLocaleString()}`;
}

function formatCompactCurrency(value: number) {
  const amount = Number(value || 0);
  if (amount >= 1000) {
    const compact = amount / 1000;
    const formatted = compact % 1 === 0 ? compact.toFixed(0) : compact.toFixed(1);
    return `₹${formatted}k`;
  }
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function getCategoryAbbreviation(name: string) {
  const codeMatch = name.match(/^([A-Z]{2})\b/);
  if (codeMatch) return codeMatch[1];

  const words = name.split(/[\s/&.-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

function getCategoryDisplayName(name: string) {
  return name.trim() || name;
}

const CATEGORY_BAR_COLORS = ["#8b5cf6", "#38bdf8", "#1d4ed8"] as const;

const PARENT_CATEGORY_COLORS: Record<string, string> = {
  "Travel": "#4B7CFF",
  "Office admin": "#FF7A59",
  "Office running cost": "#9C5CFF",
  "Staff wellbeing": "#FFC107",
  "Operations": "#00C49F",
};

const CATEGORY_TO_PARENT: Record<string, string> = {
  "Staff/Volunteer Travel": "Travel",
  "Volunteer Travel": "Travel",
  "Postage & Courier": "Office admin",
  "Stationery": "Office admin",
  "Sanitary Expenses": "Office running cost",
  "Telephone & Internet": "Office running cost",
  "Electricity": "Office running cost",
  "Pantry Supplies": "Office running cost",
  "Staff Wellness": "Staff wellbeing",
  "Volunteer Food": "Operations",
};

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<any>> = {
  travel: Route,
  travel_expenses: Route,
  "staff/volunteer travel": Route,
  "volunteer travel": Route,
  postage: Package,
  courier: Package,
  "postage & courier": Package,
  package: Package,
  sanitary: Droplet,
  "sanitary expenses": Droplet,
  hygiene: Droplet,
  wellness: Heart,
  "staff wellness": Heart,
  telephone: Wifi,
  internet: Wifi,
  "telephone & internet": Wifi,
  wifi: Wifi,
  electricity: Zap,
  food: Utensils,
  "volunteer food": Utensils,
  stationery: Pencil,
  pantry: Coffee,
  "pantry supplies": Coffee,
};

function getIconForCategory(name: string) {
  if (!name) return null;
  const key = name.toLowerCase();
  // exact and contains matches
  for (const mapKey of Object.keys(CATEGORY_ICON_MAP)) {
    if (key === mapKey || key.includes(mapKey)) {
      return CATEGORY_ICON_MAP[mapKey];
    }
  }
  return Tag;
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "").trim();

  if (clean.length === 3) {
    const r = clean[0] + clean[0];
    const g = clean[1] + clean[1];
    const b = clean[2] + clean[2];
    return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
  }

  const value = parseInt(clean, 16);
  if (Number.isNaN(value)) return `rgba(148, 163, 184, ${alpha})`;

  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function TooltipShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      {children}
    </div>
  );
}

type CategoryRow = {
  key: string;
  name: string;
  displayName: string;
  abbreviation: string;
  amount: number;
  claimCount: number;
  percent: number;
  barColor: string;
};

export function WhereTheMoneyGoesChart({
  data,
  selectedCategory,
  onCategoryClick,
}: {
  data: Expense[];
  selectedCategory?: string;
  onCategoryClick?: (category: string | null) => void;
}) {
  const [showAllCategories, setShowAllCategories] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const categories: Record<string, { amount: number; claimCount: number }> = {};
    data.forEach((exp) => {
      const key = exp.expense_type || "Uncategorized";
      if (!categories[key]) {
        categories[key] = { amount: 0, claimCount: 0 };
      }
      categories[key].amount += Number(exp.amount) || 0;
      categories[key].claimCount += 1;
    });

    const totalAmount = Object.values(categories).reduce((sum, value) => sum + value.amount, 0);
    const sorted = Object.entries(categories)
      .map(([name, stats]) => ({
        key: name,
        name,
        displayName: getCategoryDisplayName(name),
        abbreviation: getCategoryAbbreviation(name),
        amount: stats.amount,
        claimCount: stats.claimCount,
        percent: totalAmount > 0 ? (stats.amount / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .map((row, index) => {
        const parent = CATEGORY_TO_PARENT[row.name] || null;
        const color = parent ? PARENT_CATEGORY_COLORS[parent] : COLORS[index % COLORS.length];
        return {
          ...row,
          barColor: color,
        };
      });

    return sorted;
  }, [data]);

  useEffect(() => {
    if (rows.length <= 5 && showAllCategories) {
      setShowAllCategories(false);
    }
  }, [rows.length, showAllCategories]);

  if (rows.length === 0) {
    return <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground">No data available</div>;
  }

  const hasSelection = typeof selectedCategory !== 'undefined' && selectedCategory !== null;
  const hiddenCount = Math.max(rows.length - 5, 0);
  const visibleRows = showAllCategories ? rows : rows.slice(0, 5);

  return (
    <div className="space-y-4" ref={containerRef}>
      {/* Stacked Bar Chart */}
      <div className="flex h-12 w-full overflow-hidden rounded-xl bg-slate-100">
        {rows.map((row) => (
          <div
            key={row.key}
            style={{ width: `${row.percent}%`, backgroundColor: row.barColor }}
            className="h-full relative group transition-all border-r-2 border-white last:border-r-0"
          >
            {row.percent >= 5 && (
              <div className="flex h-full items-center justify-center text-sm font-semibold text-white">
                {row.percent.toFixed(0)}%
              </div>
            )}
            {/* Tooltip */}
            <div className="absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded border bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.1)] group-hover:block z-10 pointer-events-none">
              {row.displayName} · {formatCurrency(row.amount)} · {row.percent.toFixed(0)}%
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 mt-6">
        {visibleRows.map((row: CategoryRow) => {
          const maxAmount = rows[0]?.amount ?? 1;
          const barWidth = maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0;
          const Icon = getIconForCategory(row.key);
          const iconBg = hexToRgba(row.barColor, 0.12);

          return (
            <div
              key={row.key}
              className="flex items-center gap-4 py-2 transition-all hover:bg-slate-50/50 rounded-xl px-2 -mx-2"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                style={{ backgroundColor: iconBg }}
              >
                {Icon ? (
                  <Icon className="h-[22px] w-[22px]" style={{ color: row.barColor }} strokeWidth={1.5} />
                ) : (
                  <span className="text-xs font-semibold" style={{ color: row.barColor }}>
                    {row.abbreviation}
                  </span>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0 pr-2">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold truncate text-slate-800">
                    {row.displayName}
                  </span>
                  <span className="text-[13px] font-semibold text-slate-500">
                    {row.percent.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${barWidth}%`, backgroundColor: row.barColor }}
                  />
                </div>
              </div>

              <div className="shrink-0 text-right w-[72px]">
                <p className="text-[15px] font-bold tracking-tight text-slate-900">
                  {formatCompactCurrency(row.amount)}
                </p>
                <p className="text-[11px] font-medium text-slate-500">
                  {row.claimCount} claim{row.claimCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {hiddenCount > 0 ? (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              if (showAllCategories) {
                setTimeout(() => {
                  const section = document.getElementById('where-money-goes-section');
                  if (section) {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  } else {
                    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }
                }, 0);
              }
              setShowAllCategories((prev) => !prev);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 cursor-pointer"
          >
            {showAllCategories ? "Show less" : "Show all categories"}
            {!showAllCategories && <span className="font-bold">+{hiddenCount}</span>}
            {showAllCategories ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      ) : null}

      <div className="mt-4 border-t border-dashed border-slate-200 pt-5 pb-1">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {Object.entries(PARENT_CATEGORY_COLORS).map(([group, color]) => (
            <div key={group} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: color }} />
              <span className="text-xs font-semibold text-slate-600">{group}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PIPELINE_STATUS_ORDER = [
  "finance_approved",
  "approved",
  "submitted",
  "rejected",
  "finance_rejected",
] as const;

const PIPELINE_BAR_COLORS: Record<string, string> = {
  submitted: "#f59e0b",
  approved: "#3b82f6",
  rejected: "#f87171",
  finance_rejected: "#ef4444",
  finance_approved: "#059669",
};

const PENDING_PIPELINE_STATUSES = new Set([
  "pending",
  "submitted",
  "awaiting approval",
  "under review",
  "in review",
  "approval pending",
]);

function getPersonInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

type PipelineRow = {
  status: string;
  label: string;
  count: number;
  percent: number;
  totalAmount: number;
  avgAmount: number;
  barColor: string;
};

export function ApprovalPipelineChart({
  data,
  selectedStatus,
  onStatusClick,
}: {
  data: Expense[];
  selectedStatus?: string;
  onStatusClick?: (status: string | null) => void;
}) {
  const { rows, totalClaims } = useMemo(() => {
    const buckets: Record<string, { count: number; totalAmount: number }> = {};
    let total = 0;
    data.forEach((exp) => {
      let status = String(exp.status || "unknown").trim().toLowerCase();
      if (PENDING_PIPELINE_STATUSES.has(status)) status = "submitted";

      if (!buckets[status]) buckets[status] = { count: 0, totalAmount: 0 };
      buckets[status].count += 1;
      buckets[status].totalAmount += Number(exp.amount) || 0;
      total += 1;
    });

    const orderedStatuses = [
      "finance_approved",
      "submitted",
      "rejected",
      "finance_rejected",
      "approved",
    ];

    Object.keys(buckets).forEach((s) => {
      if (!orderedStatuses.includes(s)) orderedStatuses.push(s);
    });

    const pipelineRows = orderedStatuses
      .filter((s) => buckets[s])
      .map((status) => {
        const bucket = buckets[status];
        let label = "";
        let sublabel = "";
        let color = "";
        if (status === "finance_approved") {
          label = "Finance approved";
          sublabel = "paid out";
          color = "#059669";
        } else if (status === "submitted") {
          label = "Awaiting review";
          sublabel = "pending";
          color = "#f59e0b";
        } else if (status === "rejected") {
          label = "Manager rejected";
          sublabel = "sent back";
          color = "#f87171";
        } else if (status === "finance_rejected") {
          label = "Finance rejected";
          sublabel = "denied";
          color = "#ef4444";
        } else if (status === "approved") {
          label = "Manager approved";
          sublabel = "approved";
          color = "#3b82f6";
        } else {
          label = status;
          sublabel = "other";
          color = "#64748b";
        }

        return {
          status,
          label,
          sublabel,
          count: bucket.count,
          percent: total > 0 ? (bucket.count / total) * 100 : 0,
          totalAmount: bucket.totalAmount,
          barColor: color,
        };
      });

    return {
      rows: pipelineRows,
      totalClaims: total,
    };
  }, [data]);

  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex w-full h-8 overflow-hidden rounded-md mb-6 mt-2">
        {rows.map((row) => {
          if (row.percent === 0) return null;
          return (
            <div
              key={row.status}
              className="h-full flex items-center justify-center text-white text-xs font-bold transition-all"
              style={{ width: `${row.percent}%`, backgroundColor: row.barColor }}
            >
              {row.percent > 5 && row.count}
            </div>
          );
        })}
      </div>

      <div className="flex-1 space-y-0 divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.status} className="flex items-center justify-between py-4">
            <div className="flex items-start gap-3">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.barColor }}
              />
              <div>
                <p className="text-[15px] font-semibold text-slate-900">{row.label}</p>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  {row.count} claim{row.count === 1 ? "" : "s"} · {row.sublabel}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[16px] font-bold text-slate-900">
                {formatCompactCurrency(row.totalAmount)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpendingPatternChart({ data }: { data: Expense[] }) {
  const { heatmapData, maxAmount, activeDays, quietDays, biggestDay, monthLabels } = useMemo(() => {
    const dailyTotals: Record<string, number> = {};
    let maxAmt = 0;
    let maxDateStr = "";

    let minDataDate = new Date(8640000000000000);
    let maxDataDate = new Date(0);

    data.forEach((exp) => {
      if (!exp.date) return;
      const d = new Date(exp.date);
      if (isNaN(d.getTime())) return;
      const key = d.toISOString().slice(0, 10);
      dailyTotals[key] = (dailyTotals[key] || 0) + (Number(exp.amount) || 0);
      if (dailyTotals[key] > maxAmt) {
        maxAmt = dailyTotals[key];
        maxDateStr = key;
      }

      if (d > maxDataDate) maxDataDate = d;
      if (d < minDataDate) minDataDate = d;
    });

    const today = new Date();
    if (maxDataDate.getTime() === 0) {
      maxDataDate = new Date(today);
      minDataDate = new Date(today);
      minDataDate.setMonth(minDataDate.getMonth() - 2);
    }

    const startMonth = minDataDate.getMonth();
    const startYear = minDataDate.getFullYear();
    const firstDayOfStartMonth = new Date(startYear, startMonth, 1);

    const endMonth = maxDataDate.getMonth();
    const endYear = maxDataDate.getFullYear();
    const lastDayOfEndMonth = new Date(endYear, endMonth + 1, 0);

    const start = new Date(firstDayOfStartMonth);
    const startDayOfWeek = start.getDay();
    const diffToMon = startDayOfWeek === 0 ? -6 : 1 - startDayOfWeek;
    start.setDate(start.getDate() + diffToMon);

    const end = new Date(lastDayOfEndMonth);
    const endDayOfWeek = end.getDay();
    const diffToSun = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
    end.setDate(end.getDate() + diffToSun);

    const heatmapData = [];
    const monthLabels = [];
    let currentMonth = -1;

    let active = 0;
    let quiet = 0;

    let curr = new Date(start);
    let col = 0;
    const maxCols = 500;

    while (curr <= end && col < maxCols) {
      const week = [];
      let weekMonth = -1;
      let weekYear = -1;

      for (let row = 0; row < 7; row++) {
        const dateStr = curr.toISOString().slice(0, 10);
        const amt = dailyTotals[dateStr] || 0;

        if (amt > 0) active++;
        else if (curr <= today) quiet++;

        week.push({
          dateStr,
          date: new Date(curr),
          amount: amt,
        });

        if (row === 3) {
          weekMonth = curr.getMonth();
          weekYear = curr.getFullYear();
        }

        curr.setDate(curr.getDate() + 1);
      }
      heatmapData.push(week);

      if (weekMonth !== currentMonth) {
        currentMonth = weekMonth;
        const newLabel = {
          col,
          label: new Date(weekYear, weekMonth, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase(),
        };

        if (monthLabels.length > 0) {
          const last = monthLabels[monthLabels.length - 1];
          if (col - last.col < 3) {
            monthLabels[monthLabels.length - 1] = newLabel;
          } else {
            monthLabels.push(newLabel);
          }
        } else {
          monthLabels.push(newLabel);
        }
      }
      col++;
    }

    if (monthLabels.length > 1) {
      const last = monthLabels[monthLabels.length - 1];
      if (col - last.col < 2) {
        monthLabels.pop();
      }
    }

    const biggestDayLabel = maxDateStr
      ? new Date(maxDateStr).toLocaleDateString("en-US", { day: "numeric", month: "short" })
      : "—";

    return {
      heatmapData,
      maxAmount: maxAmt,
      activeDays: active,
      quietDays: quiet,
      biggestDay: { label: biggestDayLabel, amount: maxAmt },
      monthLabels,
    };
  }, [data]);

  const getColor = (amount: number) => {
    if (amount === 0 || maxAmount === 0) return "#f1f5f9";
    if (amount <= maxAmount * 0.25) return "#bfdbfe";
    if (amount <= maxAmount * 0.5) return "#60a5fa";
    if (amount <= maxAmount * 0.75) return "#3b82f6";
    return "#1d4ed8";
  };

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col justify-between">
        <div className="flex-1 overflow-x-auto pb-4 scrollbar-hide -mx-1 px-1">
          <div className="flex items-center text-[11px] font-bold text-slate-400 tracking-wider mb-2">
            <div className="w-6 shrink-0" />
            <div className="relative flex w-full h-4">
              {monthLabels.map((m) => (
                <span key={m.col} className="absolute whitespace-nowrap" style={{ left: `${m.col * 20}px` }}>
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex">
            <div className="flex flex-col gap-1 w-6 shrink-0 text-[10px] font-bold text-slate-400 pr-2 uppercase">
              {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                <div key={row} className="h-4 flex items-center justify-end">
                  {row === 0 && "M"}
                  {row === 2 && "W"}
                  {row === 4 && "F"}
                  {row === 6 && "S"}
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              {heatmapData.map((week, cIndex) => (
                <div key={cIndex} className="flex flex-col gap-1">
                  {week.map((day) => (
                    <RadixTooltip key={day.dateStr}>
                      <TooltipTrigger asChild>
                        <div
                          className="h-4 w-4 rounded-[4px] cursor-pointer transition-all hover:ring-[2.5px] hover:ring-blue-400 hover:ring-offset-[2px] hover:ring-offset-white"
                          style={{ backgroundColor: getColor(day.amount) }}
                        />
                      </TooltipTrigger>
                      <TooltipContent
                        sideOffset={6}
                        className="border-none bg-[#1e1e24] px-4 py-2.5 text-[14px] font-semibold text-white shadow-xl rounded-xl"
                      >
                        {day.date.toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        · {formatCurrency(day.amount)}
                      </TooltipContent>
                    </RadixTooltip>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="mt-2 flex items-center justify-end gap-2 text-xs font-medium text-slate-500">
            <span>Quiet</span>
            <div className="flex gap-1">
              <div className="h-4 w-4 rounded-[4px] bg-slate-100" />
              <div className="h-4 w-4 rounded-[4px] bg-blue-200" />
              <div className="h-4 w-4 rounded-[4px] bg-blue-400" />
              <div className="h-4 w-4 rounded-[4px] bg-blue-500" />
              <div className="h-4 w-4 rounded-[4px] bg-blue-700" />
            </div>
            <span>Busy</span>
          </div>

          <div className="mt-4 border-t border-dashed border-slate-200 pt-4 text-[13px] text-slate-500">
            <span className="font-bold text-slate-900">{activeDays} active days</span> · {quietDays}{" "}
            quiet days · biggest day was <span className="font-bold text-slate-900">{biggestDay.label}</span>{" "}
            at {formatCurrency(biggestDay.amount)}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

type SpenderRow = {
  key: string;
  name: string;
  initials: string;
  amount: number;
  claimCount: number;
};

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "linear-gradient(135deg, #f97316, #fbbf24)",
  "linear-gradient(135deg, #14b8a6, #3b82f6)",
  "linear-gradient(135deg, #a855f7, #f43f5e)",
  "linear-gradient(135deg, #f97316, #fca5a5)",
  "linear-gradient(135deg, #22c55e, #eab308)",
];

export function TopSpendersChart({
  data,
  selectedUser,
  onUserClick,
  hideHeader = false,
}: {
  data: Expense[];
  selectedUser?: string;
  onUserClick?: (user: string | null) => void;
  hideHeader?: boolean;
}) {
  const { rows, top3Share } = useMemo(() => {
    const spenders: Record<string, { amount: number; claimCount: number }> = {};

    data.forEach((exp) => {
      const name = (exp.creator_name || exp.user_id || "Unknown").trim();
      if (!spenders[name]) spenders[name] = { amount: 0, claimCount: 0 };
      spenders[name].amount += Number(exp.amount) || 0;
      spenders[name].claimCount += 1;
    });

    const sorted: SpenderRow[] = Object.entries(spenders)
      .map(([name, stats]) => ({
        key: name,
        name,
        initials: getPersonInitials(name),
        amount: stats.amount,
        claimCount: stats.claimCount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0);

    const totalSpend = Object.values(spenders).reduce((sum, row) => sum + row.amount, 0);
    const top3Amount = sorted.slice(0, 3).reduce((sum, row) => sum + row.amount, 0);
    const top3Percent = totalSpend > 0 ? (top3Amount / totalSpend) * 100 : 0;

    return {
      rows: sorted,
      top3Share: top3Percent,
    };
  }, [data]);

  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground">
        No data available
      </div>
    );
  }

  const maxAmount = rows[0]?.amount ?? 1;
  const showScrollbar = rows.length > 6;
  const hasSelection = typeof selectedUser !== "undefined" && selectedUser !== null && selectedUser !== "ALL";

  return (
    <div className="flex h-full flex-col">
      {!hideHeader && (
        <p className="text-sm text-slate-500">
          Who&apos;s claiming the most.{" "}
          <span className="font-semibold text-slate-700">Top 3</span> account for{" "}
          {top3Share.toFixed(0)}% of spend.
          {onUserClick ? " Click a person to filter the table." : ""}
        </p>
      )}

      <div className={showScrollbar ? "mt-4 max-h-[360px] space-y-1 overflow-y-auto pr-1" : "mt-4 divide-y divide-slate-100"}>
        {rows.map((row, index) => {
          const barWidth = maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0;

          return (
            <div
              key={row.key}
              className="w-full px-1 py-3 text-left transition-colors first:pt-0 hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ background: AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length] }}
                >
                  {row.initials}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {row.name}
                    </span>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(row.amount)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.claimCount} claim{row.claimCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${barWidth}%`,
                        background: "linear-gradient(90deg, #38bdf8 0%, #8b5cf6 100%)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type MonthlyTrendPoint = {
  label: string;
  thisYear: number;
  lastYear: number;
  deltaPct: number | null;
};

export function MonthlyTrendChart({ data }: { data: Expense[] }) {
  const { chartData, subtitle } = useMemo(() => {
    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = now.getMonth();

    const recentMonths = Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(endYear, endMonth - (5 - index), 1);
      return {
        year: monthDate.getFullYear(),
        month: monthDate.getMonth(),
        label: monthDate.toLocaleDateString("en-US", { month: "short" }),
        monthKey: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
      };
    });

    const totals = new Map<string, number>();
    data.forEach((expense) => {
      const rawDate = expense.date || expense.created_at;
      if (!rawDate) return;

      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) return;

      const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
      totals.set(key, (totals.get(key) || 0) + (Number(expense.amount) || 0));
    });

    const points: MonthlyTrendPoint[] = recentMonths.map(({ year, month, label }) => {
      const thisYearKey = `${year}-${String(month + 1).padStart(2, "0")}`;
      const lastYearKey = `${year - 1}-${String(month + 1).padStart(2, "0")}`;
      const thisYear = totals.get(thisYearKey) || 0;
      const lastYear = totals.get(lastYearKey) || 0;

      return {
        label,
        thisYear,
        lastYear,
        deltaPct: lastYear > 0 ? ((thisYear - lastYear) / lastYear) * 100 : null,
      };
    });

    const first = recentMonths[0];
    const last = recentMonths[recentMonths.length - 1];
    const subtitleText = `${first.label} to ${last.label}`;

    return { chartData: points, subtitle: subtitleText };
  }, [data]);

  if (chartData.length === 0) {
    return <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground">No data available</div>;
  }

  const formatAmount = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[22px] font-bold text-slate-900 tracking-tight">Monthly trend</div>
        <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#5b8def]" />
            <span>This year</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-slate-400" />
            <span>Last year</span>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-500">Last 6 months — {subtitle}</p>

      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="monthlyTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5b8def" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#5b8def" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis width={56} tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={false}
              offset={0}
              allowEscapeViewBox={{ x: true, y: true }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;

                const point = payload[0]?.payload as MonthlyTrendPoint | undefined;
                if (!point) return null;

                return (
                  <div
                    className="relative rounded-[10px] bg-[#1e1e24] px-4 py-2.5 text-[15px] shadow-2xl w-max pointer-events-none"
                    style={{
                      transform: 'translate(-50%, -100%)',
                      marginTop: '-16px'
                    }}
                  >
                    <div className="font-bold text-white tracking-wide">
                      {point.label} · {formatAmount(point.thisYear)}
                    </div>
                    <div className="mt-0.5 font-semibold text-slate-300/90 tracking-wide">
                      {point.deltaPct == null ? "No last-year comparison" : `${point.deltaPct >= 0 ? "+" : ""}${point.deltaPct.toFixed(0)}% vs last year`}
                    </div>
                    {/* The triangle arrow */}
                    <div className="absolute left-1/2 -bottom-[6px] -translate-x-1/2 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[#1e1e24]" />
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="thisYear" stroke="#5b8def" strokeWidth={3} fill="url(#monthlyTrendFill)" dot={{ r: 5, fill: "#fff", stroke: "#5b8def", strokeWidth: 3 }} activeDot={{ r: 7, fill: "#fff", stroke: "#5b8def", strokeWidth: 3 }} />
            <Line type="monotone" dataKey="lastYear" stroke="#b6bccb" strokeWidth={2.5} strokeDasharray="6 6" dot={false} activeDot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
