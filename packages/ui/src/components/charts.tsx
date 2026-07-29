'use client';

import * as React from 'react';

import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '../lib/cn';

/**
 * Chart palette. Ordered so adjacent series stay distinguishable, and taken
 * from the dashboard mock rather than Recharts' defaults.
 */
export const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
] as const;

const AXIS_PROPS = {
  stroke: 'var(--color-muted-foreground)',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({ formatter }: { formatter?: (value: number) => string }) {
  return (
    <Tooltip
      cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
      contentStyle={{
        backgroundColor: 'var(--color-popover)',
        border: '1px solid var(--color-border)',
        borderRadius: '0.625rem',
        fontSize: '0.8125rem',
        boxShadow: 'var(--shadow-card)',
        color: 'var(--color-popover-foreground)',
      }}
      formatter={formatter ? (value: number) => formatter(value) : undefined}
    />
  );
}

export interface AreaChartProps {
  data: Record<string, unknown>[];
  /** Key holding the x-axis label. */
  categoryKey: string;
  /** Key holding the numeric value. */
  valueKey: string;
  color?: string;
  height?: number;
  valueFormatter?: (value: number) => string;
  className?: string;
}

/** The "Bookings Overview" trend chart. */
export function AreaChart({
  data,
  categoryKey,
  valueKey,
  color = CHART_COLORS[0],
  height = 280,
  valueFormatter,
  className,
}: AreaChartProps) {
  const gradientId = React.useId();

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey={categoryKey} {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} width={48} />
          <ChartTooltip formatter={valueFormatter} />

          <Area
            type="monotone"
            dataKey={valueKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface DonutSlice {
  name: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: DonutSlice[];
  height?: number;
  /** Rendered in the middle of the ring. */
  centerLabel?: React.ReactNode;
  valueFormatter?: (value: number) => string;
  className?: string;
}

/** The "Bookings by Status" ring. */
export function DonutChart({
  data,
  height = 260,
  centerLabel,
  valueFormatter,
  className,
}: DonutChartProps) {
  return (
    <div className={cn('relative w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((slice, index) => (
              <Cell
                key={slice.name}
                fill={slice.color ?? CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <ChartTooltip formatter={valueFormatter} />
          <Legend
            verticalAlign="middle"
            align="right"
            layout="vertical"
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span className="text-muted-foreground text-sm">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>

      {centerLabel ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {centerLabel}
        </div>
      ) : null}
    </div>
  );
}
