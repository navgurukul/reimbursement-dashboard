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
  Area
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
  finance_approved: 'Finance Approved',
  rejected: 'Manager Rejected',
  finance_rejected: 'Finance Rejected',
  payment_processed: 'Payment Successful',
  payment_not_processed: 'Payment Rejected',
  ready_for_payment: 'Ready for Payment',
  draft: 'Draft',
  reimbursed: 'Reimbursed',
};

function formatCurrency(value: number) {
  return `₹${Number(value || 0).toLocaleString()}`;
}

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
