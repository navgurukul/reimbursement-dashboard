"use client";

import React, { useMemo, useState, useEffect } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  ReferenceLine,
} from 'recharts';

interface Expense {
  id: string;
  amount: number;
  status: string;
  expense_type: string;
  date: string;
  creator_name?: string;
  user_id?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28DFF', '#FF66B2'];
const STATUS_COLORS: Record<string, string> = {
  submitted: '#f59e0b',
  approved: '#3b82f6',
  finance_approved: '#10b981',
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

function TooltipShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      {children}
    </div>
  );
}

export function ExpensesByExpenseTypeChart({ data }: { data: Expense[] }) {
  const chartData = useMemo(() => {
    const categories: Record<string, number> = {};
    data.forEach((exp) => {
      const cat = exp.expense_type || 'Uncategorized';
      categories[cat] = (categories[cat] || 0) + (exp.amount || 0);
    });
    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => a.value - b.value);
  }, [data]);

  if (chartData.length === 0) return <div className="flex items-center justify-center h-full text-muted-foreground">No data available</div>;

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);

    if (percent < 0.05) return null; // Don't show labels for very small slices

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderLabel}
              outerRadius={88}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const item = payload[0];
                const color = item.color || item.fill || '#111827';
                return (
                  <TooltipShell>
                    <div className="font-medium" style={{ color }}>
                      {item.name}
                    </div>
                    <div className="font-semibold" style={{ color }}>
                      {formatCurrency(Number(item.value))}
                    </div>
                  </TooltipShell>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 max-h-[80px] overflow-y-auto pr-1">
        <div className="w-full flex flex-wrap gap-x-3 gap-y-2 justify-center items-center px-1 py-1">
          {chartData.map((entry: any, index: number) => (
            <div key={`legend-${index}`} className="flex items-center gap-1.5 text-[13px] max-w-full">
              <span
                style={{ backgroundColor: COLORS[index % COLORS.length], minWidth: 10, height: 10, display: 'inline-block', borderRadius: 2 }}
                className="shrink-0"
              />
              <span style={{ color: COLORS[index % COLORS.length], fontWeight: 500 }} className="truncate">
                {`${entry.name} (₹${Number(entry.value).toLocaleString()})`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ExpensesAmountChart({ data }: { data: Expense[] }) {
  const chartData = useMemo(() => {
    const dates: Record<string, { amount: number; items: Array<any> }> = {};
    data.forEach((exp) => {
      if (!exp.date) return;
      const dateObj = new Date(exp.date);
      if (isNaN(dateObj.getTime())) return;

      const date = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!dates[date]) dates[date] = { amount: 0, items: [] };
      dates[date].amount = (dates[date].amount || 0) + (exp.amount || 0);
      dates[date].items.push({ id: exp.id, amount: exp.amount || 0, creator_name: exp.creator_name, expense_type: exp.expense_type, raw: exp });
    });

    return Object.entries(dates)
      .map(([date, v]) => ({ date, amount: v.amount, items: v.items }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  if (chartData.length === 0) return <div className="flex items-center justify-center h-full text-muted-foreground">No data available</div>;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const entry = payload[0].payload;
    if (!entry) return null;

    // Build rows from payload so we show only the visible/hovered segments
    const rows: Array<any> = [];
    payload.forEach((p: any) => {
      // dataKey is like 'item_0', 'item_1' etc.
      const key: string = p.dataKey || '';
      const match = key.match(/item_(\d+)/);
      if (match) {
        const idx = Number(match[1]);
        const amount = p.value || 0;
        if (amount > 0 && entry.items && entry.items[idx]) {
          const it = entry.items[idx];
          rows.push({
            idx,
            amount,
            label: it.creator_name || it.expense_type || it.id,
            color: p.color || COLORS[idx % COLORS.length],
          });
        }
      }
    });

    // If no rows found from payload (e.g., non-stacked fallback), show entry.items
    const rowsToShow = rows.length ? rows : (entry.items || []).map((it: any, i: number) => ({ idx: i, amount: it.amount, label: it.creator_name || it.expense_type || it.id, color: COLORS[i % COLORS.length] }));

    return (
      <TooltipShell>
        <div className="min-w-[220px]">
          <div className="font-semibold text-foreground">{new Date(entry.date).toLocaleDateString()}</div>
          <div className="mb-2 text-muted-foreground">Total: {formatCurrency(entry.amount)}</div>
          <div className="max-h-48 overflow-auto">
            {rowsToShow.map((r: any) => (
              <div key={r.idx} className="flex items-center justify-between gap-4 border-b py-1 last:border-b-0">
                <div className="flex items-center gap-2">
                  <span style={{ backgroundColor: r.color, width: 10, height: 10, display: 'inline-block', borderRadius: 2 }} />
                  <div className="font-medium" style={{ color: r.color }}>{r.label}</div>
                </div>
                <div className="font-semibold" style={{ color: r.color }}>{formatCurrency(r.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      </TooltipShell>
    );
  };

  const maxItems = Math.max(...chartData.map((c) => (c.items ? c.items.length : 0)), 0);
  const barData = chartData.map((c) => {
    const obj: any = { date: c.date, amount: c.amount, items: c.items };
    for (let i = 0; i < maxItems; i++) {
      obj[`item_${i}`] = c.items && c.items[i] ? c.items[i].amount : 0;
    }
    return obj;
  });

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart
        data={barData}
        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />

        <YAxis width={56} tickFormatter={(value) => `₹${value}`} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} shared={false} />
        {Array.from({ length: maxItems }).map((_, i) => (
          <Bar
            key={`bar-${i}`}
            dataKey={`item_${i}`}
            fill={COLORS[i % COLORS.length]}
            radius={[4, 4, 0, 0]}
            barSize={Math.min(40, Math.max(8, Math.floor(40 / Math.max(1, maxItems))))}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ExpensesTimeChart({ data, range: externalRange }: { data: Expense[]; range?: 'day' | 'weekly' | 'monthly' | 'quarterly' | 'halfyear' | 'year' }) {
  const [range, setRange] = useState<'day' | 'weekly' | 'monthly' | 'quarterly' | 'halfyear' | 'year'>(externalRange ?? 'monthly');

  useEffect(() => {
    if (externalRange) setRange(externalRange);
  }, [externalRange]);

  const aggregated = useMemo(() => {
    const points: Array<{ label: string; value: number; date: string; expense_type?: string; id: string }> = [];
    const bucketCounts: Record<string, number> = {};

    function getBucket(d: Date) {
      const y = d.getFullYear();
      const m = d.getMonth();

      switch (range) {
        case 'day':
          return d.toISOString().slice(0, 10);
        case 'weekly': {
          const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          const dayNum = tmp.getUTCDay() || 7;
          tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
          const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
          const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
          return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
        }
        case 'monthly':
          return `${y}-${String(m + 1).padStart(2, '0')}`;
        case 'quarterly': {
          const q = Math.floor(m / 3) + 1;
          return `${y}-Q${q}`;
        }
        case 'halfyear': {
          const h = m < 6 ? 1 : 2;
          return `${y}-H${h}`;
        }
        case 'year':
          return String(y);
        default:
          return d.toISOString().slice(0, 10);
      }
    }

    function formatPointLabel(d: Date, exp: Expense, bucket: string, countInBucket: number) {
      const dateLabel = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
      const timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (range === 'day') {
        return `${timeLabel} • ${exp.expense_type || 'Expense'}`;
      }

      if (countInBucket > 0) {
        return `${dateLabel} • ${exp.expense_type || 'Expense'} #${countInBucket}`;
      }

      return `${dateLabel} • ${exp.expense_type || 'Expense'}`;
    }

    data.forEach((exp, index) => {
      if (!exp.date) return;
      const d = new Date(exp.date);
      if (isNaN(d.getTime())) return;
      const bucket = getBucket(d);
      bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
      const countInBucket = bucketCounts[bucket];
      points.push({
        label: formatPointLabel(d, exp, bucket, countInBucket),
        value: exp.amount || 0,
        date: d.toISOString(),
        expense_type: exp.expense_type,
        id: exp.id || String(index),
      });
    });

    return points.sort((a, b) => a.date.localeCompare(b.date));
  }, [data, range]);

  if (!aggregated || aggregated.length === 0) return <div className="flex items-center justify-center h-full text-muted-foreground">No data available</div>;

  const chartData = aggregated.map((d) => ({ label: d.label, value: d.value, date: d.date, expense_type: d.expense_type, id: d.id }));

  const RANGE_LABELS: Record<string, string> = {
    day: 'Day',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    halfyear: 'Half Year',
    year: 'Year',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Expenses ({RANGE_LABELS[range] || range})</div>
        <div className="flex items-center gap-2">
          {!externalRange && (
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as any)}
              className="rounded-md border px-3 py-1 text-sm"
            >
              <option value="day">Day</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="halfyear">Half Year</option>
              <option value="year">Year</option>
            </select>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="expenseAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
          <YAxis width={56} tickFormatter={(v) => `₹${v}`} tick={{ fontSize: 12 }} />

          <Tooltip
            formatter={(value: any) => formatCurrency(Number(value))}
            labelFormatter={(label) => label}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#expenseAreaFill)"
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExpensesByStatusChart({ data }: { data: Expense[] }) {
  const chartData = useMemo(() => {
    const statuses: Record<string, number> = {};
    data.forEach((exp) => {
      const status = exp.status || 'unknown';
      statuses[status] = (statuses[status] || 0) + 1;
    });

    return Object.entries(statuses)
      .map(([key, value]) => ({
        name: STATUS_LABELS[key] || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        value,
        originalStatus: key
      }))
      .sort((a, b) => a.value - b.value);
  }, [data]);

  if (chartData.length === 0) return <div className="flex items-center justify-center h-full text-muted-foreground">No data available</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={88}
              fill="#8884d8"
              paddingAngle={5}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.originalStatus] || COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const item = payload[0];
                const color = STATUS_COLORS[item.payload?.originalStatus] || item.color || item.fill || '#111827';
                return (
                  <TooltipShell>
                    <div className="font-medium" style={{ color }}>
                      {item.name}
                    </div>
                    <div className="font-semibold" style={{ color }}>
                      {typeof item.value === 'number' ? item.value : 0} expense{typeof item.value === 'number' && item.value > 1 ? 's' : ''}
                    </div>
                  </TooltipShell>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 max-h-[110px] overflow-y-auto pr-1">
        <div className="w-full flex flex-wrap gap-x-3 gap-y-2 justify-center items-center px-1 py-1">
          {chartData.map((entry: any, i: number) => (
            <div key={`legend-${i}`} className="flex items-center gap-1.5 text-[13px] max-w-full">
              <span
                style={{ backgroundColor: STATUS_COLORS[entry.originalStatus] || COLORS[i % COLORS.length], minWidth: 10, height: 10, display: 'inline-block', borderRadius: 2 }}
                className="shrink-0"
              />
              <span style={{ color: STATUS_COLORS[entry.originalStatus] || COLORS[i % COLORS.length], fontWeight: 600 }} className="truncate">{entry.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type CategoryRow = {
  key: string;
  name: string;
  displayName: string;
  abbreviation: string;
  amount: number;
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
  const { rows, top3Share } = useMemo(() => {
    const categories: Record<string, number> = {};
    data.forEach((exp) => {
      const key = exp.expense_type || "Uncategorized";
      categories[key] = (categories[key] || 0) + (Number(exp.amount) || 0);
    });

    const totalAmount = Object.values(categories).reduce((sum, value) => sum + value, 0);
    const sorted = Object.entries(categories)
      .map(([name, amount]) => ({
        key: name,
        name,
        displayName: getCategoryDisplayName(name),
        abbreviation: getCategoryAbbreviation(name),
        amount,
        percent: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .map((row, index) => ({
        ...row,
        barColor: CATEGORY_BAR_COLORS[index % CATEGORY_BAR_COLORS.length],
      }));

    const top3Amount = sorted.slice(0, 3).reduce((sum, row) => sum + row.amount, 0);
    const top3Percent = totalAmount > 0 ? (top3Amount / totalAmount) * 100 : 0;

    return {
      rows: sorted,
      top3Share: top3Percent,
    };
  }, [data]);

  if (rows.length === 0) {
    return <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground">No data available</div>;
  }

  const maxAmount = rows[0]?.amount ?? 1;

  const hasSelection = typeof selectedCategory !== 'undefined' && selectedCategory !== null;

  return (
    <div className="flex h-full flex-col">
      <p className="text-sm text-slate-500">
        Spending by category. Top 3 expense types = {top3Share.toFixed(0)}% of all spend.
        {onCategoryClick ? " Click a row to filter the table below." : ""}
      </p>

      <div className="mt-4 max-h-[360px] space-y-1 overflow-y-auto pr-1">
        {rows.map((row: CategoryRow) => {
          const isSelected = selectedCategory === row.key;
          const isDisabled = hasSelection && !isSelected;
          const barWidth = maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0;

          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onCategoryClick?.(isSelected ? null : row.key)}
              className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${isSelected ? "bg-sky-50" : "hover:bg-slate-50"
                } ${onCategoryClick ? "cursor-pointer" : "cursor-default"} ${isDisabled ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isDisabled ? 'bg-slate-100 text-slate-400' : 'bg-sky-50 text-sky-700'}`}>
                  {row.abbreviation}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`truncate text-sm font-medium ${isDisabled ? 'text-slate-400' : 'text-slate-900'}`}>{row.displayName}</span>
                    <div className="shrink-0 text-right">
                      <div className="flex items-center justify-end gap-2 text-sm font-semibold text-slate-900">
                        <span className={`${isDisabled ? 'text-slate-400' : ''}`}>{formatCurrency(row.amount)}</span>
                        <span className={`text-xs font-medium ${isDisabled ? 'text-slate-400' : 'text-slate-500'}`}>{row.percent.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${barWidth}%`, backgroundColor: isDisabled ? '#e6edf3' : row.barColor }}
                    />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const PIPELINE_STATUS_ORDER = [
  "submitted",
  "approved",
  "rejected",
  "finance_approved",
  "finance_rejected",
] as const;

const PIPELINE_BAR_COLORS: Record<string, string> = {
  submitted: "#eab308",
  approved: "#3b82f6",
  rejected: "#f97316",
  finance_rejected: "#ef4444",
  finance_approved: "#22c55e",
};

const PENDING_PIPELINE_STATUSES = new Set([
  "pending",
  "submitted",
  "awaiting approval",
  "under review",
  "in review",
  "approval pending",
]);

function getPipelineStatusLabel(status: string) {
  if (status === "submitted") return "Submitted (Pending)";
  return STATUS_LABELS[status] || status.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

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
  const { rows, pendingCount, totalClaims } = useMemo(() => {
    const buckets: Record<string, { count: number; totalAmount: number }> = {};

    data.forEach((exp) => {
      const status = String(exp.status || "unknown").trim().toLowerCase();
      if (!buckets[status]) buckets[status] = { count: 0, totalAmount: 0 };
      buckets[status].count += 1;
      buckets[status].totalAmount += Number(exp.amount) || 0;
    });

    const total = data.length;
    const orderedStatuses = [
      ...PIPELINE_STATUS_ORDER,
      ...Object.keys(buckets).filter(
        (status) => !PIPELINE_STATUS_ORDER.includes(status as (typeof PIPELINE_STATUS_ORDER)[number])
      ),
    ];

    const pipelineRows: PipelineRow[] = orderedStatuses.map((status) => {
      const bucket = buckets[status] || { count: 0, totalAmount: 0 };
      return {
        status,
        label: getPipelineStatusLabel(status),
        count: bucket.count,
        percent: total > 0 ? (bucket.count / total) * 100 : 0,
        totalAmount: bucket.totalAmount,
        avgAmount: bucket.count > 0 ? bucket.totalAmount / bucket.count : 0,
        barColor: PIPELINE_BAR_COLORS[status] || STATUS_COLORS[status] || "#64748b",
      };
    });

    const pending = data.filter((exp) =>
      PENDING_PIPELINE_STATUSES.has(String(exp.status || "").trim().toLowerCase())
    ).length;

    return {
      rows: pipelineRows,
      pendingCount: pending,
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

  const hasSelection = typeof selectedStatus !== "undefined" && selectedStatus !== null && selectedStatus !== "ALL";

  return (
    <div className="flex h-full flex-col">
      <p className="text-sm text-slate-500">
        Where each claim stands.{" "}
        <span className="font-semibold text-slate-700">
          {pendingCount} pending
        </span>{" "}
        need your attention.
        {onStatusClick ? " Click a status to filter the table." : ""}
      </p>

      <div className="mt-4 space-y-2">
        {rows.map((row) => {
          const isSelected = selectedStatus === row.status;
          const isDisabled = hasSelection && !isSelected;

          return (
            <button
              key={row.status}
              type="button"
              onClick={() => onStatusClick?.(isSelected ? null : row.status)}
              className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors ${isSelected ? "border-slate-300 bg-slate-50 ring-1 ring-slate-200" : "hover:border-slate-300 hover:bg-slate-50/80"
                } ${onStatusClick ? "cursor-pointer" : "cursor-default"} ${isDisabled ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: isDisabled ? "#cbd5e1" : row.barColor }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${isDisabled ? "text-slate-400" : "text-slate-900"}`}>
                        {row.label}
                      </p>
                      <p className={`mt-0.5 text-xs ${isDisabled ? "text-slate-400" : "text-slate-500"}`}>
                        {row.count} claim{row.count === 1 ? "" : "s"} · {row.percent.toFixed(0)}% of total
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-semibold ${isDisabled ? "text-slate-400" : "text-slate-900"}`}>
                        {formatCurrency(row.totalAmount)}
                      </p>
                      <p className={`text-xs ${isDisabled ? "text-slate-400" : "text-slate-500"}`}>
                        avg {formatCurrency(row.avgAmount)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(row.percent, row.count > 0 ? 2 : 0)}%`,
                        backgroundColor: isDisabled ? "#e2e8f0" : row.barColor,
                      }}
                    />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type SpenderRow = {
  key: string;
  name: string;
  initials: string;
  amount: number;
  claimCount: number;
};

export function TopSpendersChart({
  data,
  selectedUser,
  onUserClick,
  limit = 8,
}: {
  data: Expense[];
  selectedUser?: string;
  onUserClick?: (user: string | null) => void;
  limit?: number;
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
      .slice(0, limit);

    const totalSpend = Object.values(spenders).reduce((sum, row) => sum + row.amount, 0);
    const top3Amount = sorted.slice(0, 3).reduce((sum, row) => sum + row.amount, 0);
    const top3Percent = totalSpend > 0 ? (top3Amount / totalSpend) * 100 : 0;

    return {
      rows: sorted,
      top3Share: top3Percent,
    };
  }, [data, limit]);

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
      <p className="text-sm text-slate-500">
        Who&apos;s claiming the most.{" "}
        <span className="font-semibold text-slate-700">Top 3</span> account for{" "}
        {top3Share.toFixed(0)}% of spend.
        {onUserClick ? " Click a person to filter the table." : ""}
      </p>

      <div className={showScrollbar ? "mt-4 max-h-[360px] space-y-1 overflow-y-auto pr-1" : "mt-4 divide-y divide-slate-100"}>
        {rows.map((row) => {
          const isSelected = selectedUser === row.key;
          const isDisabled = hasSelection && !isSelected;
          const barWidth = maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0;

          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onUserClick?.(isSelected ? null : row.key)}
              className={`w-full px-1 py-3 text-left transition-colors first:pt-0 ${isSelected ? "rounded-xl bg-violet-50 px-2" : "hover:bg-slate-50"
                } ${onUserClick ? "cursor-pointer" : "cursor-default"} ${isDisabled ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isDisabled ? "bg-slate-100 text-slate-400" : "bg-violet-100 text-violet-700"
                    }`}
                >
                  {row.initials}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`truncate text-sm font-semibold ${isDisabled ? "text-slate-400" : "text-slate-900"}`}>
                      {row.name}
                    </span>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-semibold ${isDisabled ? "text-slate-400" : "text-slate-900"}`}>
                        {formatCurrency(row.amount)}
                      </p>
                      <p className={`text-xs ${isDisabled ? "text-slate-400" : "text-slate-500"}`}>
                        {row.claimCount} claim{row.claimCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${barWidth}%`,
                        background: isDisabled
                          ? "#e2e8f0"
                          : "linear-gradient(90deg, #38bdf8 0%, #8b5cf6 100%)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DailySpendTrendChart({ data }: { data: Expense[] }) {
  const { chartData, outlierDates, dayCount } = useMemo(() => {
    const dailyTotals: Record<string, number> = {};

    data.forEach((exp) => {
      if (!exp.date) return;
      const dateObj = new Date(exp.date);
      if (Number.isNaN(dateObj.getTime())) return;

      const key = dateObj.toISOString().slice(0, 10);
      dailyTotals[key] = (dailyTotals[key] || 0) + (Number(exp.amount) || 0);
    });

    const series = Object.entries(dailyTotals)
      .map(([date, amount]) => ({
        date,
        amount,
        label: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const outliers = [...series].sort((a, b) => b.amount - a.amount).slice(0, 2).map((item) => item.date);

    return {
      chartData: series,
      outlierDates: new Set(outliers),
      dayCount: series.length,
    };
  }, [data]);

  if (chartData.length === 0) {
    return <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground">No data available</div>;
  }

  const outlierCount = outlierDates.size;

  const renderDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload || !outlierDates.has(payload.date) || cx == null || cy == null) {
      return null;
    }

    return <circle cx={cx} cy={cy} r={5} fill="#fff" stroke="#ef4444" strokeWidth={2} />;
  };

  return (
    <div className="flex h-full flex-col">
      <p className="text-sm text-slate-500">
        Over the last {dayCount} day{dayCount === 1 ? "" : "s"}. {outlierCount} outlier day
        {outlierCount === 1 ? "" : "s"} highlighted — typically large travel reimbursements.
      </p>

      <div className="mt-4 h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dailySpendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              width={48}
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => formatCompactCurrency(Number(value))}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload;
                return (
                  <TooltipShell>
                    <div className="font-medium text-slate-900">{item.label}</div>
                    <div className="font-semibold text-violet-600">{formatCurrency(item.amount)}</div>
                  </TooltipShell>
                );
              }}
            />
            {chartData
              .filter((point) => outlierDates.has(point.date))
              .map((point) => (
                <ReferenceLine
                  key={point.date}
                  x={point.label}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                />
              ))}
            <Area
              type="monotone"
              dataKey="amount"
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#dailySpendFill)"
              dot={renderDot}
              activeDot={{ r: 4, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-5 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
          <span>Daily spend</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border-2 border-rose-500 bg-white" />
          <span>Outlier days (top 2)</span>
        </div>
      </div>
    </div>
  );
}
